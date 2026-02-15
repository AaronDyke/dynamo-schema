/**
 * BatchGet operation: retrieves multiple items across entities with auto-chunking
 * and exponential backoff retry for unprocessed keys.
 *
 * DynamoDB limits batch get to 100 items per request. When DynamoDB throttles
 * a batch and returns UnprocessedKeys, this operation retries automatically
 * with exponential backoff until all keys are resolved or the attempt limit
 * is reached.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { BatchGetRequest } from "../adapters/adapter.js";
import type { DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { unmarshallItem } from "../marshalling/unmarshall.js";
import type { AttributeMap } from "../marshalling/types.js";
import { type RetryOptions, computeBackoffDelay, sleep } from "../utils/retry.js";

/** Maximum items per BatchGetItem request. */
const BATCH_GET_LIMIT = 100;

/** A single entity batch get request. */
export interface BatchGetEntityRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly entity: EntityDefinition<S>;
  readonly keys: readonly Readonly<Record<string, string>>[];
  readonly consistentRead?: boolean | undefined;
  readonly projection?: readonly string[] | undefined;
}

/** Options for batch get operations. */
export interface BatchGetOptions {
  /**
   * Retry options for handling DynamoDB's `UnprocessedKeys` responses.
   *
   * When DynamoDB throttles a batch get and returns some keys as unprocessed,
   * the operation retries those keys automatically with exponential backoff.
   *
   * Defaults: `{ maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 5000 }`
   * (1 initial attempt + up to 3 retries at 100ms, 200ms, 400ms).
   */
  readonly retryOptions?: RetryOptions | undefined;
}

/** Result for a batch get, keyed by entity name. */
export interface BatchGetResult {
  readonly responses: Readonly<Record<string, readonly Record<string, unknown>[]>>;
}

/**
 * Builds a DynamoDB key from entity key input.
 */
const buildKey = (
  entity: EntityDefinition,
  keyInput: Readonly<Record<string, string>>,
): Result<Record<string, unknown>, Error> => {
  const pkTemplate = parseTemplate(entity.partitionKey);
  const pkResult = buildKeyValue(pkTemplate, keyInput);
  if (!pkResult.success) return pkResult;

  const key: Record<string, unknown> = {
    [entity.table.partitionKey.name]: pkResult.data,
  };

  if (entity.sortKey && entity.table.sortKey) {
    const skTemplate = parseTemplate(entity.sortKey);
    const skResult = buildKeyValue(skTemplate, keyInput);
    if (!skResult.success) return skResult;
    key[entity.table.sortKey.name] = skResult.data;
  }

  return ok(key);
};

/**
 * Chunks an array into sub-arrays of the given size.
 */
const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

/**
 * Processes batch get responses and appends items to `allResponses`.
 * Returns a DynamoError if unmarshalling fails.
 */
const processResponses = (
  responses: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>,
  chunkKeys: ReadonlyArray<{ tableName: string; entityName: string; key: Record<string, unknown> }>,
  allResponses: Record<string, Record<string, unknown>[]>,
  isRaw: boolean,
): DynamoError | undefined => {
  for (const [tableName, items] of Object.entries(responses)) {
    const entityName =
      chunkKeys.find((fk) => fk.tableName === tableName)?.entityName ?? tableName;

    if (!allResponses[entityName]) {
      allResponses[entityName] = [];
    }

    for (const rawItem of items) {
      if (isRaw) {
        const unmarshalled = unmarshallItem(rawItem as AttributeMap);
        if (!unmarshalled.success) {
          return createDynamoError(
            "marshalling",
            unmarshalled.error.message,
            unmarshalled.error,
          );
        }
        allResponses[entityName]!.push(unmarshalled.data);
      } else {
        allResponses[entityName]!.push(rawItem as Record<string, unknown>);
      }
    }
  }
  return undefined;
};

/**
 * Executes a BatchGet operation with auto-chunking and exponential backoff retry.
 *
 * - Automatically chunks requests into groups of 100 (the DynamoDB limit).
 * - When DynamoDB returns `UnprocessedKeys`, retries them with exponential
 *   backoff (default: up to 3 retries at 100ms, 200ms, 400ms intervals).
 * - Returns a `DynamoError` if keys remain unprocessed after all retries.
 *
 * @param adapter - The SDK adapter
 * @param requests - Array of entity get requests
 * @param options - Optional retry configuration
 * @returns A Result containing responses grouped by entity name, or a DynamoError
 *
 * @example
 * ```ts
 * // Works transparently with any number of items — auto-chunks + retries
 * const result = await client.batchGet([
 *   { entity: UserEntity, keys: userIds.map(id => ({ userId: id })) },
 * ]);
 *
 * // Custom retry options
 * const result = await client.batchGet(requests, {
 *   retryOptions: { maxAttempts: 5, baseDelayMs: 200 },
 * });
 * ```
 */
export const executeBatchGet = async (
  adapter: SDKAdapter,
  requests: readonly BatchGetEntityRequest[],
  options?: BatchGetOptions,
): Promise<Result<BatchGetResult, DynamoError>> => {
  // 1. Build keys for each request and flatten into adapter format
  type FlatKey = { tableName: string; entityName: string; key: Record<string, unknown> };
  const flatKeys: FlatKey[] = [];

  // Track per-table batch get config (projection, consistentRead)
  const tableConfigs = new Map<
    string,
    { consistentRead?: boolean; projectionExpression?: string; expressionAttributeNames?: Record<string, string> }
  >();

  for (const req of requests) {
    const tableName = req.entity.table.tableName;

    // Build projection for this entity's table
    if (req.projection && req.projection.length > 0 && !tableConfigs.has(tableName)) {
      const names: Record<string, string> = {};
      const parts: string[] = [];
      for (const attr of req.projection) {
        const alias = `#proj_${attr}`;
        names[alias] = attr;
        parts.push(alias);
      }
      tableConfigs.set(tableName, {
        ...(req.consistentRead !== undefined ? { consistentRead: req.consistentRead } : {}),
        projectionExpression: parts.join(", "),
        expressionAttributeNames: names,
      });
    } else if (!tableConfigs.has(tableName)) {
      tableConfigs.set(tableName, {
        ...(req.consistentRead !== undefined ? { consistentRead: req.consistentRead } : {}),
      });
    }

    for (const keyInput of req.keys) {
      const keyResult = buildKey(req.entity, keyInput);
      if (!keyResult.success) {
        return err(createDynamoError("key", keyResult.error.message, keyResult.error));
      }

      let key = keyResult.data;
      if (adapter.isRaw) {
        const marshalled = marshallItem(key);
        if (!marshalled.success) {
          return err(
            createDynamoError("marshalling", marshalled.error.message, marshalled.error),
          );
        }
        key = marshalled.data;
      }

      flatKeys.push({ tableName, entityName: req.entity.name, key });
    }
  }

  // 2. Chunk into groups of 100 and execute each chunk
  const allResponses: Record<string, Record<string, unknown>[]> = {};
  const keyChunks = chunk(flatKeys, BATCH_GET_LIMIT);
  const maxAttempts = options?.retryOptions?.maxAttempts ?? 4;

  for (const chunkKeys of keyChunks) {
    // Group by table for the initial request
    const byTable = new Map<string, Record<string, unknown>[]>();
    for (const fk of chunkKeys) {
      if (!byTable.has(fk.tableName)) {
        byTable.set(fk.tableName, []);
      }
      byTable.get(fk.tableName)!.push(fk.key);
    }

    const batchReqs: BatchGetRequest[] = [];
    for (const [tableName, keys] of byTable) {
      const config = tableConfigs.get(tableName);
      batchReqs.push({
        tableName,
        keys,
        consistentRead: config?.consistentRead,
        projectionExpression: config?.projectionExpression,
        expressionAttributeNames: config?.expressionAttributeNames,
      });
    }

    // 3. Initial call
    let result;
    try {
      result = await adapter.batchGetItem(batchReqs);
    } catch (cause) {
      return err(
        createDynamoError(
          "dynamo",
          cause instanceof Error ? cause.message : "BatchGet operation failed",
          cause,
        ),
      );
    }

    // Process initial responses
    const initialError = processResponses(
      result.responses as Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>,
      chunkKeys,
      allResponses,
      adapter.isRaw,
    );
    if (initialError) return err(initialError);

    // 4. Retry unprocessed keys with exponential backoff
    let unprocessed: ReadonlyArray<BatchGetRequest> = result.unprocessedKeys;

    for (let retryIndex = 0; retryIndex < maxAttempts - 1 && unprocessed.length > 0; retryIndex++) {
      const delay = computeBackoffDelay(retryIndex, options?.retryOptions);
      await sleep(delay);

      let retryResult;
      try {
        retryResult = await adapter.batchGetItem(unprocessed);
      } catch (cause) {
        return err(
          createDynamoError(
            "dynamo",
            cause instanceof Error ? cause.message : "BatchGet retry failed",
            cause,
          ),
        );
      }

      const retryError = processResponses(
        retryResult.responses as Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>,
        chunkKeys,
        allResponses,
        adapter.isRaw,
      );
      if (retryError) return err(retryError);

      unprocessed = retryResult.unprocessedKeys;
    }

    // 5. Fail if keys remain unprocessed after all attempts
    if (unprocessed.length > 0) {
      const totalUnprocessed = unprocessed.reduce((n, req) => n + req.keys.length, 0);
      return err(
        createDynamoError(
          "dynamo",
          `BatchGet: ${totalUnprocessed} key(s) remained unprocessed after ${maxAttempts} attempt(s). ` +
            `Consider increasing retryOptions.maxAttempts or checking for persistent throttling.`,
        ),
      );
    }
  }

  return ok(Object.freeze({ responses: Object.freeze(allResponses) }));
};

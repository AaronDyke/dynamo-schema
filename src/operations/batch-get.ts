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
import { buildProjection } from "../utils/expression-names.js";
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

/** Where a requested key's item belongs in the result. */
interface KeyOwner {
  readonly entityName: string;
  /** The entity's own projection, used to trim items fetched with a wider one. */
  readonly projection: readonly string[] | undefined;
}

/** Identifies an item by table and key values, to match returned items to requests. */
const keyIdentity = (tableName: string, pk: unknown, sk: unknown): string =>
  JSON.stringify([tableName, pk, sk ?? null]);

/** Keeps only the projected attributes of an item. */
const pickAttributes = (
  item: Record<string, unknown>,
  attributes: readonly string[],
): Record<string, unknown> =>
  Object.fromEntries(attributes.filter((a) => a in item).map((a) => [a, item[a]]));

/**
 * Processes batch get responses and appends each item to its entity's list in
 * `allResponses`. Items are matched to entities by their key attributes, so
 * several entities can share a table.
 * Returns a DynamoError if unmarshalling fails.
 */
const processResponses = (
  responses: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>,
  owners: ReadonlyMap<string, KeyOwner>,
  keyNames: ReadonlyMap<string, { readonly pk: string; readonly sk: string | undefined }>,
  allResponses: Record<string, Record<string, unknown>[]>,
  isRaw: boolean,
): DynamoError | undefined => {
  for (const [tableName, items] of Object.entries(responses)) {
    const names = keyNames.get(tableName);

    for (const rawItem of items) {
      let item = rawItem as Record<string, unknown>;
      if (isRaw) {
        const unmarshalled = unmarshallItem(rawItem as AttributeMap);
        if (!unmarshalled.success) {
          return createDynamoError(
            "marshalling",
            unmarshalled.error.message,
            unmarshalled.error,
          );
        }
        item = unmarshalled.data;
      }

      const owner = names
        ? owners.get(
            keyIdentity(tableName, item[names.pk], names.sk ? item[names.sk] : undefined),
          )
        : undefined;
      const entityName = owner?.entityName ?? tableName;
      const output = owner?.projection ? pickAttributes(item, owner.projection) : item;

      (allResponses[entityName] ??= []).push(output);
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
  type FlatKey = { tableName: string; key: Record<string, unknown> };
  const flatKeys: FlatKey[] = [];

  // Per-table settings. DynamoDB allows one projection and one ConsistentRead
  // per table in a BatchGetItem request, so entities sharing a table share them:
  // consistent if any entity asks for it, and the union of the projections
  // (plus the key attributes, to match items back) unless any entity wants
  // full items. Each entity's items are trimmed to its own projection later.
  type TableSettings = {
    consistentRead: boolean;
    fullItems: boolean;
    attributes: Set<string>;
  };
  const tableSettings = new Map<string, TableSettings>();
  const keyNames = new Map<string, { pk: string; sk: string | undefined }>();
  const owners = new Map<string, KeyOwner>();
  // Every requested entity gets an array, even if none of its items exist.
  const allResponses: Record<string, Record<string, unknown>[]> = {};

  for (const req of requests) {
    allResponses[req.entity.name] ??= [];
    const table = req.entity.table;
    const tableName = table.tableName;
    const projection = req.projection && req.projection.length > 0 ? req.projection : undefined;

    const settings = tableSettings.get(tableName) ?? {
      consistentRead: false,
      fullItems: false,
      attributes: new Set<string>(),
    };
    settings.consistentRead ||= req.consistentRead === true;
    if (projection) projection.forEach((a) => settings.attributes.add(a));
    else settings.fullItems = true;
    tableSettings.set(tableName, settings);

    const skName = req.entity.sortKey ? table.sortKey?.name : undefined;
    keyNames.set(tableName, { pk: table.partitionKey.name, sk: table.sortKey?.name });

    for (const keyInput of req.keys) {
      const keyResult = buildKey(req.entity, keyInput);
      if (!keyResult.success) {
        return err(createDynamoError("key", keyResult.error.message, keyResult.error));
      }

      owners.set(
        keyIdentity(
          tableName,
          keyResult.data[table.partitionKey.name],
          skName ? keyResult.data[skName] : undefined,
        ),
        { entityName: req.entity.name, projection },
      );

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

      flatKeys.push({ tableName, key });
    }
  }

  const tableConfigs = new Map<
    string,
    { consistentRead?: boolean; projectionExpression?: string; expressionAttributeNames?: Record<string, string> }
  >();
  for (const [tableName, settings] of tableSettings) {
    const names = keyNames.get(tableName)!;
    const projection = settings.fullItems
      ? undefined
      : buildProjection([
          ...new Set([
            ...settings.attributes,
            names.pk,
            ...(names.sk ? [names.sk] : []),
          ]),
        ]);
    tableConfigs.set(tableName, {
      ...(settings.consistentRead ? { consistentRead: true } : {}),
      ...(projection
        ? {
            projectionExpression: projection.expression,
            expressionAttributeNames: { ...projection.names },
          }
        : {}),
    });
  }

  // 2. Chunk into groups of 100 and execute each chunk
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
      owners,
      keyNames,
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
        owners,
        keyNames,
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

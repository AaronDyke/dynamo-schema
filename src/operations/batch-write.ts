/**
 * BatchWrite operation: writes multiple items across entities with auto-chunking
 * and exponential backoff retry for unprocessed items.
 *
 * DynamoDB limits batch write to 25 items per request. When DynamoDB throttles
 * a batch and returns UnprocessedItems, this operation retries automatically
 * with exponential backoff until all items are written or the attempt limit
 * is reached.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { BatchWriteRequest } from "../adapters/adapter.js";
import type { DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { validate } from "../validation/validate.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { buildStoredItem } from "../keys/item-keys.js";
import { marshallItem } from "../marshalling/marshall.js";
import { type RetryOptions, computeBackoffDelay, sleep } from "../utils/retry.js";

/** Maximum items per BatchWriteItem request. */
const BATCH_WRITE_LIMIT = 25;

/** A put request for batch write. */
export interface BatchPutRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly type: "put";
  readonly entity: EntityDefinition<S>;
  readonly data: StandardSchemaV1.InferOutput<S>;
}

/** A delete request for batch write. */
export interface BatchDeleteRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly type: "delete";
  readonly entity: EntityDefinition<S>;
  readonly keyInput: Readonly<Record<string, string>>;
}

/** A single batch write request item. */
export type BatchWriteRequestItem = BatchPutRequest | BatchDeleteRequest;

/** Options for batch write. */
export interface BatchWriteOptions {
  readonly skipValidation?: boolean | undefined;
  /**
   * Retry options for handling DynamoDB's `UnprocessedItems` responses.
   *
   * When DynamoDB throttles a batch write and returns some items as unprocessed,
   * the operation retries those items automatically with exponential backoff.
   *
   * Defaults: `{ maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 5000 }`
   * (1 initial attempt + up to 3 retries at 100ms, 200ms, 400ms).
   */
  readonly retryOptions?: RetryOptions | undefined;
}

/**
 * Builds a DynamoDB item with key attributes from entity data.
 */
const buildItemWithKeys = (
  entity: EntityDefinition,
  data: Record<string, unknown>,
): Result<Record<string, unknown>, Error> => buildStoredItem(entity, data);

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
 * The error returned by {@link executeBatchWrite}: a `DynamoError` plus the
 * requests that were not confirmed written.
 */
export interface BatchWriteError extends DynamoError {
  /**
   * Every request that was not confirmed written, in the order they were
   * passed in. Requests not listed here were written. Retrying exactly these
   * completes the batch.
   *
   * When the failure happens before anything is sent (validation, key
   * building, marshalling), this is every request.
   */
  readonly unprocessed: readonly BatchWriteRequestItem[];
}

/** A request in adapter form, with its position in the caller's list. */
interface FlatRequest {
  readonly index: number;
  readonly tableName: string;
  readonly identity: string;
  readonly request:
    | { readonly type: "put"; readonly item: Record<string, unknown> }
    | { readonly type: "delete"; readonly key: Record<string, unknown> };
}

/** Identifies a write by table and key attribute values (in adapter form). */
const writeIdentity = (
  tableName: string,
  keyNames: { readonly pk: string; readonly sk: string | undefined },
  attributes: Readonly<Record<string, unknown>>,
): string =>
  JSON.stringify([
    tableName,
    attributes[keyNames.pk],
    keyNames.sk ? attributes[keyNames.sk] : null,
  ]);

/**
 * Executes a BatchWrite operation with auto-chunking and exponential backoff
 * retry.
 *
 * - Requests are sent in the order given, in chunks of 25 (the DynamoDB limit).
 * - When DynamoDB returns `UnprocessedItems`, they are retried with
 *   exponential backoff (default: up to 3 retries at 100ms, 200ms, 400ms).
 * - On any failure, the error's `unprocessed` lists every request that was not
 *   confirmed written. Chunks sent before the failure stay written.
 *
 * @param adapter - The SDK adapter
 * @param requests - Array of put/delete requests across entities
 * @param options - Optional batch write options
 * @returns A Result indicating success, or a {@link BatchWriteError}
 *
 * @example
 * ```ts
 * const result = await executeBatchWrite(adapter, requests);
 * if (!result.success) {
 *   // Retry only what wasn't written
 *   await executeBatchWrite(adapter, result.error.unprocessed);
 * }
 * ```
 */
export const executeBatchWrite = async (
  adapter: SDKAdapter,
  requests: readonly BatchWriteRequestItem[],
  options?: BatchWriteOptions,
): Promise<Result<void, BatchWriteError>> => {
  const fail = (
    error: DynamoError,
    unprocessedIndexes: Iterable<number>,
  ): Result<void, BatchWriteError> => {
    const indexes = [...new Set(unprocessedIndexes)].sort((a, b) => a - b);
    return err(
      Object.freeze({
        ...error,
        unprocessed: Object.freeze(indexes.map((i) => requests[i]!)),
      }),
    );
  };
  const allIndexes = requests.map((_, i) => i);

  // 1. Validate, build and marshall every request before sending anything
  const flatRequests: FlatRequest[] = [];

  for (const [index, req] of requests.entries()) {
    const table = req.entity.table;
    const keyNames = {
      pk: table.partitionKey.name,
      sk: req.entity.sortKey ? table.sortKey?.name : undefined,
    };

    if (req.type === "put") {
      // Validate if not skipped
      if (!options?.skipValidation) {
        const validationResult = await validate(req.entity.schema, req.data);
        if (!validationResult.success) {
          return fail(
            createDynamoError(
              "validation",
              validationResult.error.message,
              validationResult.error,
            ),
            allIndexes,
          );
        }
      }

      const itemResult = buildItemWithKeys(
        req.entity,
        req.data as Record<string, unknown>,
      );
      if (!itemResult.success) {
        return fail(
          createDynamoError("key", itemResult.error.message, itemResult.error),
          allIndexes,
        );
      }

      let item = itemResult.data;
      if (adapter.isRaw) {
        const marshalled = marshallItem(item);
        if (!marshalled.success) {
          return fail(
            createDynamoError("marshalling", marshalled.error.message, marshalled.error),
            allIndexes,
          );
        }
        item = marshalled.data;
      }

      flatRequests.push({
        index,
        tableName: table.tableName,
        identity: writeIdentity(table.tableName, keyNames, item),
        request: { type: "put", item },
      });
    } else {
      const keyResult = buildKey(req.entity, req.keyInput);
      if (!keyResult.success) {
        return fail(
          createDynamoError("key", keyResult.error.message, keyResult.error),
          allIndexes,
        );
      }

      let key = keyResult.data;
      if (adapter.isRaw) {
        const marshalled = marshallItem(key);
        if (!marshalled.success) {
          return fail(
            createDynamoError("marshalling", marshalled.error.message, marshalled.error),
            allIndexes,
          );
        }
        key = marshalled.data;
      }

      flatRequests.push({
        index,
        tableName: table.tableName,
        identity: writeIdentity(table.tableName, keyNames, key),
        request: { type: "delete", key },
      });
    }
  }

  // Key attribute names per table, to match DynamoDB's UnprocessedItems back to requests
  const keyNamesByTable = new Map(
    requests.map((req) => [
      req.entity.table.tableName,
      {
        pk: req.entity.table.partitionKey.name,
        sk: req.entity.sortKey ? req.entity.table.sortKey?.name : undefined,
      },
    ]),
  );

  const chunks = chunk(flatRequests, BATCH_WRITE_LIMIT);
  const maxAttempts = options?.retryOptions?.maxAttempts ?? 4;

  // 2. Execute each chunk
  for (const [chunkIndex, chunkItems] of chunks.entries()) {
    const laterIndexes = chunks.slice(chunkIndex + 1).flat().map((r) => r.index);

    /** Maps DynamoDB's unprocessed items back to indexes in this chunk. */
    const indexesOf = (pending: ReadonlyArray<BatchWriteRequest>): number[] =>
      pending.flatMap((batchReq) => {
        const keyNames = keyNamesByTable.get(batchReq.tableName);
        return batchReq.requests.flatMap((r) => {
          if (!keyNames) return [];
          const identity = writeIdentity(
            batchReq.tableName,
            keyNames,
            r.type === "put" ? r.item : r.key,
          );
          return chunkItems.filter((f) => f.identity === identity).map((f) => f.index);
        });
      });

    // Group chunk items by table
    const chunkByTable = new Map<string, Array<FlatRequest["request"]>>();
    for (const item of chunkItems) {
      if (!chunkByTable.has(item.tableName)) {
        chunkByTable.set(item.tableName, []);
      }
      chunkByTable.get(item.tableName)!.push(item.request);
    }

    const batchReqs: BatchWriteRequest[] = [];
    for (const [tableName, reqs] of chunkByTable) {
      batchReqs.push({ tableName, requests: reqs });
    }

    // 3. Initial call. If it throws, nothing in this chunk is confirmed written.
    let result;
    try {
      result = await adapter.batchWriteItem(batchReqs);
    } catch (cause) {
      return fail(
        createDynamoError(
          "dynamo",
          cause instanceof Error ? cause.message : "BatchWrite operation failed",
          cause,
        ),
        [...chunkItems.map((r) => r.index), ...laterIndexes],
      );
    }

    // 4. Retry unprocessed items with exponential backoff
    let unprocessed: ReadonlyArray<BatchWriteRequest> = result.unprocessedItems;

    for (let retryIndex = 0; retryIndex < maxAttempts - 1 && unprocessed.length > 0; retryIndex++) {
      const delay = computeBackoffDelay(retryIndex, options?.retryOptions);
      await sleep(delay);

      try {
        const retryResult = await adapter.batchWriteItem(unprocessed);
        unprocessed = retryResult.unprocessedItems;
      } catch (cause) {
        return fail(
          createDynamoError(
            "dynamo",
            cause instanceof Error ? cause.message : "BatchWrite retry failed",
            cause,
          ),
          [...indexesOf(unprocessed), ...laterIndexes],
        );
      }
    }

    // 5. Fail if items remain unprocessed after all attempts
    if (unprocessed.length > 0) {
      const totalUnprocessed = unprocessed.reduce((n, req) => n + req.requests.length, 0);
      return fail(
        createDynamoError(
          "dynamo",
          `BatchWrite: ${totalUnprocessed} item(s) remained unprocessed after ${maxAttempts} attempt(s). ` +
            `Consider increasing retryOptions.maxAttempts or checking for persistent throttling. ` +
            `error.unprocessed lists every request that was not written.`,
        ),
        [...indexesOf(unprocessed), ...laterIndexes],
      );
    }
  }

  return ok(undefined);
};

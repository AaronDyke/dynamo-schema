/**
 * BatchWrite operation: writes multiple items across entities with auto-chunking.
 *
 * DynamoDB limits batch write to 25 items per request.
 * This operation handles chunking automatically.
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
import { marshallItem } from "../marshalling/marshall.js";

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
}

/**
 * Builds a DynamoDB item with key attributes from entity data.
 */
const buildItemWithKeys = (
  entity: EntityDefinition,
  data: Record<string, unknown>,
): Result<Record<string, unknown>, Error> => {
  const record = { ...data };

  const pkTemplate = parseTemplate(entity.partitionKey);
  const pkResult = buildKeyValue(pkTemplate, record);
  if (!pkResult.success) return pkResult;
  record[entity.table.partitionKey.name] = pkResult.data;

  if (entity.sortKey && entity.table.sortKey) {
    const skTemplate = parseTemplate(entity.sortKey);
    const skResult = buildKeyValue(skTemplate, record);
    if (!skResult.success) return skResult;
    record[entity.table.sortKey.name] = skResult.data;
  }

  // Build index keys
  if (entity.indexes) {
    const indexes = entity.indexes as Record<
      string,
      { partitionKey: string; sortKey?: string }
    >;
    const tableIndexes = entity.table.indexes as Record<
      string,
      { partitionKey: { name: string }; sortKey?: { name: string } }
    >;
    for (const [indexKey, indexMapping] of Object.entries(indexes)) {
      const tableIndex = tableIndexes[indexKey];
      if (!tableIndex) continue;

      const idxPkTemplate = parseTemplate(indexMapping.partitionKey);
      const idxPkResult = buildKeyValue(idxPkTemplate, data);
      if (!idxPkResult.success) return idxPkResult;
      record[tableIndex.partitionKey.name] = idxPkResult.data;

      if (indexMapping.sortKey && tableIndex.sortKey) {
        const idxSkTemplate = parseTemplate(indexMapping.sortKey);
        const idxSkResult = buildKeyValue(idxSkTemplate, data);
        if (!idxSkResult.success) return idxSkResult;
        record[tableIndex.sortKey.name] = idxSkResult.data;
      }
    }
  }

  return ok(record);
};

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
 * Executes a BatchWrite operation with auto-chunking.
 *
 * @param adapter - The SDK adapter
 * @param requests - Array of put/delete requests across entities
 * @param options - Optional batch write options
 * @returns A Result indicating success or a DynamoError
 */
export const executeBatchWrite = async (
  adapter: SDKAdapter,
  requests: readonly BatchWriteRequestItem[],
  options?: BatchWriteOptions,
): Promise<Result<void, DynamoError>> => {
  // 1. Process each request into adapter format, grouped by table
  const tableRequests = new Map<
    string,
    Array<{ type: "put"; item: Record<string, unknown> } | { type: "delete"; key: Record<string, unknown> }>
  >();

  for (const req of requests) {
    if (req.type === "put") {
      // Validate if not skipped
      if (!options?.skipValidation) {
        const validationResult = await validate(req.entity.schema, req.data);
        if (!validationResult.success) {
          return err(
            createDynamoError(
              "validation",
              validationResult.error.message,
              validationResult.error,
            ),
          );
        }
      }

      const itemResult = buildItemWithKeys(
        req.entity,
        req.data as Record<string, unknown>,
      );
      if (!itemResult.success) {
        return err(createDynamoError("key", itemResult.error.message, itemResult.error));
      }

      let item = itemResult.data;
      if (adapter.isRaw) {
        const marshalled = marshallItem(item);
        if (!marshalled.success) {
          return err(
            createDynamoError("marshalling", marshalled.error.message, marshalled.error),
          );
        }
        item = marshalled.data;
      }

      const tableName = req.entity.table.tableName;
      if (!tableRequests.has(tableName)) {
        tableRequests.set(tableName, []);
      }
      tableRequests.get(tableName)!.push({ type: "put", item });
    } else {
      const keyResult = buildKey(req.entity, req.keyInput);
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

      const tableName = req.entity.table.tableName;
      if (!tableRequests.has(tableName)) {
        tableRequests.set(tableName, []);
      }
      tableRequests.get(tableName)!.push({ type: "delete", key });
    }
  }

  // 2. Build BatchWriteRequest objects
  const allBatchRequests: BatchWriteRequest[] = [];
  for (const [tableName, reqs] of tableRequests) {
    allBatchRequests.push({ tableName, requests: reqs });
  }

  // 3. Flatten all requests and chunk into groups of 25
  type FlatRequest = { tableName: string; request: { type: "put"; item: Record<string, unknown> } | { type: "delete"; key: Record<string, unknown> } };
  const flatRequests: FlatRequest[] = [];
  for (const batchReq of allBatchRequests) {
    for (const req of batchReq.requests) {
      flatRequests.push({ tableName: batchReq.tableName, request: req });
    }
  }

  const chunks = chunk(flatRequests, BATCH_WRITE_LIMIT);

  // 4. Execute each chunk
  for (const chunkItems of chunks) {
    // Group chunk items by table
    const chunkByTable = new Map<
      string,
      Array<{ type: "put"; item: Record<string, unknown> } | { type: "delete"; key: Record<string, unknown> }>
    >();
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

    try {
      const result = await adapter.batchWriteItem(batchReqs);

      // Handle unprocessed items with a single retry
      if (result.unprocessedItems.length > 0) {
        try {
          await adapter.batchWriteItem(result.unprocessedItems);
        } catch (cause) {
          return err(
            createDynamoError(
              "dynamo",
              cause instanceof Error
                ? cause.message
                : "BatchWrite retry failed",
              cause,
            ),
          );
        }
      }
    } catch (cause) {
      return err(
        createDynamoError(
          "dynamo",
          cause instanceof Error ? cause.message : "BatchWrite operation failed",
          cause,
        ),
      );
    }
  }

  return ok(undefined);
};

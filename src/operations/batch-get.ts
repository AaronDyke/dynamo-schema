/**
 * BatchGet operation: retrieves multiple items across entities with auto-chunking.
 *
 * DynamoDB limits batch get to 100 items per request.
 * This operation handles chunking automatically.
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

/** Maximum items per BatchGetItem request. */
const BATCH_GET_LIMIT = 100;

/** A single entity batch get request. */
export interface BatchGetEntityRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly entity: EntityDefinition<S>;
  readonly keys: readonly Readonly<Record<string, string>>[];
  readonly consistentRead?: boolean | undefined;
  readonly projection?: readonly string[] | undefined;
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
 * Executes a BatchGet operation with auto-chunking.
 *
 * @param adapter - The SDK adapter
 * @param requests - Array of entity get requests
 * @returns A Result containing responses grouped by entity name, or a DynamoError
 */
export const executeBatchGet = async (
  adapter: SDKAdapter,
  requests: readonly BatchGetEntityRequest[],
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

  // 2. Chunk and execute
  const allResponses: Record<string, Record<string, unknown>[]> = {};
  const keyChunks = chunk(flatKeys, BATCH_GET_LIMIT);

  for (const chunkKeys of keyChunks) {
    // Group by table
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

    try {
      const result = await adapter.batchGetItem(batchReqs);

      // Process responses
      for (const [tableName, items] of Object.entries(result.responses)) {
        // Find entity name for this table
        const entityName =
          chunkKeys.find((fk) => fk.tableName === tableName)?.entityName ??
          tableName;

        if (!allResponses[entityName]) {
          allResponses[entityName] = [];
        }

        for (const rawItem of items) {
          if (adapter.isRaw) {
            const unmarshalled = unmarshallItem(rawItem as AttributeMap);
            if (!unmarshalled.success) {
              return err(
                createDynamoError(
                  "marshalling",
                  unmarshalled.error.message,
                  unmarshalled.error,
                ),
              );
            }
            allResponses[entityName]!.push(unmarshalled.data);
          } else {
            allResponses[entityName]!.push(rawItem as Record<string, unknown>);
          }
        }
      }

      // Handle unprocessed keys with a single retry
      if (result.unprocessedKeys.length > 0) {
        try {
          const retryResult = await adapter.batchGetItem(result.unprocessedKeys);
          for (const [tableName, items] of Object.entries(retryResult.responses)) {
            const entityName =
              chunkKeys.find((fk) => fk.tableName === tableName)?.entityName ??
              tableName;

            if (!allResponses[entityName]) {
              allResponses[entityName] = [];
            }

            for (const rawItem of items) {
              if (adapter.isRaw) {
                const unmarshalled = unmarshallItem(rawItem as AttributeMap);
                if (!unmarshalled.success) {
                  return err(
                    createDynamoError(
                      "marshalling",
                      unmarshalled.error.message,
                      unmarshalled.error,
                    ),
                  );
                }
                allResponses[entityName]!.push(unmarshalled.data);
              } else {
                allResponses[entityName]!.push(rawItem as Record<string, unknown>);
              }
            }
          }
        } catch (cause) {
          return err(
            createDynamoError(
              "dynamo",
              cause instanceof Error ? cause.message : "BatchGet retry failed",
              cause,
            ),
          );
        }
      }
    } catch (cause) {
      return err(
        createDynamoError(
          "dynamo",
          cause instanceof Error ? cause.message : "BatchGet operation failed",
          cause,
        ),
      );
    }
  }

  return ok(Object.freeze({ responses: Object.freeze(allResponses) }));
};

/**
 * Put operation: validates data, builds keys, and writes an item.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { PutOptions, DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { validate } from "../validation/validate.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { marshallValue } from "../marshalling/marshall.js";
import { resolveFilterInput } from "./filter.js";

/**
 * Executes a Put operation for the given entity.
 *
 * @param entity - The entity definition
 * @param adapter - The SDK adapter
 * @param data - The item data to put
 * @param options - Optional put options (condition, skip validation, etc.)
 * @returns A Result indicating success or a DynamoError
 */
export const executePut = async <
  S extends StandardSchemaV1,
>(
  entity: EntityDefinition<S>,
  adapter: SDKAdapter,
  data: StandardSchemaV1.InferOutput<S>,
  options?: PutOptions,
): Promise<Result<StandardSchemaV1.InferOutput<S>, DynamoError>> => {
  // 1. Validate via schema (unless skipped)
  if (!options?.skipValidation) {
    const validationResult = await validate(entity.schema, data);
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

  // 1.5. Run beforePut hook (unless skipped)
  let itemData_: StandardSchemaV1.InferOutput<S> = data;
  if (!options?.skipHooks && entity.hooks?.beforePut) {
    try {
      itemData_ = await entity.hooks.beforePut(data);
    } catch (cause) {
      return err(
        createDynamoError(
          "hook",
          cause instanceof Error
            ? `beforePut hook failed: ${cause.message}`
            : "beforePut hook failed",
          cause,
        ),
      );
    }
  }

  // 2. Build key attributes
  const record = itemData_ as Record<string, unknown>;
  const pkTemplate = parseTemplate(entity.partitionKey);
  const pkResult = buildKeyValue(pkTemplate, record);
  if (!pkResult.success) {
    return err(createDynamoError("key", pkResult.error.message, pkResult.error));
  }

  let skValue: string | undefined;
  if (entity.sortKey) {
    const skTemplate = parseTemplate(entity.sortKey);
    const skResult = buildKeyValue(skTemplate, record);
    if (!skResult.success) {
      return err(
        createDynamoError("key", skResult.error.message, skResult.error),
      );
    }
    skValue = skResult.data;
  }

  // 3. Build the item with key attributes
  const itemData: Record<string, unknown> = { ...record };
  itemData[entity.table.partitionKey.name] = pkResult.data;
  if (entity.sortKey && entity.table.sortKey && skValue !== undefined) {
    itemData[entity.table.sortKey.name] = skValue;
  }

  // 4. Inject default TTL if configured
  const ttlAttributeName = entity.table.ttl?.attributeName;
  const defaultTtlSeconds = entity.ttl?.defaultTtlSeconds;
  if (ttlAttributeName && defaultTtlSeconds !== undefined && defaultTtlSeconds > 0) {
    itemData[ttlAttributeName] = Math.floor(Date.now() / 1000) + defaultTtlSeconds;
  }

  // 5. Build index key attributes
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
      const idxPkResult = buildKeyValue(idxPkTemplate, record);
      if (!idxPkResult.success) {
        return err(
          createDynamoError("key", idxPkResult.error.message, idxPkResult.error),
        );
      }
      itemData[tableIndex.partitionKey.name] = idxPkResult.data;

      if (indexMapping.sortKey && tableIndex.sortKey) {
        const idxSkTemplate = parseTemplate(indexMapping.sortKey);
        const idxSkResult = buildKeyValue(idxSkTemplate, record);
        if (!idxSkResult.success) {
          return err(
            createDynamoError(
              "key",
              idxSkResult.error.message,
              idxSkResult.error,
            ),
          );
        }
        itemData[tableIndex.sortKey.name] = idxSkResult.data;
      }
    }
  }

  // 6. Resolve condition expression (string, FilterNode, or callback)
  const resolvedCondition = resolveFilterInput(options?.condition);

  // 7. Marshall if using raw adapter
  let item: Record<string, unknown> = itemData;
  let exprValues: Record<string, unknown> = {
    ...resolvedCondition.expressionAttributeValues,
    ...options?.expressionValues,
  };

  if (adapter.isRaw) {
    const marshalled = marshallItem(itemData);
    if (!marshalled.success) {
      return err(
        createDynamoError(
          "marshalling",
          marshalled.error.message,
          marshalled.error,
        ),
      );
    }
    item = marshalled.data;

    if (Object.keys(exprValues).length > 0) {
      const marshalledValues: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(exprValues)) {
        const mv = marshallValue(v);
        if (!mv.success) {
          return err(
            createDynamoError("marshalling", mv.error.message, mv.error),
          );
        }
        marshalledValues[k] = mv.data;
      }
      exprValues = marshalledValues;
    }
  }

  // 8. Merge condition expression attribute names
  const mergedNames: Record<string, string> = {
    ...resolvedCondition.expressionAttributeNames,
    ...options?.expressionNames,
  };

  // 9. Call adapter
  try {
    await adapter.putItem({
      tableName: entity.table.tableName,
      item,
      conditionExpression: resolvedCondition.expression,
      expressionAttributeNames:
        Object.keys(mergedNames).length > 0 ? mergedNames : undefined,
      expressionAttributeValues:
        Object.keys(exprValues).length > 0 ? exprValues : undefined,
    });
    return ok(itemData as StandardSchemaV1.InferOutput<S>);
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "Put operation failed",
        cause,
      ),
    );
  }
};

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
import { buildStoredItem } from "../keys/item-keys.js";
import { marshallItem } from "../marshalling/marshall.js";
import { marshallValue } from "../marshalling/marshall.js";
import { resolveFilterInput } from "./filter.js";
import { mergeExpressionMaps } from "../utils/merge-expression-maps.js";

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

  // 2-4. Build the stored item: key and index attributes (indexes are sparse),
  //      plus the default TTL when the item doesn't already carry one
  const record = itemData_ as Record<string, unknown>;
  const itemResult = buildStoredItem(entity as EntityDefinition, record);
  if (!itemResult.success) {
    return err(createDynamoError("key", itemResult.error.message, itemResult.error));
  }
  const itemData = itemResult.data;

  // 6. Resolve condition expression (string, FilterNode, or callback)
  const resolvedCondition = resolveFilterInput(options?.condition);

  // 7. Marshall if using raw adapter
  let item: Record<string, unknown> = itemData;
  const mergedValuesResult = mergeExpressionMaps(
    "expressionValues",
    resolvedCondition.expressionAttributeValues,
    options?.expressionValues,
  );
  if (!mergedValuesResult.success) {
    return err(createDynamoError("validation", mergedValuesResult.error.message, mergedValuesResult.error));
  }
  let exprValues: Record<string, unknown> = mergedValuesResult.data;

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
  const mergedNamesResult = mergeExpressionMaps(
    "expressionNames",
    resolvedCondition.expressionAttributeNames,
    options?.expressionNames,
  );
  if (!mergedNamesResult.success) {
    return err(createDynamoError("validation", mergedNamesResult.error.message, mergedNamesResult.error));
  }
  const mergedNames = mergedNamesResult.data;

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

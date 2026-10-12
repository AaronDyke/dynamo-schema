/**
 * Scan operation: scans items from a table/index and returns typed results.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { ScanOptions, ScanResult, DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { marshallItem } from "../marshalling/marshall.js";
import { marshallValue } from "../marshalling/marshall.js";
import { unmarshallItem } from "../marshalling/unmarshall.js";
import { buildProjection } from "../utils/expression-names.js";
import { resolveFilterInput } from "./filter.js";
import type { AttributeMap } from "../marshalling/types.js";
import { mergeExpressionMaps } from "../utils/merge-expression-maps.js";
import { runAfterGetOnList } from "../utils/run-hook.js";

/**
 * Executes a Scan operation for the given entity.
 *
 * @param entity - The entity definition
 * @param adapter - The SDK adapter
 * @param options - Optional scan options (filter, limit, projection, etc.)
 * @returns A Result containing typed scan results or a DynamoError
 */
export const executeScan = async <
  S extends StandardSchemaV1,
>(
  entity: EntityDefinition<S>,
  adapter: SDKAdapter,
  options?: ScanOptions,
): Promise<Result<ScanResult<StandardSchemaV1.InferOutput<S>>, DynamoError>> => {
  // 1. Build projection expression
  const projection = buildProjection(options?.projection);

  // 2. Resolve filter expression (string, FilterNode, or callback)
  const resolvedFilter = resolveFilterInput(options?.filter);

  // 3. Merge expression attribute names
  const mergedNamesResult = mergeExpressionMaps(
    "expressionNames",
    { ...projection?.names, ...resolvedFilter.expressionAttributeNames },
    options?.expressionNames,
  );
  if (!mergedNamesResult.success) {
    return err(createDynamoError("validation", mergedNamesResult.error.message, mergedNamesResult.error));
  }
  const mergedNames = mergedNamesResult.data;

  // 4. Marshall expression values if using raw adapter
  const mergedValuesResult = mergeExpressionMaps(
    "expressionValues",
    resolvedFilter.expressionAttributeValues,
    options?.expressionValues,
  );
  if (!mergedValuesResult.success) {
    return err(createDynamoError("validation", mergedValuesResult.error.message, mergedValuesResult.error));
  }
  let exprValues: Record<string, unknown> = mergedValuesResult.data;
  let startKey = options?.startKey;

  if (adapter.isRaw) {
    if (Object.keys(exprValues).length > 0) {
      const mv: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(exprValues)) {
        const marshalled = marshallValue(v);
        if (!marshalled.success) {
          return err(
            createDynamoError("marshalling", marshalled.error.message, marshalled.error),
          );
        }
        mv[k] = marshalled.data;
      }
      exprValues = mv;
    }

    if (startKey && !isAttributeMap(startKey)) {
      const mk = marshallItem(startKey as Record<string, unknown>);
      if (!mk.success) {
        return err(
          createDynamoError("marshalling", mk.error.message, mk.error),
        );
      }
      startKey = mk.data;
    }
  }

  // 5. Call adapter
  let result;
  try {
    result = await adapter.scan({
      tableName: entity.table.tableName,
      indexName: options?.indexName,
      filterExpression: resolvedFilter.expression,
      expressionAttributeNames:
        Object.keys(mergedNames).length > 0 ? mergedNames : undefined,
      expressionAttributeValues:
        Object.keys(exprValues).length > 0 ? exprValues : undefined,
      limit: options?.limit,
      exclusiveStartKey: startKey,
      consistentRead: options?.consistentRead,
      projectionExpression: projection?.expression,
    });
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "Scan operation failed",
        cause,
      ),
    );
  }

  // 6. Unmarshall items if using raw adapter
  const items: Array<StandardSchemaV1.InferOutput<S>> = [];
  for (const rawItem of result.items) {
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
      items.push(unmarshalled.data as StandardSchemaV1.InferOutput<S>);
    } else {
      items.push(rawItem as StandardSchemaV1.InferOutput<S>);
    }
  }

  // Run afterGet on each item (unless skipped); items mapped to undefined are dropped
  const hooks = entity.hooks;
  const hooked = await runAfterGetOnList(
    !options?.skipHooks && hooks?.afterGet
      ? (item: StandardSchemaV1.InferOutput<S> | undefined) => hooks.afterGet!(item)
      : undefined,
    items,
  );
  if (!hooked.success) return err(hooked.error);

  return ok(
    Object.freeze({
      items: Object.freeze(hooked.data),
      count: hooked.data.length,
      lastKey: result.lastEvaluatedKey,
    }),
  );
};

/** Simple check for whether a value looks like an AttributeMap. */
const isAttributeMap = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const entries = Object.values(value as Record<string, unknown>);
  if (entries.length === 0) return false;
  const first = entries[0];
  if (typeof first !== "object" || first === null) return false;
  const keys = Object.keys(first as Record<string, unknown>);
  return (
    keys.length === 1 &&
    ["S", "N", "B", "SS", "NS", "BS", "L", "M", "NULL", "BOOL"].includes(
      keys[0] ?? "",
    )
  );
};

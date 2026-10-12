/**
 * Query operation: builds key conditions, queries items, and returns typed results.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { IndexDefinition } from "../types/table.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { QueryOptions, QueryResult, DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { marshallValue } from "../marshalling/marshall.js";
import { unmarshallItem } from "../marshalling/unmarshall.js";
import { aliasAttributeName, buildProjection } from "../utils/expression-names.js";
import { valuePlaceholder } from "../utils/expression-values.js";
import { resolveFilterInput } from "./filter.js";
import type { AttributeMap } from "../marshalling/types.js";
import { mergeExpressionMaps } from "../utils/merge-expression-maps.js";

/** Key condition for the partition key. */
export interface PartitionKeyCondition {
  readonly [field: string]: string;
}

/** Sort key condition operators. */
export type SortKeyCondition =
  | { readonly eq: string }
  | { readonly lt: string }
  | { readonly lte: string }
  | { readonly gt: string }
  | { readonly gte: string }
  | { readonly between: readonly [string, string] }
  | { readonly beginsWith: string };

/** Input for the query operation on an entity. */
export interface EntityQueryInput {
  readonly partitionKey: PartitionKeyCondition;
  readonly sortKeyCondition?: SortKeyCondition | undefined;
  readonly options?: QueryOptions | undefined;
}

/**
 * Builds a key condition expression from partition key and optional sort key condition.
 */
const buildKeyConditionExpression = (
  pkAttrName: string,
  skAttrName: string | undefined,
  pkValue: string,
  sortKeyCondition: SortKeyCondition | undefined,
): {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
} => {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  // Partition key condition
  const pkAlias = aliasAttributeName("pk");
  const pkValueAlias = valuePlaceholder("pk");
  names[pkAlias] = pkAttrName;
  values[pkValueAlias] = pkValue;

  let expression = `${pkAlias} = ${pkValueAlias}`;

  // Sort key condition (if provided)
  if (sortKeyCondition && skAttrName) {
    const skAlias = aliasAttributeName("sk");
    names[skAlias] = skAttrName;

    if ("eq" in sortKeyCondition) {
      const skValueAlias = valuePlaceholder("sk");
      values[skValueAlias] = sortKeyCondition.eq;
      expression += ` AND ${skAlias} = ${skValueAlias}`;
    } else if ("lt" in sortKeyCondition) {
      const skValueAlias = valuePlaceholder("sk");
      values[skValueAlias] = sortKeyCondition.lt;
      expression += ` AND ${skAlias} < ${skValueAlias}`;
    } else if ("lte" in sortKeyCondition) {
      const skValueAlias = valuePlaceholder("sk");
      values[skValueAlias] = sortKeyCondition.lte;
      expression += ` AND ${skAlias} <= ${skValueAlias}`;
    } else if ("gt" in sortKeyCondition) {
      const skValueAlias = valuePlaceholder("sk");
      values[skValueAlias] = sortKeyCondition.gt;
      expression += ` AND ${skAlias} > ${skValueAlias}`;
    } else if ("gte" in sortKeyCondition) {
      const skValueAlias = valuePlaceholder("sk");
      values[skValueAlias] = sortKeyCondition.gte;
      expression += ` AND ${skAlias} >= ${skValueAlias}`;
    } else if ("between" in sortKeyCondition) {
      const skLoAlias = valuePlaceholder("skLo");
      const skHiAlias = valuePlaceholder("skHi");
      values[skLoAlias] = sortKeyCondition.between[0];
      values[skHiAlias] = sortKeyCondition.between[1];
      expression += ` AND ${skAlias} BETWEEN ${skLoAlias} AND ${skHiAlias}`;
    } else if ("beginsWith" in sortKeyCondition) {
      const skValueAlias = valuePlaceholder("sk");
      values[skValueAlias] = sortKeyCondition.beginsWith;
      expression += ` AND begins_with(${skAlias}, ${skValueAlias})`;
    }
  }

  return { expression, names, values };
};

/**
 * Resolves the partition key template, pk attribute name, and sk attribute name to use
 * for a query — accounting for GSI/LSI when an indexName is provided.
 */
const resolveQueryKeyInfo = (
  entity: EntityDefinition,
  indexName: string | undefined,
): Result<
  { pkTemplate: string; pkAttrName: string; skAttrName: string | undefined },
  DynamoError
> => {
  if (!indexName) {
    return ok({
      pkTemplate: entity.partitionKey,
      pkAttrName: entity.table.partitionKey.name,
      skAttrName: entity.table.sortKey?.name,
    });
  }

  // Find the table-level index definition by its DynamoDB indexName
  const tableIndexes = entity.table.indexes as Record<string, IndexDefinition>;
  const indexKey = Object.keys(tableIndexes).find(
    (k) => (tableIndexes[k] as IndexDefinition | undefined)?.indexName === indexName,
  );
  const tableIndex: IndexDefinition | undefined = indexKey ? tableIndexes[indexKey] : undefined;

  if (!indexKey || !tableIndex) {
    return err(
      createDynamoError(
        "key",
        `Index "${indexName}" is not defined on table "${entity.table.tableName}"`,
      ),
    );
  }

  const pkAttrName = tableIndex.partitionKey.name;
  const skAttrName = tableIndex.sortKey?.name;

  // Find the entity-level key template override for this index
  const entityIndexes = entity.indexes as
    | Record<string, { partitionKey: string; sortKey?: string }>
    | undefined;
  const entityIndex = entityIndexes?.[indexKey];

  if (!entityIndex) {
    return err(
      createDynamoError(
        "key",
        `No key template defined on entity "${entity.name}" for index "${indexName}". ` +
          `Add an entry for "${indexKey}" in the entity's indexes config.`,
      ),
    );
  }

  return ok({ pkTemplate: entityIndex.partitionKey, pkAttrName, skAttrName });
};

/**
 * Executes a Query operation for the given entity.
 *
 * @param entity - The entity definition
 * @param adapter - The SDK adapter
 * @param input - The query input with partition key, optional sort key condition, and options
 * @returns A Result containing typed query results or a DynamoError
 */
export const executeQuery = async <
  S extends StandardSchemaV1,
>(
  entity: EntityDefinition<S>,
  adapter: SDKAdapter,
  input: EntityQueryInput,
): Promise<Result<QueryResult<StandardSchemaV1.InferOutput<S>>, DynamoError>> => {
  const options = input.options;

  // 1. Resolve which key template and attribute names to use (base table vs. index)
  const keyInfoResult = resolveQueryKeyInfo(entity, options?.indexName);
  if (!keyInfoResult.success) {
    return err(keyInfoResult.error);
  }
  const { pkTemplate, pkAttrName, skAttrName } = keyInfoResult.data;

  // 2. Build partition key value from template and input
  const pkTemplateParsed = parseTemplate(pkTemplate);
  const pkResult = buildKeyValue(pkTemplateParsed, input.partitionKey);
  if (!pkResult.success) {
    return err(createDynamoError("key", pkResult.error.message, pkResult.error));
  }

  // 3. Build key condition expression
  const keyCondition = buildKeyConditionExpression(
    pkAttrName,
    skAttrName,
    pkResult.data,
    input.sortKeyCondition,
  );

  // 4. Build projection expression
  const projection = buildProjection(options?.projection);

  // 5. Resolve filter expression (string, FilterNode, or callback)
  const resolvedFilter = resolveFilterInput(options?.filter);

  // 6. Merge all expression attribute names and values
  const mergedNamesResult = mergeExpressionMaps(
    "expressionNames",
    { ...keyCondition.names, ...projection?.names, ...resolvedFilter.expressionAttributeNames },
    options?.expressionNames,
  );
  if (!mergedNamesResult.success) {
    return err(createDynamoError("validation", mergedNamesResult.error.message, mergedNamesResult.error));
  }
  const mergedNames = mergedNamesResult.data;

  const mergedValuesResult = mergeExpressionMaps(
    "expressionValues",
    { ...keyCondition.values, ...resolvedFilter.expressionAttributeValues },
    options?.expressionValues,
  );
  if (!mergedValuesResult.success) {
    return err(createDynamoError("validation", mergedValuesResult.error.message, mergedValuesResult.error));
  }
  const mergedValues = mergedValuesResult.data;

  // 7. Marshall values if using raw adapter
  let marshalledValues: Record<string, unknown> = mergedValues;
  let startKey = options?.startKey;

  if (adapter.isRaw) {
    const mv: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mergedValues)) {
      const marshalled = marshallValue(v);
      if (!marshalled.success) {
        return err(
          createDynamoError("marshalling", marshalled.error.message, marshalled.error),
        );
      }
      mv[k] = marshalled.data;
    }
    marshalledValues = mv;

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

  // 8. Call adapter
  let result;
  try {
    result = await adapter.query({
      tableName: entity.table.tableName,
      indexName: options?.indexName,
      keyConditionExpression: keyCondition.expression,
      filterExpression: resolvedFilter.expression,
      expressionAttributeNames:
        Object.keys(mergedNames).length > 0 ? mergedNames : undefined,
      expressionAttributeValues:
        Object.keys(marshalledValues).length > 0 ? marshalledValues : undefined,
      limit: options?.limit,
      exclusiveStartKey: startKey,
      scanIndexForward: options?.scanIndexForward,
      consistentRead: options?.consistentRead,
      projectionExpression: projection?.expression,
    });
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "Query operation failed",
        cause,
      ),
    );
  }

  // 9. Unmarshall items if using raw adapter
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

  return ok(
    Object.freeze({
      items: Object.freeze(items),
      count: result.count,
      lastKey: result.lastEvaluatedKey,
    }),
  );
};

/** Simple check for whether a value looks like an AttributeMap (has AttributeValue-shaped values). */
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

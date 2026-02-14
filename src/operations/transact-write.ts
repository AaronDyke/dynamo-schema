/**
 * TransactWrite operation: executes multiple write operations atomically.
 *
 * DynamoDB limits transactions to 100 items per request.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter, TransactWriteItem } from "../adapters/adapter.js";
import type { DynamoError } from "../types/operations.js";
import type { UpdateBuilder } from "../types/update-expression.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { validate } from "../validation/validate.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { marshallValue } from "../marshalling/marshall.js";
import { createUpdateBuilder, compileUpdateActions } from "./update.js";

/** A transactional put request. */
export interface TransactPutRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly type: "put";
  readonly entity: EntityDefinition<S>;
  readonly data: StandardSchemaV1.InferOutput<S>;
  readonly condition?: string | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
}

/** A transactional delete request. */
export interface TransactDeleteRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly type: "delete";
  readonly entity: EntityDefinition<S>;
  readonly keyInput: Readonly<Record<string, string>>;
  readonly condition?: string | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
}

/** A transactional update request. */
export interface TransactUpdateRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly type: "update";
  readonly entity: EntityDefinition<S>;
  readonly keyInput: Readonly<Record<string, string>>;
  readonly builderFn: (
    builder: UpdateBuilder<StandardSchemaV1.InferOutput<S>>,
  ) => UpdateBuilder<StandardSchemaV1.InferOutput<S>>;
  readonly condition?: string | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
}

/** A transactional condition check request. */
export interface TransactConditionCheckRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly type: "conditionCheck";
  readonly entity: EntityDefinition<S>;
  readonly keyInput: Readonly<Record<string, string>>;
  readonly condition: string;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
}

/** A single transact write request item. */
export type TransactWriteRequestItem =
  | TransactPutRequest
  | TransactDeleteRequest
  | TransactUpdateRequest
  | TransactConditionCheckRequest;

/** Options for transact write. */
export interface TransactWriteOptions {
  readonly skipValidation?: boolean | undefined;
}

/**
 * Builds key from entity and key input.
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
 * Builds item with key attributes for a put.
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
 * Marshalls expression values for raw adapters.
 */
const marshallExprValues = (
  values: Record<string, unknown>,
): Result<Record<string, unknown>, Error> => {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const marshalled = marshallValue(v);
    if (!marshalled.success) return marshalled;
    result[k] = marshalled.data;
  }
  return ok(result);
};

/**
 * Executes a TransactWrite operation.
 *
 * @param adapter - The SDK adapter
 * @param requests - Array of transactional write requests
 * @param options - Optional transact write options
 * @returns A Result indicating success or a DynamoError
 */
export const executeTransactWrite = async (
  adapter: SDKAdapter,
  requests: readonly TransactWriteRequestItem[],
  options?: TransactWriteOptions,
): Promise<Result<void, DynamoError>> => {
  const transactItems: TransactWriteItem[] = [];

  for (const req of requests) {
    switch (req.type) {
      case "put": {
        // Validate
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
        let exprValues = req.expressionValues;

        if (adapter.isRaw) {
          const marshalled = marshallItem(item);
          if (!marshalled.success) {
            return err(
              createDynamoError("marshalling", marshalled.error.message, marshalled.error),
            );
          }
          item = marshalled.data;

          if (exprValues) {
            const mv = marshallExprValues(exprValues);
            if (!mv.success) {
              return err(createDynamoError("marshalling", mv.error.message, mv.error));
            }
            exprValues = mv.data;
          }
        }

        transactItems.push({
          type: "put",
          tableName: req.entity.table.tableName,
          item,
          conditionExpression: req.condition,
          expressionAttributeNames: req.expressionNames,
          expressionAttributeValues: exprValues,
        });
        break;
      }

      case "delete": {
        const keyResult = buildKey(req.entity, req.keyInput);
        if (!keyResult.success) {
          return err(createDynamoError("key", keyResult.error.message, keyResult.error));
        }

        let key = keyResult.data;
        let exprValues = req.expressionValues;

        if (adapter.isRaw) {
          const marshalled = marshallItem(key);
          if (!marshalled.success) {
            return err(
              createDynamoError("marshalling", marshalled.error.message, marshalled.error),
            );
          }
          key = marshalled.data;

          if (exprValues) {
            const mv = marshallExprValues(exprValues);
            if (!mv.success) {
              return err(createDynamoError("marshalling", mv.error.message, mv.error));
            }
            exprValues = mv.data;
          }
        }

        transactItems.push({
          type: "delete",
          tableName: req.entity.table.tableName,
          key,
          conditionExpression: req.condition,
          expressionAttributeNames: req.expressionNames,
          expressionAttributeValues: exprValues,
        });
        break;
      }

      case "update": {
        const keyResult = buildKey(req.entity, req.keyInput);
        if (!keyResult.success) {
          return err(createDynamoError("key", keyResult.error.message, keyResult.error));
        }

        // Build update expression
        const builder = createUpdateBuilder<unknown>();
        const configured = req.builderFn(builder as unknown as UpdateBuilder<StandardSchemaV1.InferOutput<StandardSchemaV1>>);
        const actions = configured.build();
        const compiled = compileUpdateActions(actions);

        const mergedNames: Record<string, string> = {
          ...compiled.expressionAttributeNames,
          ...req.expressionNames,
        };

        let mergedValues: Record<string, unknown> = {
          ...compiled.expressionAttributeValues,
          ...req.expressionValues,
        };

        let key = keyResult.data;

        if (adapter.isRaw) {
          const km = marshallItem(key);
          if (!km.success) {
            return err(
              createDynamoError("marshalling", km.error.message, km.error),
            );
          }
          key = km.data;

          const mv = marshallExprValues(mergedValues);
          if (!mv.success) {
            return err(createDynamoError("marshalling", mv.error.message, mv.error));
          }
          mergedValues = mv.data;
        }

        transactItems.push({
          type: "update",
          tableName: req.entity.table.tableName,
          key,
          updateExpression: compiled.updateExpression,
          conditionExpression: req.condition,
          expressionAttributeNames:
            Object.keys(mergedNames).length > 0 ? mergedNames : undefined,
          expressionAttributeValues:
            Object.keys(mergedValues).length > 0 ? mergedValues : undefined,
        });
        break;
      }

      case "conditionCheck": {
        const keyResult = buildKey(req.entity, req.keyInput);
        if (!keyResult.success) {
          return err(createDynamoError("key", keyResult.error.message, keyResult.error));
        }

        let key = keyResult.data;
        let exprValues = req.expressionValues;

        if (adapter.isRaw) {
          const km = marshallItem(key);
          if (!km.success) {
            return err(
              createDynamoError("marshalling", km.error.message, km.error),
            );
          }
          key = km.data;

          if (exprValues) {
            const mv = marshallExprValues(exprValues);
            if (!mv.success) {
              return err(createDynamoError("marshalling", mv.error.message, mv.error));
            }
            exprValues = mv.data;
          }
        }

        transactItems.push({
          type: "conditionCheck",
          tableName: req.entity.table.tableName,
          key,
          conditionExpression: req.condition,
          expressionAttributeNames: req.expressionNames,
          expressionAttributeValues: exprValues,
        });
        break;
      }
    }
  }

  // Execute transaction
  try {
    await adapter.transactWriteItems(transactItems);
    return ok(undefined);
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "TransactWrite operation failed",
        cause,
      ),
    );
  }
};

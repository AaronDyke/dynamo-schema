/**
 * TransactGet operation: retrieves multiple items atomically.
 *
 * DynamoDB limits transactions to 100 items per request.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter, TransactGetItem } from "../adapters/adapter.js";
import type { DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { unmarshallItem } from "../marshalling/unmarshall.js";
import type { AttributeMap } from "../marshalling/types.js";

/** A single transact get request for an entity. */
export interface TransactGetEntityRequest<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly entity: EntityDefinition<S>;
  readonly keyInput: Readonly<Record<string, string>>;
  readonly projection?: readonly string[] | undefined;
}

/** Result of a transact get, items in the same order as requests. */
export interface TransactGetResult {
  readonly items: readonly (Record<string, unknown> | undefined)[];
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
 * Executes a TransactGet operation.
 *
 * @param adapter - The SDK adapter
 * @param requests - Array of entity get requests
 * @returns A Result containing items in request order, or a DynamoError
 */
export const executeTransactGet = async (
  adapter: SDKAdapter,
  requests: readonly TransactGetEntityRequest[],
): Promise<Result<TransactGetResult, DynamoError>> => {
  const transactItems: TransactGetItem[] = [];

  for (const req of requests) {
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

    // Build projection
    let projectionExpression: string | undefined;
    let expressionAttributeNames: Record<string, string> | undefined;
    if (req.projection && req.projection.length > 0) {
      expressionAttributeNames = {};
      const parts: string[] = [];
      for (const attr of req.projection) {
        const alias = `#proj_${attr}`;
        expressionAttributeNames[alias] = attr;
        parts.push(alias);
      }
      projectionExpression = parts.join(", ");
    }

    transactItems.push({
      tableName: req.entity.table.tableName,
      key,
      projectionExpression,
      expressionAttributeNames,
    });
  }

  // Execute transaction
  let result;
  try {
    result = await adapter.transactGetItems(transactItems);
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "TransactGet operation failed",
        cause,
      ),
    );
  }

  // Process results
  const items: (Record<string, unknown> | undefined)[] = [];
  for (const rawItem of result.items) {
    if (rawItem === undefined) {
      items.push(undefined);
    } else if (adapter.isRaw) {
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
      items.push(unmarshalled.data);
    } else {
      items.push(rawItem as Record<string, unknown>);
    }
  }

  return ok(Object.freeze({ items: Object.freeze(items) }));
};

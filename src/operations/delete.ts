/**
 * Delete operation: builds a key and deletes an item.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { DeleteOptions, DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { marshallValue } from "../marshalling/marshall.js";

/**
 * Executes a Delete operation for the given entity.
 *
 * @param entity - The entity definition
 * @param adapter - The SDK adapter
 * @param keyInput - An object with the key fields needed to identify the item
 * @param options - Optional delete options (condition expression)
 * @returns A Result indicating success or a DynamoError
 */
export const executeDelete = async <
  S extends StandardSchemaV1,
>(
  entity: EntityDefinition<S>,
  adapter: SDKAdapter,
  keyInput: Readonly<Record<string, string>>,
  options?: DeleteOptions,
): Promise<Result<void, DynamoError>> => {
  // 1. Build key
  const pkTemplate = parseTemplate(entity.partitionKey);
  const pkResult = buildKeyValue(pkTemplate, keyInput);
  if (!pkResult.success) {
    return err(createDynamoError("key", pkResult.error.message, pkResult.error));
  }

  const key: Record<string, unknown> = {
    [entity.table.partitionKey.name]: pkResult.data,
  };

  if (entity.sortKey && entity.table.sortKey) {
    const skTemplate = parseTemplate(entity.sortKey);
    const skResult = buildKeyValue(skTemplate, keyInput);
    if (!skResult.success) {
      return err(
        createDynamoError("key", skResult.error.message, skResult.error),
      );
    }
    key[entity.table.sortKey.name] = skResult.data;
  }

  // 1.5. Run beforeDelete hook (unless skipped)
  if (!options?.skipHooks && entity.hooks?.beforeDelete) {
    try {
      await entity.hooks.beforeDelete(keyInput);
    } catch (cause) {
      return err(
        createDynamoError(
          "hook",
          cause instanceof Error
            ? `beforeDelete hook failed: ${cause.message}`
            : "beforeDelete hook failed",
          cause,
        ),
      );
    }
  }

  // 2. Marshall key if using raw adapter
  let marshalledKey: Record<string, unknown> = key;
  let exprValues = options?.expressionValues;

  if (adapter.isRaw) {
    const m = marshallItem(key);
    if (!m.success) {
      return err(
        createDynamoError("marshalling", m.error.message, m.error),
      );
    }
    marshalledKey = m.data;

    if (exprValues) {
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

  // 3. Call adapter
  try {
    await adapter.deleteItem({
      tableName: entity.table.tableName,
      key: marshalledKey,
      conditionExpression: options?.condition,
      expressionAttributeNames: options?.expressionNames,
      expressionAttributeValues: exprValues,
    });
    return ok(undefined);
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "Delete operation failed",
        cause,
      ),
    );
  }
};

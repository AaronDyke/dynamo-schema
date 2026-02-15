/**
 * Remove TTL operation: removes the TTL attribute from a specific item.
 *
 * Useful for items that should no longer expire, without needing to perform
 * a full update with a builder function.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { aliasAttributeName } from "../utils/expression-names.js";

/**
 * Removes the TTL attribute from an existing item.
 *
 * Requires the entity's table to have a `ttl` config with an `attributeName`.
 * Calling this on a table without TTL configured returns a validation error.
 *
 * @param entity - The entity definition (must have `table.ttl` configured)
 * @param adapter - The SDK adapter
 * @param keyInput - An object with the key fields needed to identify the item
 * @returns A Result indicating success or a DynamoError
 *
 * @example
 * ```ts
 * const result = await users.removeTtl({ userId: "123" });
 * if (!result.success) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export const executeRemoveTtl = async <
  S extends StandardSchemaV1,
>(
  entity: EntityDefinition<S>,
  adapter: SDKAdapter,
  keyInput: Readonly<Record<string, string>>,
): Promise<Result<void, DynamoError>> => {
  // 1. Check TTL is configured on the table
  const ttlAttributeName = entity.table.ttl?.attributeName;
  if (!ttlAttributeName) {
    return err(
      createDynamoError(
        "validation",
        `No TTL attribute configured on table "${entity.table.tableName}". Add a ttl config to defineTable() first.`,
      ),
    );
  }

  // 2. Build key
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

  // 3. Build REMOVE expression for the TTL attribute
  const nameAlias = aliasAttributeName(`r0_${ttlAttributeName}`);
  const updateExpression = `REMOVE ${nameAlias}`;
  const expressionAttributeNames: Record<string, string> = {
    [nameAlias]: ttlAttributeName,
  };

  // 4. Marshall key if using raw adapter
  let marshalledKey: Record<string, unknown> = key;

  if (adapter.isRaw) {
    const km = marshallItem(key);
    if (!km.success) {
      return err(
        createDynamoError("marshalling", km.error.message, km.error),
      );
    }
    marshalledKey = km.data;
  }

  // 5. Call adapter
  try {
    await adapter.updateItem({
      tableName: entity.table.tableName,
      key: marshalledKey,
      updateExpression,
      expressionAttributeNames,
      returnValues: "NONE",
    });
    return ok(undefined);
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "Remove TTL operation failed",
        cause,
      ),
    );
  }
};

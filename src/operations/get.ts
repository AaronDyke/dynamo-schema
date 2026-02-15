/**
 * Get operation: builds a key, fetches an item, and validates the output.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { GetOptions, DynamoError } from "../types/operations.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { unmarshallItem } from "../marshalling/unmarshall.js";
import type { AttributeMap } from "../marshalling/types.js";

/**
 * Executes a Get operation for the given entity.
 *
 * @param entity - The entity definition
 * @param adapter - The SDK adapter
 * @param keyInput - An object with the key fields needed to identify the item
 * @param options - Optional get options (consistent read, projection)
 * @returns A Result containing the typed item or undefined (if not found), or a DynamoError
 */
export const executeGet = async <
  S extends StandardSchemaV1,
>(
  entity: EntityDefinition<S>,
  adapter: SDKAdapter,
  keyInput: Readonly<Record<string, string>>,
  options?: GetOptions,
): Promise<Result<StandardSchemaV1.InferOutput<S> | undefined, DynamoError>> => {
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

  // 2. Marshall key if using raw adapter
  let marshalledKey: Record<string, unknown> = key;
  if (adapter.isRaw) {
    const m = marshallItem(key);
    if (!m.success) {
      return err(
        createDynamoError("marshalling", m.error.message, m.error),
      );
    }
    marshalledKey = m.data;
  }

  // 3. Build projection expression
  let projectionExpression: string | undefined;
  let expressionAttributeNames: Record<string, string> | undefined;
  if (options?.projection && options.projection.length > 0) {
    expressionAttributeNames = {};
    const projParts: string[] = [];
    for (const attr of options.projection) {
      const alias = `#proj_${attr}`;
      expressionAttributeNames[alias] = attr;
      projParts.push(alias);
    }
    projectionExpression = projParts.join(", ");
  }

  // 4. Call adapter
  let result;
  try {
    result = await adapter.getItem({
      tableName: entity.table.tableName,
      key: marshalledKey,
      consistentRead: options?.consistentRead,
      projectionExpression,
      expressionAttributeNames,
    });
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "Get operation failed",
        cause,
      ),
    );
  }

  // 5. Item not found
  if (!result.item) {
    // Run afterGet hook with undefined (unless skipped)
    if (!options?.skipHooks && entity.hooks?.afterGet) {
      try {
        const hooked = await entity.hooks.afterGet(undefined);
        return ok(hooked);
      } catch (cause) {
        return err(
          createDynamoError(
            "hook",
            cause instanceof Error
              ? `afterGet hook failed: ${cause.message}`
              : "afterGet hook failed",
            cause,
          ),
        );
      }
    }
    return ok(undefined);
  }

  // 6. Unmarshall if using raw adapter
  let itemData: Record<string, unknown>;
  if (adapter.isRaw) {
    const unmarshalled = unmarshallItem(result.item as AttributeMap);
    if (!unmarshalled.success) {
      return err(
        createDynamoError(
          "marshalling",
          unmarshalled.error.message,
          unmarshalled.error,
        ),
      );
    }
    itemData = unmarshalled.data;
  } else {
    itemData = result.item as Record<string, unknown>;
  }

  // 6.5. Run afterGet hook with found item (unless skipped)
  if (!options?.skipHooks && entity.hooks?.afterGet) {
    try {
      const hooked = await entity.hooks.afterGet(
        itemData as StandardSchemaV1.InferOutput<S>,
      );
      return ok(hooked);
    } catch (cause) {
      return err(
        createDynamoError(
          "hook",
          cause instanceof Error
            ? `afterGet hook failed: ${cause.message}`
            : "afterGet hook failed",
          cause,
        ),
      );
    }
  }

  return ok(itemData as StandardSchemaV1.InferOutput<S>);
};

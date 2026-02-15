/**
 * Update operation: builds a key, constructs an update expression, and updates an item.
 *
 * Includes a chainable, immutable UpdateBuilder for type-safe update expressions.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type { DynamoError } from "../types/operations.js";
import type { UpdateActions, UpdateBuilder } from "../types/update-expression.js";
import { type Result, ok, err } from "../types/common.js";
import { createDynamoError } from "../types/operations.js";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { marshallItem } from "../marshalling/marshall.js";
import { marshallValue } from "../marshalling/marshall.js";
import { unmarshallItem } from "../marshalling/unmarshall.js";
import type { AttributeMap } from "../marshalling/types.js";
import { aliasAttributeName } from "../utils/expression-names.js";
import { valuePlaceholder } from "../utils/expression-values.js";

/** Options for Update operations. */
export interface UpdateOptions {
  readonly condition?: string | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
  /**
   * When `true`, suppresses the automatic TTL refresh even if the entity has
   * `autoUpdateTtlSeconds` configured. Useful for administrative updates where
   * you do not want to extend the item's lifetime.
   */
  readonly skipAutoTtl?: boolean | undefined;
  /** When `true`, all entity hooks are bypassed for this call. Default: `false`. */
  readonly skipHooks?: boolean | undefined;
}

/**
 * Creates an immutable UpdateBuilder for type-safe update expression construction.
 *
 * @returns A new empty UpdateBuilder
 */
export const createUpdateBuilder = <T>(): UpdateBuilder<T> => {
  const emptyActions: UpdateActions = Object.freeze({
    sets: [],
    setIfNotExists: [],
    removes: [],
    adds: [],
    deletes: [],
  });

  const makeBuilder = (actions: UpdateActions): UpdateBuilder<T> =>
    Object.freeze({
      set: <K extends string & keyof T>(path: K, value: T[K]) =>
        makeBuilder(
          Object.freeze({
            ...actions,
            sets: [...actions.sets, Object.freeze({ path, value })],
          }),
        ),

      setIfNotExists: <K extends string & keyof T>(path: K, value: T[K]) =>
        makeBuilder(
          Object.freeze({
            ...actions,
            setIfNotExists: [
              ...actions.setIfNotExists,
              Object.freeze({ path, value }),
            ],
          }),
        ),

      remove: <K extends string & keyof T>(path: K) =>
        makeBuilder(
          Object.freeze({
            ...actions,
            removes: [...actions.removes, path],
          }),
        ),

      add: <K extends string & keyof T>(path: K, value: T[K]) =>
        makeBuilder(
          Object.freeze({
            ...actions,
            adds: [...actions.adds, Object.freeze({ path, value })],
          }),
        ),

      delete: <K extends string & keyof T>(path: K, value: T[K]) =>
        makeBuilder(
          Object.freeze({
            ...actions,
            deletes: [...actions.deletes, Object.freeze({ path, value })],
          }),
        ),

      build: () => actions,
    });

  return makeBuilder(emptyActions);
};

/**
 * Compiles UpdateActions into a DynamoDB UpdateExpression string,
 * ExpressionAttributeNames, and ExpressionAttributeValues.
 *
 * @param actions - The accumulated update actions
 * @returns The compiled expression parts
 */
export const compileUpdateActions = (
  actions: UpdateActions,
): {
  updateExpression: string;
  expressionAttributeNames: Record<string, string>;
  expressionAttributeValues: Record<string, unknown>;
} => {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const clauses: string[] = [];

  // SET clause (includes regular sets and setIfNotExists)
  const setParts: string[] = [];

  actions.sets.forEach((action, i) => {
    const nameAlias = aliasAttributeName(`s${i}_${action.path}`);
    const valueAlias = valuePlaceholder(`s${i}_${action.path}`);
    names[nameAlias] = action.path;
    values[valueAlias] = action.value;
    setParts.push(`${nameAlias} = ${valueAlias}`);
  });

  actions.setIfNotExists.forEach((action, i) => {
    const nameAlias = aliasAttributeName(`sne${i}_${action.path}`);
    const valueAlias = valuePlaceholder(`sne${i}_${action.path}`);
    names[nameAlias] = action.path;
    values[valueAlias] = action.value;
    setParts.push(`${nameAlias} = if_not_exists(${nameAlias}, ${valueAlias})`);
  });

  if (setParts.length > 0) {
    clauses.push(`SET ${setParts.join(", ")}`);
  }

  // REMOVE clause
  if (actions.removes.length > 0) {
    const removeParts = actions.removes.map((path, i) => {
      const nameAlias = aliasAttributeName(`r${i}_${path}`);
      names[nameAlias] = path;
      return nameAlias;
    });
    clauses.push(`REMOVE ${removeParts.join(", ")}`);
  }

  // ADD clause
  if (actions.adds.length > 0) {
    const addParts = actions.adds.map((action, i) => {
      const nameAlias = aliasAttributeName(`a${i}_${action.path}`);
      const valueAlias = valuePlaceholder(`a${i}_${action.path}`);
      names[nameAlias] = action.path;
      values[valueAlias] = action.value;
      return `${nameAlias} ${valueAlias}`;
    });
    clauses.push(`ADD ${addParts.join(", ")}`);
  }

  // DELETE clause
  if (actions.deletes.length > 0) {
    const deleteParts = actions.deletes.map((action, i) => {
      const nameAlias = aliasAttributeName(`d${i}_${action.path}`);
      const valueAlias = valuePlaceholder(`d${i}_${action.path}`);
      names[nameAlias] = action.path;
      values[valueAlias] = action.value;
      return `${nameAlias} ${valueAlias}`;
    });
    clauses.push(`DELETE ${deleteParts.join(", ")}`);
  }

  return Object.freeze({
    updateExpression: clauses.join(" "),
    expressionAttributeNames: Object.freeze(names),
    expressionAttributeValues: Object.freeze(values),
  });
};

/**
 * Executes an Update operation for the given entity.
 *
 * @param entity - The entity definition
 * @param adapter - The SDK adapter
 * @param keyInput - An object with the key fields needed to identify the item
 * @param builderFn - A function that receives an UpdateBuilder and returns a configured builder
 * @param options - Optional update options (condition expression, return values)
 * @returns A Result indicating success or a DynamoError
 */
export const executeUpdate = async <
  S extends StandardSchemaV1,
>(
  entity: EntityDefinition<S>,
  adapter: SDKAdapter,
  keyInput: Readonly<Record<string, string>>,
  builderFn: (
    builder: UpdateBuilder<StandardSchemaV1.InferOutput<S>>,
  ) => UpdateBuilder<StandardSchemaV1.InferOutput<S>>,
  options?: UpdateOptions,
): Promise<Result<StandardSchemaV1.InferOutput<S>, DynamoError>> => {
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

  // 2. Build update expression from builder
  const builder = createUpdateBuilder<StandardSchemaV1.InferOutput<S>>();
  const configured = builderFn(builder);
  let actions = configured.build();

  // 2.5. Run beforeUpdate hook (unless skipped)
  if (!options?.skipHooks && entity.hooks?.beforeUpdate) {
    try {
      actions = await entity.hooks.beforeUpdate(keyInput, actions);
    } catch (cause) {
      return err(
        createDynamoError(
          "hook",
          cause instanceof Error
            ? `beforeUpdate hook failed: ${cause.message}`
            : "beforeUpdate hook failed",
          cause,
        ),
      );
    }
  }

  // Inject auto-TTL refresh if configured and not suppressed
  let actionsWithTtl = actions;
  const ttlAttributeName = entity.table.ttl?.attributeName;
  const autoUpdateTtlSeconds = entity.ttl?.autoUpdateTtlSeconds;
  if (
    ttlAttributeName &&
    autoUpdateTtlSeconds !== undefined &&
    autoUpdateTtlSeconds > 0 &&
    !options?.skipAutoTtl
  ) {
    actionsWithTtl = Object.freeze({
      ...actions,
      sets: [
        ...actions.sets,
        Object.freeze({
          path: ttlAttributeName,
          value: Math.floor(Date.now() / 1000) + autoUpdateTtlSeconds,
        }),
      ],
    });
  }

  if (
    actionsWithTtl.sets.length === 0 &&
    actionsWithTtl.setIfNotExists.length === 0 &&
    actionsWithTtl.removes.length === 0 &&
    actionsWithTtl.adds.length === 0 &&
    actionsWithTtl.deletes.length === 0
  ) {
    return err(
      createDynamoError("validation", "Update expression is empty; no actions specified"),
    );
  }

  const compiled = compileUpdateActions(actionsWithTtl);

  // 3. Merge user-provided expression names/values
  const mergedNames: Record<string, string> = {
    ...compiled.expressionAttributeNames,
    ...options?.expressionNames,
  };

  const mergedValues: Record<string, unknown> = {
    ...compiled.expressionAttributeValues,
    ...options?.expressionValues,
  };

  // 4. Marshall if using raw adapter
  let marshalledKey: Record<string, unknown> = key;
  let marshalledValues: Record<string, unknown> = mergedValues;

  if (adapter.isRaw) {
    const km = marshallItem(key);
    if (!km.success) {
      return err(
        createDynamoError("marshalling", km.error.message, km.error),
      );
    }
    marshalledKey = km.data;

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
  }

  // 5. Call adapter
  let updateResult;
  try {
    updateResult = await adapter.updateItem({
      tableName: entity.table.tableName,
      key: marshalledKey,
      updateExpression: compiled.updateExpression,
      conditionExpression: options?.condition,
      expressionAttributeNames:
        Object.keys(mergedNames).length > 0 ? mergedNames : undefined,
      expressionAttributeValues:
        Object.keys(marshalledValues).length > 0
          ? marshalledValues
          : undefined,
      returnValues: "ALL_NEW",
    });
  } catch (cause) {
    return err(
      createDynamoError(
        "dynamo",
        cause instanceof Error ? cause.message : "Update operation failed",
        cause,
      ),
    );
  }

  // 6. Return the new entity state from the response
  if (!updateResult.attributes) {
    return err(
      createDynamoError(
        "dynamo",
        "Update succeeded but no attributes were returned",
      ),
    );
  }

  let itemData: Record<string, unknown>;
  if (adapter.isRaw) {
    const unmarshalled = unmarshallItem(updateResult.attributes as AttributeMap);
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
    itemData = updateResult.attributes as Record<string, unknown>;
  }

  return ok(itemData as StandardSchemaV1.InferOutput<S>);
};

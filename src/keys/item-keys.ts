/**
 * Builds every key attribute a stored item needs: the table's partition and
 * sort key, plus the key attributes of each index the entity maps.
 */

import type { EntityDefinition } from "../types/entity.js";
import { type Result, ok, err } from "../types/common.js";
import { parseTemplate } from "./template-parser.js";
import { buildKeyValue } from "./key-builder.js";

/** An entity index mapping: key templates for one table index. */
interface IndexMapping {
  readonly partitionKey: string;
  readonly sortKey?: string | undefined;
}

/** The key attribute names of one table index. */
interface TableIndexKeys {
  readonly partitionKey: { readonly name: string };
  readonly sortKey?: { readonly name: string } | undefined;
}

const isAbsent = (value: unknown): boolean => value === undefined || value === null;

/**
 * Builds the key attributes of one index, or `undefined` when the item should
 * not appear in the index (a sparse index).
 *
 * An item is left out of the index when **every** field referenced by the
 * index's key templates is absent (`undefined` or `null`). If only some are
 * present, the item is ambiguous and an error is returned. Templates without
 * fields (static values) always apply.
 */
const buildIndexKeyAttributes = (
  mapping: IndexMapping,
  tableIndex: TableIndexKeys,
  data: Readonly<Record<string, unknown>>,
): Result<Record<string, string> | undefined, Error> => {
  const pkTemplate = parseTemplate(mapping.partitionKey);
  const skTemplate =
    mapping.sortKey !== undefined && tableIndex.sortKey
      ? parseTemplate(mapping.sortKey)
      : undefined;

  const fields = [...pkTemplate.fields, ...(skTemplate?.fields ?? [])];
  if (fields.length > 0 && fields.every((field) => isAbsent(data[field]))) {
    return ok(undefined);
  }

  const pkResult = buildKeyValue(pkTemplate, data);
  if (!pkResult.success) return pkResult;
  const attributes: Record<string, string> = {
    [tableIndex.partitionKey.name]: pkResult.data,
  };

  if (skTemplate && tableIndex.sortKey) {
    const skResult = buildKeyValue(skTemplate, data);
    if (!skResult.success) return skResult;
    attributes[tableIndex.sortKey.name] = skResult.data;
  }

  return ok(attributes);
};

/**
 * Builds the key attributes for an item about to be written: the table's
 * partition key, its sort key (when both the table and the entity define one),
 * and the keys of every index the entity maps.
 *
 * Indexes are sparse: when none of the fields an index's templates reference
 * are present in `data`, that index's attributes are omitted and the item
 * does not appear in the index.
 *
 * @param entity - The entity definition
 * @param data - The validated item data
 * @returns The key attributes, or an error if a required key field is
 *   missing, an index's fields are only partly present, or a field value
 *   contains its template delimiter
 *
 * @example
 * ```ts
 * // Entity: partitionKey "USER#{{userId}}", sortKey "PROFILE",
 * //         indexes: { gsi1: { partitionKey: "EMAIL#{{email}}" } }
 * buildItemKeyAttributes(entity, { userId: "1", email: "a@b.c" });
 * // => ok({ pk: "USER#1", sk: "PROFILE", gsi1pk: "EMAIL#a@b.c" })
 * buildItemKeyAttributes(entity, { userId: "1" });
 * // => ok({ pk: "USER#1", sk: "PROFILE" })  (no email: left out of gsi1)
 * ```
 */
export const buildItemKeyAttributes = (
  entity: EntityDefinition,
  data: Readonly<Record<string, unknown>>,
): Result<Readonly<Record<string, string>>, Error> => {
  const pkResult = buildKeyValue(parseTemplate(entity.partitionKey), data);
  if (!pkResult.success) return pkResult;
  const attributes: Record<string, string> = {
    [entity.table.partitionKey.name]: pkResult.data,
  };

  if (entity.sortKey && entity.table.sortKey) {
    const skResult = buildKeyValue(parseTemplate(entity.sortKey), data);
    if (!skResult.success) return skResult;
    attributes[entity.table.sortKey.name] = skResult.data;
  }

  const mappings = (entity.indexes ?? {}) as Readonly<Record<string, IndexMapping>>;
  const tableIndexes = entity.table.indexes as Readonly<Record<string, TableIndexKeys | undefined>>;

  for (const [indexKey, mapping] of Object.entries(mappings)) {
    const tableIndex = tableIndexes[indexKey];
    if (!tableIndex) continue;

    const indexResult = buildIndexKeyAttributes(mapping, tableIndex, data);
    if (!indexResult.success) {
      return err(new Error(`Index "${indexKey}": ${indexResult.error.message}`));
    }
    Object.assign(attributes, indexResult.data);
  }

  return ok(Object.freeze(attributes));
};

/** Formats a value for an error message without throwing (e.g. on `bigint`). */
const describe = (value: unknown): string =>
  typeof value === "string" ? `"${value}"` : String(value);

/**
 * Builds the full item to store: the validated data, plus its table and index
 * key attributes (see {@link buildItemKeyAttributes}), plus the entity's
 * default TTL.
 *
 * - If `data` already holds a **different** value under a generated key
 *   attribute name (for example a schema field called `pk`), an error is
 *   returned instead of silently overwriting it. An equal value is allowed,
 *   so an item read back with its key attributes can be written again.
 * - The default TTL (`entity.ttl.defaultTtlSeconds`) is only filled in when
 *   `data` has no value for the table's TTL attribute.
 *
 * @param entity - The entity definition
 * @param data - The validated item data
 * @param nowSeconds - Current Unix time in seconds, used for the default TTL
 * @returns The item to store, or an error for a key-building failure or a
 *   field that conflicts with a generated key attribute
 *
 * @example
 * ```ts
 * buildStoredItem(userEntity, { userId: "1", email: "a@b.c", name: "A" });
 * // => ok({ userId: "1", ..., pk: "USER#1", sk: "PROFILE", gsi1pk: ..., expiresAt: ... })
 * buildStoredItem(userEntity, { userId: "1", pk: "something-else", ... });
 * // => err(Error('Item field "pk" ... conflicts with the generated key attribute ...'))
 * ```
 */
export const buildStoredItem = (
  entity: EntityDefinition,
  data: Readonly<Record<string, unknown>>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Result<Record<string, unknown>, Error> => {
  const keyResult = buildItemKeyAttributes(entity, data);
  if (!keyResult.success) return keyResult;

  const conflict = Object.entries(keyResult.data).find(
    ([name, value]) => !isAbsent(data[name]) && data[name] !== value,
  );
  if (conflict) {
    const [name, value] = conflict;
    return err(
      new Error(
        `Item field "${name}" (${describe(data[name])}) conflicts with the generated key attribute ` +
          `of the same name (${describe(value)}). Rename the schema field or the table/index key attribute.`,
      ),
    );
  }

  const item: Record<string, unknown> = { ...data, ...keyResult.data };

  const ttlAttributeName = entity.table.ttl?.attributeName;
  const defaultTtlSeconds = entity.ttl?.defaultTtlSeconds;
  if (
    ttlAttributeName &&
    defaultTtlSeconds !== undefined &&
    defaultTtlSeconds > 0 &&
    isAbsent(item[ttlAttributeName])
  ) {
    item[ttlAttributeName] = nowSeconds + defaultTtlSeconds;
  }

  return ok(item);
};

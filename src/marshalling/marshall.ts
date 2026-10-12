/**
 * Marshalls JavaScript values into DynamoDB AttributeValue format.
 *
 * Self-contained implementation with no AWS SDK dependency.
 */

import { type Result, ok, err } from "../types/common.js";
import type { AttributeValue, AttributeMap } from "./types.js";

/**
 * Marshalls a single JavaScript value into a DynamoDB AttributeValue.
 *
 * Conversion rules:
 * - `null` / `undefined` -> `{ NULL: true }`
 * - `string` -> `{ S: "..." }`
 * - `number` / `bigint` -> `{ N: "..." }`
 * - `boolean` -> `{ BOOL: true/false }`
 * - `Uint8Array` -> `{ B: ... }`
 * - `Set<string>` -> `{ SS: [...] }`
 * - `Set<number>` -> `{ NS: [...] }`
 * - `Set<Uint8Array>` -> `{ BS: [...] }`
 * - `Array` -> `{ L: [...] }`
 * - Plain object (object literal or `Object.create(null)`) -> `{ M: { ... } }`
 *
 * Any other object (`Date`, `Map`, `ArrayBuffer`, class instances) is an
 * error rather than an empty map, because its data would be silently lost.
 *
 * @param value - The JavaScript value to marshall
 * @returns A Result containing the DynamoDB AttributeValue, or an error for
 *   unsupported values
 */
export const marshallValue = (
  value: unknown,
): Result<AttributeValue, Error> => {
  if (value === null || value === undefined) {
    return ok({ NULL: true });
  }

  if (typeof value === "string") {
    return ok({ S: value });
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return err(new Error(`Cannot marshall non-finite number: ${value}`));
    }
    return ok({ N: String(value) });
  }

  if (typeof value === "bigint") {
    return ok({ N: String(value) });
  }

  if (typeof value === "boolean") {
    return ok({ BOOL: value });
  }

  if (value instanceof Uint8Array) {
    return ok({ B: value });
  }

  if (value instanceof Set) {
    return marshallSet(value);
  }

  if (Array.isArray(value)) {
    return marshallList(value);
  }

  if (typeof value === "object") {
    if (!isPlainObject(value)) {
      return err(new Error(describeNonPlainObject(value)));
    }
    return marshallMap(value as Record<string, unknown>);
  }

  return err(new Error(`Cannot marshall value of type ${typeof value}`));
};

/**
 * True for object literals and `Object.create(null)` objects. Instances of
 * other classes (`Date`, `Map`, `ArrayBuffer`, user classes, ...) are not
 * plain: their data is usually not in own enumerable properties, so
 * marshalling them as maps would silently drop it.
 */
const isPlainObject = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Builds the error message for a non-plain object, with a hint for common types. */
const describeNonPlainObject = (value: object): string => {
  const name = value.constructor?.name || "object with a custom prototype";
  const hint =
    value instanceof Date
      ? " Convert it first, e.g. date.toISOString() or date.getTime()."
      : value instanceof Map
        ? " Convert it first with Object.fromEntries(map)."
        : value instanceof ArrayBuffer
          ? " Wrap it in a Uint8Array first."
          : " Convert it to a plain object, array, Set, string, number, boolean or Uint8Array first.";
  return `Cannot marshall ${name} instance; only plain objects are marshalled as maps.${hint}`;
};

const marshallSet = (
  set: Set<unknown>,
): Result<AttributeValue, Error> => {
  if (set.size === 0) {
    return err(new Error("Cannot marshall empty Set; DynamoDB does not support empty sets"));
  }

  const values = [...set];
  const first = values[0];

  if (typeof first === "string") {
    return ok({ SS: values as string[] });
  }

  if (typeof first === "number" || typeof first === "bigint") {
    return ok({ NS: (values as Array<number | bigint>).map(String) });
  }

  if (first instanceof Uint8Array) {
    return ok({ BS: values as Uint8Array[] });
  }

  return err(
    new Error(
      `Cannot marshall Set with element type ${typeof first}; only string, number, and Uint8Array sets are supported`,
    ),
  );
};

const marshallList = (
  list: readonly unknown[],
): Result<AttributeValue, Error> => {
  const items: AttributeValue[] = [];
  for (const item of list) {
    const result = marshallValue(item);
    if (!result.success) return result;
    items.push(result.data);
  }
  return ok({ L: items });
};

const marshallMap = (
  obj: Record<string, unknown>,
): Result<AttributeValue, Error> => {
  const map: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    const result = marshallValue(value);
    if (!result.success) return result;
    map[key] = result.data;
  }
  return ok({ M: map });
};

/**
 * Marshalls a plain JavaScript object into a DynamoDB item (AttributeMap).
 *
 * @param item - A plain object representing the item
 * @returns A Result containing the DynamoDB AttributeMap
 */
export const marshallItem = (
  item: Readonly<Record<string, unknown>>,
): Result<AttributeMap, Error> => {
  const map: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined) continue; // skip undefined attributes
    const result = marshallValue(value);
    if (!result.success) return result;
    map[key] = result.data;
  }
  return ok(map);
};

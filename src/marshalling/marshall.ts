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
 * - Plain object -> `{ M: { ... } }`
 *
 * @param value - The JavaScript value to marshall
 * @returns A Result containing the DynamoDB AttributeValue
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
    return marshallMap(value as Record<string, unknown>);
  }

  return err(new Error(`Cannot marshall value of type ${typeof value}`));
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

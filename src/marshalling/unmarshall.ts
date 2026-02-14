/**
 * Unmarshalls DynamoDB AttributeValue format back into JavaScript values.
 *
 * Self-contained implementation with no AWS SDK dependency.
 */

import { type Result, ok, err } from "../types/common.js";
import type { AttributeValue, AttributeMap } from "./types.js";
import { getAttributeValueType } from "./types.js";

/**
 * Unmarshalls a single DynamoDB AttributeValue into a JavaScript value.
 *
 * Conversion rules:
 * - `{ S: "..." }` -> `string`
 * - `{ N: "..." }` -> `number`
 * - `{ B: ... }` -> `Uint8Array`
 * - `{ SS: [...] }` -> `Set<string>`
 * - `{ NS: [...] }` -> `Set<number>`
 * - `{ BS: [...] }` -> `Set<Uint8Array>`
 * - `{ L: [...] }` -> `unknown[]`
 * - `{ M: { ... } }` -> `Record<string, unknown>`
 * - `{ NULL: true }` -> `null`
 * - `{ BOOL: ... }` -> `boolean`
 *
 * @param av - The DynamoDB AttributeValue to unmarshall
 * @returns A Result containing the JavaScript value
 */
export const unmarshallValue = (
  av: AttributeValue,
): Result<unknown, Error> => {
  const type = getAttributeValueType(av);

  switch (type) {
    case "S":
      return ok((av as { readonly S: string }).S);
    case "N": {
      const num = Number((av as { readonly N: string }).N);
      return ok(num);
    }
    case "B":
      return ok((av as { readonly B: Uint8Array }).B);
    case "SS":
      return ok(new Set((av as { readonly SS: readonly string[] }).SS));
    case "NS":
      return ok(
        new Set(
          (av as { readonly NS: readonly string[] }).NS.map(Number),
        ),
      );
    case "BS":
      return ok(
        new Set((av as { readonly BS: readonly Uint8Array[] }).BS),
      );
    case "L": {
      const list = (av as { readonly L: readonly AttributeValue[] }).L;
      const items: unknown[] = [];
      for (const item of list) {
        const result = unmarshallValue(item);
        if (!result.success) return result;
        items.push(result.data);
      }
      return ok(items);
    }
    case "M": {
      const map = (
        av as { readonly M: Readonly<Record<string, AttributeValue>> }
      ).M;
      const obj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(map)) {
        const result = unmarshallValue(val);
        if (!result.success) return result;
        obj[key] = result.data;
      }
      return ok(obj);
    }
    case "NULL":
      return ok(null);
    case "BOOL":
      return ok((av as { readonly BOOL: boolean }).BOOL);
    default:
      return err(new Error("Unrecognized AttributeValue type"));
  }
};

/**
 * Unmarshalls a DynamoDB item (AttributeMap) into a plain JavaScript object.
 *
 * @param item - The DynamoDB AttributeMap
 * @returns A Result containing the plain object
 */
export const unmarshallItem = (
  item: AttributeMap,
): Result<Record<string, unknown>, Error> => {
  const obj: Record<string, unknown> = {};
  for (const [key, av] of Object.entries(item)) {
    const result = unmarshallValue(av);
    if (!result.success) return result;
    obj[key] = result.data;
  }
  return ok(obj);
};

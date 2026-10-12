/**
 * Merges generated ExpressionAttributeNames / ExpressionAttributeValues with
 * caller-supplied ones, refusing conflicting keys.
 */

import { type Result, ok, err } from "../types/common.js";

/** Formats a value for an error message without throwing (e.g. on `bigint`). */
const describe = (value: unknown): string =>
  typeof value === "string" ? `"${value}"` : String(value);

/**
 * Merges caller-supplied expression names or values over the generated ones.
 *
 * A caller key that matches a generated placeholder is allowed only when it
 * maps to the identical value (`===`). Any other overlap would silently
 * redirect the generated expression to a different attribute or value, so it
 * is returned as an error instead.
 *
 * @param label - `"expressionNames"` or `"expressionValues"`, used in the error message
 * @param generated - Placeholders the library generated (key conditions, projections, builders)
 * @param user - Caller-supplied placeholders, if any
 * @returns The merged map, or an error naming the first conflicting key
 *
 * @example
 * ```ts
 * mergeExpressionMaps("expressionNames", { "#u0": "name" }, { "#age": "age" });
 * // => ok({ "#u0": "name", "#age": "age" })
 *
 * mergeExpressionMaps("expressionNames", { "#u0": "name" }, { "#u0": "email" });
 * // => err(Error('expressionNames key "#u0" conflicts with a generated placeholder ...'))
 * ```
 */
export const mergeExpressionMaps = <V>(
  label: "expressionNames" | "expressionValues",
  generated: Readonly<Record<string, V>>,
  user: Readonly<Record<string, V>> | undefined,
): Result<Record<string, V>, Error> => {
  const conflict = Object.keys(user ?? {}).find(
    (key) => Object.hasOwn(generated, key) && generated[key] !== user![key],
  );
  if (conflict !== undefined) {
    return err(
      new Error(
        `${label} key "${conflict}" conflicts with a generated placeholder ` +
          `(generated: ${describe(generated[conflict])}, provided: ${describe(user![conflict])}). ` +
          `Generated placeholders use the forms #pk, #sk, #u<n>, #p<n>, #f<n>, #f<n>_<m>, #ttl, :pk, :sk, :skLo, :skHi, :u<n> and :f<n>; choose a different key.`,
      ),
    );
  }
  return ok({ ...generated, ...user });
};

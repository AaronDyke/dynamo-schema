/**
 * Runs an entity lifecycle hook, converting a throw or rejection into a
 * `DynamoError` with `type: "hook"`.
 */

import { type Result, ok, err } from "../types/common.js";
import { type DynamoError, createDynamoError } from "../types/operations.js";

/**
 * Runs a hook and wraps its outcome in a `Result`.
 *
 * @param name - The hook name, used in the error message (e.g. `"beforePut"`)
 * @param hook - A thunk that calls the hook; may be sync or async
 * @returns The hook's return value, or a `"hook"` DynamoError whose message is
 *   `"<name> hook failed: <message>"` and whose `cause` is the thrown value
 *
 * @example
 * ```ts
 * const hooked = await runHook("beforePut", () => entity.hooks.beforePut(item));
 * if (!hooked.success) return err(hooked.error);
 * ```
 */
export const runHook = async <T>(
  name: string,
  hook: () => T | Promise<T>,
): Promise<Result<T, DynamoError>> => {
  try {
    return ok(await hook());
  } catch (cause) {
    return err(
      createDynamoError(
        "hook",
        cause instanceof Error ? `${name} hook failed: ${cause.message}` : `${name} hook failed`,
        cause,
      ),
    );
  }
};

/**
 * Runs an `afterGet` hook over a list of items, in order. Items the hook maps
 * to `undefined` are dropped, matching `get`, where `undefined` means "not
 * found" (e.g. a soft-deleted item).
 *
 * @param afterGet - The entity's `afterGet` hook, or `undefined` to return items unchanged
 * @param items - The retrieved items
 * @returns The hooked items, or the first hook failure as a `"hook"` DynamoError
 */
export const runAfterGetOnList = async <T>(
  afterGet: ((item: T | undefined) => T | undefined | Promise<T | undefined>) | undefined,
  items: readonly T[],
): Promise<Result<T[], DynamoError>> => {
  if (!afterGet) return ok([...items]);
  const output: T[] = [];
  for (const item of items) {
    const hooked = await runHook("afterGet", () => afterGet(item));
    if (!hooked.success) return hooked;
    if (hooked.data !== undefined) output.push(hooked.data);
  }
  return ok(output);
};

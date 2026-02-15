/**
 * Lifecycle hook types for entity operations.
 */

import type { UpdateActions } from "./update-expression.js";

/**
 * Lifecycle hooks for entity operations.
 *
 * Hooks provide a way to attach cross-cutting behavior to DynamoDB operations
 * such as audit logging, soft-delete, auto-injection of timestamps, and custom
 * access control. All hooks can be synchronous or asynchronous. Throwing from
 * a hook aborts the operation and surfaces a `DynamoError` with `type: "hook"`.
 *
 * Hooks are opt-in per entity and are **run by default**. Pass `skipHooks: true`
 * in any operation's options to bypass all hooks for that call.
 *
 * Method shorthand syntax is used intentionally: TypeScript's `--strictFunctionTypes`
 * check does not apply to interface method declarations, making
 * `EntityHooks<ConcreteType>` assignable to `EntityHooks<unknown>`. This is
 * required because `EntityDefinition` is used as a base type in all operations.
 *
 * @typeParam T - The inferred schema output type of the entity
 *
 * @example
 * ```ts
 * import { defineEntity } from "dynamo-schema";
 *
 * const UserEntity = defineEntity({
 *   name: "User",
 *   schema: UserSchema,
 *   table: UserTable,
 *   partitionKey: "USER#{{userId}}",
 *   sortKey: "PROFILE",
 *   hooks: {
 *     // Auto-inject updatedAt on every put
 *     beforePut: (item) => ({ ...item, updatedAt: Date.now() }),
 *
 *     // Auto-inject updatedAt on every update
 *     beforeUpdate: (_key, actions) => ({
 *       ...actions,
 *       sets: [...actions.sets, { path: "updatedAt", value: Date.now() }],
 *     }),
 *
 *     // Return null instead of undefined when item not found
 *     afterGet: (item) => item ?? null,
 *
 *     // Implement soft-delete pattern
 *     beforeDelete: (_key) => {
 *       throw new Error("Use deactivateUser() instead of deleting");
 *     },
 *   },
 * });
 * ```
 */
export interface EntityHooks<T> {
  /**
   * Called before a put operation, after schema validation.
   *
   * Can transform the item (e.g. inject `updatedAt` timestamps) or throw to
   * abort the operation. The returned item is used for all subsequent steps
   * including key building and DynamoDB marshalling.
   *
   * @param item - The validated item about to be written
   * @returns The (possibly modified) item, or a Promise resolving to it
   */
  beforePut?(item: T): T | Promise<T>;

  /**
   * Called before an update operation, after the update builder function runs
   * and before TTL auto-injection and expression compilation.
   *
   * Can transform the accumulated `UpdateActions` (e.g. add an `updatedAt`
   * SET action) or throw to abort the operation.
   *
   * @param key - The key fields used to identify the item (e.g. `{ userId: "123" }`)
   * @param actions - The accumulated update actions from the builder
   * @returns The (possibly modified) UpdateActions, or a Promise resolving to them
   */
  beforeUpdate?(
    key: Readonly<Record<string, string>>,
    actions: UpdateActions,
  ): UpdateActions | Promise<UpdateActions>;

  /**
   * Called after a get operation, once the item is retrieved and unmarshalled.
   *
   * Can transform the result, provide a default value when the item is not
   * found (`item` is `undefined`), or perform additional lookups.
   *
   * @param item - The retrieved item, or `undefined` if not found
   * @returns The (possibly modified) item or `undefined`
   */
  afterGet?(item: T | undefined): T | undefined | Promise<T | undefined>;

  /**
   * Called before a delete operation.
   *
   * Can perform pre-delete validation or throw to abort the deletion. This is
   * the primary hook for implementing soft-delete patterns — throw a descriptive
   * error directing callers to an alternative API instead.
   *
   * @param key - The key fields used to identify the item (e.g. `{ userId: "123" }`)
   * @returns `void` or a `Promise<void>`; throw to abort the deletion
   */
  beforeDelete?(key: Readonly<Record<string, string>>): void | Promise<void>;
}

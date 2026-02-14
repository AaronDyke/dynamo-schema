/**
 * Type-level template string parsing utilities.
 *
 * These types enable compile-time validation that key template fields
 * actually exist in the entity's schema output type.
 */

/**
 * Extracts all `{{field}}` placeholders from a template string as a union.
 *
 * @example
 * ```ts
 * type R = ParseTemplateFields<"USER#{{userId}}#{{role}}">;
 * //   ^? "userId" | "role"
 * ```
 */
export type ParseTemplateFields<T extends string> =
  T extends `${string}{{${infer Field}}}${infer Rest}`
    ? Field | ParseTemplateFields<Rest>
    : never;

/**
 * Returns `true` if the string contains at least one `{{...}}` placeholder.
 */
export type HasTemplate<T extends string> =
  T extends `${string}{{${string}}}${string}` ? true : false;

/**
 * Resolves the fields required to build a key value.
 *
 * - For template keys: extracts all `{{field}}` names
 * - For simple keys: the key string itself is the field name
 */
export type ResolveKeyFields<T extends string> =
  HasTemplate<T> extends true ? ParseTemplateFields<T> : T;

/**
 * Validates that all fields required by a key template exist in the
 * given record type. Resolves to `true` when valid, or the missing
 * field names when invalid.
 */
export type ValidateKeyFields<
  Template extends string,
  SchemaKeys extends string,
> = ResolveKeyFields<Template> extends infer Fields extends string
  ? Exclude<Fields, SchemaKeys> extends never
    ? true
    : Exclude<Fields, SchemaKeys>
  : never;

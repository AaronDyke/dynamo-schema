/**
 * Key-related types for DynamoDB partition and sort key definitions.
 *
 * Supports both template keys ("USER#{{userId}}") and simple field references ("userId").
 */

/**
 * A key definition is either a template string with `{{field}}` placeholders,
 * or a simple field name that maps directly to a schema field.
 */
export type KeyDefinition = string;

/**
 * The resolved key schema for a table's primary key or index key.
 */
export interface KeySchema {
  readonly partitionKey: {
    readonly name: string;
    readonly definition: KeyDefinition;
  };
  readonly sortKey?: {
    readonly name: string;
    readonly definition: KeyDefinition;
  } | undefined;
}

/**
 * Extracts field names from a template string at the type level.
 *
 * @example
 * ```ts
 * type Fields = ExtractTemplateFields<"USER#{{userId}}#{{role}}">;
 * //   ^? "userId" | "role"
 *
 * type Simple = ExtractTemplateFields<"userId">;
 * //   ^? "userId"
 * ```
 */
export type ExtractTemplateFields<T extends string> =
  T extends `${string}{{${infer Field}}}${infer Rest}`
    ? Field | ExtractTemplateFields<Rest>
    : T extends `${string}{{${infer Field}}}`
      ? Field
      : T; // Simple field reference (no template syntax)

/**
 * Checks whether a key definition is a template (contains `{{...}}`).
 */
export type IsTemplate<T extends string> =
  T extends `${string}{{${string}}}${string}` ? true : false;

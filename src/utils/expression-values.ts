/**
 * Utilities for generating ExpressionAttributeValues.
 *
 * Creates prefixed value placeholders for use in DynamoDB expressions.
 */

/**
 * Creates a value placeholder for use in DynamoDB expressions.
 *
 * @param name - The base name for the placeholder
 * @returns The placeholder string (e.g., ":name" for "name")
 */
export const valuePlaceholder = (name: string): string => `:${name}`;

/**
 * Builds ExpressionAttributeValues from a record of name-value pairs.
 *
 * @param values - The values to include, keyed by their placeholder base name
 * @returns A record mapping placeholders (e.g., ":name") to their values
 */
export const buildExpressionAttributeValues = (
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const key = name.startsWith(":") ? name : valuePlaceholder(name);
    result[key] = value;
  }
  return Object.freeze(result);
};

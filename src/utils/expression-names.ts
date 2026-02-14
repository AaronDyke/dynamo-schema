/**
 * Utilities for generating ExpressionAttributeNames.
 *
 * Handles aliasing attribute names that conflict with DynamoDB reserved words.
 */

// TODO: Implement DYNAMO_RESERVED_WORDS set (DynamoDB has ~570 reserved words)
// See: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html

// TODO: Implement isReservedWord(word: string): boolean

/**
 * Creates an alias for an attribute name suitable for use in expressions.
 *
 * @param name - The attribute name
 * @returns The aliased name (e.g., "#name" for "name")
 */
export const aliasAttributeName = (name: string): string => `#${name}`;

/**
 * Builds ExpressionAttributeNames from a list of attribute names.
 * Only includes names that need aliasing (reserved words or names with special characters).
 *
 * @param names - The attribute names to process
 * @returns A record mapping aliases to original names
 */
export const buildExpressionAttributeNames = (
  names: readonly string[],
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const name of names) {
    // TODO: Check against reserved words list and only alias when needed
    // For now, alias all names to be safe
    result[aliasAttributeName(name)] = name;
  }
  return Object.freeze(result);
};

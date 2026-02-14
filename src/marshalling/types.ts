/**
 * DynamoDB AttributeValue types for self-contained marshalling.
 *
 * These mirror the AWS SDK types but are defined locally so that
 * the library has zero runtime dependency on the AWS SDK.
 */

/** A DynamoDB AttributeValue. */
export type AttributeValue =
  | { readonly S: string }
  | { readonly N: string }
  | { readonly B: Uint8Array }
  | { readonly SS: readonly string[] }
  | { readonly NS: readonly string[] }
  | { readonly BS: readonly Uint8Array[] }
  | { readonly L: readonly AttributeValue[] }
  | { readonly M: Readonly<Record<string, AttributeValue>> }
  | { readonly NULL: true }
  | { readonly BOOL: boolean };

/** A DynamoDB item: a record of attribute name to AttributeValue. */
export type AttributeMap = Readonly<Record<string, AttributeValue>>;

/** Identifies which DynamoDB type tag an AttributeValue carries. */
export type AttributeValueType =
  | "S"
  | "N"
  | "B"
  | "SS"
  | "NS"
  | "BS"
  | "L"
  | "M"
  | "NULL"
  | "BOOL";

/**
 * Returns the DynamoDB type tag of an AttributeValue.
 *
 * @param av - The AttributeValue to inspect
 * @returns The type tag, or undefined if the value has no recognized tag.
 */
export const getAttributeValueType = (
  av: AttributeValue,
): AttributeValueType | undefined => {
  if ("S" in av) return "S";
  if ("N" in av) return "N";
  if ("B" in av) return "B";
  if ("SS" in av) return "SS";
  if ("NS" in av) return "NS";
  if ("BS" in av) return "BS";
  if ("L" in av) return "L";
  if ("M" in av) return "M";
  if ("NULL" in av) return "NULL";
  if ("BOOL" in av) return "BOOL";
  return undefined;
};

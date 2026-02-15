/**
 * Extracts entity field values from DynamoDB key attribute values
 * by reversing the template pattern.
 */

import { type Result, ok, err } from "../types/common.js";
import { type ParsedTemplate } from "./template-parser.js";

/**
 * Extracts field values from a key string using a parsed template.
 *
 * For simple templates (single field, no literals), returns the whole
 * key value as the field value. For complex templates, uses the literal
 * segments as delimiters to extract field values.
 *
 * @param template - A parsed key template
 * @param keyValue - The DynamoDB key attribute value string
 * @returns A Result containing a record of field name -> extracted value,
 *   or an error if the key value doesn't match the template pattern.
 *
 * @example
 * ```ts
 * const tmpl = parseTemplate("USER#{{userId}}");
 * extractFieldsFromKey(tmpl, "USER#123");
 * // => { success: true, data: { userId: "123" } }
 * ```
 */
export const extractFieldsFromKey = (
  template: ParsedTemplate,
  keyValue: string,
): Result<Readonly<Record<string, string>>, Error> => {
  const fields: Record<string, string> = {};

  // Static literal case: no fields to extract (e.g. "PROFILE")
  if (template.isSimple) {
    return ok(Object.freeze(fields));
  }

  // Complex case: walk through segments and extract field values
  let position = 0;

  for (let i = 0; i < template.segments.length; i++) {
    const segment = template.segments[i]!;

    if (segment.type === "literal") {
      // Verify the literal matches at the current position
      if (!keyValue.startsWith(segment.value, position)) {
        return err(
          new Error(
            `Key value "${keyValue}" does not match template pattern at position ${position}: expected "${segment.value}"`,
          ),
        );
      }
      position += segment.value.length;
    } else {
      // Field segment: find the end boundary
      const nextSegment = template.segments[i + 1];

      if (nextSegment === undefined) {
        // Last segment: take everything remaining
        fields[segment.name] = keyValue.slice(position);
        position = keyValue.length;
      } else if (nextSegment.type === "literal") {
        // Next is a literal: use it as the delimiter
        const endIndex = keyValue.indexOf(nextSegment.value, position);
        if (endIndex === -1) {
          return err(
            new Error(
              `Key value "${keyValue}" does not match template pattern: could not find delimiter "${nextSegment.value}"`,
            ),
          );
        }
        fields[segment.name] = keyValue.slice(position, endIndex);
        position = endIndex;
      } else {
        // Two consecutive field segments without a delimiter -- ambiguous.
        // This is a template authoring error.
        return err(
          new Error(
            "Template has consecutive field segments without a literal delimiter; cannot extract values unambiguously",
          ),
        );
      }
    }
  }

  return ok(Object.freeze(fields));
};

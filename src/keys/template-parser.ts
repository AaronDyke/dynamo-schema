/**
 * Runtime template parsing for key definitions.
 *
 * Parses template strings like `"USER#{{userId}}"` into a list of
 * literal segments and field references.
 */

/** A literal text segment in a parsed template. */
export interface LiteralSegment {
  readonly type: "literal";
  readonly value: string;
}

/** A field reference segment (`{{fieldName}}`) in a parsed template. */
export interface FieldSegment {
  readonly type: "field";
  readonly name: string;
}

export type TemplateSegment = LiteralSegment | FieldSegment;

/** A fully parsed template ready for key building / extraction. */
export interface ParsedTemplate {
  readonly segments: readonly TemplateSegment[];
  readonly fields: readonly string[];
  readonly isSimple: boolean;
}

const TEMPLATE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Parses a key definition string into segments and field references.
 *
 * @param definition - A template string (e.g. `"USER#{{userId}}"`) or a
 *   static literal value (e.g. `"PROFILE"`).
 * @returns A frozen {@link ParsedTemplate} object.
 *
 * @example
 * ```ts
 * parseTemplate("USER#{{userId}}")
 * // => { segments: [{ type: "literal", value: "USER#" }, { type: "field", name: "userId" }],
 * //      fields: ["userId"], isSimple: false }
 *
 * parseTemplate("PROFILE")
 * // => { segments: [{ type: "literal", value: "PROFILE" }],
 * //      fields: [], isSimple: true }
 * ```
 */
export const parseTemplate = (definition: string): ParsedTemplate => {
  const segments: TemplateSegment[] = [];
  const fields: string[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  TEMPLATE_REGEX.lastIndex = 0;

  while ((match = TEMPLATE_REGEX.exec(definition)) !== null) {
    // Add literal segment before this match (if any)
    if (match.index > lastIndex) {
      segments.push(
        Object.freeze({
          type: "literal" as const,
          value: definition.slice(lastIndex, match.index),
        }),
      );
    }

    const fieldName = match[1]!;
    segments.push(Object.freeze({ type: "field" as const, name: fieldName }));
    fields.push(fieldName);

    lastIndex = match.index + match[0].length;
  }

  // If no template placeholders were found, treat the whole string as a static literal value
  if (fields.length === 0) {
    return Object.freeze({
      segments: Object.freeze([
        Object.freeze({ type: "literal" as const, value: definition }),
      ]),
      fields: Object.freeze([]),
      isSimple: true,
    });
  }

  // Add trailing literal (if any)
  if (lastIndex < definition.length) {
    segments.push(
      Object.freeze({
        type: "literal" as const,
        value: definition.slice(lastIndex),
      }),
    );
  }

  return Object.freeze({
    segments: Object.freeze(segments),
    fields: Object.freeze(fields),
    isSimple: false,
  });
};

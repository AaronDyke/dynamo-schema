/**
 * Builds DynamoDB key attribute values from entity data using parsed templates.
 */

import { type Result, ok, err } from "../types/common.js";
import { type ParsedTemplate } from "./template-parser.js";

/**
 * Builds a key value string from entity data using a parsed template.
 *
 * A field value may not contain the literal that directly follows it in the
 * template. Otherwise two different items could build the same key (with
 * `"{{orgId}}#{{userId}}"`, `{ orgId: "a#b", userId: "c" }` and
 * `{ orgId: "a", userId: "b#c" }` both give `"a#b#c"`), and the key could not
 * be split back into its fields. A field at the end of the template has no
 * such restriction.
 *
 * @param template - A parsed key template
 * @param data - The entity data record containing field values
 * @returns A Result containing the built key string, or an error if a
 *   required field is missing or a field value contains its delimiter.
 *
 * @example
 * ```ts
 * const tmpl = parseTemplate("USER#{{userId}}");
 * buildKeyValue(tmpl, { userId: "123" });
 * // => { success: true, data: "USER#123" }
 * ```
 */
export const buildKeyValue = (
  template: ParsedTemplate,
  data: Readonly<Record<string, unknown>>,
): Result<string, Error> => {
  const parts: string[] = [];

  for (const [i, segment] of template.segments.entries()) {
    if (segment.type === "literal") {
      parts.push(segment.value);
    } else {
      const value = data[segment.name];
      if (value === undefined || value === null) {
        return err(
          new Error(
            `Missing required key field "${segment.name}" in entity data`,
          ),
        );
      }
      const text = String(value);
      const next = template.segments[i + 1];
      if (next?.type === "literal" && text.includes(next.value)) {
        return err(
          new Error(
            `Key field "${segment.name}" value "${text}" contains the delimiter "${next.value}" ` +
              `that follows it in the key template, which would make the key ambiguous. ` +
              `Use a delimiter that cannot appear in this field's values.`,
          ),
        );
      }
      parts.push(text);
    }
  }

  return ok(parts.join(""));
};

/**
 * Builds a complete DynamoDB key object (partition key + optional sort key)
 * from entity data.
 *
 * @param config - Key configuration with attribute names and templates
 * @param data - The entity data record
 * @returns A Result containing a frozen key object, or an error if
 *   required fields are missing.
 */
export const buildKey = (
  config: {
    readonly partitionKey: {
      readonly name: string;
      readonly template: ParsedTemplate;
    };
    readonly sortKey?: {
      readonly name: string;
      readonly template: ParsedTemplate;
    } | undefined;
  },
  data: Readonly<Record<string, unknown>>,
): Result<Readonly<Record<string, string>>, Error> => {
  const pkResult = buildKeyValue(config.partitionKey.template, data);
  if (!pkResult.success) return pkResult;

  const key: Record<string, string> = {
    [config.partitionKey.name]: pkResult.data,
  };

  if (config.sortKey) {
    const skResult = buildKeyValue(config.sortKey.template, data);
    if (!skResult.success) return skResult;
    key[config.sortKey.name] = skResult.data;
  }

  return ok(Object.freeze(key));
};

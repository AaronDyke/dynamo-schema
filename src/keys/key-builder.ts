/**
 * Builds DynamoDB key attribute values from entity data using parsed templates.
 */

import { type Result, ok, err } from "../types/common.js";
import { type ParsedTemplate } from "./template-parser.js";

/**
 * Builds a key value string from entity data using a parsed template.
 *
 * @param template - A parsed key template
 * @param data - The entity data record containing field values
 * @returns A Result containing the built key string, or an error if
 *   required fields are missing.
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

  for (const segment of template.segments) {
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
      parts.push(String(value));
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

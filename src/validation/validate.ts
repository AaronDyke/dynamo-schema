/**
 * Wrapper around StandardSchemaV1.validate() that normalizes sync/async
 * results and returns a Result type.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import { type Result, ok, err } from "../types/common.js";
import { type ValidationError, createValidationError } from "./errors.js";

/**
 * Validates a value against a Standard Schema V1 compatible schema.
 *
 * Handles both synchronous and asynchronous schema implementations
 * (e.g., Zod is sync, some schemas may be async).
 *
 * @param schema - A StandardSchemaV1 compatible schema
 * @param value - The value to validate
 * @returns A Promise resolving to a Result with the validated output or a ValidationError
 *
 * @example
 * ```ts
 * const result = await validate(userSchema, { name: "Alice" });
 * if (result.success) {
 *   console.log(result.data); // typed output
 * } else {
 *   console.error(result.error.issues);
 * }
 * ```
 */
export const validate = async <Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
): Promise<Result<Output, ValidationError>> => {
  const result = await schema["~standard"].validate(value);

  if ("issues" in result && result.issues !== undefined) {
    return err(createValidationError(result.issues));
  }

  return ok((result as StandardSchemaV1.Success<Output>).value);
};

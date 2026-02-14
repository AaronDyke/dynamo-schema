/**
 * Validation error types for schema validation failures.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";

/** A single validation issue with path and message. */
export interface ValidationIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

/** Error type returned when schema validation fails. */
export interface ValidationError {
  readonly type: "validation";
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Creates a ValidationError from StandardSchemaV1 issues.
 *
 * @param issues - The issues array from a StandardSchemaV1.Failure
 * @returns A frozen ValidationError
 */
export const createValidationError = (
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): ValidationError =>
  Object.freeze({
    type: "validation" as const,
    message: `Validation failed: ${issues.map((i) => i.message).join("; ")}`,
    issues: Object.freeze(
      issues.map((issue) =>
        Object.freeze({
          message: issue.message,
          ...(issue.path ? { path: issue.path } : {}),
        }),
      ),
    ),
  });

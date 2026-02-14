/**
 * Result type for operations that can fail.
 * Provides explicit error handling without throwing exceptions.
 */
export type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

/** Creates a successful Result. */
export const ok = <T>(data: T): Result<T, never> =>
  Object.freeze({ success: true as const, data });

/** Creates a failed Result. */
export const err = <E>(error: E): Result<never, E> =>
  Object.freeze({ success: false as const, error });

/**
 * Maps over a successful Result, passing through errors unchanged.
 *
 * @param result - The Result to map over
 * @param fn - The function to apply to the success value
 * @returns A new Result with the mapped value or the original error
 */
export const mapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U,
): Result<U, E> => (result.success ? ok(fn(result.data)) : result);

/**
 * Chains Result-returning operations, short-circuiting on the first error.
 *
 * @param result - The Result to chain from
 * @param fn - The function that returns a new Result
 * @returns The chained Result or the original error
 */
export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>,
): Result<U, E> => (result.success ? fn(result.data) : result);

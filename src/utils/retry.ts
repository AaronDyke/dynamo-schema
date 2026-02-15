/**
 * Exponential backoff retry utilities for batch DynamoDB operations.
 *
 * Used by BatchGet and BatchWrite to retry unprocessed items/keys that
 * DynamoDB returns when it throttles a batch request.
 */

/**
 * Options for controlling exponential backoff retry behavior.
 *
 * @example
 * ```ts
 * const options: RetryOptions = {
 *   maxAttempts: 5,    // 1 initial + 4 retries
 *   baseDelayMs: 200,  // 200 → 400 → 800 → 1600ms
 *   maxDelayMs: 3000,  // cap at 3 seconds
 * };
 * ```
 */
export interface RetryOptions {
  /**
   * Total number of attempts (initial attempt + retries).
   * For example, `4` means one initial call and up to 3 retries.
   * Default: `4`.
   */
  readonly maxAttempts?: number | undefined;
  /**
   * Base delay in milliseconds before the first retry.
   * Each subsequent retry doubles this value.
   * Default: `100`.
   *
   * @example
   * ```
   * baseDelayMs: 100 → retries at 100ms, 200ms, 400ms, ...
   * ```
   */
  readonly baseDelayMs?: number | undefined;
  /**
   * Maximum delay cap in milliseconds.
   * Prevents exponential growth from becoming excessively long.
   * Default: `5000`.
   */
  readonly maxDelayMs?: number | undefined;
}

/**
 * Returns the delay in milliseconds for the given retry index (0-based).
 *
 * Formula: `min(baseDelayMs × 2^retryIndex, maxDelayMs)`
 *
 * @param retryIndex - Zero-based retry attempt index (0 = first retry)
 * @param options - Optional retry options
 */
export const computeBackoffDelay = (
  retryIndex: number,
  options?: RetryOptions,
): number => {
  const base = options?.baseDelayMs ?? 100;
  const max = options?.maxDelayMs ?? 5000;
  return Math.min(base * Math.pow(2, retryIndex), max);
};

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Uses `setTimeout` so it is compatible with `vi.useFakeTimers()` in tests.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

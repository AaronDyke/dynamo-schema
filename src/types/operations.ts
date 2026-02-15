/**
 * Operation input/output types for the entity client.
 */

import type { AttributeMap } from "../marshalling/types.js";
import type { FilterInput } from "./filter-expression.js";

/** Error type for DynamoDB operations. */
export interface DynamoError {
  readonly type: "dynamo" | "validation" | "marshalling" | "key" | "hook";
  readonly message: string;
  readonly cause?: unknown;
}

/** Creates a DynamoError. */
export const createDynamoError = (
  type: DynamoError["type"],
  message: string,
  cause?: unknown,
): DynamoError =>
  Object.freeze({ type, message, cause });

/** Options for Put operations. */
export interface PutOptions {
  /**
   * Condition expression that must be satisfied for the put to succeed.
   * Accepts a raw DynamoDB expression string, a `FilterNode` built with
   * `createFilterBuilder`, or an inline callback `(f) => f.attributeNotExists('pk')`.
   */
  readonly condition?: FilterInput | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
  readonly skipValidation?: boolean | undefined;
  /** When `true`, all entity hooks are bypassed for this call. Default: `false`. */
  readonly skipHooks?: boolean | undefined;
}

/** Options for Get operations. */
export interface GetOptions {
  readonly consistentRead?: boolean | undefined;
  readonly projection?: readonly string[] | undefined;
  /** When `true`, all entity hooks are bypassed for this call. Default: `false`. */
  readonly skipHooks?: boolean | undefined;
}

/** Options for Delete operations. */
export interface DeleteOptions {
  /**
   * Condition expression that must be satisfied for the delete to succeed.
   * Accepts a raw DynamoDB expression string, a `FilterNode` built with
   * `createFilterBuilder`, or an inline callback `(f) => f.attributeExists('pk')`.
   */
  readonly condition?: FilterInput | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
  /** When `true`, all entity hooks are bypassed for this call. Default: `false`. */
  readonly skipHooks?: boolean | undefined;
}

/** Options for Query operations. */
export interface QueryOptions {
  readonly indexName?: string | undefined;
  /**
   * Filter expression applied after the key condition.
   * Accepts a raw DynamoDB expression string, a `FilterNode` built with
   * `createFilterBuilder`, or an inline callback `(f) => f.and(...)`.
   *
   * When using a `FilterNode` or callback, `expressionNames` and
   * `expressionValues` are populated automatically.
   *
   * @example
   * ```ts
   * // Inline callback (untyped builder — any string key accepted)
   * filter: (f) => f.and(f.eq('status', 'active'), f.gt('age', 18))
   *
   * // Pre-built node (type-safe builder)
   * const f = createFilterBuilder<User>();
   * filter: f.and(f.eq('status', 'active'), f.gt('age', 18))
   * ```
   */
  readonly filter?: FilterInput | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
  readonly limit?: number | undefined;
  readonly startKey?: AttributeMap | Record<string, unknown> | undefined;
  readonly scanIndexForward?: boolean | undefined;
  readonly consistentRead?: boolean | undefined;
  readonly projection?: readonly string[] | undefined;
}

/** Result of a Query operation. */
export interface QueryResult<T> {
  readonly items: readonly T[];
  readonly count: number;
  readonly lastKey?: AttributeMap | Record<string, unknown> | undefined;
}

/** Options for Scan operations. */
export interface ScanOptions {
  readonly indexName?: string | undefined;
  /**
   * Filter expression applied to scanned items.
   * Accepts a raw DynamoDB expression string, a `FilterNode` built with
   * `createFilterBuilder`, or an inline callback `(f) => f.and(...)`.
   *
   * When using a `FilterNode` or callback, `expressionNames` and
   * `expressionValues` are populated automatically.
   */
  readonly filter?: FilterInput | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
  readonly limit?: number | undefined;
  readonly startKey?: AttributeMap | Record<string, unknown> | undefined;
  readonly consistentRead?: boolean | undefined;
  readonly projection?: readonly string[] | undefined;
}

/** Result of a Scan operation. */
export interface ScanResult<T> {
  readonly items: readonly T[];
  readonly count: number;
  readonly lastKey?: AttributeMap | Record<string, unknown> | undefined;
}

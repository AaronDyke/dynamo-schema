/**
 * Operation input/output types for the entity client.
 */

import type { AttributeMap } from "../marshalling/types.js";

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
  readonly condition?: string | undefined;
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
  readonly condition?: string | undefined;
  readonly expressionNames?: Record<string, string> | undefined;
  readonly expressionValues?: Record<string, unknown> | undefined;
  /** When `true`, all entity hooks are bypassed for this call. Default: `false`. */
  readonly skipHooks?: boolean | undefined;
}

/** Options for Query operations. */
export interface QueryOptions {
  readonly indexName?: string | undefined;
  readonly filter?: string | undefined;
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
  readonly filter?: string | undefined;
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

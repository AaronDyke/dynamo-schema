/**
 * SDK-agnostic types for normalized DescribeTable output.
 *
 * All 4 SDK adapters normalize their DescribeTable responses into these types,
 * allowing `validateTable()` to work uniformly across adapters.
 */

import type { KeyAttributeType } from "./table.js";

/** A key schema element from the DescribeTable response. */
export interface DescribeKeySchema {
  readonly attributeName: string;
  readonly keyType: "HASH" | "RANGE";
}

/** An attribute definition from the DescribeTable response. */
export interface DescribeAttributeDefinition {
  readonly attributeName: string;
  readonly attributeType: KeyAttributeType;
}

/** Information about a Global or Local Secondary Index. */
export interface DescribeIndexInfo {
  readonly indexName: string;
  readonly keySchema: readonly DescribeKeySchema[];
  readonly projection: {
    readonly projectionType: "ALL" | "KEYS_ONLY" | "INCLUDE";
    readonly nonKeyAttributes?: readonly string[];
  };
  readonly indexStatus?: string;
}

/** Normalized output from a DescribeTable API call. */
export interface DescribeTableOutput {
  readonly tableName: string;
  readonly tableStatus: string;
  readonly keySchema: readonly DescribeKeySchema[];
  readonly attributeDefinitions: readonly DescribeAttributeDefinition[];
  readonly globalSecondaryIndexes?: readonly DescribeIndexInfo[];
  readonly localSecondaryIndexes?: readonly DescribeIndexInfo[];
}

/**
 * Table and index definition types for DynamoDB single-table design.
 */

import type { KeyDefinition } from "./key.js";

/** DynamoDB key attribute type. */
export type KeyAttributeType = "S" | "N" | "B";

/** A single key attribute in a table or index. */
export interface KeyAttribute {
  readonly name: string;
  readonly definition: KeyDefinition;
  readonly type?: KeyAttributeType | undefined;
}

/**
 * TTL (Time to Live) configuration for a table.
 *
 * Specifies which DynamoDB attribute is used as the TTL field.
 * The attribute must contain a Unix epoch timestamp (seconds) and
 * TTL must be enabled on the table in AWS.
 *
 * @example
 * ```ts
 * const table = defineTable({
 *   tableName: "MainTable",
 *   partitionKey: { name: "pk", definition: "pk" },
 *   ttl: { attributeName: "expiresAt" },
 * });
 * ```
 */
export interface TtlConfig {
  /** The name of the DynamoDB attribute used for TTL (must be a Number type in DynamoDB). */
  readonly attributeName: string;
}

/** Index type discriminator. */
export type IndexType = "GSI" | "LSI";

/** Definition for a Global or Local Secondary Index. */
export interface IndexDefinition {
  readonly type: IndexType;
  readonly indexName: string;
  readonly partitionKey: KeyAttribute;
  readonly sortKey?: KeyAttribute | undefined;
}

/** Configuration input for `defineTable()`. */
export interface TableConfig<
  Indexes extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> {
  readonly tableName: string;
  readonly partitionKey: KeyAttribute;
  readonly sortKey?: KeyAttribute | undefined;
  readonly indexes?: Indexes | undefined;
  /** Optional TTL configuration for the table. */
  readonly ttl?: TtlConfig | undefined;
}

/** The frozen, immutable table definition produced by `defineTable()`. */
export interface TableDefinition<
  Indexes extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> {
  readonly tableName: string;
  readonly partitionKey: KeyAttribute;
  readonly sortKey?: KeyAttribute | undefined;
  readonly indexes: Indexes;
  /** TTL configuration for the table, if set. */
  readonly ttl?: TtlConfig | undefined;
}

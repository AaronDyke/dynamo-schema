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
}

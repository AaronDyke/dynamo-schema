/**
 * Factory function for creating immutable table definitions.
 */

import type {
  TableConfig,
  TableDefinition,
  IndexDefinition,
} from "../types/table.js";

/**
 * Defines a DynamoDB table with its primary key schema and optional indexes.
 *
 * @param config - The table configuration
 * @returns A frozen {@link TableDefinition} object
 *
 * @example
 * ```ts
 * const table = defineTable({
 *   tableName: "MainTable",
 *   partitionKey: { name: "pk", definition: "pk" },
 *   sortKey: { name: "sk", definition: "sk" },
 *   indexes: {
 *     gsi1: {
 *       type: "GSI",
 *       indexName: "GSI1",
 *       partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
 *       sortKey: { name: "gsi1sk", definition: "gsi1sk" },
 *     },
 *   },
 * });
 * ```
 */
export const defineTable = <
  Indexes extends Record<string, IndexDefinition> = Record<string, never>,
>(
  config: TableConfig<Indexes>,
): TableDefinition<Indexes> =>
  Object.freeze({
    tableName: config.tableName,
    partitionKey: Object.freeze({ ...config.partitionKey }),
    sortKey: config.sortKey
      ? Object.freeze({ ...config.sortKey })
      : undefined,
    indexes: Object.freeze(
      config.indexes ?? ({} as Indexes),
    ),
  });

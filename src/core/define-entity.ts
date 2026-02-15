/**
 * Factory function for creating immutable entity definitions.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { TableDefinition } from "../types/table.js";
import type {
  EntityConfig,
  EntityDefinition,
  EntityIndexKeys,
} from "../types/entity.js";
import type { ValidateKeyFields } from "../keys/template-types.js";

/**
 * Defines a DynamoDB entity by binding a Standard Schema to a table
 * with key mappings.
 *
 * Provides compile-time validation that all template fields referenced
 * in key definitions exist in the schema's output type.
 *
 * @param config - The entity configuration
 * @returns A frozen {@link EntityDefinition} object
 *
 * @example
 * ```ts
 * const userEntity = defineEntity({
 *   name: "User",
 *   schema: z.object({
 *     userId: z.string(),
 *     email: z.string(),
 *     name: z.string(),
 *   }),
 *   table,
 *   partitionKey: "USER#{{userId}}",
 *   sortKey: "PROFILE",
 * });
 * ```
 */
export const defineEntity = <
  S extends StandardSchemaV1,
  T extends TableDefinition,
  PK extends string,
  SK extends string = never,
>(
  config: EntityConfig<S, T, PK, SK> &
    (ValidateKeyFields<
      PK,
      string & keyof StandardSchemaV1.InferOutput<S>
    > extends true
      ? unknown
      : {
          _pkError: `Partition key template references fields not in schema: ${string & ValidateKeyFields<PK, string & keyof StandardSchemaV1.InferOutput<S>>}`;
        }) &
    (SK extends string
      ? ValidateKeyFields<
          SK,
          string & keyof StandardSchemaV1.InferOutput<S>
        > extends true
        ? unknown
        : {
            _skError: `Sort key template references fields not in schema: ${string & ValidateKeyFields<SK, string & keyof StandardSchemaV1.InferOutput<S>>}`;
          }
      : unknown),
): EntityDefinition<S, T, PK, SK> =>
  Object.freeze({
    name: config.name,
    schema: config.schema,
    table: config.table,
    partitionKey: config.partitionKey,
    sortKey: config.sortKey as SK | undefined,
    indexes: config.indexes as
      | (T extends TableDefinition<infer I> ? EntityIndexKeys<I> : never)
      | undefined,
    ttl: config.ttl ? Object.freeze({ ...config.ttl }) : undefined,
  });

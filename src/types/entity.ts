/**
 * Entity definition types for mapping application models to DynamoDB items.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { TableDefinition, IndexDefinition } from "./table.js";
import type { ResolveKeyFields } from "../keys/template-types.js";

/**
 * TTL behavior configuration for an entity.
 *
 * Controls automatic TTL injection on put and update operations.
 * Requires the parent table to have a `ttl` config with an `attributeName`.
 *
 * @example
 * ```ts
 * const userEntity = defineEntity({
 *   name: "User",
 *   schema: userSchema,
 *   table,
 *   partitionKey: "USER#{{userId}}",
 *   ttl: {
 *     defaultTtlSeconds: 60 * 60 * 24 * 30, // 30 days
 *     autoUpdateTtlSeconds: 60 * 60 * 24 * 30, // refresh to 30 days on every update
 *   },
 * });
 * ```
 */
export interface EntityTtlConfig {
  /**
   * When set, a TTL value will be automatically injected on every `put` operation.
   * The value is computed as `Math.floor(Date.now() / 1000) + defaultTtlSeconds`.
   */
  readonly defaultTtlSeconds?: number | undefined;
  /**
   * When set, the TTL attribute will be refreshed on every `update` operation
   * (unless `skipAutoTtl: true` is passed in UpdateOptions).
   * The value is computed as `Math.floor(Date.now() / 1000) + autoUpdateTtlSeconds`.
   */
  readonly autoUpdateTtlSeconds?: number | undefined;
}

/**
 * Index key overrides for an entity.
 * Each key in the record corresponds to an index name defined on the table.
 */
export type EntityIndexKeys<
  Indexes extends Record<string, IndexDefinition>,
> = {
  readonly [K in keyof Indexes]?: {
    readonly partitionKey: string;
    readonly sortKey?: string | undefined;
  };
};

/**
 * Configuration input for `defineEntity()`.
 *
 * The `_check` parameter uses a compile-time trick to ensure that all
 * template fields referenced in key definitions exist in the schema's
 * output type.
 */
export interface EntityConfig<
  S extends StandardSchemaV1,
  T extends TableDefinition,
  PK extends string = string,
  SK extends string = string,
> {
  readonly name: string;
  readonly schema: S;
  readonly table: T;
  readonly partitionKey: PK;
  readonly sortKey?: SK | undefined;
  readonly indexes?: T extends TableDefinition<infer I>
    ? EntityIndexKeys<I>
    : undefined;
  /** Optional TTL behavior for this entity. Requires the table to have a `ttl` config. */
  readonly ttl?: EntityTtlConfig | undefined;
}

/**
 * The frozen, immutable entity definition produced by `defineEntity()`.
 */
export interface EntityDefinition<
  S extends StandardSchemaV1 = StandardSchemaV1,
  T extends TableDefinition = TableDefinition,
  PK extends string = string,
  SK extends string = string,
> {
  readonly name: string;
  readonly schema: S;
  readonly table: T;
  readonly partitionKey: PK;
  readonly sortKey: SK | undefined;
  readonly indexes:
    | (T extends TableDefinition<infer I> ? EntityIndexKeys<I> : never)
    | undefined;
  /** TTL behavior for this entity, if configured. */
  readonly ttl: EntityTtlConfig | undefined;
}

/**
 * Infers the TypeScript type of an entity from its schema.
 *
 * @example
 * ```ts
 * const userEntity = defineEntity({ ... });
 * type User = InferEntityType<typeof userEntity>;
 * ```
 */
export type InferEntityType<E> =
  E extends EntityDefinition<infer S, infer _T, infer _PK, infer _SK>
    ? StandardSchemaV1.InferOutput<S>
    : never;

/**
 * Extracts the fields required to identify an entity (i.e., the fields
 * referenced in the partition key and sort key templates).
 */
export type EntityKeyFields<E> =
  E extends EntityDefinition<infer _S, infer _T, infer PK, infer SK>
    ? SK extends string
      ? ResolveKeyFields<PK> | ResolveKeyFields<SK>
      : ResolveKeyFields<PK>
    : never;

/**
 * The key input type: a record whose keys are the entity key fields
 * and whose values are strings.
 */
export type EntityKeyInput<E> = {
  readonly [K in EntityKeyFields<E>]: string;
};

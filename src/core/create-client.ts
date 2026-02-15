/**
 * Client factory: creates a type-safe DynamoDB client from an SDK adapter.
 *
 * The client provides entity-scoped operations with full type inference
 * from Standard Schema definitions.
 */

import type { StandardSchemaV1 } from "../standard-schema/types.js";
import type { EntityDefinition, EntityKeyInput, InferEntityType } from "../types/entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type {
  DynamoError,
  PutOptions,
  GetOptions,
  DeleteOptions,
  QueryOptions,
  QueryResult,
  ScanOptions,
  ScanResult,
} from "../types/operations.js";
import type { UpdateBuilder } from "../types/update-expression.js";
import type { Result } from "../types/common.js";
import { executePut } from "../operations/put.js";
import { executeGet } from "../operations/get.js";
import { executeDelete } from "../operations/delete.js";
import { executeQuery, type EntityQueryInput, type SortKeyCondition } from "../operations/query.js";
import { executeScan } from "../operations/scan.js";
import { executeUpdate, type UpdateOptions } from "../operations/update.js";
import { executeRemoveTtl } from "../operations/remove-ttl.js";
import { executeBatchWrite, type BatchWriteRequestItem, type BatchWriteOptions } from "../operations/batch-write.js";
import { executeBatchGet, type BatchGetEntityRequest, type BatchGetResult, type BatchGetOptions } from "../operations/batch-get.js";
import { executeTransactWrite, type TransactWriteRequestItem, type TransactWriteOptions } from "../operations/transact-write.js";
import { executeTransactGet, type TransactGetEntityRequest, type TransactGetResult } from "../operations/transact-get.js";

/** Configuration for creating a client. */
export interface ClientConfig {
  readonly adapter: SDKAdapter;
  readonly validation?: boolean | undefined;
}

/**
 * A type-safe client scoped to a single entity.
 * All operations are typed based on the entity's Standard Schema.
 */
export interface EntityClient<E extends EntityDefinition> {
  /** Puts an item into the table, validated against the entity schema. */
  readonly put: (
    data: InferEntityType<E>,
    options?: PutOptions,
  ) => Promise<Result<InferEntityType<E>, DynamoError>>;

  /** Gets an item by key. */
  readonly get: (
    key: EntityKeyInput<E>,
    options?: GetOptions,
  ) => Promise<Result<InferEntityType<E> | undefined, DynamoError>>;

  /** Deletes an item by key. */
  readonly delete: (
    key: EntityKeyInput<E>,
    options?: DeleteOptions,
  ) => Promise<Result<void, DynamoError>>;

  /** Queries items by partition key with optional sort key conditions. */
  readonly query: (
    input: EntityQueryInput,
  ) => Promise<Result<QueryResult<InferEntityType<E>>, DynamoError>>;

  /** Scans items from the table or index. */
  readonly scan: (
    options?: ScanOptions,
  ) => Promise<Result<ScanResult<InferEntityType<E>>, DynamoError>>;

  /** Updates an item using a type-safe expression builder. */
  readonly update: (
    key: EntityKeyInput<E>,
    builderFn: (
      builder: UpdateBuilder<InferEntityType<E>>,
    ) => UpdateBuilder<InferEntityType<E>>,
    options?: UpdateOptions,
  ) => Promise<Result<InferEntityType<E>, DynamoError>>;

  /**
   * Removes the TTL attribute from an existing item, preventing it from expiring.
   *
   * Requires the entity's table to have a `ttl` config with an `attributeName`.
   * Returns a validation error if no TTL is configured on the table.
   */
  readonly removeTtl: (
    key: EntityKeyInput<E>,
  ) => Promise<Result<void, DynamoError>>;
}

/**
 * The DynamoDB client with entity-scoped and multi-entity operations.
 */
export interface DynamoClient {
  /** Creates a type-safe client scoped to a specific entity. */
  readonly entity: <E extends EntityDefinition>(
    entityDef: E,
  ) => EntityClient<E>;

  /** Batch write items across multiple entities. */
  readonly batchWrite: (
    requests: readonly BatchWriteRequestItem[],
    options?: BatchWriteOptions,
  ) => Promise<Result<void, DynamoError>>;

  /** Batch get items across multiple entities. */
  readonly batchGet: (
    requests: readonly BatchGetEntityRequest[],
    options?: BatchGetOptions,
  ) => Promise<Result<BatchGetResult, DynamoError>>;

  /** Transactional write across multiple entities. */
  readonly transactWrite: (
    requests: readonly TransactWriteRequestItem[],
    options?: TransactWriteOptions,
  ) => Promise<Result<void, DynamoError>>;

  /** Transactional get across multiple entities. */
  readonly transactGet: (
    requests: readonly TransactGetEntityRequest[],
  ) => Promise<Result<TransactGetResult, DynamoError>>;
}

/**
 * Creates a type-safe DynamoDB client.
 *
 * @param config - Client configuration with SDK adapter and validation settings
 * @returns A DynamoClient with entity-scoped and multi-entity operations
 *
 * @example
 * ```ts
 * import { createClient } from "dynamo-schema";
 * import { createSDKv3DocAdapter } from "dynamo-schema/adapters/sdk-v3-doc";
 *
 * const adapter = createSDKv3DocAdapter(documentClient, commands);
 * const client = createClient({ adapter });
 * const users = client.entity(userEntity);
 *
 * await users.put({ userId: "123", name: "Alice", email: "alice@example.com" });
 * const result = await users.get({ userId: "123" });
 * ```
 */
export const createClient = (config: ClientConfig): DynamoClient => {
  const { adapter, validation = true } = config;

  const createEntityClient = <E extends EntityDefinition>(
    entityDef: E,
  ): EntityClient<E> => {
    // Cast entity definition to work with the generic execute functions.
    // These casts are safe because E extends EntityDefinition and the
    // operations only use the schema for validation/inference.
    const entity = entityDef as unknown as EntityDefinition<StandardSchemaV1>;

    return Object.freeze({
      put: (data: InferEntityType<E>, options?: PutOptions) =>
        executePut(
          entity,
          adapter,
          data,
          validation === false
            ? { ...options, skipValidation: true }
            : options,
        ) as Promise<Result<InferEntityType<E>, DynamoError>>,

      get: (key: EntityKeyInput<E>, options?: GetOptions) =>
        executeGet(
          entity,
          adapter,
          key as Readonly<Record<string, string>>,
          options,
        ) as Promise<Result<InferEntityType<E> | undefined, DynamoError>>,

      delete: (key: EntityKeyInput<E>, options?: DeleteOptions) =>
        executeDelete(
          entity,
          adapter,
          key as Readonly<Record<string, string>>,
          options,
        ),

      query: (input: EntityQueryInput) =>
        executeQuery(
          entity,
          adapter,
          input,
        ) as Promise<Result<QueryResult<InferEntityType<E>>, DynamoError>>,

      scan: (options?: ScanOptions) =>
        executeScan(
          entity,
          adapter,
          options,
        ) as Promise<Result<ScanResult<InferEntityType<E>>, DynamoError>>,

      update: (
        key: EntityKeyInput<E>,
        builderFn: (
          builder: UpdateBuilder<InferEntityType<E>>,
        ) => UpdateBuilder<InferEntityType<E>>,
        options?: UpdateOptions,
      ) =>
        executeUpdate(
          entity,
          adapter,
          key as Readonly<Record<string, string>>,
          builderFn as unknown as (
            builder: UpdateBuilder<StandardSchemaV1.InferOutput<StandardSchemaV1>>,
          ) => UpdateBuilder<StandardSchemaV1.InferOutput<StandardSchemaV1>>,
          options,
        ) as Promise<Result<InferEntityType<E>, DynamoError>>,

      removeTtl: (key: EntityKeyInput<E>) =>
        executeRemoveTtl(
          entity,
          adapter,
          key as Readonly<Record<string, string>>,
        ),
    });
  };

  return Object.freeze({
    entity: createEntityClient,

    batchWrite: (
      requests: readonly BatchWriteRequestItem[],
      options?: BatchWriteOptions,
    ) =>
      executeBatchWrite(
        adapter,
        requests,
        validation === false
          ? { ...options, skipValidation: true }
          : options,
      ),

    batchGet: (
      requests: readonly BatchGetEntityRequest[],
      options?: BatchGetOptions,
    ) => executeBatchGet(adapter, requests, options),

    transactWrite: (
      requests: readonly TransactWriteRequestItem[],
      options?: TransactWriteOptions,
    ) =>
      executeTransactWrite(
        adapter,
        requests,
        validation === false
          ? { ...options, skipValidation: true }
          : options,
      ),

    transactGet: (requests: readonly TransactGetEntityRequest[]) =>
      executeTransactGet(adapter, requests),
  });
};

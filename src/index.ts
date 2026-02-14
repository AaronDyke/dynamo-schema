/**
 * dynamo-schema: Type-safe DynamoDB schema validation and modeling library.
 *
 * Accepts any Standard Schema V1 compatible schema (Zod, Valibot, ArkType, etc.)
 * and provides type-safe DynamoDB operations with runtime validation.
 *
 * @example
 * ```ts
 * import { defineTable, defineEntity, createClient } from "dynamo-schema";
 * import { createSDKv3DocAdapter } from "dynamo-schema/adapters/sdk-v3-doc";
 * import { z } from "zod";
 *
 * const table = defineTable({
 *   tableName: "MainTable",
 *   partitionKey: { name: "pk", definition: "pk" },
 *   sortKey: { name: "sk", definition: "sk" },
 * });
 *
 * const userEntity = defineEntity({
 *   name: "User",
 *   schema: z.object({ userId: z.string(), name: z.string() }),
 *   table,
 *   partitionKey: "USER#{{userId}}",
 *   sortKey: "PROFILE",
 * });
 *
 * const client = createClient({ adapter });
 * const users = client.entity(userEntity);
 * await users.put({ userId: "123", name: "Alice" });
 * ```
 */

// Core factory functions
export { defineTable } from "./core/define-table.js";
export { defineEntity } from "./core/define-entity.js";
export { createClient } from "./core/create-client.js";

// Core types
export type { TableConfig, TableDefinition, IndexDefinition, IndexType, KeyAttribute, KeyAttributeType } from "./types/table.js";
export type { EntityConfig, EntityDefinition, InferEntityType, EntityKeyInput, EntityKeyFields, EntityIndexKeys } from "./types/entity.js";
export type { KeyDefinition, KeySchema, ExtractTemplateFields, IsTemplate } from "./types/key.js";
export type { ClientConfig, EntityClient, DynamoClient } from "./core/create-client.js";

// Operation types
export type { DynamoError, PutOptions, GetOptions, DeleteOptions, QueryOptions, QueryResult, ScanOptions, ScanResult } from "./types/operations.js";
export type { UpdateBuilder, UpdateActions, SetAction, AddAction, DeleteAction } from "./types/update-expression.js";
export type { UpdateOptions } from "./operations/update.js";
export type { EntityQueryInput, SortKeyCondition, PartitionKeyCondition } from "./operations/query.js";

// Batch operation types
export type { BatchPutRequest, BatchDeleteRequest, BatchWriteRequestItem, BatchWriteOptions } from "./operations/batch-write.js";
export type { BatchGetEntityRequest, BatchGetResult } from "./operations/batch-get.js";

// Transaction operation types
export type { TransactPutRequest, TransactDeleteRequest, TransactUpdateRequest, TransactConditionCheckRequest, TransactWriteRequestItem, TransactWriteOptions } from "./operations/transact-write.js";
export type { TransactGetEntityRequest, TransactGetResult } from "./operations/transact-get.js";

// Result type and helpers
export { type Result, ok, err, mapResult, flatMapResult } from "./types/common.js";

// Validation
export { validate } from "./validation/validate.js";
export type { ValidationError, ValidationIssue } from "./validation/errors.js";

// Standard Schema types (re-exported for convenience)
export type { StandardSchemaV1 } from "./standard-schema/types.js";

// Update builder factory
export { createUpdateBuilder } from "./operations/update.js";

// Marshalling (for users who need raw AttributeValue handling)
export { marshallItem, marshallValue } from "./marshalling/marshall.js";
export { unmarshallItem, unmarshallValue } from "./marshalling/unmarshall.js";
export type { AttributeValue, AttributeMap } from "./marshalling/types.js";

// SDK Adapter type (for creating custom adapters)
export type { SDKAdapter } from "./adapters/adapter.js";

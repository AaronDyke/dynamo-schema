/**
 * SDK adapter interface for abstracting over DynamoDB client implementations.
 *
 * Each adapter is a record of functions (not a class) to keep the
 * codebase functional and support tree-shaking.
 */

import type { AttributeMap } from "../marshalling/types.js";
import type { DescribeTableOutput } from "../types/describe-table.js";

/** Common options for all DynamoDB operations. */
export interface BaseOperationInput {
  readonly tableName: string;
}

/** Input for PutItem. */
export interface PutItemInput extends BaseOperationInput {
  readonly item: AttributeMap | Record<string, unknown>;
  readonly conditionExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
  readonly expressionAttributeValues?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
}

/** Output for PutItem. */
export interface PutItemOutput {
  readonly attributes?: AttributeMap | Record<string, unknown> | undefined;
}

/** Input for GetItem. */
export interface GetItemInput extends BaseOperationInput {
  readonly key: AttributeMap | Record<string, unknown>;
  readonly consistentRead?: boolean | undefined;
  readonly projectionExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
}

/** Output for GetItem. */
export interface GetItemOutput {
  readonly item?: AttributeMap | Record<string, unknown> | undefined;
}

/** Input for DeleteItem. */
export interface DeleteItemInput extends BaseOperationInput {
  readonly key: AttributeMap | Record<string, unknown>;
  readonly conditionExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
  readonly expressionAttributeValues?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
}

/** Output for DeleteItem. */
export interface DeleteItemOutput {
  readonly attributes?: AttributeMap | Record<string, unknown> | undefined;
}

/** Input for UpdateItem. */
export interface UpdateItemInput extends BaseOperationInput {
  readonly key: AttributeMap | Record<string, unknown>;
  readonly updateExpression: string;
  readonly conditionExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
  readonly expressionAttributeValues?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
  readonly returnValues?: string | undefined;
}

/** Output for UpdateItem. */
export interface UpdateItemOutput {
  readonly attributes?: AttributeMap | Record<string, unknown> | undefined;
}

/** Input for Query. */
export interface QueryInput extends BaseOperationInput {
  readonly indexName?: string | undefined;
  readonly keyConditionExpression: string;
  readonly filterExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
  readonly expressionAttributeValues?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
  readonly limit?: number | undefined;
  readonly exclusiveStartKey?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
  readonly scanIndexForward?: boolean | undefined;
  readonly consistentRead?: boolean | undefined;
  readonly projectionExpression?: string | undefined;
}

/** Output for Query. */
export interface QueryOutput {
  readonly items: ReadonlyArray<
    AttributeMap | Record<string, unknown>
  >;
  readonly count: number;
  readonly lastEvaluatedKey?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
}

/** Input for Scan. */
export interface ScanInput extends BaseOperationInput {
  readonly indexName?: string | undefined;
  readonly filterExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
  readonly expressionAttributeValues?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
  readonly limit?: number | undefined;
  readonly exclusiveStartKey?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
  readonly consistentRead?: boolean | undefined;
  readonly projectionExpression?: string | undefined;
}

/** Output for Scan. */
export interface ScanOutput {
  readonly items: ReadonlyArray<
    AttributeMap | Record<string, unknown>
  >;
  readonly count: number;
  readonly lastEvaluatedKey?:
    | AttributeMap
    | Record<string, unknown>
    | undefined;
}

/** A write request for batch operations. */
export interface BatchWriteRequest {
  readonly tableName: string;
  readonly requests: ReadonlyArray<
    | { readonly type: "put"; readonly item: AttributeMap | Record<string, unknown> }
    | { readonly type: "delete"; readonly key: AttributeMap | Record<string, unknown> }
  >;
}

/** Output for BatchWriteItem. */
export interface BatchWriteOutput {
  readonly unprocessedItems: ReadonlyArray<BatchWriteRequest>;
}

/** A get request for batch operations. */
export interface BatchGetRequest {
  readonly tableName: string;
  readonly keys: ReadonlyArray<AttributeMap | Record<string, unknown>>;
  readonly consistentRead?: boolean | undefined;
  readonly projectionExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
}

/** Output for BatchGetItem. */
export interface BatchGetOutput {
  readonly responses: Readonly<
    Record<
      string,
      ReadonlyArray<AttributeMap | Record<string, unknown>>
    >
  >;
  readonly unprocessedKeys: ReadonlyArray<BatchGetRequest>;
}

/** A transact write item. */
export type TransactWriteItem =
  | {
      readonly type: "put";
      readonly tableName: string;
      readonly item: AttributeMap | Record<string, unknown>;
      readonly conditionExpression?: string | undefined;
      readonly expressionAttributeNames?:
        | Record<string, string>
        | undefined;
      readonly expressionAttributeValues?:
        | AttributeMap
        | Record<string, unknown>
        | undefined;
    }
  | {
      readonly type: "delete";
      readonly tableName: string;
      readonly key: AttributeMap | Record<string, unknown>;
      readonly conditionExpression?: string | undefined;
      readonly expressionAttributeNames?:
        | Record<string, string>
        | undefined;
      readonly expressionAttributeValues?:
        | AttributeMap
        | Record<string, unknown>
        | undefined;
    }
  | {
      readonly type: "update";
      readonly tableName: string;
      readonly key: AttributeMap | Record<string, unknown>;
      readonly updateExpression: string;
      readonly conditionExpression?: string | undefined;
      readonly expressionAttributeNames?:
        | Record<string, string>
        | undefined;
      readonly expressionAttributeValues?:
        | AttributeMap
        | Record<string, unknown>
        | undefined;
    }
  | {
      readonly type: "conditionCheck";
      readonly tableName: string;
      readonly key: AttributeMap | Record<string, unknown>;
      readonly conditionExpression: string;
      readonly expressionAttributeNames?:
        | Record<string, string>
        | undefined;
      readonly expressionAttributeValues?:
        | AttributeMap
        | Record<string, unknown>
        | undefined;
    };

/** A transact get item. */
export interface TransactGetItem {
  readonly tableName: string;
  readonly key: AttributeMap | Record<string, unknown>;
  readonly projectionExpression?: string | undefined;
  readonly expressionAttributeNames?:
    | Record<string, string>
    | undefined;
}

/** Output for TransactGetItems. */
export interface TransactGetOutput {
  readonly items: ReadonlyArray<
    (AttributeMap | Record<string, unknown>) | undefined
  >;
}

/** Input for DescribeTable. */
export interface DescribeTableInput {
  readonly tableName: string;
}

/**
 * The adapter interface that all SDK adapters must implement.
 *
 * This is a record of async functions, not a class.
 * Each function corresponds to a DynamoDB API operation.
 */
export interface SDKAdapter {
  /** Whether this adapter uses raw AttributeValue format (vs DocumentClient). */
  readonly isRaw: boolean;

  readonly putItem: (input: PutItemInput) => Promise<PutItemOutput>;
  readonly getItem: (input: GetItemInput) => Promise<GetItemOutput>;
  readonly deleteItem: (
    input: DeleteItemInput,
  ) => Promise<DeleteItemOutput>;
  readonly updateItem: (
    input: UpdateItemInput,
  ) => Promise<UpdateItemOutput>;
  readonly query: (input: QueryInput) => Promise<QueryOutput>;
  readonly scan: (input: ScanInput) => Promise<ScanOutput>;
  readonly batchWriteItem: (
    requests: ReadonlyArray<BatchWriteRequest>,
  ) => Promise<BatchWriteOutput>;
  readonly batchGetItem: (
    requests: ReadonlyArray<BatchGetRequest>,
  ) => Promise<BatchGetOutput>;
  readonly transactWriteItems: (
    items: ReadonlyArray<TransactWriteItem>,
  ) => Promise<void>;
  readonly transactGetItems: (
    items: ReadonlyArray<TransactGetItem>,
  ) => Promise<TransactGetOutput>;
  readonly describeTable: (
    input: DescribeTableInput,
  ) => Promise<DescribeTableOutput>;
}

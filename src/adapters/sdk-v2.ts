/**
 * AWS SDK v2 raw DynamoDB client adapter.
 *
 * Uses the raw `aws-sdk` DynamoDB service with AttributeValue format.
 * Requires `aws-sdk` as a peer dependency.
 */

import type { SDKAdapter } from "./adapter.js";
import type { AttributeMap } from "../marshalling/types.js";
import { normalizeDescribeTableOutput } from "./normalize-describe-table.js";

/** Minimal interface for the AWS SDK v2 DynamoDB service. */
interface DynamoDBV2 {
  putItem(params: unknown): { promise(): Promise<unknown> };
  getItem(params: unknown): { promise(): Promise<unknown> };
  deleteItem(params: unknown): { promise(): Promise<unknown> };
  updateItem(params: unknown): { promise(): Promise<unknown> };
  query(params: unknown): { promise(): Promise<unknown> };
  scan(params: unknown): { promise(): Promise<unknown> };
  batchWriteItem(params: unknown): { promise(): Promise<unknown> };
  batchGetItem(params: unknown): { promise(): Promise<unknown> };
  transactWriteItems(params: unknown): { promise(): Promise<unknown> };
  transactGetItems(params: unknown): { promise(): Promise<unknown> };
  describeTable(params: unknown): { promise(): Promise<unknown> };
}

/**
 * Creates an SDK adapter for the raw AWS SDK v2 DynamoDB service.
 *
 * @param client - An instance of `AWS.DynamoDB` from `aws-sdk`
 * @returns A frozen {@link SDKAdapter}
 */
export const createSDKv2Adapter = (client: DynamoDBV2): SDKAdapter =>
  Object.freeze({
    isRaw: true,

    putItem: async (input) => {
      const result = (await client
        .putItem({
          TableName: input.tableName,
          Item: input.item,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        })
        .promise()) as { Attributes?: AttributeMap };
      return { attributes: result.Attributes };
    },

    getItem: async (input) => {
      const result = (await client
        .getItem({
          TableName: input.tableName,
          Key: input.key,
          ConsistentRead: input.consistentRead,
          ProjectionExpression: input.projectionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
        })
        .promise()) as { Item?: AttributeMap };
      return { item: result.Item };
    },

    deleteItem: async (input) => {
      const result = (await client
        .deleteItem({
          TableName: input.tableName,
          Key: input.key,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        })
        .promise()) as { Attributes?: AttributeMap };
      return { attributes: result.Attributes };
    },

    updateItem: async (input) => {
      const result = (await client
        .updateItem({
          TableName: input.tableName,
          Key: input.key,
          UpdateExpression: input.updateExpression,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
          ReturnValues: input.returnValues,
        })
        .promise()) as { Attributes?: AttributeMap };
      return { attributes: result.Attributes };
    },

    query: async (input) => {
      const result = (await client
        .query({
          TableName: input.tableName,
          IndexName: input.indexName,
          KeyConditionExpression: input.keyConditionExpression,
          FilterExpression: input.filterExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
          Limit: input.limit,
          ExclusiveStartKey: input.exclusiveStartKey,
          ScanIndexForward: input.scanIndexForward,
          ConsistentRead: input.consistentRead,
          ProjectionExpression: input.projectionExpression,
        })
        .promise()) as {
        Items?: AttributeMap[];
        Count?: number;
        LastEvaluatedKey?: AttributeMap;
      };
      return {
        items: result.Items ?? [],
        count: result.Count ?? 0,
        lastEvaluatedKey: result.LastEvaluatedKey,
      };
    },

    scan: async (input) => {
      const result = (await client
        .scan({
          TableName: input.tableName,
          IndexName: input.indexName,
          FilterExpression: input.filterExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
          Limit: input.limit,
          ExclusiveStartKey: input.exclusiveStartKey,
          ConsistentRead: input.consistentRead,
          ProjectionExpression: input.projectionExpression,
        })
        .promise()) as {
        Items?: AttributeMap[];
        Count?: number;
        LastEvaluatedKey?: AttributeMap;
      };
      return {
        items: result.Items ?? [],
        count: result.Count ?? 0,
        lastEvaluatedKey: result.LastEvaluatedKey,
      };
    },

    batchWriteItem: async (requests) => {
      const requestItems: Record<
        string,
        Array<Record<string, unknown>>
      > = {};
      for (const req of requests) {
        const tableRequests: Array<Record<string, unknown>> = [];
        for (const r of req.requests) {
          if (r.type === "put") {
            tableRequests.push({ PutRequest: { Item: r.item } });
          } else {
            tableRequests.push({ DeleteRequest: { Key: r.key } });
          }
        }
        requestItems[req.tableName] = tableRequests;
      }

      const result = (await client
        .batchWriteItem({ RequestItems: requestItems })
        .promise()) as {
        UnprocessedItems?: Record<
          string,
          Array<{
            PutRequest?: { Item: AttributeMap };
            DeleteRequest?: { Key: AttributeMap };
          }>
        >;
      };

      const unprocessed: Array<{
        tableName: string;
        requests: Array<
          | { type: "put"; item: AttributeMap }
          | { type: "delete"; key: AttributeMap }
        >;
      }> = [];
      if (result.UnprocessedItems) {
        for (const [tableName, reqs] of Object.entries(
          result.UnprocessedItems,
        )) {
          const tableReqs: Array<
            | { type: "put"; item: AttributeMap }
            | { type: "delete"; key: AttributeMap }
          > = [];
          for (const r of reqs) {
            if (r.PutRequest) {
              tableReqs.push({ type: "put", item: r.PutRequest.Item });
            } else if (r.DeleteRequest) {
              tableReqs.push({
                type: "delete",
                key: r.DeleteRequest.Key,
              });
            }
          }
          unprocessed.push({ tableName, requests: tableReqs });
        }
      }

      return { unprocessedItems: unprocessed };
    },

    batchGetItem: async (requests) => {
      const requestItems: Record<string, Record<string, unknown>> = {};
      for (const req of requests) {
        requestItems[req.tableName] = {
          Keys: req.keys,
          ConsistentRead: req.consistentRead,
          ProjectionExpression: req.projectionExpression,
          ExpressionAttributeNames: req.expressionAttributeNames,
        };
      }

      const result = (await client
        .batchGetItem({ RequestItems: requestItems })
        .promise()) as {
        Responses?: Record<string, AttributeMap[]>;
        UnprocessedKeys?: Record<
          string,
          { Keys: AttributeMap[] }
        >;
      };

      const unprocessed: Array<{
        tableName: string;
        keys: AttributeMap[];
      }> = [];
      if (result.UnprocessedKeys) {
        for (const [tableName, data] of Object.entries(
          result.UnprocessedKeys,
        )) {
          unprocessed.push({ tableName, keys: data.Keys });
        }
      }

      return {
        responses: result.Responses ?? {},
        unprocessedKeys: unprocessed,
      };
    },

    transactWriteItems: async (items) => {
      const transactItems = items.map((item) => {
        switch (item.type) {
          case "put":
            return {
              Put: {
                TableName: item.tableName,
                Item: item.item,
                ConditionExpression: item.conditionExpression,
                ExpressionAttributeNames:
                  item.expressionAttributeNames,
                ExpressionAttributeValues:
                  item.expressionAttributeValues,
              },
            };
          case "delete":
            return {
              Delete: {
                TableName: item.tableName,
                Key: item.key,
                ConditionExpression: item.conditionExpression,
                ExpressionAttributeNames:
                  item.expressionAttributeNames,
                ExpressionAttributeValues:
                  item.expressionAttributeValues,
              },
            };
          case "update":
            return {
              Update: {
                TableName: item.tableName,
                Key: item.key,
                UpdateExpression: item.updateExpression,
                ConditionExpression: item.conditionExpression,
                ExpressionAttributeNames:
                  item.expressionAttributeNames,
                ExpressionAttributeValues:
                  item.expressionAttributeValues,
              },
            };
          case "conditionCheck":
            return {
              ConditionCheck: {
                TableName: item.tableName,
                Key: item.key,
                ConditionExpression: item.conditionExpression,
                ExpressionAttributeNames:
                  item.expressionAttributeNames,
                ExpressionAttributeValues:
                  item.expressionAttributeValues,
              },
            };
        }
      });

      await client
        .transactWriteItems({ TransactItems: transactItems })
        .promise();
    },

    transactGetItems: async (items) => {
      const transactItems = items.map((item) => ({
        Get: {
          TableName: item.tableName,
          Key: item.key,
          ProjectionExpression: item.projectionExpression,
          ExpressionAttributeNames: item.expressionAttributeNames,
        },
      }));

      const result = (await client
        .transactGetItems({ TransactItems: transactItems })
        .promise()) as {
        Responses?: Array<{ Item?: AttributeMap }>;
      };

      return {
        items: (result.Responses ?? []).map((r) => r.Item),
      };
    },
    describeTable: async (input) => {
      const result = await client
        .describeTable({ TableName: input.tableName })
        .promise();
      return normalizeDescribeTableOutput(result);
    },
  } satisfies SDKAdapter);

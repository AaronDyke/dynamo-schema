/**
 * AWS SDK v2 DocumentClient adapter.
 *
 * Uses `AWS.DynamoDB.DocumentClient` which handles marshalling automatically.
 * Requires `aws-sdk` as a peer dependency.
 */

import type { SDKAdapter } from "./adapter.js";

/** Minimal interface for the AWS SDK v2 DocumentClient. */
interface DocumentClientV2 {
  put(params: unknown): { promise(): Promise<unknown> };
  get(params: unknown): { promise(): Promise<unknown> };
  delete(params: unknown): { promise(): Promise<unknown> };
  update(params: unknown): { promise(): Promise<unknown> };
  query(params: unknown): { promise(): Promise<unknown> };
  scan(params: unknown): { promise(): Promise<unknown> };
  batchWrite(params: unknown): { promise(): Promise<unknown> };
  batchGet(params: unknown): { promise(): Promise<unknown> };
  transactWrite(params: unknown): { promise(): Promise<unknown> };
  transactGet(params: unknown): { promise(): Promise<unknown> };
}

/**
 * Creates an SDK adapter for the AWS SDK v2 DocumentClient.
 *
 * @param client - An instance of `AWS.DynamoDB.DocumentClient` from `aws-sdk`
 * @returns A frozen {@link SDKAdapter}
 */
export const createSDKv2DocAdapter = (
  client: DocumentClientV2,
): SDKAdapter =>
  Object.freeze({
    isRaw: false,

    putItem: async (input) => {
      const result = (await client
        .put({
          TableName: input.tableName,
          Item: input.item,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        })
        .promise()) as { Attributes?: Record<string, unknown> };
      return { attributes: result.Attributes };
    },

    getItem: async (input) => {
      const result = (await client
        .get({
          TableName: input.tableName,
          Key: input.key,
          ConsistentRead: input.consistentRead,
          ProjectionExpression: input.projectionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
        })
        .promise()) as { Item?: Record<string, unknown> };
      return { item: result.Item };
    },

    deleteItem: async (input) => {
      const result = (await client
        .delete({
          TableName: input.tableName,
          Key: input.key,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        })
        .promise()) as { Attributes?: Record<string, unknown> };
      return { attributes: result.Attributes };
    },

    updateItem: async (input) => {
      const result = (await client
        .update({
          TableName: input.tableName,
          Key: input.key,
          UpdateExpression: input.updateExpression,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
          ReturnValues: input.returnValues,
        })
        .promise()) as { Attributes?: Record<string, unknown> };
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
        Items?: Record<string, unknown>[];
        Count?: number;
        LastEvaluatedKey?: Record<string, unknown>;
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
        Items?: Record<string, unknown>[];
        Count?: number;
        LastEvaluatedKey?: Record<string, unknown>;
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
        .batchWrite({ RequestItems: requestItems })
        .promise()) as {
        UnprocessedItems?: Record<
          string,
          Array<{
            PutRequest?: { Item: Record<string, unknown> };
            DeleteRequest?: { Key: Record<string, unknown> };
          }>
        >;
      };

      const unprocessed: Array<{
        tableName: string;
        requests: Array<
          | { type: "put"; item: Record<string, unknown> }
          | { type: "delete"; key: Record<string, unknown> }
        >;
      }> = [];
      if (result.UnprocessedItems) {
        for (const [tableName, reqs] of Object.entries(
          result.UnprocessedItems,
        )) {
          const tableReqs: Array<
            | { type: "put"; item: Record<string, unknown> }
            | { type: "delete"; key: Record<string, unknown> }
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
        .batchGet({ RequestItems: requestItems })
        .promise()) as {
        Responses?: Record<string, Record<string, unknown>[]>;
        UnprocessedKeys?: Record<
          string,
          { Keys: Record<string, unknown>[] }
        >;
      };

      const unprocessed: Array<{
        tableName: string;
        keys: Record<string, unknown>[];
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
        .transactWrite({ TransactItems: transactItems })
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
        .transactGet({ TransactItems: transactItems })
        .promise()) as {
        Responses?: Array<{ Item?: Record<string, unknown> }>;
      };

      return {
        items: (result.Responses ?? []).map((r) => r.Item),
      };
    },
  } satisfies SDKAdapter);

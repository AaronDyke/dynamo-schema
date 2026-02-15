/**
 * AWS SDK v3 DocumentClient adapter.
 *
 * Uses `@aws-sdk/lib-dynamodb` DynamoDBDocumentClient which handles
 * marshalling/unmarshalling automatically.
 */

import type { SDKAdapter } from "./adapter.js";
import { normalizeDescribeTableOutput } from "./normalize-describe-table.js";

/** Minimal interface for the AWS SDK v3 DynamoDBDocumentClient. */
interface DynamoDBDocumentClientV3 {
  send(command: unknown): Promise<unknown>;
}

/** Minimal command constructor shape. */
interface CommandConstructor {
  new (input: unknown): unknown;
}

/**
 * Creates an SDK adapter for the AWS SDK v3 DocumentClient.
 *
 * @param client - An instance of `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb`
 * @param commands - The command constructors from `@aws-sdk/lib-dynamodb`
 * @returns A frozen {@link SDKAdapter}
 */
export const createSDKv3DocAdapter = (
  client: DynamoDBDocumentClientV3,
  commands: {
    readonly PutCommand: CommandConstructor;
    readonly GetCommand: CommandConstructor;
    readonly DeleteCommand: CommandConstructor;
    readonly UpdateCommand: CommandConstructor;
    readonly QueryCommand: CommandConstructor;
    readonly ScanCommand: CommandConstructor;
    readonly BatchWriteCommand: CommandConstructor;
    readonly BatchGetCommand: CommandConstructor;
    readonly TransactWriteCommand: CommandConstructor;
    readonly TransactGetCommand: CommandConstructor;
    readonly DescribeTableCommand: CommandConstructor;
  },
): SDKAdapter =>
  Object.freeze({
    isRaw: false,

    putItem: async (input) => {
      const result = (await client.send(
        new commands.PutCommand({
          TableName: input.tableName,
          Item: input.item,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        }),
      )) as { Attributes?: Record<string, unknown> };
      return { attributes: result.Attributes };
    },

    getItem: async (input) => {
      const result = (await client.send(
        new commands.GetCommand({
          TableName: input.tableName,
          Key: input.key,
          ConsistentRead: input.consistentRead,
          ProjectionExpression: input.projectionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
        }),
      )) as { Item?: Record<string, unknown> };
      return { item: result.Item };
    },

    deleteItem: async (input) => {
      const result = (await client.send(
        new commands.DeleteCommand({
          TableName: input.tableName,
          Key: input.key,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        }),
      )) as { Attributes?: Record<string, unknown> };
      return { attributes: result.Attributes };
    },

    updateItem: async (input) => {
      const result = (await client.send(
        new commands.UpdateCommand({
          TableName: input.tableName,
          Key: input.key,
          UpdateExpression: input.updateExpression,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
          ReturnValues: input.returnValues,
        }),
      )) as { Attributes?: Record<string, unknown> };
      return { attributes: result.Attributes };
    },

    query: async (input) => {
      const result = (await client.send(
        new commands.QueryCommand({
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
        }),
      )) as {
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
      const result = (await client.send(
        new commands.ScanCommand({
          TableName: input.tableName,
          IndexName: input.indexName,
          FilterExpression: input.filterExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
          Limit: input.limit,
          ExclusiveStartKey: input.exclusiveStartKey,
          ConsistentRead: input.consistentRead,
          ProjectionExpression: input.projectionExpression,
        }),
      )) as {
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

      const result = (await client.send(
        new commands.BatchWriteCommand({
          RequestItems: requestItems,
        }),
      )) as {
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

      const result = (await client.send(
        new commands.BatchGetCommand({
          RequestItems: requestItems,
        }),
      )) as {
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

      await client.send(
        new commands.TransactWriteCommand({
          TransactItems: transactItems,
        }),
      );
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

      const result = (await client.send(
        new commands.TransactGetCommand({
          TransactItems: transactItems,
        }),
      )) as {
        Responses?: Array<{ Item?: Record<string, unknown> }>;
      };

      return {
        items: (result.Responses ?? []).map((r) => r.Item),
      };
    },
    describeTable: async (input) => {
      const result = await client.send(
        new commands.DescribeTableCommand({
          TableName: input.tableName,
        }),
      );
      return normalizeDescribeTableOutput(result);
    },
  } satisfies SDKAdapter);

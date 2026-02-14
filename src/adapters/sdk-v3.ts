/**
 * AWS SDK v3 raw DynamoDB client adapter.
 *
 * Uses the raw `@aws-sdk/client-dynamodb` client with AttributeValue format.
 * Requires `@aws-sdk/client-dynamodb` as a peer dependency.
 */

import type { SDKAdapter } from "./adapter.js";
import type { AttributeMap, AttributeValue } from "../marshalling/types.js";

/** Minimal interface for the AWS SDK v3 DynamoDBClient. */
interface DynamoDBClientV3 {
  send(command: unknown): Promise<unknown>;
}

/** Minimal command constructor shape. */
interface CommandConstructor {
  new (input: unknown): unknown;
}

/**
 * Creates an SDK adapter for the raw AWS SDK v3 DynamoDB client.
 *
 * @param client - An instance of `DynamoDBClient` from `@aws-sdk/client-dynamodb`
 * @param commands - The command constructors from `@aws-sdk/client-dynamodb`
 * @returns A frozen {@link SDKAdapter}
 *
 * @example
 * ```ts
 * import { DynamoDBClient, PutItemCommand, GetItemCommand, ... } from "@aws-sdk/client-dynamodb";
 * const adapter = createSDKv3Adapter(new DynamoDBClient({}), {
 *   PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand,
 *   QueryCommand, ScanCommand, BatchWriteItemCommand, BatchGetItemCommand,
 *   TransactWriteItemsCommand, TransactGetItemsCommand,
 * });
 * ```
 */
export const createSDKv3Adapter = (
  client: DynamoDBClientV3,
  commands: {
    readonly PutItemCommand: CommandConstructor;
    readonly GetItemCommand: CommandConstructor;
    readonly DeleteItemCommand: CommandConstructor;
    readonly UpdateItemCommand: CommandConstructor;
    readonly QueryCommand: CommandConstructor;
    readonly ScanCommand: CommandConstructor;
    readonly BatchWriteItemCommand: CommandConstructor;
    readonly BatchGetItemCommand: CommandConstructor;
    readonly TransactWriteItemsCommand: CommandConstructor;
    readonly TransactGetItemsCommand: CommandConstructor;
  },
): SDKAdapter =>
  Object.freeze({
    isRaw: true,

    putItem: async (input) => {
      const result = (await client.send(
        new commands.PutItemCommand({
          TableName: input.tableName,
          Item: input.item,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        }),
      )) as { Attributes?: AttributeMap };
      return { attributes: result.Attributes };
    },

    getItem: async (input) => {
      const result = (await client.send(
        new commands.GetItemCommand({
          TableName: input.tableName,
          Key: input.key,
          ConsistentRead: input.consistentRead,
          ProjectionExpression: input.projectionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
        }),
      )) as { Item?: AttributeMap };
      return { item: result.Item };
    },

    deleteItem: async (input) => {
      const result = (await client.send(
        new commands.DeleteItemCommand({
          TableName: input.tableName,
          Key: input.key,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
        }),
      )) as { Attributes?: AttributeMap };
      return { attributes: result.Attributes };
    },

    updateItem: async (input) => {
      const result = (await client.send(
        new commands.UpdateItemCommand({
          TableName: input.tableName,
          Key: input.key,
          UpdateExpression: input.updateExpression,
          ConditionExpression: input.conditionExpression,
          ExpressionAttributeNames: input.expressionAttributeNames,
          ExpressionAttributeValues: input.expressionAttributeValues,
          ReturnValues: input.returnValues,
        }),
      )) as { Attributes?: AttributeMap };
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

      const result = (await client.send(
        new commands.BatchWriteItemCommand({
          RequestItems: requestItems,
        }),
      )) as {
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
              tableReqs.push({
                type: "put",
                item: r.PutRequest.Item,
              });
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
        new commands.BatchGetItemCommand({
          RequestItems: requestItems,
        }),
      )) as {
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

      await client.send(
        new commands.TransactWriteItemsCommand({
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
        new commands.TransactGetItemsCommand({
          TransactItems: transactItems,
        }),
      )) as {
        Responses?: Array<{ Item?: AttributeMap }>;
      };

      return {
        items: (result.Responses ?? []).map((r) => r.Item),
      };
    },
  } satisfies SDKAdapter);

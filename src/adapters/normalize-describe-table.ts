/**
 * Shared normalization helper for DescribeTable responses.
 *
 * Converts the raw AWS DescribeTable response (same shape across all SDKs)
 * into the normalized {@link DescribeTableOutput} type.
 */

import type {
  DescribeTableOutput,
  DescribeKeySchema,
  DescribeAttributeDefinition,
  DescribeIndexInfo,
} from "../types/describe-table.js";

/** Raw AWS DescribeTable response shape (common across all SDK versions). */
interface RawDescribeTableResponse {
  Table?: {
    TableName?: string;
    TableStatus?: string;
    KeySchema?: ReadonlyArray<{
      AttributeName?: string;
      KeyType?: string;
    }>;
    AttributeDefinitions?: ReadonlyArray<{
      AttributeName?: string;
      AttributeType?: string;
    }>;
    GlobalSecondaryIndexes?: ReadonlyArray<{
      IndexName?: string;
      IndexStatus?: string;
      KeySchema?: ReadonlyArray<{
        AttributeName?: string;
        KeyType?: string;
      }>;
      Projection?: {
        ProjectionType?: string;
        NonKeyAttributes?: ReadonlyArray<string>;
      };
    }>;
    LocalSecondaryIndexes?: ReadonlyArray<{
      IndexName?: string;
      KeySchema?: ReadonlyArray<{
        AttributeName?: string;
        KeyType?: string;
      }>;
      Projection?: {
        ProjectionType?: string;
        NonKeyAttributes?: ReadonlyArray<string>;
      };
    }>;
  };
}

const normalizeKeySchema = (
  raw: ReadonlyArray<{ AttributeName?: string; KeyType?: string }>,
): readonly DescribeKeySchema[] =>
  Object.freeze(
    raw.map((k) =>
      Object.freeze({
        attributeName: k.AttributeName ?? "",
        keyType: (k.KeyType ?? "HASH") as "HASH" | "RANGE",
      }),
    ),
  );

const normalizeIndex = (
  raw: {
    IndexName?: string;
    IndexStatus?: string;
    KeySchema?: ReadonlyArray<{ AttributeName?: string; KeyType?: string }>;
    Projection?: {
      ProjectionType?: string;
      NonKeyAttributes?: ReadonlyArray<string>;
    };
  },
  includeStatus: boolean,
): DescribeIndexInfo =>
  Object.freeze({
    indexName: raw.IndexName ?? "",
    keySchema: normalizeKeySchema(raw.KeySchema ?? []),
    projection: Object.freeze({
      projectionType: (raw.Projection?.ProjectionType ?? "ALL") as
        | "ALL"
        | "KEYS_ONLY"
        | "INCLUDE",
      ...(raw.Projection?.NonKeyAttributes
        ? {
            nonKeyAttributes: Object.freeze([
              ...raw.Projection.NonKeyAttributes,
            ]),
          }
        : {}),
    }),
    ...(includeStatus && raw.IndexStatus
      ? { indexStatus: raw.IndexStatus }
      : {}),
  });

/**
 * Normalizes a raw AWS DescribeTable response into {@link DescribeTableOutput}.
 *
 * @param raw - The raw response from any AWS SDK's describeTable call
 * @returns A frozen, normalized DescribeTableOutput
 */
export const normalizeDescribeTableOutput = (
  raw: unknown,
): DescribeTableOutput => {
  const response = raw as RawDescribeTableResponse;
  const table = response.Table ?? {};

  const attributeDefinitions: readonly DescribeAttributeDefinition[] =
    Object.freeze(
      (table.AttributeDefinitions ?? []).map((a) =>
        Object.freeze({
          attributeName: a.AttributeName ?? "",
          attributeType: (a.AttributeType ?? "S") as "S" | "N" | "B",
        }),
      ),
    );

  const result: DescribeTableOutput = {
    tableName: table.TableName ?? "",
    tableStatus: table.TableStatus ?? "UNKNOWN",
    keySchema: normalizeKeySchema(table.KeySchema ?? []),
    attributeDefinitions,
    ...(table.GlobalSecondaryIndexes
      ? {
          globalSecondaryIndexes: Object.freeze(
            table.GlobalSecondaryIndexes.map((idx) =>
              normalizeIndex(idx, true),
            ),
          ),
        }
      : {}),
    ...(table.LocalSecondaryIndexes
      ? {
          localSecondaryIndexes: Object.freeze(
            table.LocalSecondaryIndexes.map((idx) =>
              normalizeIndex(idx, false),
            ),
          ),
        }
      : {}),
  };

  return Object.freeze(result);
};

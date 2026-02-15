/**
 * Validates a local TableDefinition against the actual table in AWS DynamoDB.
 *
 * Calls `DescribeTable` through the SDK adapter and compares the result against
 * the local definition, reporting mismatches in key names, key types, indexes,
 * and table status.
 */

import type { Result } from "../types/common.js";
import { ok, err } from "../types/common.js";
import type { DynamoError } from "../types/operations.js";
import { createDynamoError } from "../types/operations.js";
import type { TableDefinition, IndexDefinition } from "../types/table.js";
import type { SDKAdapter } from "../adapters/adapter.js";
import type {
  DescribeTableOutput,
  DescribeKeySchema,
  DescribeAttributeDefinition,
} from "../types/describe-table.js";

/** Severity level for table validation issues. */
export type TableValidationSeverity = "error" | "warning" | "info";

/** A single validation issue found when comparing local vs AWS table structure. */
export interface TableValidationIssue {
  readonly severity: TableValidationSeverity;
  readonly path: string;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
}

/** Result of validating a table definition against AWS. */
export interface TableValidationResult {
  readonly tableName: string;
  readonly tableStatus: string;
  readonly valid: boolean;
  readonly issues: readonly TableValidationIssue[];
}

const findKeyByType = (
  keySchema: readonly DescribeKeySchema[],
  keyType: "HASH" | "RANGE",
): DescribeKeySchema | undefined =>
  keySchema.find((k) => k.keyType === keyType);

const findAttributeType = (
  attributeDefinitions: readonly DescribeAttributeDefinition[],
  attributeName: string,
): string | undefined =>
  attributeDefinitions.find((a) => a.attributeName === attributeName)
    ?.attributeType;

/**
 * Validates a local {@link TableDefinition} against the actual DynamoDB table.
 *
 * @param table - The local table definition created by `defineTable()`
 * @param adapter - An SDK adapter with `describeTable` capability
 * @returns A Result containing validation issues or a DynamoError if the API call fails
 *
 * @example
 * ```ts
 * const result = await validateTable(table, adapter);
 * if (result.success && !result.data.valid) {
 *   for (const issue of result.data.issues) {
 *     console.log(`[${issue.severity}] ${issue.path}: ${issue.message}`);
 *   }
 * }
 * ```
 */
export const validateTable = async (
  table: TableDefinition,
  adapter: SDKAdapter,
): Promise<Result<TableValidationResult, DynamoError>> => {
  let described: DescribeTableOutput;
  try {
    described = await adapter.describeTable({ tableName: table.tableName });
  } catch (cause: unknown) {
    return err(
      createDynamoError(
        "dynamo",
        `Failed to describe table "${table.tableName}"`,
        cause,
      ),
    );
  }

  const issues: TableValidationIssue[] = [];

  // 1. Table status
  if (described.tableStatus !== "ACTIVE") {
    issues.push({
      severity: "warning",
      path: "tableStatus",
      message: `Table status is "${described.tableStatus}", expected "ACTIVE"`,
      expected: "ACTIVE",
      actual: described.tableStatus,
    });
  }

  // 2. Partition key
  const awsHash = findKeyByType(described.keySchema, "HASH");
  if (!awsHash) {
    issues.push({
      severity: "error",
      path: "partitionKey",
      message: "No HASH key found in AWS table key schema",
      expected: table.partitionKey.name,
    });
  } else {
    if (awsHash.attributeName !== table.partitionKey.name) {
      issues.push({
        severity: "error",
        path: "partitionKey",
        message: "Partition key name mismatch",
        expected: table.partitionKey.name,
        actual: awsHash.attributeName,
      });
    }
    if (table.partitionKey.type !== undefined) {
      const awsType = findAttributeType(
        described.attributeDefinitions,
        awsHash.attributeName,
      );
      if (awsType && awsType !== table.partitionKey.type) {
        issues.push({
          severity: "error",
          path: "partitionKey.type",
          message: "Partition key type mismatch",
          expected: table.partitionKey.type,
          actual: awsType,
        });
      }
    }
  }

  // 3. Sort key
  const awsRange = findKeyByType(described.keySchema, "RANGE");
  if (table.sortKey && !awsRange) {
    issues.push({
      severity: "error",
      path: "sortKey",
      message: "Definition has a sort key but AWS table does not",
      expected: table.sortKey.name,
    });
  } else if (!table.sortKey && awsRange) {
    issues.push({
      severity: "error",
      path: "sortKey",
      message: "AWS table has a sort key but definition does not",
      actual: awsRange.attributeName,
    });
  } else if (table.sortKey && awsRange) {
    if (awsRange.attributeName !== table.sortKey.name) {
      issues.push({
        severity: "error",
        path: "sortKey",
        message: "Sort key name mismatch",
        expected: table.sortKey.name,
        actual: awsRange.attributeName,
      });
    }
    if (table.sortKey.type !== undefined) {
      const awsType = findAttributeType(
        described.attributeDefinitions,
        awsRange.attributeName,
      );
      if (awsType && awsType !== table.sortKey.type) {
        issues.push({
          severity: "error",
          path: "sortKey.type",
          message: "Sort key type mismatch",
          expected: table.sortKey.type,
          actual: awsType,
        });
      }
    }
  }

  // 4. Indexes
  const allAwsGSIs = described.globalSecondaryIndexes ?? [];
  const allAwsLSIs = described.localSecondaryIndexes ?? [];
  const matchedAwsIndexNames = new Set<string>();

  for (const [key, indexDef] of Object.entries(
    table.indexes as Record<string, IndexDefinition>,
  )) {
    const awsIndexList =
      indexDef.type === "GSI" ? allAwsGSIs : allAwsLSIs;
    const awsIndex = awsIndexList.find(
      (idx) => idx.indexName === indexDef.indexName,
    );

    if (!awsIndex) {
      // Check if it exists as the wrong type
      const otherList =
        indexDef.type === "GSI" ? allAwsLSIs : allAwsGSIs;
      const inOtherList = otherList.find(
        (idx) => idx.indexName === indexDef.indexName,
      );
      if (inOtherList) {
        issues.push({
          severity: "error",
          path: `indexes.${key}`,
          message: `Index "${indexDef.indexName}" exists but is a ${indexDef.type === "GSI" ? "LSI" : "GSI"}, expected ${indexDef.type}`,
          expected: indexDef.type,
          actual: indexDef.type === "GSI" ? "LSI" : "GSI",
        });
        matchedAwsIndexNames.add(indexDef.indexName);
      } else {
        issues.push({
          severity: "error",
          path: `indexes.${key}`,
          message: `Index "${indexDef.indexName}" not found in AWS table`,
        });
      }
      continue;
    }

    matchedAwsIndexNames.add(indexDef.indexName);

    // 6. GSI status
    if (indexDef.type === "GSI" && awsIndex.indexStatus && awsIndex.indexStatus !== "ACTIVE") {
      issues.push({
        severity: "warning",
        path: `indexes.${key}.status`,
        message: `GSI "${indexDef.indexName}" status is "${awsIndex.indexStatus}", expected "ACTIVE"`,
        expected: "ACTIVE",
        actual: awsIndex.indexStatus,
      });
    }

    // Index partition key
    const idxHash = findKeyByType(awsIndex.keySchema, "HASH");
    if (idxHash) {
      if (idxHash.attributeName !== indexDef.partitionKey.name) {
        issues.push({
          severity: "error",
          path: `indexes.${key}.partitionKey`,
          message: `Index "${indexDef.indexName}" partition key name mismatch`,
          expected: indexDef.partitionKey.name,
          actual: idxHash.attributeName,
        });
      }
      if (indexDef.partitionKey.type !== undefined) {
        const awsType = findAttributeType(
          described.attributeDefinitions,
          idxHash.attributeName,
        );
        if (awsType && awsType !== indexDef.partitionKey.type) {
          issues.push({
            severity: "error",
            path: `indexes.${key}.partitionKey.type`,
            message: `Index "${indexDef.indexName}" partition key type mismatch`,
            expected: indexDef.partitionKey.type,
            actual: awsType,
          });
        }
      }
    }

    // Index sort key
    const idxRange = findKeyByType(awsIndex.keySchema, "RANGE");
    if (indexDef.sortKey && !idxRange) {
      issues.push({
        severity: "error",
        path: `indexes.${key}.sortKey`,
        message: `Index "${indexDef.indexName}" definition has a sort key but AWS does not`,
        expected: indexDef.sortKey.name,
      });
    } else if (!indexDef.sortKey && idxRange) {
      issues.push({
        severity: "error",
        path: `indexes.${key}.sortKey`,
        message: `Index "${indexDef.indexName}" has a sort key in AWS but not in definition`,
        actual: idxRange.attributeName,
      });
    } else if (indexDef.sortKey && idxRange) {
      if (idxRange.attributeName !== indexDef.sortKey.name) {
        issues.push({
          severity: "error",
          path: `indexes.${key}.sortKey`,
          message: `Index "${indexDef.indexName}" sort key name mismatch`,
          expected: indexDef.sortKey.name,
          actual: idxRange.attributeName,
        });
      }
      if (indexDef.sortKey.type !== undefined) {
        const awsType = findAttributeType(
          described.attributeDefinitions,
          idxRange.attributeName,
        );
        if (awsType && awsType !== indexDef.sortKey.type) {
          issues.push({
            severity: "error",
            path: `indexes.${key}.sortKey.type`,
            message: `Index "${indexDef.indexName}" sort key type mismatch`,
            expected: indexDef.sortKey.type,
            actual: awsType,
          });
        }
      }
    }
  }

  // 5. Extra AWS indexes (info-level)
  for (const awsGSI of allAwsGSIs) {
    if (!matchedAwsIndexNames.has(awsGSI.indexName)) {
      issues.push({
        severity: "info",
        path: `indexes`,
        message: `GSI "${awsGSI.indexName}" exists in AWS but is not defined locally`,
        actual: awsGSI.indexName,
      });
    }
  }
  for (const awsLSI of allAwsLSIs) {
    if (!matchedAwsIndexNames.has(awsLSI.indexName)) {
      issues.push({
        severity: "info",
        path: `indexes`,
        message: `LSI "${awsLSI.indexName}" exists in AWS but is not defined locally`,
        actual: awsLSI.indexName,
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  return ok(
    Object.freeze({
      tableName: table.tableName,
      tableStatus: described.tableStatus,
      valid: !hasErrors,
      issues: Object.freeze(issues),
    }),
  );
};

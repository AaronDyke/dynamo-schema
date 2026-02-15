import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateTable } from "../../validation/validate-table.js";
import { defineTable } from "../../core/define-table.js";
import { createMockAdapter } from "../fixtures.js";
import type { DescribeTableOutput } from "../../types/describe-table.js";

const makeDescribeOutput = (
  overrides?: Partial<DescribeTableOutput>,
): DescribeTableOutput => ({
  tableName: "TestTable",
  tableStatus: "ACTIVE",
  keySchema: [
    { attributeName: "pk", keyType: "HASH" },
    { attributeName: "sk", keyType: "RANGE" },
  ],
  attributeDefinitions: [
    { attributeName: "pk", attributeType: "S" },
    { attributeName: "sk", attributeType: "S" },
  ],
  globalSecondaryIndexes: [],
  localSecondaryIndexes: [],
  ...overrides,
});

const validTable = defineTable({
  tableName: "TestTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
});

describe("validateTable()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns valid=true when table matches local definition", async () => {
    vi.mocked(adapter.describeTable).mockResolvedValueOnce(makeDescribeOutput());
    const result = await validateTable(validTable, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.issues).toHaveLength(0);
    }
  });

  it("returns a warning when table is not ACTIVE", async () => {
    vi.mocked(adapter.describeTable).mockResolvedValueOnce(
      makeDescribeOutput({ tableStatus: "CREATING" }),
    );
    const result = await validateTable(validTable, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      const warning = result.data.issues.find((i) => i.path === "tableStatus");
      expect(warning?.severity).toBe("warning");
    }
  });

  it("returns error when partition key name does not match", async () => {
    vi.mocked(adapter.describeTable).mockResolvedValueOnce(
      makeDescribeOutput({
        keySchema: [
          { attributeName: "wrong_pk", keyType: "HASH" },
          { attributeName: "sk", keyType: "RANGE" },
        ],
      }),
    );
    const result = await validateTable(validTable, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      const issue = result.data.issues.find((i) => i.path === "partitionKey");
      expect(issue?.severity).toBe("error");
    }
  });

  it("returns error when sort key is missing from AWS", async () => {
    vi.mocked(adapter.describeTable).mockResolvedValueOnce(
      makeDescribeOutput({
        keySchema: [{ attributeName: "pk", keyType: "HASH" }],
      }),
    );
    const result = await validateTable(validTable, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      const issue = result.data.issues.find((i) => i.path === "sortKey");
      expect(issue?.severity).toBe("error");
    }
  });

  it("returns error when index is missing from AWS", async () => {
    const tableWithIndex = defineTable({
      tableName: "TestTable",
      partitionKey: { name: "pk", definition: "pk" },
      sortKey: { name: "sk", definition: "sk" },
      indexes: {
        gsi1: {
          type: "GSI" as const,
          indexName: "GSI1",
          partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
        },
      },
    });
    vi.mocked(adapter.describeTable).mockResolvedValueOnce(makeDescribeOutput());
    const result = await validateTable(tableWithIndex, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      const indexIssue = result.data.issues.find((i) => i.path === "indexes.gsi1");
      expect(indexIssue?.severity).toBe("error");
    }
  });

  it("returns dynamo error when describeTable throws", async () => {
    vi.mocked(adapter.describeTable).mockRejectedValueOnce(new Error("ResourceNotFoundException"));
    const result = await validateTable(validTable, adapter);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });

  it("returns correct tableName in result", async () => {
    vi.mocked(adapter.describeTable).mockResolvedValueOnce(makeDescribeOutput());
    const result = await validateTable(validTable, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tableName).toBe("TestTable");
    }
  });

  it("validates TTL attribute does not conflict with PK name", async () => {
    const ttlConflictTable = defineTable({
      tableName: "TestTable",
      partitionKey: { name: "pk", definition: "pk" },
      ttl: { attributeName: "pk" }, // conflicts!
    });
    vi.mocked(adapter.describeTable).mockResolvedValueOnce(
      makeDescribeOutput({ keySchema: [{ attributeName: "pk", keyType: "HASH" }] }),
    );
    const result = await validateTable(ttlConflictTable, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      const ttlIssue = result.data.issues.find((i) => i.path === "ttl.attributeName");
      expect(ttlIssue).toBeDefined();
    }
  });
});

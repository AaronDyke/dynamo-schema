import { describe, it, expect } from "vitest";
import { defineTable } from "../../core/define-table.js";

describe("defineTable()", () => {
  it("returns a frozen object", () => {
    const table = defineTable({
      tableName: "TestTable",
      partitionKey: { name: "pk", definition: "pk" },
    });
    expect(Object.isFrozen(table)).toBe(true);
  });

  it("has the correct tableName", () => {
    const table = defineTable({
      tableName: "MyTable",
      partitionKey: { name: "pk", definition: "pk" },
    });
    expect(table.tableName).toBe("MyTable");
  });

  it("stores the partition key", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
    });
    expect(table.partitionKey.name).toBe("pk");
    expect(table.partitionKey.definition).toBe("pk");
  });

  it("has no sortKey when not provided", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
    });
    expect(table.sortKey).toBeUndefined();
  });

  it("stores the sort key when provided", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
      sortKey: { name: "sk", definition: "sk" },
    });
    expect(table.sortKey?.name).toBe("sk");
  });

  it("stores index definitions", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
      indexes: {
        gsi1: {
          type: "GSI" as const,
          indexName: "GSI1",
          partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
        },
      },
    });
    expect(table.indexes["gsi1"]).toBeDefined();
    expect(table.indexes["gsi1"]?.indexName).toBe("GSI1");
    expect(Object.isFrozen(table.indexes)).toBe(true);
  });

  it("has empty indexes object when no indexes provided", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
    });
    expect(table.indexes).toEqual({});
  });

  it("stores TTL config when provided", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
      ttl: { attributeName: "expiresAt" },
    });
    expect(table.ttl?.attributeName).toBe("expiresAt");
    expect(Object.isFrozen(table.ttl)).toBe(true);
  });

  it("has undefined TTL when not provided", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
    });
    expect(table.ttl).toBeUndefined();
  });

  it("freezes the partition key and sort key objects", () => {
    const table = defineTable({
      tableName: "T",
      partitionKey: { name: "pk", definition: "pk" },
      sortKey: { name: "sk", definition: "sk" },
    });
    expect(Object.isFrozen(table.partitionKey)).toBe(true);
    expect(Object.isFrozen(table.sortKey)).toBe(true);
  });
});

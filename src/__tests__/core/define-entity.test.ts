import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTable } from "../../core/define-table.js";
import { defineEntity } from "../../core/define-entity.js";

const schema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
});

const table = defineTable({
  tableName: "TestTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
  indexes: {
    gsi1: {
      type: "GSI" as const,
      indexName: "GSI1",
      partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
      sortKey: { name: "gsi1sk", definition: "gsi1sk" },
    },
  },
  ttl: { attributeName: "expiresAt" },
});

describe("defineEntity()", () => {
  it("returns a frozen object", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    expect(Object.isFrozen(entity)).toBe(true);
  });

  it("stores the entity name", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    expect(entity.name).toBe("User");
  });

  it("stores the schema reference", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    expect(entity.schema).toBe(schema);
  });

  it("stores the table reference", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    expect(entity.table).toBe(table);
  });

  it("stores simple (non-template) key definitions", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    expect(entity.partitionKey).toBe("USER#{{userId}}");
    expect(entity.sortKey).toBe("PROFILE");
  });

  it("has the sortKey from config", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    expect(entity.sortKey).toBe("PROFILE");
  });

  it("stores index key overrides", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
      indexes: {
        gsi1: {
          partitionKey: "EMAIL#{{email}}",
          sortKey: "USER#{{userId}}",
        },
      },
    });
    expect(entity.indexes?.["gsi1"]?.partitionKey).toBe("EMAIL#{{email}}");
  });

  it("stores TTL config when provided", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
      ttl: {
        defaultTtlSeconds: 86400,
        autoUpdateTtlSeconds: 86400,
      },
    });
    expect(entity.ttl?.defaultTtlSeconds).toBe(86400);
    expect(entity.ttl?.autoUpdateTtlSeconds).toBe(86400);
    expect(Object.isFrozen(entity.ttl)).toBe(true);
  });

  it("has undefined TTL when not provided", () => {
    const entity = defineEntity({
      name: "User",
      schema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    expect(entity.ttl).toBeUndefined();
  });
});

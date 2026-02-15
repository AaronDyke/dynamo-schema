/**
 * Shared test fixtures used across all test files.
 */

import { vi } from "vitest";
import { z } from "zod";
import { defineTable } from "../core/define-table.js";
import { defineEntity } from "../core/define-entity.js";
import type { SDKAdapter } from "../adapters/adapter.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().int().nonnegative().optional(),
});

export type User = z.output<typeof userSchema>;

// ---------------------------------------------------------------------------
// Table + entity definitions
// ---------------------------------------------------------------------------

export const usersTable = defineTable({
  tableName: "UsersTable",
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

export const userEntity = defineEntity({
  name: "User",
  schema: userSchema,
  table: usersTable,
  partitionKey: "USER#{{userId}}",
  sortKey: "PROFILE",
  indexes: {
    gsi1: {
      partitionKey: "USER_EMAIL#{{email}}",
      sortKey: "USER#{{userId}}",
    },
  },
  ttl: {
    defaultTtlSeconds: 60 * 60 * 24 * 30, // 30 days
    autoUpdateTtlSeconds: 60 * 60 * 24 * 30,
  },
});

/** Table without TTL for testing TTL-absent scenarios. */
export const noTtlTable = defineTable({
  tableName: "NoTtlTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
});

export const noTtlEntity = defineEntity({
  name: "NoTtlUser",
  schema: userSchema,
  table: noTtlTable,
  partitionKey: "USER#{{userId}}",
  sortKey: "PROFILE",
});

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

export const createMockAdapter = (): SDKAdapter => ({
  isRaw: false,
  putItem: vi.fn().mockResolvedValue({}),
  getItem: vi.fn().mockResolvedValue({ item: undefined }),
  deleteItem: vi.fn().mockResolvedValue({}),
  updateItem: vi.fn().mockResolvedValue({ attributes: {} }),
  query: vi.fn().mockResolvedValue({ items: [], count: 0, lastEvaluatedKey: undefined }),
  scan: vi.fn().mockResolvedValue({ items: [], count: 0, lastEvaluatedKey: undefined }),
  batchWriteItem: vi.fn().mockResolvedValue({ unprocessedItems: [] }),
  batchGetItem: vi.fn().mockResolvedValue({ responses: {}, unprocessedKeys: [] }),
  transactWriteItems: vi.fn().mockResolvedValue(undefined),
  transactGetItems: vi.fn().mockResolvedValue({ items: [] }),
  describeTable: vi.fn().mockResolvedValue(undefined),
});

export const createRawMockAdapter = (): SDKAdapter => ({
  ...createMockAdapter(),
  isRaw: true,
});

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

export const validUser: User = {
  userId: "user-123",
  email: "alice@example.com",
  name: "Alice",
};

export const validUserWithAge: User = {
  userId: "user-456",
  email: "bob@example.com",
  name: "Bob",
  age: 30,
};

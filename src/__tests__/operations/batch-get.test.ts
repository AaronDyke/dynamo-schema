import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeBatchGet } from "../../operations/batch-get.js";
import type { BatchGetEntityRequest } from "../../operations/batch-get.js";
import {
  userEntity,
  validUser,
  createMockAdapter,
  createRawMockAdapter,
} from "../fixtures.js";

describe("executeBatchGet()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns empty responses when no items found", async () => {
    vi.mocked(adapter.batchGetItem).mockResolvedValueOnce({
      responses: { UsersTable: [] },
      unprocessedKeys: [],
    });
    const requests: BatchGetEntityRequest[] = [
      { entity: userEntity, keys: [{ userId: "user-123" }] },
    ];
    const result = await executeBatchGet(adapter, requests);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.responses["User"]).toEqual([]);
    }
  });

  it("returns items when found", async () => {
    const item = { ...validUser, pk: "USER#user-123", sk: "PROFILE" };
    vi.mocked(adapter.batchGetItem).mockResolvedValueOnce({
      responses: { UsersTable: [item] },
      unprocessedKeys: [],
    });
    const requests: BatchGetEntityRequest[] = [
      { entity: userEntity, keys: [{ userId: "user-123" }] },
    ];
    const result = await executeBatchGet(adapter, requests);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.responses["User"]).toHaveLength(1);
    }
  });

  it("calls batchGetItem with correct tableName and key", async () => {
    vi.mocked(adapter.batchGetItem).mockResolvedValueOnce({ responses: {}, unprocessedKeys: [] });
    const requests: BatchGetEntityRequest[] = [
      { entity: userEntity, keys: [{ userId: "user-123" }] },
    ];
    await executeBatchGet(adapter, requests);
    const call = vi.mocked(adapter.batchGetItem).mock.calls[0]?.[0];
    expect(call?.[0]?.tableName).toBe("UsersTable");
    expect((call?.[0]?.keys[0] as Record<string, unknown>)?.["pk"]).toBe("USER#user-123");
  });

  it("returns key error when key field is missing", async () => {
    const requests: BatchGetEntityRequest[] = [
      { entity: userEntity, keys: [{}] },
    ];
    const result = await executeBatchGet(adapter, requests);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
    }
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.batchGetItem).mockRejectedValueOnce(new Error("BatchGet failed"));
    const requests: BatchGetEntityRequest[] = [
      { entity: userEntity, keys: [{ userId: "user-123" }] },
    ];
    const result = await executeBatchGet(adapter, requests);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });

  it("handles raw adapter by unmarshalling responses", async () => {
    const rawAdapter = createRawMockAdapter();
    const rawItem = {
      userId: { S: "user-123" },
      email: { S: "alice@example.com" },
      name: { S: "Alice" },
      pk: { S: "USER#user-123" },
      sk: { S: "PROFILE" },
    };
    vi.mocked(rawAdapter.batchGetItem).mockResolvedValueOnce({
      responses: { UsersTable: [rawItem] },
      unprocessedKeys: [],
    });
    const requests: BatchGetEntityRequest[] = [
      { entity: userEntity, keys: [{ userId: "user-123" }] },
    ];
    const result = await executeBatchGet(rawAdapter, requests);
    expect(result.success).toBe(true);
    if (result.success) {
      const items = result.data.responses["User"];
      expect(items?.[0]?.["userId"]).toBe("user-123");
    }
  });
});

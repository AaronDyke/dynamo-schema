import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeTransactGet } from "../../operations/transact-get.js";
import type { TransactGetEntityRequest } from "../../operations/transact-get.js";
import {
  userEntity,
  validUser,
  createMockAdapter,
  createRawMockAdapter,
} from "../fixtures.js";

describe("executeTransactGet()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns items in request order", async () => {
    const item = { ...validUser, pk: "USER#user-123", sk: "PROFILE" };
    vi.mocked(adapter.transactGetItems).mockResolvedValueOnce({ items: [item] });
    const requests: TransactGetEntityRequest[] = [
      { entity: userEntity, keyInput: { userId: "user-123" } },
    ];
    const result = await executeTransactGet(adapter, requests);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]).toEqual(item);
    }
  });

  it("handles missing items (undefined) in results", async () => {
    vi.mocked(adapter.transactGetItems).mockResolvedValueOnce({ items: [undefined] });
    const requests: TransactGetEntityRequest[] = [
      { entity: userEntity, keyInput: { userId: "user-999" } },
    ];
    const result = await executeTransactGet(adapter, requests);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]).toBeUndefined();
    }
  });

  it("calls transactGetItems with correct tableName and key", async () => {
    vi.mocked(adapter.transactGetItems).mockResolvedValueOnce({ items: [undefined] });
    const requests: TransactGetEntityRequest[] = [
      { entity: userEntity, keyInput: { userId: "user-123" } },
    ];
    await executeTransactGet(adapter, requests);
    const call = vi.mocked(adapter.transactGetItems).mock.calls[0]?.[0];
    expect(call?.[0]?.tableName).toBe("UsersTable");
    expect((call?.[0]?.key as Record<string, unknown>)?.["pk"]).toBe("USER#user-123");
  });

  it("handles multiple entity requests", async () => {
    vi.mocked(adapter.transactGetItems).mockResolvedValueOnce({
      items: [validUser, undefined],
    });
    const requests: TransactGetEntityRequest[] = [
      { entity: userEntity, keyInput: { userId: "user-123" } },
      { entity: userEntity, keyInput: { userId: "user-456" } },
    ];
    const result = await executeTransactGet(adapter, requests);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
    }
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.transactGetItems).mockRejectedValueOnce(new Error("TransactGet failed"));
    const requests: TransactGetEntityRequest[] = [
      { entity: userEntity, keyInput: { userId: "user-123" } },
    ];
    const result = await executeTransactGet(adapter, requests);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });

  it("returns key error when key field is missing", async () => {
    const requests: TransactGetEntityRequest[] = [
      { entity: userEntity, keyInput: {} },
    ];
    const result = await executeTransactGet(adapter, requests);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
    }
  });

  it("unmarshalls items with raw adapter", async () => {
    const rawAdapter = createRawMockAdapter();
    const rawItem = {
      userId: { S: "user-123" },
      email: { S: "alice@example.com" },
      name: { S: "Alice" },
    };
    vi.mocked(rawAdapter.transactGetItems).mockResolvedValueOnce({ items: [rawItem] });
    const requests: TransactGetEntityRequest[] = [
      { entity: userEntity, keyInput: { userId: "user-123" } },
    ];
    const result = await executeTransactGet(rawAdapter, requests);
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.items[0] as Record<string, unknown> | undefined;
      expect(item?.["userId"]).toBe("user-123");
    }
  });
});

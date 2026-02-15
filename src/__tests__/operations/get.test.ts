import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeGet } from "../../operations/get.js";
import {
  userEntity,
  validUser,
  createMockAdapter,
  createRawMockAdapter,
} from "../fixtures.js";

describe("executeGet()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns ok with undefined when item not found", async () => {
    vi.mocked(adapter.getItem).mockResolvedValueOnce({ item: undefined });
    const result = await executeGet(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("returns ok with item data when found", async () => {
    const returnedItem = { ...validUser, pk: "USER#user-123", sk: "PROFILE" };
    vi.mocked(adapter.getItem).mockResolvedValueOnce({ item: returnedItem });
    const result = await executeGet(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(returnedItem);
    }
  });

  it("calls getItem with correct tableName and key", async () => {
    await executeGet(userEntity, adapter, { userId: "user-123" });
    const call = vi.mocked(adapter.getItem).mock.calls[0]?.[0];
    expect(call?.tableName).toBe("UsersTable");
    expect((call?.key as Record<string, unknown>)?.["pk"]).toBe("USER#user-123");
    expect((call?.key as Record<string, unknown>)?.["sk"]).toBe("PROFILE");
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.getItem).mockRejectedValueOnce(new Error("Network error"));
    const result = await executeGet(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });

  it("returns key error when key field is missing", async () => {
    const result = await executeGet(userEntity, adapter, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
    }
  });

  it("unmarshalls item from raw adapter", async () => {
    const rawAdapter = createRawMockAdapter();
    const rawItem = { userId: { S: "user-123" }, email: { S: "alice@example.com" }, name: { S: "Alice" } };
    vi.mocked(rawAdapter.getItem).mockResolvedValueOnce({ item: rawItem });
    const result = await executeGet(userEntity, rawAdapter, { userId: "user-123" });
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.userId).toBe("user-123");
    }
  });
});

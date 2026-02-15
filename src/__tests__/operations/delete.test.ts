import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeDelete } from "../../operations/delete.js";
import {
  userEntity,
  createMockAdapter,
} from "../fixtures.js";

describe("executeDelete()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns ok on successful delete", async () => {
    const result = await executeDelete(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(true);
  });

  it("calls deleteItem with correct tableName and key", async () => {
    await executeDelete(userEntity, adapter, { userId: "user-123" });
    const call = vi.mocked(adapter.deleteItem).mock.calls[0]?.[0];
    expect(call?.tableName).toBe("UsersTable");
    expect((call?.key as Record<string, unknown>)?.["pk"]).toBe("USER#user-123");
    expect((call?.key as Record<string, unknown>)?.["sk"]).toBe("PROFILE");
  });

  it("forwards conditionExpression to adapter", async () => {
    await executeDelete(userEntity, adapter, { userId: "user-123" }, {
      condition: "attribute_exists(pk)",
    });
    const call = vi.mocked(adapter.deleteItem).mock.calls[0]?.[0];
    expect(call?.conditionExpression).toBe("attribute_exists(pk)");
  });

  it("returns key error when key field is missing", async () => {
    const result = await executeDelete(userEntity, adapter, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
    }
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.deleteItem).mockRejectedValueOnce(new Error("ConditionalCheckFailed"));
    const result = await executeDelete(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
      expect(result.error.message).toContain("ConditionalCheckFailed");
    }
  });

  it("returns void on success (data is undefined)", async () => {
    const result = await executeDelete(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });
});

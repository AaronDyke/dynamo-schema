import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeRemoveTtl } from "../../operations/remove-ttl.js";
import {
  userEntity,
  noTtlEntity,
  createMockAdapter,
} from "../fixtures.js";

describe("executeRemoveTtl()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns ok on successful TTL removal", async () => {
    const result = await executeRemoveTtl(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(true);
  });

  it("calls updateItem with a REMOVE expression targeting the TTL attribute", async () => {
    await executeRemoveTtl(userEntity, adapter, { userId: "user-123" });
    const call = vi.mocked(adapter.updateItem).mock.calls[0]?.[0];
    expect(call?.updateExpression).toContain("REMOVE");
    expect(call?.updateExpression).toContain("#r0_expiresAt");
    expect(call?.expressionAttributeNames?.["#r0_expiresAt"]).toBe("expiresAt");
  });

  it("calls updateItem with correct tableName and key", async () => {
    await executeRemoveTtl(userEntity, adapter, { userId: "user-123" });
    const call = vi.mocked(adapter.updateItem).mock.calls[0]?.[0];
    expect(call?.tableName).toBe("UsersTable");
    expect((call?.key as Record<string, unknown>)?.["pk"]).toBe("USER#user-123");
  });

  it("returns validation error when entity table has no TTL config", async () => {
    const result = await executeRemoveTtl(noTtlEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation");
      expect(result.error.message).toContain("No TTL attribute configured");
    }
  });

  it("returns key error when key field is missing", async () => {
    const result = await executeRemoveTtl(userEntity, adapter, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
    }
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.updateItem).mockRejectedValueOnce(new Error("Resource not found"));
    const result = await executeRemoveTtl(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });

  it("returns void on success", async () => {
    const result = await executeRemoveTtl(userEntity, adapter, { userId: "user-123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });
});

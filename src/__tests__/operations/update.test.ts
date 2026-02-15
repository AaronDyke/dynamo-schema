import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeUpdate } from "../../operations/update.js";
import {
  userEntity,
  noTtlEntity,
  validUser,
  createMockAdapter,
  createRawMockAdapter,
} from "../fixtures.js";

describe("executeUpdate()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.mocked(adapter.updateItem).mockResolvedValue({
      attributes: { ...validUser, pk: "USER#user-123", sk: "PROFILE" },
    });
  });

  it("succeeds and calls updateItem", async () => {
    const result = await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Bob"),
    );
    expect(result.success).toBe(true);
    expect(adapter.updateItem).toHaveBeenCalledOnce();
  });

  it("passes correct tableName and key to adapter", async () => {
    await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Bob"),
    );
    const call = vi.mocked(adapter.updateItem).mock.calls[0]?.[0];
    expect(call?.tableName).toBe("UsersTable");
    expect((call?.key as Record<string, unknown>)?.["pk"]).toBe("USER#user-123");
    expect((call?.key as Record<string, unknown>)?.["sk"]).toBe("PROFILE");
  });

  it("returns error for empty actions (no set/remove/add/delete)", async () => {
    const result = await executeUpdate(
      noTtlEntity,
      adapter,
      { userId: "user-123" },
      (b) => b,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation");
      expect(result.error.message).toContain("empty");
    }
  });

  it("auto-injects TTL refresh on update", async () => {
    const before = Math.floor(Date.now() / 1000);
    await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Bob"),
    );
    const call = vi.mocked(adapter.updateItem).mock.calls[0]?.[0];
    const exprValues = call?.expressionAttributeValues as Record<string, unknown>;
    // One of the values should be the TTL timestamp
    const ttlKey = Object.keys(exprValues ?? {}).find((k) =>
      k.includes("expiresAt"),
    );
    expect(ttlKey).toBeDefined();
    if (ttlKey) {
      const ttl = exprValues[ttlKey] as number;
      expect(ttl).toBeGreaterThanOrEqual(before + 60 * 60 * 24 * 30);
    }
  });

  it("skipAutoTtl suppresses TTL refresh", async () => {
    await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Bob"),
      { skipAutoTtl: true },
    );
    const call = vi.mocked(adapter.updateItem).mock.calls[0]?.[0];
    const exprValues = call?.expressionAttributeValues as Record<string, unknown>;
    const ttlKey = Object.keys(exprValues ?? {}).find((k) =>
      k.includes("expiresAt"),
    );
    expect(ttlKey).toBeUndefined();
  });

  it("returns key error when key field is missing", async () => {
    const result = await executeUpdate(
      userEntity,
      adapter,
      {},
      (b) => b.set("name", "Bob"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
    }
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.updateItem).mockRejectedValueOnce(new Error("Provisioned throughput exceeded"));
    const result = await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Bob"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });

  it("returns error when adapter returns no attributes", async () => {
    vi.mocked(adapter.updateItem).mockResolvedValueOnce({ attributes: undefined });
    const result = await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Bob"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("no attributes");
    }
  });

  it("round-trips with raw adapter", async () => {
    const rawAdapter = createRawMockAdapter();
    vi.mocked(rawAdapter.updateItem).mockResolvedValueOnce({
      attributes: {
        userId: { S: "user-123" },
        email: { S: "alice@example.com" },
        name: { S: "NewName" },
      },
    });
    const result = await executeUpdate(
      userEntity,
      rawAdapter,
      { userId: "user-123" },
      (b) => b.set("name", "NewName"),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("NewName");
    }
  });
});

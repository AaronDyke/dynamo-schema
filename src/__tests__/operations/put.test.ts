import { describe, it, expect, vi, beforeEach } from "vitest";
import { executePut } from "../../operations/put.js";
import {
  userEntity,
  noTtlEntity,
  validUser,
  createMockAdapter,
  createRawMockAdapter,
} from "../fixtures.js";

describe("executePut()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("succeeds with a DocumentClient adapter", async () => {
    const result = await executePut(userEntity, adapter, validUser);
    expect(result.success).toBe(true);
    expect(adapter.putItem).toHaveBeenCalledOnce();
  });

  it("calls putItem with the correct tableName", async () => {
    await executePut(userEntity, adapter, validUser);
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    expect(call?.tableName).toBe("UsersTable");
  });

  it("injects PK and SK into the item", async () => {
    await executePut(userEntity, adapter, validUser);
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    expect(item?.["pk"]).toBe("USER#user-123");
    expect(item?.["sk"]).toBe("PROFILE");
  });

  it("writes index key attributes", async () => {
    await executePut(userEntity, adapter, validUser);
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    expect(item?.["gsi1pk"]).toBe("USER_EMAIL#alice@example.com");
    expect(item?.["gsi1sk"]).toBe("USER#user-123");
  });

  it("auto-injects TTL on put", async () => {
    const before = Math.floor(Date.now() / 1000);
    await executePut(userEntity, adapter, validUser);
    const after = Math.floor(Date.now() / 1000);
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    const ttl = item?.["expiresAt"] as number;
    const expectedTtlSeconds = 60 * 60 * 24 * 30;
    expect(ttl).toBeGreaterThanOrEqual(before + expectedTtlSeconds);
    expect(ttl).toBeLessThanOrEqual(after + expectedTtlSeconds);
  });

  it("does not inject TTL when entity has no TTL config", async () => {
    await executePut(noTtlEntity, adapter, validUser);
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    expect(item?.["expiresAt"]).toBeUndefined();
  });

  it("returns ok with the item data", async () => {
    const result = await executePut(userEntity, adapter, validUser);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe("user-123");
    }
  });

  it("returns validation error for invalid data", async () => {
    const badData = { userId: "u1", email: "not-an-email", name: "Bob" };
    const result = await executePut(userEntity, adapter, badData as typeof validUser);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation");
    }
  });

  it("skips validation when skipValidation is true", async () => {
    const badData = { userId: "u1", email: "not-an-email", name: "Bob" };
    const result = await executePut(
      userEntity,
      adapter,
      badData as typeof validUser,
      { skipValidation: true },
    );
    expect(result.success).toBe(true);
  });

  it("forwards conditionExpression to adapter", async () => {
    await executePut(userEntity, adapter, validUser, {
      condition: "attribute_not_exists(pk)",
    });
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    expect(call?.conditionExpression).toBe("attribute_not_exists(pk)");
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.putItem).mockRejectedValueOnce(new Error("DynamoDB error"));
    const result = await executePut(userEntity, adapter, validUser, { skipValidation: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
      expect(result.error.message).toContain("DynamoDB error");
    }
  });

  it("marshalls item correctly with raw adapter", async () => {
    const rawAdapter = createRawMockAdapter();
    await executePut(userEntity, rawAdapter, validUser, { skipValidation: true });
    const call = vi.mocked(rawAdapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    // In raw mode, string values are wrapped in {S: "..."}
    expect(item?.["pk"]).toEqual({ S: "USER#user-123" });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeBatchWrite } from "../../operations/batch-write.js";
import type { BatchWriteRequestItem } from "../../operations/batch-write.js";
import {
  userEntity,
  validUser,
  validUserWithAge,
  createMockAdapter,
} from "../fixtures.js";

describe("executeBatchWrite()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("succeeds with a single put request", async () => {
    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const result = await executeBatchWrite(adapter, requests);
    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledOnce();
  });

  it("succeeds with a single delete request", async () => {
    const requests: BatchWriteRequestItem[] = [
      { type: "delete", entity: userEntity, keyInput: { userId: "user-123" } },
    ];
    const result = await executeBatchWrite(adapter, requests);
    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledOnce();
  });

  it("handles mixed put and delete requests", async () => {
    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
      { type: "delete", entity: userEntity, keyInput: { userId: "user-456" } },
    ];
    const result = await executeBatchWrite(adapter, requests);
    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledOnce();
  });

  it("calls adapter with correctly shaped request", async () => {
    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    await executeBatchWrite(adapter, requests, { skipValidation: true });
    const call = vi.mocked(adapter.batchWriteItem).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call?.[0]?.tableName).toBe("UsersTable");
    expect(call?.[0]?.requests[0]?.type).toBe("put");
  });

  it("returns validation error for invalid put data", async () => {
    const badUser = { userId: "u", email: "bad-email", name: "Bob" };
    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: badUser as typeof validUser },
    ];
    const result = await executeBatchWrite(adapter, requests);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation");
    }
  });

  it("skips validation when skipValidation is true", async () => {
    const badUser = { userId: "u", email: "bad-email", name: "Bob" };
    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: badUser as typeof validUser },
    ];
    const result = await executeBatchWrite(adapter, requests, { skipValidation: true });
    expect(result.success).toBe(true);
  });

  it("handles multiple put requests across the same table", async () => {
    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
      { type: "put", entity: userEntity, data: validUserWithAge },
    ];
    const result = await executeBatchWrite(adapter, requests, { skipValidation: true });
    expect(result.success).toBe(true);
    const call = vi.mocked(adapter.batchWriteItem).mock.calls[0]?.[0];
    expect(call?.[0]?.requests).toHaveLength(2);
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.batchWriteItem).mockRejectedValueOnce(new Error("BatchWrite failed"));
    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const result = await executeBatchWrite(adapter, requests, { skipValidation: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });
});

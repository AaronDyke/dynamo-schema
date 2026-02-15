/**
 * Tests for exponential backoff retry behaviour in BatchGet and BatchWrite.
 *
 * These tests use `vi.useFakeTimers()` to control time and
 * `baseDelayMs: 0` where we only care about retry *count*, not timing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeBatchGet } from "../../operations/batch-get.js";
import { executeBatchWrite } from "../../operations/batch-write.js";
import type { BatchGetEntityRequest } from "../../operations/batch-get.js";
import type { BatchWriteRequestItem } from "../../operations/batch-write.js";
import {
  userEntity,
  validUser,
  validUserWithAge,
  createMockAdapter,
} from "../fixtures.js";
import type { BatchGetRequest, BatchWriteRequest, BatchGetOutput } from "../../adapters/adapter.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const emptyGet = (): BatchGetOutput =>
  ({ responses: {}, unprocessedKeys: [] });

const emptyWrite = (): { unprocessedItems: BatchWriteRequest[] } =>
  ({ unprocessedItems: [] });

const unprocessedGetKey = (): BatchGetRequest => ({
  tableName: "UsersTable",
  keys: [{ pk: { S: "USER#user-123" }, sk: { S: "PROFILE" } }],
});

const unprocessedWriteReq = (): BatchWriteRequest => ({
  tableName: "UsersTable",
  requests: [{ type: "put", item: { pk: "USER#user-123", sk: "PROFILE" } }],
});

// ──────────────────────────────────────────────────────────────────────────────
// computeBackoffDelay unit tests
// ──────────────────────────────────────────────────────────────────────────────

import { computeBackoffDelay } from "../../utils/retry.js";

describe("computeBackoffDelay()", () => {
  it("returns baseDelayMs * 2^retryIndex by default", () => {
    expect(computeBackoffDelay(0)).toBe(100);   // 100 * 2^0 = 100
    expect(computeBackoffDelay(1)).toBe(200);   // 100 * 2^1 = 200
    expect(computeBackoffDelay(2)).toBe(400);   // 100 * 2^2 = 400
    expect(computeBackoffDelay(3)).toBe(800);   // 100 * 2^3 = 800
  });

  it("respects custom baseDelayMs", () => {
    expect(computeBackoffDelay(0, { baseDelayMs: 50 })).toBe(50);
    expect(computeBackoffDelay(1, { baseDelayMs: 50 })).toBe(100);
    expect(computeBackoffDelay(2, { baseDelayMs: 50 })).toBe(200);
  });

  it("caps at maxDelayMs (default 5000)", () => {
    expect(computeBackoffDelay(10)).toBe(5000); // would be 102400, capped at 5000
  });

  it("caps at custom maxDelayMs", () => {
    expect(computeBackoffDelay(3, { baseDelayMs: 100, maxDelayMs: 500 })).toBe(500);
    expect(computeBackoffDelay(2, { baseDelayMs: 100, maxDelayMs: 300 })).toBe(300);
  });

  it("returns baseDelayMs when retryIndex is 0", () => {
    expect(computeBackoffDelay(0, { baseDelayMs: 250 })).toBe(250);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BatchGet retry tests
// ──────────────────────────────────────────────────────────────────────────────

describe("executeBatchGet() — retry behaviour", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not retry when no unprocessed keys", async () => {
    vi.mocked(adapter.batchGetItem).mockResolvedValue(emptyGet());

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(1);
  });

  it("retries once when first response has unprocessed keys", async () => {
    vi.mocked(adapter.batchGetItem)
      .mockResolvedValueOnce({ responses: {}, unprocessedKeys: [unprocessedGetKey()] })
      .mockResolvedValueOnce(emptyGet());

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(2);
  });

  it("retries multiple times until keys are resolved", async () => {
    vi.mocked(adapter.batchGetItem)
      .mockResolvedValueOnce({ responses: {}, unprocessedKeys: [unprocessedGetKey()] })
      .mockResolvedValueOnce({ responses: {}, unprocessedKeys: [unprocessedGetKey()] })
      .mockResolvedValueOnce(emptyGet());

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { maxAttempts: 4, baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("returns error when keys remain unprocessed after maxAttempts", async () => {
    vi.mocked(adapter.batchGetItem).mockResolvedValue({
      responses: {},
      unprocessedKeys: [unprocessedGetKey()],
    });

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { maxAttempts: 3, baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
      expect(result.error.message).toContain("unprocessed");
      expect(result.error.message).toContain("3 attempt");
    }
    // 1 initial + 2 retries = 3 calls total
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(3);
  });

  it("stops retrying as soon as all keys are resolved (no extra calls)", async () => {
    vi.mocked(adapter.batchGetItem)
      .mockResolvedValueOnce({ responses: {}, unprocessedKeys: [unprocessedGetKey()] })
      .mockResolvedValueOnce(emptyGet()); // resolved on retry 1

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { maxAttempts: 5, baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(2); // not 5
  });

  it("uses delay between retries (fake timers verify sleep is called)", async () => {
    vi.mocked(adapter.batchGetItem)
      .mockResolvedValueOnce({ responses: {}, unprocessedKeys: [unprocessedGetKey()] })
      .mockResolvedValueOnce(emptyGet());

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { maxAttempts: 3, baseDelayMs: 500 } },
    );

    // Before advancing timers, the second batchGetItem call has not been made yet
    // (it's waiting for the 500ms sleep)
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(adapter.batchGetItem).toHaveBeenCalledTimes(2);
  });

  it("returns error when a retry call throws", async () => {
    vi.mocked(adapter.batchGetItem)
      .mockResolvedValueOnce({ responses: {}, unprocessedKeys: [unprocessedGetKey()] })
      .mockRejectedValueOnce(new Error("network error"));

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
      expect(result.error.message).toContain("network error");
    }
  });

  it("uses default maxAttempts of 4 when no retryOptions provided", async () => {
    vi.mocked(adapter.batchGetItem).mockResolvedValue({
      responses: {},
      unprocessedKeys: [unprocessedGetKey()],
    });

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }] }],
      { retryOptions: { baseDelayMs: 0 } }, // only override delay for test speed
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    // Default maxAttempts=4 → 1 initial + 3 retries = 4 calls
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(4);
  });

  it("collects items from successful retries into the final response", async () => {
    const item1 = { ...validUser, pk: "USER#user-123", sk: "PROFILE" };
    const item2 = { ...validUserWithAge, pk: "USER#user-456", sk: "PROFILE" };

    vi.mocked(adapter.batchGetItem)
      .mockResolvedValueOnce({
        responses: { UsersTable: [item1] },
        unprocessedKeys: [unprocessedGetKey()],
      })
      .mockResolvedValueOnce({
        responses: { UsersTable: [item2] },
        unprocessedKeys: [],
      });

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys: [{ userId: "user-123" }, { userId: "user-456" }] }],
      { retryOptions: { baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.responses["User"]).toHaveLength(2);
    }
  });

  it("auto-chunks beyond 100 items (multiple chunks each get retry logic)", async () => {
    // Generate 101 keys → 2 chunks (100 + 1)
    const keys = Array.from({ length: 101 }, (_, i) => ({ userId: `user-${i}` }));

    vi.mocked(adapter.batchGetItem).mockResolvedValue(emptyGet());

    const promise = executeBatchGet(
      adapter,
      [{ entity: userEntity, keys }],
      { retryOptions: { baseDelayMs: 0 } },
    );
    await vi.runAllTimersAsync();
    await promise;

    // 2 chunks → 2 initial calls
    expect(adapter.batchGetItem).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BatchWrite retry tests
// ──────────────────────────────────────────────────────────────────────────────

describe("executeBatchWrite() — retry behaviour", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not retry when no unprocessed items", async () => {
    vi.mocked(adapter.batchWriteItem).mockResolvedValue(emptyWrite());

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(1);
  });

  it("retries once when first response has unprocessed items", async () => {
    vi.mocked(adapter.batchWriteItem)
      .mockResolvedValueOnce({ unprocessedItems: [unprocessedWriteReq()] })
      .mockResolvedValueOnce(emptyWrite());

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(2);
  });

  it("retries multiple times until all items are written", async () => {
    vi.mocked(adapter.batchWriteItem)
      .mockResolvedValueOnce({ unprocessedItems: [unprocessedWriteReq()] })
      .mockResolvedValueOnce({ unprocessedItems: [unprocessedWriteReq()] })
      .mockResolvedValueOnce(emptyWrite());

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { maxAttempts: 4, baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(3);
  });

  it("returns error when items remain unprocessed after maxAttempts", async () => {
    vi.mocked(adapter.batchWriteItem).mockResolvedValue({
      unprocessedItems: [unprocessedWriteReq()],
    });

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { maxAttempts: 2, baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
      expect(result.error.message).toContain("unprocessed");
      expect(result.error.message).toContain("2 attempt");
    }
    // 1 initial + 1 retry = 2 calls
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(2);
  });

  it("stops retrying as soon as all items are written", async () => {
    vi.mocked(adapter.batchWriteItem)
      .mockResolvedValueOnce({ unprocessedItems: [unprocessedWriteReq()] })
      .mockResolvedValueOnce(emptyWrite());

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { maxAttempts: 10, baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(2); // not 10
  });

  it("uses delay between retries", async () => {
    vi.mocked(adapter.batchWriteItem)
      .mockResolvedValueOnce({ unprocessedItems: [unprocessedWriteReq()] })
      .mockResolvedValueOnce(emptyWrite());

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { maxAttempts: 3, baseDelayMs: 300 },
    });

    // First call happens synchronously
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    await promise;

    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(2);
  });

  it("returns error when a retry call throws", async () => {
    vi.mocked(adapter.batchWriteItem)
      .mockResolvedValueOnce({ unprocessedItems: [unprocessedWriteReq()] })
      .mockRejectedValueOnce(new Error("throttled"));

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
      expect(result.error.message).toContain("throttled");
    }
  });

  it("uses default maxAttempts of 4 when no retryOptions provided", async () => {
    vi.mocked(adapter.batchWriteItem).mockResolvedValue({
      unprocessedItems: [unprocessedWriteReq()],
    });

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    // Default maxAttempts=4 → 1 initial + 3 retries = 4 calls
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(4);
  });

  it("auto-chunks beyond 25 items — each chunk independently retried", async () => {
    // 26 items → 2 chunks (25 + 1)
    const requests: BatchWriteRequestItem[] = Array.from({ length: 26 }, () => ({
      type: "put" as const,
      entity: userEntity,
      data: validUser,
    }));

    vi.mocked(adapter.batchWriteItem).mockResolvedValue(emptyWrite());

    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    await promise;

    // 2 chunks → 2 initial calls
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(2);
  });

  it("handles delete requests with retry", async () => {
    vi.mocked(adapter.batchWriteItem)
      .mockResolvedValueOnce({ unprocessedItems: [unprocessedWriteReq()] })
      .mockResolvedValueOnce(emptyWrite());

    const requests: BatchWriteRequestItem[] = [
      { type: "delete", entity: userEntity, keyInput: { userId: "user-123" } },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      retryOptions: { baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(2);
  });

  it("maxAttempts: 1 means no retries at all", async () => {
    vi.mocked(adapter.batchWriteItem).mockResolvedValue({
      unprocessedItems: [unprocessedWriteReq()],
    });

    const requests: BatchWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const promise = executeBatchWrite(adapter, requests, {
      skipValidation: true,
      retryOptions: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(adapter.batchWriteItem).toHaveBeenCalledTimes(1); // no retries
  });
});

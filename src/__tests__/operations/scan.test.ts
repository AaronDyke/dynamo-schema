import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeScan } from "../../operations/scan.js";
import {
  userEntity,
  validUser,
  createMockAdapter,
} from "../fixtures.js";

describe("executeScan()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns empty results when no items", async () => {
    vi.mocked(adapter.scan).mockResolvedValueOnce({ items: [], count: 0 });
    const result = await executeScan(userEntity, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(0);
    }
  });

  it("returns items when found", async () => {
    const item = { ...validUser, pk: "USER#user-123", sk: "PROFILE" };
    vi.mocked(adapter.scan).mockResolvedValueOnce({ items: [item], count: 1 });
    const result = await executeScan(userEntity, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(1);
    }
  });

  it("passes correct tableName to adapter", async () => {
    await executeScan(userEntity, adapter);
    const call = vi.mocked(adapter.scan).mock.calls[0]?.[0];
    expect(call?.tableName).toBe("UsersTable");
  });

  it("passes index name when specified", async () => {
    await executeScan(userEntity, adapter, { indexName: "GSI1" });
    const call = vi.mocked(adapter.scan).mock.calls[0]?.[0];
    expect(call?.indexName).toBe("GSI1");
  });

  it("passes filter expression when specified", async () => {
    await executeScan(userEntity, adapter, {
      filter: "#age > :minAge",
      expressionNames: { "#age": "age" },
      expressionValues: { ":minAge": 18 },
    });
    const call = vi.mocked(adapter.scan).mock.calls[0]?.[0];
    expect(call?.filterExpression).toBe("#age > :minAge");
  });

  it("includes lastKey in results when provided", async () => {
    const lastKey = { pk: "USER#last", sk: "PROFILE" };
    vi.mocked(adapter.scan).mockResolvedValueOnce({ items: [], count: 0, lastEvaluatedKey: lastKey });
    const result = await executeScan(userEntity, adapter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastKey).toEqual(lastKey);
    }
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.scan).mockRejectedValueOnce(new Error("Scan failed"));
    const result = await executeScan(userEntity, adapter);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeQuery } from "../../operations/query.js";
import {
  userEntity,
  validUser,
  createMockAdapter,
} from "../fixtures.js";

describe("executeQuery()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns empty results when no items", async () => {
    vi.mocked(adapter.query).mockResolvedValueOnce({ items: [], count: 0, lastEvaluatedKey: undefined });
    const result = await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(0);
      expect(result.data.count).toBe(0);
    }
  });

  it("returns items when found", async () => {
    const item = { ...validUser, pk: "USER#user-123", sk: "PROFILE" };
    vi.mocked(adapter.query).mockResolvedValueOnce({ items: [item], count: 1 });
    const result = await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]).toEqual(item);
    }
  });

  it("passes correct tableName to adapter", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
    });
    const call = vi.mocked(adapter.query).mock.calls[0]?.[0];
    expect(call?.tableName).toBe("UsersTable");
  });

  it("builds a key condition expression with partition key", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
    });
    const call = vi.mocked(adapter.query).mock.calls[0]?.[0];
    expect(call?.keyConditionExpression).toContain("#pk");
    expect(call?.keyConditionExpression).toContain(":pk");
  });

  it("includes sort key eq condition", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      sortKeyCondition: { eq: "PROFILE" },
    });
    const call = vi.mocked(adapter.query).mock.calls[0]?.[0];
    expect(call?.keyConditionExpression).toContain("=");
    expect(call?.expressionAttributeValues?.[":sk"]).toBe("PROFILE");
  });

  it("includes sort key beginsWith condition", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      sortKeyCondition: { beginsWith: "PRO" },
    });
    const call = vi.mocked(adapter.query).mock.calls[0]?.[0];
    expect(call?.keyConditionExpression).toContain("begins_with");
  });

  it("includes sort key between condition", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      sortKeyCondition: { between: ["A", "Z"] },
    });
    const call = vi.mocked(adapter.query).mock.calls[0]?.[0];
    expect(call?.keyConditionExpression).toContain("BETWEEN");
  });

  it("passes index name when specified", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      options: { indexName: "GSI1" },
    });
    const call = vi.mocked(adapter.query).mock.calls[0]?.[0];
    expect(call?.indexName).toBe("GSI1");
  });

  it("passes filter expression when specified", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      options: { filter: "age > :minAge", expressionValues: { ":minAge": 18 } },
    });
    const call = vi.mocked(adapter.query).mock.calls[0]?.[0];
    expect(call?.filterExpression).toBe("age > :minAge");
  });

  it("includes lastKey in results when provided", async () => {
    const lastKey = { pk: "USER#last", sk: "PROFILE" };
    vi.mocked(adapter.query).mockResolvedValueOnce({ items: [], count: 0, lastEvaluatedKey: lastKey });
    const result = await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastKey).toEqual(lastKey);
    }
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.query).mockRejectedValueOnce(new Error("Resource not found"));
    const result = await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });
});

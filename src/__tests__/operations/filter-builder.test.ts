import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFilterBuilder,
  compileFilterNode,
  resolveFilterInput,
} from "../../operations/filter.js";
import type { FilterNode } from "../../types/filter-expression.js";
import { executeQuery } from "../../operations/query.js";
import { executeScan } from "../../operations/scan.js";
import { executeDelete } from "../../operations/delete.js";
import { executePut } from "../../operations/put.js";
import { executeUpdate } from "../../operations/update.js";
import {
  userEntity,
  validUser,
  createMockAdapter,
} from "../fixtures.js";

// ──────────────────────────────────────────────────────────────────────────────
// Test item type
// ──────────────────────────────────────────────────────────────────────────────

type Item = {
  name: string;
  status: string;
  age: number;
  email: string;
  score: number;
  tags: string[];
  verifiedAt: string;
  count: number;
};

// ──────────────────────────────────────────────────────────────────────────────
// createFilterBuilder()
// ──────────────────────────────────────────────────────────────────────────────

describe("createFilterBuilder()", () => {
  const f = createFilterBuilder<Item>();

  it("returns a frozen builder object", () => {
    expect(Object.isFrozen(f)).toBe(true);
  });

  describe("leaf comparisons", () => {
    it("eq() creates a frozen eq node", () => {
      const node = f.eq("status", "active");
      expect(node).toEqual({ op: "eq", path: "status", value: "active" });
      expect(Object.isFrozen(node)).toBe(true);
    });

    it("ne() creates a ne node", () => {
      const node = f.ne("status", "deleted");
      expect(node).toEqual({ op: "ne", path: "status", value: "deleted" });
    });

    it("lt() creates a lt node", () => {
      const node = f.lt("age", 18);
      expect(node).toEqual({ op: "lt", path: "age", value: 18 });
    });

    it("lte() creates a lte node", () => {
      const node = f.lte("age", 65);
      expect(node).toEqual({ op: "lte", path: "age", value: 65 });
    });

    it("gt() creates a gt node", () => {
      const node = f.gt("score", 100);
      expect(node).toEqual({ op: "gt", path: "score", value: 100 });
    });

    it("gte() creates a gte node", () => {
      const node = f.gte("score", 50);
      expect(node).toEqual({ op: "gte", path: "score", value: 50 });
    });

    it("between() creates a between node", () => {
      const node = f.between("age", 18, 65);
      expect(node).toEqual({ op: "between", path: "age", lo: 18, hi: 65 });
    });

    it("beginsWith() creates a beginsWith node", () => {
      const node = f.beginsWith("email", "admin@");
      expect(node).toEqual({ op: "beginsWith", path: "email", value: "admin@" });
    });

    it("contains() creates a contains node", () => {
      const node = f.contains("email", "@example");
      expect(node).toEqual({ op: "contains", path: "email", value: "@example" });
    });

    it("attributeExists() creates an attributeExists node", () => {
      const node = f.attributeExists("verifiedAt");
      expect(node).toEqual({ op: "attributeExists", path: "verifiedAt" });
    });

    it("attributeNotExists() creates an attributeNotExists node", () => {
      const node = f.attributeNotExists("verifiedAt");
      expect(node).toEqual({ op: "attributeNotExists", path: "verifiedAt" });
    });

    it("attributeType() creates an attributeType node", () => {
      const node = f.attributeType("age", "N");
      expect(node).toEqual({ op: "attributeType", path: "age", type: "N" });
    });
  });

  describe("logical composition", () => {
    it("and() wraps conditions", () => {
      const node = f.and(f.eq("status", "active"), f.gt("age", 18));
      expect(node).toMatchObject({
        op: "and",
        conditions: [
          { op: "eq", path: "status", value: "active" },
          { op: "gt", path: "age", value: 18 },
        ],
      });
      expect(Object.isFrozen(node)).toBe(true);
    });

    it("or() wraps conditions", () => {
      const node = f.or(f.eq("status", "active"), f.eq("status", "pending"));
      expect(node).toMatchObject({
        op: "or",
        conditions: [
          { op: "eq", path: "status", value: "active" },
          { op: "eq", path: "status", value: "pending" },
        ],
      });
    });

    it("not() wraps a condition", () => {
      const inner = f.eq("status", "deleted");
      const node = f.not(inner);
      expect(node).toEqual({ op: "not", condition: inner });
      expect(Object.isFrozen(node)).toBe(true);
    });

    it("nodes are composable (and within or)", () => {
      const node = f.or(
        f.and(f.eq("status", "active"), f.gt("age", 18)),
        f.eq("status", "vip"),
      );
      expect(node).toMatchObject({
        op: "or",
        conditions: [
          { op: "and" },
          { op: "eq", path: "status", value: "vip" },
        ],
      });
    });

    it("not wraps an and", () => {
      const node = f.not(f.and(f.eq("status", "active"), f.gt("age", 18)));
      expect(node).toMatchObject({ op: "not", condition: { op: "and" } });
    });

    it("deeply nested composition is frozen at each level", () => {
      const leaf = f.eq("name", "Alice");
      const inner = f.and(leaf, f.gte("score", 50));
      const outer = f.or(inner, f.attributeExists("verifiedAt"));
      expect(Object.isFrozen(leaf)).toBe(true);
      expect(Object.isFrozen(inner)).toBe(true);
      expect(Object.isFrozen(outer)).toBe(true);
    });
  });

  it("builder itself is reusable (stateless factory)", () => {
    const n1 = f.eq("status", "a");
    const n2 = f.eq("status", "b");
    expect(n1).not.toBe(n2);
    expect((n1 as { value: string }).value).toBe("a");
    expect((n2 as { value: string }).value).toBe("b");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// compileFilterNode()
// ──────────────────────────────────────────────────────────────────────────────

describe("compileFilterNode()", () => {
  const f = createFilterBuilder<Item>();

  it("compiles an eq node", () => {
    const compiled = compileFilterNode(f.eq("status", "active"));
    expect(compiled.expression).toBe("#f0 = :f0");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("status");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("active");
  });

  it("compiles a ne node", () => {
    const compiled = compileFilterNode(f.ne("status", "deleted"));
    expect(compiled.expression).toBe("#f0 <> :f0");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("status");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("deleted");
  });

  it("compiles a lt node", () => {
    const compiled = compileFilterNode(f.lt("age", 18));
    expect(compiled.expression).toBe("#f0 < :f0");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("age");
    expect(compiled.expressionAttributeValues[":f0"]).toBe(18);
  });

  it("compiles a lte node", () => {
    const compiled = compileFilterNode(f.lte("age", 65));
    expect(compiled.expression).toBe("#f0 <= :f0");
  });

  it("compiles a gt node", () => {
    const compiled = compileFilterNode(f.gt("score", 100));
    expect(compiled.expression).toBe("#f0 > :f0");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("score");
    expect(compiled.expressionAttributeValues[":f0"]).toBe(100);
  });

  it("compiles a gte node", () => {
    const compiled = compileFilterNode(f.gte("score", 50));
    expect(compiled.expression).toBe("#f0 >= :f0");
  });

  it("compiles a between node", () => {
    const compiled = compileFilterNode(f.between("age", 18, 65));
    expect(compiled.expression).toBe("#f0 BETWEEN :f0lo AND :f0hi");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("age");
    expect(compiled.expressionAttributeValues[":f0lo"]).toBe(18);
    expect(compiled.expressionAttributeValues[":f0hi"]).toBe(65);
  });

  it("compiles a beginsWith node", () => {
    const compiled = compileFilterNode(f.beginsWith("email", "admin@"));
    expect(compiled.expression).toBe("begins_with(#f0, :f0)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("email");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("admin@");
  });

  it("compiles a contains node", () => {
    const compiled = compileFilterNode(f.contains("email", "@example"));
    expect(compiled.expression).toBe("contains(#f0, :f0)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("email");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("@example");
  });

  it("compiles an attributeExists node", () => {
    const compiled = compileFilterNode(f.attributeExists("verifiedAt"));
    expect(compiled.expression).toBe("attribute_exists(#f0)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("verifiedAt");
    expect(Object.keys(compiled.expressionAttributeValues)).toHaveLength(0);
  });

  it("compiles an attributeNotExists node", () => {
    const compiled = compileFilterNode(f.attributeNotExists("verifiedAt"));
    expect(compiled.expression).toBe("attribute_not_exists(#f0)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("verifiedAt");
    expect(Object.keys(compiled.expressionAttributeValues)).toHaveLength(0);
  });

  it("compiles an attributeType node", () => {
    const compiled = compileFilterNode(f.attributeType("age", "N"));
    expect(compiled.expression).toBe("attribute_type(#f0, :f0)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("age");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("N");
  });

  it("compiles an and node with multiple conditions", () => {
    const compiled = compileFilterNode(
      f.and(f.eq("status", "active"), f.gt("age", 18)),
    );
    expect(compiled.expression).toBe("(#f0 = :f0 AND #f1 > :f1)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("status");
    expect(compiled.expressionAttributeNames["#f1"]).toBe("age");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("active");
    expect(compiled.expressionAttributeValues[":f1"]).toBe(18);
  });

  it("compiles an or node with multiple conditions", () => {
    const compiled = compileFilterNode(
      f.or(f.eq("status", "active"), f.eq("status", "pending")),
    );
    expect(compiled.expression).toBe("(#f0 = :f0 OR #f1 = :f1)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("status");
    expect(compiled.expressionAttributeNames["#f1"]).toBe("status");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("active");
    expect(compiled.expressionAttributeValues[":f1"]).toBe("pending");
  });

  it("compiles a not node", () => {
    const compiled = compileFilterNode(f.not(f.eq("status", "deleted")));
    expect(compiled.expression).toBe("NOT (#f0 = :f0)");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("status");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("deleted");
  });

  it("compiles single-condition and without extra parens", () => {
    const compiled = compileFilterNode(f.and(f.eq("status", "active")));
    expect(compiled.expression).toBe("#f0 = :f0");
  });

  it("compiles single-condition or without extra parens", () => {
    const compiled = compileFilterNode(f.or(f.eq("status", "active")));
    expect(compiled.expression).toBe("#f0 = :f0");
  });

  it("compiles three-way and", () => {
    const compiled = compileFilterNode(
      f.and(
        f.eq("status", "active"),
        f.gt("age", 18),
        f.attributeExists("verifiedAt"),
      ),
    );
    expect(compiled.expression).toBe(
      "(#f0 = :f0 AND #f1 > :f1 AND attribute_exists(#f2))",
    );
    expect(Object.keys(compiled.expressionAttributeNames)).toHaveLength(3);
    expect(Object.keys(compiled.expressionAttributeValues)).toHaveLength(2);
  });

  it("compiles nested and/or correctly", () => {
    const compiled = compileFilterNode(
      f.or(
        f.and(f.eq("status", "active"), f.gt("age", 18)),
        f.eq("status", "vip"),
      ),
    );
    expect(compiled.expression).toBe(
      "((#f0 = :f0 AND #f1 > :f1) OR #f2 = :f2)",
    );
  });

  it("compiles not(and(...))", () => {
    const compiled = compileFilterNode(
      f.not(f.and(f.eq("status", "active"), f.gt("age", 18))),
    );
    // and() already wraps in parens; not() adds outer parens — double-parens are valid DynamoDB
    expect(compiled.expression).toBe("NOT ((#f0 = :f0 AND #f1 > :f1))");
  });

  it("uses unique counter indices for each leaf in a tree", () => {
    const compiled = compileFilterNode(
      f.and(
        f.eq("status", "active"),
        f.eq("status", "pending"),
        f.gt("age", 18),
      ),
    );
    // All three have unique counters (f0, f1, f2)
    expect(compiled.expressionAttributeNames["#f0"]).toBe("status");
    expect(compiled.expressionAttributeNames["#f1"]).toBe("status");
    expect(compiled.expressionAttributeNames["#f2"]).toBe("age");
    expect(compiled.expressionAttributeValues[":f0"]).toBe("active");
    expect(compiled.expressionAttributeValues[":f1"]).toBe("pending");
    expect(compiled.expressionAttributeValues[":f2"]).toBe(18);
  });

  it("returns frozen compiled result", () => {
    const compiled = compileFilterNode(f.eq("status", "active"));
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.expressionAttributeNames)).toBe(true);
    expect(Object.isFrozen(compiled.expressionAttributeValues)).toBe(true);
  });

  it("handles reserved words (status, name) in paths", () => {
    // The name alias approach always aliases — reserved words are handled
    // transparently since we always use #fN aliases
    const compiled = compileFilterNode(f.eq("name", "Alice"));
    expect(compiled.expression).toBe("#f0 = :f0");
    expect(compiled.expressionAttributeNames["#f0"]).toBe("name");
  });

  it("handles all attribute type values", () => {
    const types = ["S", "N", "B", "SS", "NS", "BS", "L", "M", "NULL", "BOOL"] as const;
    for (const type of types) {
      const compiled = compileFilterNode(f.attributeType("count", type));
      expect(compiled.expressionAttributeValues[":f0"]).toBe(type);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveFilterInput()
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveFilterInput()", () => {
  const f = createFilterBuilder<Item>();

  it("returns undefined expression when input is undefined", () => {
    const result = resolveFilterInput(undefined);
    expect(result.expression).toBeUndefined();
    expect(result.expressionAttributeNames).toEqual({});
    expect(result.expressionAttributeValues).toEqual({});
  });

  it("passes through a raw string expression", () => {
    const result = resolveFilterInput("#status = :s");
    expect(result.expression).toBe("#status = :s");
    expect(result.expressionAttributeNames).toEqual({});
    expect(result.expressionAttributeValues).toEqual({});
  });

  it("compiles a FilterNode", () => {
    const node = f.eq("status", "active");
    const result = resolveFilterInput(node);
    expect(result.expression).toBe("#f0 = :f0");
    expect(result.expressionAttributeNames["#f0"]).toBe("status");
    expect(result.expressionAttributeValues[":f0"]).toBe("active");
  });

  it("invokes a callback and compiles the returned node", () => {
    const result = resolveFilterInput(
      (fb) => fb.and(fb.eq("status", "active"), fb.gt("age", 18)),
    );
    expect(result.expression).toBe("(#f0 = :f0 AND #f1 > :f1)");
    expect(result.expressionAttributeNames["#f0"]).toBe("status");
    expect(result.expressionAttributeValues[":f1"]).toBe(18);
  });

  it("callback builder accepts any string key (untyped builder)", () => {
    // The untyped builder should not throw on any string key
    const result = resolveFilterInput((fb) => fb.attributeExists("arbitraryField"));
    expect(result.expression).toBe("attribute_exists(#f0)");
    expect(result.expressionAttributeNames["#f0"]).toBe("arbitraryField");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: filter in query operations
// ──────────────────────────────────────────────────────────────────────────────

describe("integration: query with filter", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.mocked(adapter.query).mockResolvedValue({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });
  });

  it("passes FilterNode filter expression to adapter", async () => {
    const f = createFilterBuilder<{ status: string; age: number }>();
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      options: {
        filter: f.and(f.eq("status", "active"), f.gt("age", 18)),
      },
    });

    expect(adapter.query).toHaveBeenCalledWith(
      expect.objectContaining({
        filterExpression: "(#f0 = :f0 AND #f1 > :f1)",
        expressionAttributeNames: expect.objectContaining({
          "#f0": "status",
          "#f1": "age",
        }),
        expressionAttributeValues: expect.objectContaining({
          ":f0": "active",
          ":f1": 18,
        }),
      }),
    );
  });

  it("passes callback filter expression to adapter", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      options: {
        filter: (fb) => fb.eq("status", "active"),
      },
    });

    expect(adapter.query).toHaveBeenCalledWith(
      expect.objectContaining({
        filterExpression: "#f0 = :f0",
        expressionAttributeNames: expect.objectContaining({ "#f0": "status" }),
        expressionAttributeValues: expect.objectContaining({ ":f0": "active" }),
      }),
    );
  });

  it("passes raw string filter unchanged and preserves user names/values", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      options: {
        filter: "#s = :s",
        expressionNames: { "#s": "status" },
        expressionValues: { ":s": "active" },
      },
    });

    expect(adapter.query).toHaveBeenCalledWith(
      expect.objectContaining({
        filterExpression: "#s = :s",
        expressionAttributeNames: expect.objectContaining({ "#s": "status" }),
        expressionAttributeValues: expect.objectContaining({ ":s": "active" }),
      }),
    );
  });

  it("merges FilterNode names/values with user-provided overrides", async () => {
    const f = createFilterBuilder<{ status: string }>();
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
      options: {
        filter: f.eq("status", "active"),
        expressionNames: { "#extra": "extraField" },
        expressionValues: { ":extra": "extraValue" },
      },
    });

    expect(adapter.query).toHaveBeenCalledWith(
      expect.objectContaining({
        expressionAttributeNames: expect.objectContaining({
          "#f0": "status",
          "#extra": "extraField",
        }),
        expressionAttributeValues: expect.objectContaining({
          ":f0": "active",
          ":extra": "extraValue",
        }),
      }),
    );
  });

  it("no filter passes undefined filterExpression", async () => {
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "user-123" },
    });

    expect(adapter.query).toHaveBeenCalledWith(
      expect.objectContaining({ filterExpression: undefined }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: filter in scan operations
// ──────────────────────────────────────────────────────────────────────────────

describe("integration: scan with filter", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.mocked(adapter.scan).mockResolvedValue({
      items: [],
      count: 0,
      lastEvaluatedKey: undefined,
    });
  });

  it("passes FilterNode filter to adapter", async () => {
    const f = createFilterBuilder<{ status: string }>();
    await executeScan(userEntity, adapter, {
      filter: f.eq("status", "active"),
    });

    expect(adapter.scan).toHaveBeenCalledWith(
      expect.objectContaining({
        filterExpression: "#f0 = :f0",
        expressionAttributeNames: expect.objectContaining({ "#f0": "status" }),
        expressionAttributeValues: expect.objectContaining({ ":f0": "active" }),
      }),
    );
  });

  it("passes callback filter to adapter", async () => {
    await executeScan(userEntity, adapter, {
      filter: (fb) => fb.attributeExists("verifiedAt"),
    });

    expect(adapter.scan).toHaveBeenCalledWith(
      expect.objectContaining({
        filterExpression: "attribute_exists(#f0)",
        expressionAttributeNames: expect.objectContaining({
          "#f0": "verifiedAt",
        }),
      }),
    );
  });

  it("passes raw string filter unchanged", async () => {
    await executeScan(userEntity, adapter, {
      filter: "#status = :s",
      expressionNames: { "#status": "status" },
      expressionValues: { ":s": "active" },
    });

    expect(adapter.scan).toHaveBeenCalledWith(
      expect.objectContaining({
        filterExpression: "#status = :s",
        expressionAttributeNames: expect.objectContaining({
          "#status": "status",
        }),
        expressionAttributeValues: expect.objectContaining({ ":s": "active" }),
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: condition in delete operations
// ──────────────────────────────────────────────────────────────────────────────

describe("integration: delete with condition", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("passes FilterNode condition to adapter", async () => {
    const f = createFilterBuilder<{ status: string }>();
    await executeDelete(userEntity, adapter, { userId: "user-123" }, {
      condition: f.attributeExists("status"),
    });

    expect(adapter.deleteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionExpression: "attribute_exists(#f0)",
        expressionAttributeNames: expect.objectContaining({ "#f0": "status" }),
      }),
    );
  });

  it("passes callback condition to adapter", async () => {
    await executeDelete(userEntity, adapter, { userId: "user-123" }, {
      condition: (fb) => fb.attributeExists("verifiedAt"),
    });

    expect(adapter.deleteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionExpression: "attribute_exists(#f0)",
        expressionAttributeNames: expect.objectContaining({
          "#f0": "verifiedAt",
        }),
      }),
    );
  });

  it("passes raw string condition unchanged", async () => {
    await executeDelete(userEntity, adapter, { userId: "user-123" }, {
      condition: "attribute_exists(#pk)",
      expressionNames: { "#pk": "pk" },
    });

    expect(adapter.deleteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionExpression: "attribute_exists(#pk)",
        expressionAttributeNames: expect.objectContaining({ "#pk": "pk" }),
      }),
    );
  });

  it("no condition passes undefined conditionExpression", async () => {
    await executeDelete(userEntity, adapter, { userId: "user-123" });

    expect(adapter.deleteItem).toHaveBeenCalledWith(
      expect.objectContaining({ conditionExpression: undefined }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: condition in put operations
// ──────────────────────────────────────────────────────────────────────────────

describe("integration: put with condition", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("passes FilterNode condition to adapter", async () => {
    const f = createFilterBuilder<{ status: string }>();
    await executePut(userEntity, adapter, validUser, {
      condition: f.attributeNotExists("status"),
    });

    expect(adapter.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionExpression: "attribute_not_exists(#f0)",
        expressionAttributeNames: expect.objectContaining({ "#f0": "status" }),
      }),
    );
  });

  it("passes callback condition to adapter", async () => {
    await executePut(userEntity, adapter, validUser, {
      condition: (fb) => fb.attributeNotExists("email"),
    });

    expect(adapter.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionExpression: "attribute_not_exists(#f0)",
        expressionAttributeNames: expect.objectContaining({ "#f0": "email" }),
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: condition in update operations
// ──────────────────────────────────────────────────────────────────────────────

describe("integration: update with condition", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.mocked(adapter.updateItem).mockResolvedValue({
      attributes: { ...validUser, pk: "USER#user-123", sk: "PROFILE" },
    });
  });

  it("passes FilterNode condition to adapter", async () => {
    const f = createFilterBuilder<{ status: string }>();
    await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Alice"),
      { condition: f.eq("status", "active") },
    );

    expect(adapter.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionExpression: "#f0 = :f0",
        expressionAttributeNames: expect.objectContaining({ "#f0": "status" }),
        expressionAttributeValues: expect.objectContaining({ ":f0": "active" }),
      }),
    );
  });

  it("passes callback condition to adapter", async () => {
    await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Bob"),
      { condition: (fb) => fb.attributeExists("status") },
    );

    expect(adapter.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionExpression: "attribute_exists(#f0)",
        expressionAttributeNames: expect.objectContaining({ "#f0": "status" }),
      }),
    );
  });

  it("merges condition names/values with update expression names/values", async () => {
    const f = createFilterBuilder<{ status: string }>();
    await executeUpdate(
      userEntity,
      adapter,
      { userId: "user-123" },
      (b) => b.set("name", "Alice"),
      { condition: f.eq("status", "active") },
    );

    const call = vi.mocked(adapter.updateItem).mock.calls[0]![0];
    // Update expression names start with #s0_name, condition names start with #f0
    expect(call.expressionAttributeNames).toHaveProperty("#f0", "status");
    expect(call.expressionAttributeValues).toHaveProperty(":f0", "active");
    expect(call.updateExpression).toContain("SET");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  const f = createFilterBuilder<Item>();

  it("compiles a standalone attributeExists (no value alias)", () => {
    const compiled = compileFilterNode(f.attributeExists("verifiedAt"));
    expect(":f0" in compiled.expressionAttributeValues).toBe(false);
  });

  it("compiles a standalone attributeNotExists (no value alias)", () => {
    const compiled = compileFilterNode(f.attributeNotExists("verifiedAt"));
    expect(":f0" in compiled.expressionAttributeValues).toBe(false);
  });

  it("between produces two value aliases (lo + hi)", () => {
    const compiled = compileFilterNode(f.between("age", 18, 65));
    expect(":f0lo" in compiled.expressionAttributeValues).toBe(true);
    expect(":f0hi" in compiled.expressionAttributeValues).toBe(true);
    expect(":f0" in compiled.expressionAttributeValues).toBe(false);
  });

  it("deeply nested tree uses sequential counter throughout", () => {
    const compiled = compileFilterNode(
      f.and(
        f.or(f.eq("status", "a"), f.eq("status", "b")),
        f.not(f.eq("name", "excluded")),
      ),
    );
    // Should be f0, f1 inside or; f2 inside not
    expect(compiled.expressionAttributeNames).toMatchObject({
      "#f0": "status",
      "#f1": "status",
      "#f2": "name",
    });
    expect(compiled.expressionAttributeValues).toMatchObject({
      ":f0": "a",
      ":f1": "b",
      ":f2": "excluded",
    });
  });

  it("FilterNode can be shared across multiple compileFilterNode calls without interference", () => {
    const node = f.eq("status", "active");
    const c1 = compileFilterNode(node);
    const c2 = compileFilterNode(node);
    // Each call starts a fresh counter, so results are identical
    expect(c1.expression).toBe(c2.expression);
    expect(c1.expressionAttributeNames).toEqual(c2.expressionAttributeNames);
    expect(c1.expressionAttributeValues).toEqual(c2.expressionAttributeValues);
  });
});

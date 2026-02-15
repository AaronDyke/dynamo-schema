import { describe, it, expect } from "vitest";
import { marshallValue, marshallItem } from "../../marshalling/marshall.js";

describe("marshallValue()", () => {
  it("marshalls null to NULL", () => {
    const result = marshallValue(null);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ NULL: true });
  });

  it("marshalls undefined to NULL", () => {
    const result = marshallValue(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ NULL: true });
  });

  it("marshalls a string", () => {
    const result = marshallValue("hello");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ S: "hello" });
  });

  it("marshalls an empty string", () => {
    const result = marshallValue("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ S: "" });
  });

  it("marshalls a finite number", () => {
    const result = marshallValue(42);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ N: "42" });
  });

  it("marshalls a negative number", () => {
    const result = marshallValue(-3.14);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ N: "-3.14" });
  });

  it("fails for Infinity", () => {
    const result = marshallValue(Infinity);
    expect(result.success).toBe(false);
  });

  it("fails for NaN", () => {
    const result = marshallValue(NaN);
    expect(result.success).toBe(false);
  });

  it("marshalls a bigint", () => {
    const result = marshallValue(BigInt(99));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ N: "99" });
  });

  it("marshalls true boolean", () => {
    const result = marshallValue(true);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ BOOL: true });
  });

  it("marshalls false boolean", () => {
    const result = marshallValue(false);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ BOOL: false });
  });

  it("marshalls a Uint8Array to B", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = marshallValue(bytes);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ B: bytes });
  });

  it("marshalls a Set<string> to SS", () => {
    const result = marshallValue(new Set(["a", "b"]));
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { SS: string[] };
      expect(data.SS).toEqual(expect.arrayContaining(["a", "b"]));
    }
  });

  it("marshalls a Set<number> to NS", () => {
    const result = marshallValue(new Set([1, 2]));
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { NS: string[] };
      expect(data.NS).toEqual(expect.arrayContaining(["1", "2"]));
    }
  });

  it("fails for an empty Set", () => {
    const result = marshallValue(new Set());
    expect(result.success).toBe(false);
  });

  it("marshalls an Array to L", () => {
    const result = marshallValue([1, "two", true]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        L: [{ N: "1" }, { S: "two" }, { BOOL: true }],
      });
    }
  });

  it("marshalls a nested object to M", () => {
    const result = marshallValue({ x: 1, y: "hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        M: { x: { N: "1" }, y: { S: "hello" } },
      });
    }
  });

  it("fails for unsupported types like functions", () => {
    const result = marshallValue(() => {});
    expect(result.success).toBe(false);
  });

  it("handles deeply nested objects", () => {
    const result = marshallValue({ a: { b: { c: 42 } } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        M: { a: { M: { b: { M: { c: { N: "42" } } } } } },
      });
    }
  });
});

describe("marshallItem()", () => {
  it("marshalls a plain object into an AttributeMap", () => {
    const result = marshallItem({ name: "Alice", age: 30 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: { S: "Alice" },
        age: { N: "30" },
      });
    }
  });

  it("skips undefined values", () => {
    const result = marshallItem({ name: "Alice", missing: undefined });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).not.toContain("missing");
    }
  });

  it("fails if any value cannot be marshalled", () => {
    const result = marshallItem({ bad: Infinity });
    expect(result.success).toBe(false);
  });
});

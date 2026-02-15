import { describe, it, expect } from "vitest";
import { unmarshallValue, unmarshallItem } from "../../marshalling/unmarshall.js";

describe("unmarshallValue()", () => {
  it("unmarshalls S to string", () => {
    const result = unmarshallValue({ S: "hello" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("hello");
  });

  it("unmarshalls N to number", () => {
    const result = unmarshallValue({ N: "42" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(42);
  });

  it("unmarshalls negative N", () => {
    const result = unmarshallValue({ N: "-3.14" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeCloseTo(-3.14);
  });

  it("unmarshalls BOOL true", () => {
    const result = unmarshallValue({ BOOL: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it("unmarshalls BOOL false", () => {
    const result = unmarshallValue({ BOOL: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it("unmarshalls NULL to null", () => {
    const result = unmarshallValue({ NULL: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("unmarshalls B to Uint8Array", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = unmarshallValue({ B: bytes });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(bytes);
  });

  it("unmarshalls SS to Set<string>", () => {
    const result = unmarshallValue({ SS: ["a", "b"] });
    expect(result.success).toBe(true);
    if (result.success) {
      const set = result.data as Set<string>;
      expect(set).toBeInstanceOf(Set);
      expect(set.has("a")).toBe(true);
      expect(set.has("b")).toBe(true);
    }
  });

  it("unmarshalls NS to Set<number>", () => {
    const result = unmarshallValue({ NS: ["1", "2"] });
    expect(result.success).toBe(true);
    if (result.success) {
      const set = result.data as Set<number>;
      expect(set).toBeInstanceOf(Set);
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
    }
  });

  it("unmarshalls BS to Set<Uint8Array>", () => {
    const b1 = new Uint8Array([1]);
    const b2 = new Uint8Array([2]);
    const result = unmarshallValue({ BS: [b1, b2] });
    expect(result.success).toBe(true);
    if (result.success) {
      const set = result.data as Set<Uint8Array>;
      expect(set).toBeInstanceOf(Set);
      expect(set.size).toBe(2);
    }
  });

  it("unmarshalls L to array", () => {
    const result = unmarshallValue({
      L: [{ S: "hello" }, { N: "1" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["hello", 1]);
    }
  });

  it("unmarshalls M to object", () => {
    const result = unmarshallValue({
      M: { name: { S: "Alice" }, age: { N: "30" } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Alice", age: 30 });
    }
  });

  it("handles nested M/L structures", () => {
    const result = unmarshallValue({
      M: {
        tags: { L: [{ S: "a" }, { S: "b" }] },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ tags: ["a", "b"] });
    }
  });
});

describe("unmarshallItem()", () => {
  it("unmarshalls an AttributeMap to a plain object", () => {
    const result = unmarshallItem({
      name: { S: "Alice" },
      age: { N: "30" },
      active: { BOOL: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Alice", age: 30, active: true });
    }
  });

  it("returns empty object for empty AttributeMap", () => {
    const result = unmarshallItem({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({});
  });
});

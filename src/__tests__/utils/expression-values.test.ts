import { describe, it, expect } from "vitest";
import {
  valuePlaceholder,
  buildExpressionAttributeValues,
} from "../../utils/expression-values.js";

describe("valuePlaceholder()", () => {
  it("prefixes with :", () => {
    expect(valuePlaceholder("name")).toBe(":name");
    expect(valuePlaceholder("userId")).toBe(":userId");
    expect(valuePlaceholder("pk")).toBe(":pk");
  });
});

describe("buildExpressionAttributeValues()", () => {
  it("creates prefixed value placeholders", () => {
    const result = buildExpressionAttributeValues({ name: "Alice", age: 30 });
    expect(result[":name"]).toBe("Alice");
    expect(result[":age"]).toBe(30);
  });

  it("does not double-prefix already-prefixed keys", () => {
    const result = buildExpressionAttributeValues({ ":alreadyPrefixed": "value" });
    expect(result[":alreadyPrefixed"]).toBe("value");
    expect(result["::alreadyPrefixed"]).toBeUndefined();
  });

  it("returns an empty object for empty input", () => {
    const result = buildExpressionAttributeValues({});
    expect(result).toEqual({});
  });

  it("returns a frozen object", () => {
    const result = buildExpressionAttributeValues({ x: 1 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("preserves all value types", () => {
    const result = buildExpressionAttributeValues({
      str: "hello",
      num: 42,
      bool: true,
      nil: null,
    });
    expect(result[":str"]).toBe("hello");
    expect(result[":num"]).toBe(42);
    expect(result[":bool"]).toBe(true);
    expect(result[":nil"]).toBeNull();
  });
});

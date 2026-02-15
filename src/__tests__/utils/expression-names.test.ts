import { describe, it, expect } from "vitest";
import {
  isReservedWord,
  needsAlias,
  aliasAttributeName,
  buildExpressionAttributeNames,
} from "../../utils/expression-names.js";

describe("isReservedWord()", () => {
  it("returns true for a known reserved word", () => {
    expect(isReservedWord("name")).toBe(true);
    expect(isReservedWord("status")).toBe(true);
    expect(isReservedWord("data")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isReservedWord("NAME")).toBe(true);
    expect(isReservedWord("Status")).toBe(true);
    expect(isReservedWord("DATA")).toBe(true);
  });

  it("returns false for non-reserved words", () => {
    expect(isReservedWord("userId")).toBe(false);
    expect(isReservedWord("email")).toBe(false);
    expect(isReservedWord("myAttribute")).toBe(false);
  });
});

describe("needsAlias()", () => {
  it("returns true for reserved words", () => {
    expect(needsAlias("name")).toBe(true);
    expect(needsAlias("status")).toBe(true);
  });

  it("returns true for names with special characters", () => {
    expect(needsAlias("user.email")).toBe(true);
    expect(needsAlias("my-attr")).toBe(true);
    expect(needsAlias("attr with space")).toBe(true);
  });

  it("returns false for safe non-reserved names", () => {
    expect(needsAlias("userId")).toBe(false);
    expect(needsAlias("email")).toBe(false);
    expect(needsAlias("createdAt")).toBe(false);
  });
});

describe("aliasAttributeName()", () => {
  it("prefixes with #", () => {
    expect(aliasAttributeName("name")).toBe("#name");
    expect(aliasAttributeName("status")).toBe("#status");
    expect(aliasAttributeName("userId")).toBe("#userId");
  });
});

describe("buildExpressionAttributeNames()", () => {
  it("only includes names that need aliasing", () => {
    const result = buildExpressionAttributeNames(["userId", "name", "status"]);
    expect(Object.keys(result)).not.toContain("#userId");
    expect(result["#name"]).toBe("name");
    expect(result["#status"]).toBe("status");
  });

  it("returns an empty object when no names need aliasing", () => {
    const result = buildExpressionAttributeNames(["userId", "email"]);
    expect(result).toEqual({});
  });

  it("handles names with special characters", () => {
    const result = buildExpressionAttributeNames(["user.email"]);
    expect(result["#user.email"]).toBe("user.email");
  });

  it("returns a frozen object", () => {
    const result = buildExpressionAttributeNames(["name"]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { buildKeyValue, buildKey } from "../../keys/key-builder.js";
import { parseTemplate } from "../../keys/template-parser.js";

describe("buildKeyValue()", () => {
  it("builds a key value from a simple template", () => {
    const template = parseTemplate("PROFILE");
    const result = buildKeyValue(template, {});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("PROFILE");
  });

  it("builds a key value with a single placeholder", () => {
    const template = parseTemplate("USER#{{userId}}");
    const result = buildKeyValue(template, { userId: "123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("USER#123");
  });

  it("builds a key value with multiple placeholders", () => {
    const template = parseTemplate("{{type}}#{{id}}");
    const result = buildKeyValue(template, { type: "USER", id: "456" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("USER#456");
  });

  it("stringifies numeric values", () => {
    const template = parseTemplate("ITEM#{{itemId}}");
    const result = buildKeyValue(template, { itemId: 42 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("ITEM#42");
  });

  it("fails when a required field is missing", () => {
    const template = parseTemplate("USER#{{userId}}");
    const result = buildKeyValue(template, {});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("userId");
  });

  it("fails when a required field is null", () => {
    const template = parseTemplate("USER#{{userId}}");
    const result = buildKeyValue(template, { userId: null });
    expect(result.success).toBe(false);
  });
});

describe("buildKey()", () => {
  it("builds a PK-only key", () => {
    const config = {
      partitionKey: {
        name: "pk",
        template: parseTemplate("USER#{{userId}}"),
      },
    };
    const result = buildKey(config, { userId: "123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ pk: "USER#123" });
  });

  it("builds a PK + SK key", () => {
    const config = {
      partitionKey: {
        name: "pk",
        template: parseTemplate("USER#{{userId}}"),
      },
      sortKey: {
        name: "sk",
        template: parseTemplate("PROFILE"),
      },
    };
    const result = buildKey(config, { userId: "123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ pk: "USER#123", sk: "PROFILE" });
    }
  });

  it("returns a frozen object", () => {
    const config = {
      partitionKey: {
        name: "pk",
        template: parseTemplate("STATIC"),
      },
    };
    const result = buildKey(config, {});
    expect(result.success).toBe(true);
    if (result.success) expect(Object.isFrozen(result.data)).toBe(true);
  });

  it("fails when PK field is missing", () => {
    const config = {
      partitionKey: {
        name: "pk",
        template: parseTemplate("USER#{{userId}}"),
      },
    };
    const result = buildKey(config, {});
    expect(result.success).toBe(false);
  });

  it("fails when SK field is missing", () => {
    const config = {
      partitionKey: {
        name: "pk",
        template: parseTemplate("STATIC_PK"),
      },
      sortKey: {
        name: "sk",
        template: parseTemplate("SK#{{skField}}"),
      },
    };
    const result = buildKey(config, {});
    expect(result.success).toBe(false);
  });
});

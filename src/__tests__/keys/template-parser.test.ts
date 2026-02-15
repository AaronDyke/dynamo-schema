import { describe, it, expect } from "vitest";
import { parseTemplate } from "../../keys/template-parser.js";

describe("parseTemplate()", () => {
  it("parses a literal-only template", () => {
    const result = parseTemplate("PROFILE");
    expect(result.isSimple).toBe(true);
    expect(result.fields).toHaveLength(0);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({ type: "literal", value: "PROFILE" });
  });

  it("parses a template with a single placeholder", () => {
    const result = parseTemplate("{{userId}}");
    expect(result.isSimple).toBe(false);
    expect(result.fields).toEqual(["userId"]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({ type: "field", name: "userId" });
  });

  it("parses a template with a prefix and placeholder", () => {
    const result = parseTemplate("USER#{{userId}}");
    expect(result.isSimple).toBe(false);
    expect(result.fields).toEqual(["userId"]);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({ type: "literal", value: "USER#" });
    expect(result.segments[1]).toEqual({ type: "field", name: "userId" });
  });

  it("parses a template with multiple placeholders", () => {
    const result = parseTemplate("{{type}}#{{id}}");
    expect(result.isSimple).toBe(false);
    expect(result.fields).toEqual(["type", "id"]);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ type: "field", name: "type" });
    expect(result.segments[1]).toEqual({ type: "literal", value: "#" });
    expect(result.segments[2]).toEqual({ type: "field", name: "id" });
  });

  it("parses a mixed template with prefix, field, separator, and field", () => {
    const result = parseTemplate("PREFIX#{{orgId}}#SUFFIX#{{userId}}");
    expect(result.isSimple).toBe(false);
    expect(result.fields).toEqual(["orgId", "userId"]);
    expect(result.segments).toHaveLength(4);
  });

  it("parses an empty string as a simple literal", () => {
    const result = parseTemplate("");
    expect(result.isSimple).toBe(true);
    expect(result.fields).toHaveLength(0);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({ type: "literal", value: "" });
  });

  it("returns frozen objects", () => {
    const result = parseTemplate("USER#{{userId}}");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.segments)).toBe(true);
    expect(Object.isFrozen(result.fields)).toBe(true);
  });
});

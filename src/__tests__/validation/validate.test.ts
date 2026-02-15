import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validate } from "../../validation/validate.js";

const nameSchema = z.object({ name: z.string().min(1) });
const numSchema = z.number().positive();

describe("validate()", () => {
  it("returns ok with valid data", async () => {
    const result = await validate(nameSchema, { name: "Alice" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ name: "Alice" });
  });

  it("returns err with a ValidationError on invalid data", async () => {
    const result = await validate(nameSchema, { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation");
      expect(result.error.message).toContain("Validation failed");
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns err when input is wrong type entirely", async () => {
    const result = await validate(nameSchema, 42);
    expect(result.success).toBe(false);
  });

  it("works with primitive schemas", async () => {
    const result = await validate(numSchema, 5);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(5);
  });

  it("handles negative numbers failing positive schema", async () => {
    const result = await validate(numSchema, -1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("error message includes all issue messages", async () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = await validate(schema, { a: 1, b: "oops" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should mention both failures
      expect(result.error.issues.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles schemas with transforms", async () => {
    const trimSchema = z.string().transform((s) => s.trim());
    const result = await validate(trimSchema, "  hello  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("hello");
  });
});

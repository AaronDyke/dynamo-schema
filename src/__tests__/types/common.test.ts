import { describe, it, expect } from "vitest";
import { ok, err, mapResult, flatMapResult } from "../../types/common.js";

describe("ok()", () => {
  it("creates a successful result with the given data", () => {
    const result = ok(42);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(42);
    }
  });

  it("works with string data", () => {
    const result = ok("hello");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello");
    }
  });

  it("works with object data", () => {
    const data = { x: 1, y: 2 };
    const result = ok(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(data);
    }
  });

  it("produces a frozen object", () => {
    const result = ok(1);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("err()", () => {
  it("creates a failed result with the given error", () => {
    const error = new Error("something went wrong");
    const result = err(error);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(error);
    }
  });

  it("works with string errors", () => {
    const result = err("bad input");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("bad input");
    }
  });

  it("produces a frozen object", () => {
    const result = err(new Error("e"));
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("mapResult()", () => {
  it("transforms the data on success", () => {
    const result = mapResult(ok(2), (n) => n * 10);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(20);
    }
  });

  it("passes through errors unchanged", () => {
    const error = new Error("oops");
    const result = mapResult(err(error), (n: number) => n * 10);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(error);
    }
  });

  it("does not call fn on failure", () => {
    let called = false;
    mapResult(err(new Error("e")), (_: number) => {
      called = true;
      return 0;
    });
    expect(called).toBe(false);
  });
});

describe("flatMapResult()", () => {
  it("chains a second Result-returning function on success", () => {
    const result = flatMapResult(ok(5), (n) => ok(n + 1));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(6);
    }
  });

  it("short-circuits on first error", () => {
    const error = new Error("first");
    const initial: { readonly success: false; readonly error: Error } | { readonly success: true; readonly data: number } = err(error);
    const result = flatMapResult(initial, (n) => ok(n + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(error);
    }
  });

  it("propagates errors from the chained function", () => {
    const secondError = new Error("second");
    const result = flatMapResult(ok(5), (_n) => err(secondError));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(secondError);
    }
  });

  it("does not call fn on failure", () => {
    let called = false;
    const initial: { readonly success: false; readonly error: Error } | { readonly success: true; readonly data: number } = err(new Error("e"));
    flatMapResult(initial, (_: number) => {
      called = true;
      return ok(0);
    });
    expect(called).toBe(false);
  });
});

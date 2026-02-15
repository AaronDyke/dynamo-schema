import { describe, it, expect } from "vitest";
import { createUpdateBuilder, compileUpdateActions } from "../../operations/update.js";
import type { UpdateActions } from "../../types/update-expression.js";

type Item = {
  name: string;
  age: number;
  tags: Set<string>;
  score: number;
  removable: string;
};

describe("createUpdateBuilder()", () => {
  it("creates an immutable builder with empty actions", () => {
    const builder = createUpdateBuilder<Item>();
    const actions = builder.build();
    expect(actions.sets).toHaveLength(0);
    expect(actions.setIfNotExists).toHaveLength(0);
    expect(actions.removes).toHaveLength(0);
    expect(actions.adds).toHaveLength(0);
    expect(actions.deletes).toHaveLength(0);
  });

  it("set() adds a set action and returns a new builder", () => {
    const builder = createUpdateBuilder<Item>();
    const next = builder.set("name", "Alice");
    // Original is unchanged
    expect(builder.build().sets).toHaveLength(0);
    // New builder has the action
    expect(next.build().sets).toHaveLength(1);
    expect(next.build().sets[0]).toEqual({ path: "name", value: "Alice" });
  });

  it("setIfNotExists() adds a setIfNotExists action", () => {
    const builder = createUpdateBuilder<Item>();
    const next = builder.setIfNotExists("age", 18);
    expect(next.build().setIfNotExists).toHaveLength(1);
    expect(next.build().setIfNotExists[0]).toEqual({ path: "age", value: 18 });
  });

  it("remove() adds a remove action", () => {
    const builder = createUpdateBuilder<Item>();
    const next = builder.remove("removable");
    expect(next.build().removes).toHaveLength(1);
    expect(next.build().removes[0]).toBe("removable");
  });

  it("add() adds an add action", () => {
    const builder = createUpdateBuilder<Item>();
    const next = builder.add("score", 5);
    expect(next.build().adds).toHaveLength(1);
    expect(next.build().adds[0]).toEqual({ path: "score", value: 5 });
  });

  it("delete() adds a delete action", () => {
    const builder = createUpdateBuilder<Item>();
    const tags = new Set(["old"]);
    const next = builder.delete("tags", tags);
    expect(next.build().deletes).toHaveLength(1);
    expect(next.build().deletes[0]).toEqual({ path: "tags", value: tags });
  });

  it("is chainable — multiple actions accumulate", () => {
    const actions = createUpdateBuilder<Item>()
      .set("name", "Bob")
      .set("age", 25)
      .remove("removable")
      .build();

    expect(actions.sets).toHaveLength(2);
    expect(actions.removes).toHaveLength(1);
  });

  it("each step is immutable", () => {
    const b0 = createUpdateBuilder<Item>();
    const b1 = b0.set("name", "Alice");
    const b2 = b1.set("age", 30);

    expect(b0.build().sets).toHaveLength(0);
    expect(b1.build().sets).toHaveLength(1);
    expect(b2.build().sets).toHaveLength(2);
  });

  it("returns frozen actions from build()", () => {
    const actions = createUpdateBuilder<Item>().set("name", "X").build();
    expect(Object.isFrozen(actions)).toBe(true);
    // The individual action objects within sets are frozen
    expect(Object.isFrozen(actions.sets[0])).toBe(true);
  });
});

describe("compileUpdateActions()", () => {
  it("compiles a SET action", () => {
    const actions: UpdateActions = {
      sets: [{ path: "name", value: "Alice" }],
      setIfNotExists: [],
      removes: [],
      adds: [],
      deletes: [],
    };
    const result = compileUpdateActions(actions);
    expect(result.updateExpression).toContain("SET");
    expect(result.updateExpression).toContain("= :s0_name");
    expect(result.expressionAttributeNames["#s0_name"]).toBe("name");
    expect(result.expressionAttributeValues[":s0_name"]).toBe("Alice");
  });

  it("compiles a setIfNotExists action", () => {
    const actions: UpdateActions = {
      sets: [],
      setIfNotExists: [{ path: "age", value: 18 }],
      removes: [],
      adds: [],
      deletes: [],
    };
    const result = compileUpdateActions(actions);
    expect(result.updateExpression).toContain("if_not_exists");
    expect(result.expressionAttributeNames["#sne0_age"]).toBe("age");
  });

  it("compiles a REMOVE action", () => {
    const actions: UpdateActions = {
      sets: [],
      setIfNotExists: [],
      removes: ["oldField"],
      adds: [],
      deletes: [],
    };
    const result = compileUpdateActions(actions);
    expect(result.updateExpression).toContain("REMOVE");
    expect(result.expressionAttributeNames["#r0_oldField"]).toBe("oldField");
  });

  it("compiles an ADD action", () => {
    const actions: UpdateActions = {
      sets: [],
      setIfNotExists: [],
      removes: [],
      adds: [{ path: "score", value: 10 }],
      deletes: [],
    };
    const result = compileUpdateActions(actions);
    expect(result.updateExpression).toContain("ADD");
    expect(result.expressionAttributeNames["#a0_score"]).toBe("score");
    expect(result.expressionAttributeValues[":a0_score"]).toBe(10);
  });

  it("compiles a DELETE action", () => {
    const tags = new Set(["x"]);
    const actions: UpdateActions = {
      sets: [],
      setIfNotExists: [],
      removes: [],
      adds: [],
      deletes: [{ path: "tags", value: tags }],
    };
    const result = compileUpdateActions(actions);
    expect(result.updateExpression).toContain("DELETE");
    expect(result.expressionAttributeNames["#d0_tags"]).toBe("tags");
  });

  it("combines multiple clauses", () => {
    const actions: UpdateActions = {
      sets: [{ path: "name", value: "Alice" }],
      setIfNotExists: [],
      removes: ["oldAttr"],
      adds: [],
      deletes: [],
    };
    const result = compileUpdateActions(actions);
    expect(result.updateExpression).toContain("SET");
    expect(result.updateExpression).toContain("REMOVE");
  });

  it("returns frozen results", () => {
    const actions: UpdateActions = {
      sets: [{ path: "name", value: "X" }],
      setIfNotExists: [],
      removes: [],
      adds: [],
      deletes: [],
    };
    const result = compileUpdateActions(actions);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.expressionAttributeNames)).toBe(true);
    expect(Object.isFrozen(result.expressionAttributeValues)).toBe(true);
  });
});

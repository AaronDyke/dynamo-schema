/**
 * Regression tests for the High-severity entries in TODO/EDGE-CASES.md.
 *
 * Each `describe` is named after a stable entry ID. Open entries hold
 * `it.todo` cases; when fixing an entry, replace them with real tests and
 * move the entry to "Resolved" in EDGE-CASES.md.
 */

import { describe, it, expect, expectTypeOf, vi } from "vitest";
import { defineTable } from "../core/define-table.js";
import { defineEntity } from "../core/define-entity.js";
import { createClient } from "../core/create-client.js";
import { compileUpdateActions, createUpdateBuilder } from "../operations/update.js";
import { executeQuery } from "../operations/query.js";
import { executeScan } from "../operations/scan.js";
import { executeGet } from "../operations/get.js";
import { executeTransactGet } from "../operations/transact-get.js";
import { executeBatchGet } from "../operations/batch-get.js";
import { executeRemoveTtl } from "../operations/remove-ttl.js";
import { executePut } from "../operations/put.js";
import type { EntityKeyInput } from "../types/entity.js";
import {
  userEntity,
  userSchema,
  usersTable,
  validUser,
  createMockAdapter,
} from "./fixtures.js";

/** Attribute names that are legal in DynamoDB but not valid as raw placeholder text. */
const AWKWARD_NAMES = ["user-id", "first name", "address.city"] as const;

/**
 * Asserts that every `#name` / `:value` placeholder in `expression` is
 * syntactically valid (`[A-Za-z0-9_]` only) and defined in the matching map.
 */
const expectValidPlaceholders = (
  expression: string | undefined,
  names: Readonly<Record<string, string>> | undefined,
  values: Readonly<Record<string, unknown>> | undefined = {},
): void => {
  const tokens = expression?.match(/[#:][^\s,()]+/g) ?? [];
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) {
    expect(token).toMatch(/^[#:][A-Za-z0-9_]+$/);
    const map = token.startsWith("#") ? names : values;
    expect(map ?? {}).toHaveProperty([token]);
  }
};

describe("EXP-1: attribute names with non-word characters", () => {
  it("compileUpdateActions produces valid placeholders for names containing '-', '.' or spaces", () => {
    const [a, b, c] = AWKWARD_NAMES;
    const actions = createUpdateBuilder<Record<string, unknown>>()
      .set(a, 1)
      .setIfNotExists(b, 2)
      .remove(c)
      .add(a, 3)
      .delete(b, new Set(["x"]))
      .build();
    const compiled = compileUpdateActions(actions);

    expectValidPlaceholders(
      compiled.updateExpression,
      compiled.expressionAttributeNames,
      compiled.expressionAttributeValues,
    );
    expect(Object.values(compiled.expressionAttributeNames)).toEqual([a, b, c, a, b]);
  });

  it("query and scan projections alias names like 'user-id' with valid placeholders", async () => {
    const adapter = createMockAdapter();
    await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "u1" },
      options: { projection: AWKWARD_NAMES },
    });
    await executeScan(userEntity, adapter, { projection: AWKWARD_NAMES });

    for (const call of [
      vi.mocked(adapter.query).mock.calls[0]![0],
      vi.mocked(adapter.scan).mock.calls[0]![0],
    ]) {
      expectValidPlaceholders(call.projectionExpression, call.expressionAttributeNames);
      for (const name of AWKWARD_NAMES) {
        expect(Object.values(call.expressionAttributeNames ?? {})).toContain(name);
      }
    }
  });

  it("get, transactGet and batchGet projections alias names like 'user-id' with valid placeholders", async () => {
    const adapter = createMockAdapter();
    await executeGet(userEntity, adapter, { userId: "u1" }, { projection: AWKWARD_NAMES });
    await executeTransactGet(adapter, [
      { entity: userEntity, keyInput: { userId: "u1" }, projection: AWKWARD_NAMES },
    ]);
    await executeBatchGet(adapter, [
      { entity: userEntity, keys: [{ userId: "u1" }], projection: AWKWARD_NAMES },
    ]);

    const getCall = vi.mocked(adapter.getItem).mock.calls[0]![0];
    const transactCall = vi.mocked(adapter.transactGetItems).mock.calls[0]![0][0]!;
    const batchCall = vi.mocked(adapter.batchGetItem).mock.calls[0]![0][0]!;

    for (const call of [getCall, transactCall, batchCall]) {
      expectValidPlaceholders(call.projectionExpression, call.expressionAttributeNames);
      expect(Object.values(call.expressionAttributeNames ?? {})).toEqual([...AWKWARD_NAMES]);
    }
  });

  it("removeTtl aliases a TTL attribute name containing '-' with a valid placeholder", async () => {
    const table = defineTable({
      tableName: "DashTtlTable",
      partitionKey: { name: "pk", definition: "pk" },
      sortKey: { name: "sk", definition: "sk" },
      ttl: { attributeName: "expires-at" },
    });
    const entity = defineEntity({
      name: "DashTtlUser",
      schema: userSchema,
      table,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
    });
    const adapter = createMockAdapter();

    const result = await executeRemoveTtl(entity, adapter, { userId: "u1" });

    expect(result.success).toBe(true);
    const call = vi.mocked(adapter.updateItem).mock.calls[0]![0];
    expectValidPlaceholders(call.updateExpression, call.expressionAttributeNames);
    expect(Object.values(call.expressionAttributeNames ?? {})).toEqual(["expires-at"]);
  });
});

describe("ENT-1: defineEntity without a sortKey", () => {
  const pkOnlyTable = defineTable({
    tableName: "PkOnlyTable",
    partitionKey: { name: "pk", definition: "pk" },
  });

  it("defineEntity type-checks for an entity with no sortKey on a partition-key-only table", () => {
    const entity = defineEntity({
      name: "PkOnly",
      schema: userSchema,
      table: pkOnlyTable,
      partitionKey: "USER#{{userId}}",
    });

    expect(entity.sortKey).toBeUndefined();
    expectTypeOf<EntityKeyInput<typeof entity>>().toEqualTypeOf<{ readonly userId: string }>();
  });

  it("requires the partition key fields in the client's key input", () => {
    const entity = defineEntity({
      name: "PkOnly",
      schema: userSchema,
      table: pkOnlyTable,
      partitionKey: "USER#{{userId}}",
    });
    const users = createClient({ adapter: createMockAdapter() }).entity(entity);

    // Type-level only: the calls are never awaited.
    const typeChecks = (): void => {
      void users.get({ userId: "u1" });
      // @ts-expect-error -- `userId` is required
      void users.get({});
    };
    expect(typeChecks).toBeTypeOf("function");
  });

  it("still rejects key templates that reference fields missing from the schema", () => {
    // @ts-expect-error -- `missing` is not a schema field
    defineEntity({
      name: "BadPk",
      schema: userSchema,
      table: pkOnlyTable,
      partitionKey: "USER#{{missing}}",
    });
    // @ts-expect-error -- `missing` is not a schema field
    defineEntity({
      name: "BadSk",
      schema: userSchema,
      table: usersTable,
      partitionKey: "USER#{{userId}}",
      sortKey: "SK#{{missing}}",
    });
  });

  it("put and get work end to end for an entity with no sortKey", async () => {
    const entity = defineEntity({
      name: "PkOnly",
      schema: userSchema,
      table: pkOnlyTable,
      partitionKey: "USER#{{userId}}",
    });
    const adapter = createMockAdapter();

    const putResult = await executePut(entity, adapter, validUser);
    await executeGet(entity, adapter, { userId: validUser.userId });

    expect(putResult.success).toBe(true);
    expect(vi.mocked(adapter.putItem).mock.calls[0]![0].item).toMatchObject({
      pk: `USER#${validUser.userId}`,
    });
    expect(vi.mocked(adapter.getItem).mock.calls[0]![0].key).toEqual({
      pk: `USER#${validUser.userId}`,
    });
  });
});

describe("KEY-6: bare field name documented as a key template", () => {
  it.todo("the README's 'Simple field' format matches what parseTemplate does with a bare name");
});

describe("EXP-2: user expressionNames/expressionValues overwriting generated aliases", () => {
  it.todo("returns a validation error when a user expressionNames key matches a generated alias");
  it.todo("returns a validation error when a user expressionValues key matches a generated placeholder");
});

describe("EXP-3: filter paths containing dots", () => {
  it.todo("a FilterNode path 'address.city' addresses the nested attribute or is rejected");
});

describe("KEY-1: field values containing a template delimiter", () => {
  it.todo("buildKeyValue rejects a field value that contains the adjacent literal delimiter");
  it.todo("buildKeyValue → extractFieldsFromKey round-trips every accepted value");
});

describe("MAR-1: non-plain objects marshalled as empty maps", () => {
  it.todo("marshallValue returns an error for a Date");
  it.todo("marshallValue returns an error for a Map");
  it.todo("marshallValue returns an error for class instances and ArrayBuffer");
});

describe("PUT-1: sparse GSIs", () => {
  it.todo("put succeeds and omits the index attributes when all of an index template's fields are absent");
  it.todo("put still fails when only some of an index template's fields are present");
});

describe("PUT-2: generated attributes overwriting schema fields", () => {
  it.todo("reports a collision when a schema field shares the partition/sort key attribute name");
  it.todo("reports a collision when a schema field shares a GSI key attribute name");
  it.todo("does not overwrite a caller-supplied TTL attribute value");
});

describe("BAT-1: multiple entities on one table in BatchGet", () => {
  it.todo("applies each entity's projection to its own keys");
  it.todo("groups returned items under the entity that requested them");
});

describe("BAT-2: BatchWrite partial failure", () => {
  it.todo("the error identifies the items that were not written when a later chunk fails");
  it.todo("the error identifies the items still unprocessed after retries run out");
});

describe("BAT-3: entity name collisions in BatchGetResult", () => {
  it.todo("rejects two requests whose entities share a name but differ");
});

describe("HOOK-1: hooks bypassed by batch, transaction, query and scan", () => {
  it.todo("batchWrite runs beforePut for put requests and beforeDelete for delete requests");
  it.todo("transactWrite runs beforePut, beforeUpdate and beforeDelete");
  it.todo("batchGet, transactGet, query and scan run afterGet on each item");
  it.todo("skipHooks disables hooks in all of the above");
});

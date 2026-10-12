/**
 * Regression tests for the High-severity entries in TODO/EDGE-CASES.md.
 *
 * Each `describe` is named after a stable entry ID. Open entries hold
 * `it.todo` cases; when fixing an entry, replace them with real tests and
 * move the entry to "Resolved" in EDGE-CASES.md.
 */

import { describe, it, expect, expectTypeOf, vi } from "vitest";
import { z } from "zod";
import { parseTemplate } from "../keys/template-parser.js";
import { buildKeyValue } from "../keys/key-builder.js";
import { extractFieldsFromKey } from "../keys/key-extractor.js";
import { marshallValue, marshallItem } from "../marshalling/marshall.js";
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
import { executeUpdate } from "../operations/update.js";
import { executeDelete } from "../operations/delete.js";
import {
  executeBatchWrite,
  type BatchWriteRequestItem,
} from "../operations/batch-write.js";
import {
  executeTransactWrite,
  type TransactWriteRequestItem,
} from "../operations/transact-write.js";
import { createFilterBuilder, compileFilterNode } from "../operations/filter.js";
import type { UpdateBuilder } from "../types/update-expression.js";
import type { EntityKeyInput } from "../types/entity.js";
import {
  userEntity,
  userSchema,
  usersTable,
  validUser,
  createMockAdapter,
  createRawMockAdapter,
  type User,
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

    for (const call of [getCall, transactCall]) {
      expectValidPlaceholders(call.projectionExpression, call.expressionAttributeNames);
      expect(Object.values(call.expressionAttributeNames ?? {})).toEqual([...AWKWARD_NAMES]);
    }
    // BatchGet also projects the key attributes, to match items to entities (BAT-1).
    expectValidPlaceholders(batchCall.projectionExpression, batchCall.expressionAttributeNames);
    expect(Object.values(batchCall.expressionAttributeNames ?? {})).toEqual([
      ...AWKWARD_NAMES,
      "pk",
      "sk",
    ]);
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

describe("EXP-2: user expressionNames/expressionValues overwriting generated aliases", () => {
  const f = createFilterBuilder<{ status: string }>();

  it("returns a validation error when a user expressionNames key matches a generated alias", async () => {
    const adapter = createMockAdapter();
    const results = [
      await executeUpdate(userEntity, adapter, { userId: "u1" }, (b) => b.set("name", "A"), {
        expressionNames: { "#u0": "email" },
      }),
      await executeQuery(userEntity, adapter, {
        partitionKey: { userId: "u1" },
        options: { projection: ["name"], expressionNames: { "#p0": "email" } },
      }),
      await executeScan(userEntity, adapter, {
        filter: f.eq("status", "active"),
        expressionNames: { "#f0": "email" },
      }),
      await executePut(userEntity, adapter, validUser, {
        condition: f.eq("status", "active"),
        expressionNames: { "#f0": "email" },
      }),
      await executeDelete(userEntity, adapter, { userId: "u1" }, {
        condition: f.eq("status", "active"),
        expressionNames: { "#f0": "email" },
      }),
      await executeTransactWrite(adapter, [
        {
          type: "update",
          entity: userEntity,
          keyInput: { userId: "u1" },
          builderFn: (b: UpdateBuilder<User>) => b.set("name", "A"),
          expressionNames: { "#u0": "email" },
        } as TransactWriteRequestItem,
      ]),
    ];

    for (const result of results) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
        expect(result.error.message).toContain("conflicts with a generated placeholder");
      }
    }
    expect(adapter.updateItem).not.toHaveBeenCalled();
    expect(adapter.query).not.toHaveBeenCalled();
    expect(adapter.scan).not.toHaveBeenCalled();
    expect(adapter.putItem).not.toHaveBeenCalled();
    expect(adapter.deleteItem).not.toHaveBeenCalled();
    expect(adapter.transactWriteItems).not.toHaveBeenCalled();
  });

  it("returns a validation error when a user expressionValues key matches a generated placeholder", async () => {
    const adapter = createMockAdapter();
    const update = await executeUpdate(userEntity, adapter, { userId: "u1" }, (b) => b.set("name", "A"), {
      expressionValues: { ":u0": "B" },
    });
    const query = await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "u1" },
      options: { expressionValues: { ":pk": "USER#someone-else" } },
    });

    for (const result of [update, query]) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe("validation");
    }
  });

  it("allows a user key that repeats a generated placeholder with the same value", async () => {
    const adapter = createMockAdapter();
    // The README's query example passes { "#pk": "pk" }, which matches the generated key alias.
    const result = await executeQuery(userEntity, adapter, {
      partitionKey: { userId: "u1" },
      options: { expressionNames: { "#pk": "pk", "#age": "age" } },
    });

    expect(result.success).toBe(true);
    expect(vi.mocked(adapter.query).mock.calls[0]![0].expressionAttributeNames).toMatchObject({
      "#pk": "pk",
      "#age": "age",
    });
  });
});

describe("EXP-3: filter paths containing dots", () => {
  type Profile = { address: { city: string }; tags: string[]; "a.b": string };
  const f = createFilterBuilder<Profile>();

  it("a tuple path addresses the nested attribute with one alias per segment", () => {
    const compiled = compileFilterNode(
      f.and(f.eq(["address", "city"], "NYC"), f.attributeExists(["tags", 0])),
    );

    expect(compiled.expression).toBe(
      "(#f0_0.#f0_1 = :f0 AND attribute_exists(#f1_0[0]))",
    );
    expect(compiled.expressionAttributeNames).toEqual({
      "#f0_0": "address",
      "#f0_1": "city",
      "#f1_0": "tags",
    });
    expect(compiled.expressionAttributeValues).toEqual({ ":f0": "NYC" });
  });

  it("a string path containing a dot is one attribute name, as in updates and projections", () => {
    const compiled = compileFilterNode(f.eq("a.b", "x"));

    expect(compiled.expression).toBe("#f0 = :f0");
    expect(compiled.expressionAttributeNames).toEqual({ "#f0": "a.b" });
  });

  it("type-checks nested paths against the first segment only", () => {
    const typeChecks = (): void => {
      f.eq(["address", "city"], "any value is allowed for nested paths");
      // @ts-expect-error -- first segment must be a key of Profile
      f.eq(["missing", "city"], "x");
      // @ts-expect-error -- top-level value must match the attribute type
      f.eq("tags", "not-an-array");
    };
    expect(typeChecks).toBeTypeOf("function");
  });
});

describe("KEY-1: field values containing a template delimiter", () => {
  const template = parseTemplate("{{orgId}}#{{userId}}");

  it("buildKeyValue rejects a field value that contains the adjacent literal delimiter", () => {
    const result = buildKeyValue(template, { orgId: "ORG#CHILD", userId: "u1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('contains the delimiter "#"');
  });

  it("allows the delimiter in the last field, which has no delimiter after it", () => {
    expect(buildKeyValue(template, { orgId: "ORG", userId: "a#b" })).toEqual({
      success: true,
      data: "ORG#a#b",
    });
  });

  it("buildKeyValue → extractFieldsFromKey round-trips every accepted value, and no two inputs share a key", () => {
    // Every string of length 0-3 over a small alphabet that includes the delimiter.
    const alphabet = ["a", "b", "#"];
    const values = [""];
    for (let len = 1; len <= 3; len++) {
      for (const prefix of values.filter((v) => v.length === len - 1)) {
        for (const ch of alphabet) values.push(prefix + ch);
      }
    }

    const seen = new Map<string, string>();
    for (const orgId of values) {
      for (const userId of values) {
        const built = buildKeyValue(template, { orgId, userId });
        if (!built.success) continue;

        expect(extractFieldsFromKey(template, built.data)).toEqual({
          success: true,
          data: { orgId, userId },
        });
        const input = JSON.stringify({ orgId, userId });
        expect(seen.get(built.data) ?? input).toBe(input);
        seen.set(built.data, input);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("put returns a key error instead of writing an ambiguous key", async () => {
    const orgUsers = defineEntity({
      name: "OrgUser",
      schema: z.object({ orgId: z.string(), userId: z.string() }),
      table: usersTable,
      partitionKey: "{{orgId}}#{{userId}}",
      sortKey: "PROFILE",
    });
    const adapter = createMockAdapter();

    const result = await executePut(orgUsers, adapter, { orgId: "a#b", userId: "c" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("key");
    expect(adapter.putItem).not.toHaveBeenCalled();
  });
});

describe("MAR-1: non-plain objects marshalled as empty maps", () => {
  const expectError = (value: unknown, messagePart: string): void => {
    const result = marshallValue(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain(messagePart);
  };

  it("marshallValue returns an error for a Date", () => {
    expectError(new Date("2024-01-01"), "Cannot marshall Date instance");
  });

  it("marshallValue returns an error for a Map", () => {
    expectError(new Map([["k", "v"]]), "Object.fromEntries");
  });

  it("marshallValue returns an error for class instances and ArrayBuffer", () => {
    class Point {
      constructor(readonly x: number) {}
    }
    expectError(new Point(1), "Cannot marshall Point instance");
    expectError(new ArrayBuffer(4), "Uint8Array");
  });

  it("rejects a Date nested inside an item instead of storing an empty map", () => {
    const result = marshallItem({ id: "1", meta: { createdAt: new Date() } });
    expect(result.success).toBe(false);
  });

  it("still marshals plain objects, null-prototype objects and Uint8Array subclasses", () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(marshallValue({ a: 1 })).toEqual({ success: true, data: { M: { a: { N: "1" } } } });
    expect(marshallValue(bare)).toEqual({ success: true, data: { M: { a: { N: "1" } } } });
    expect(marshallValue(new Uint8Array([1]))).toMatchObject({ success: true });
  });

  it("put through a raw adapter returns a marshalling error and writes nothing", async () => {
    const withDate = defineEntity({
      name: "WithDate",
      schema: z.object({ id: z.string(), createdAt: z.date() }),
      table: usersTable,
      partitionKey: "ITEM#{{id}}",
      sortKey: "META",
    });
    const adapter = createRawMockAdapter();

    const result = await executePut(withDate, adapter, { id: "1", createdAt: new Date() });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("marshalling");
    expect(adapter.putItem).not.toHaveBeenCalled();
  });
});

describe("PUT-1: sparse GSIs", () => {
  const sparseTable = defineTable({
    tableName: "SparseTable",
    partitionKey: { name: "pk", definition: "pk" },
    sortKey: { name: "sk", definition: "sk" },
    indexes: {
      gsi1: {
        type: "GSI" as const,
        indexName: "GSI1",
        partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
        sortKey: { name: "gsi1sk", definition: "gsi1sk" },
      },
    },
  });
  // gsi1 is only populated for users who have both an email and a team.
  const entity = defineEntity({
    name: "SparseUser",
    schema: z.object({
      userId: z.string(),
      email: z.string().optional(),
      team: z.string().optional(),
    }),
    table: sparseTable,
    partitionKey: "USER#{{userId}}",
    sortKey: "PROFILE",
    indexes: { gsi1: { partitionKey: "EMAIL#{{email}}", sortKey: "TEAM#{{team}}" } },
  });

  it("put succeeds and omits the index attributes when all of an index template's fields are absent", async () => {
    const adapter = createMockAdapter();

    const result = await executePut(entity, adapter, { userId: "u1" });

    expect(result.success).toBe(true);
    const item = vi.mocked(adapter.putItem).mock.calls[0]![0].item;
    expect(item).toEqual({ userId: "u1", pk: "USER#u1", sk: "PROFILE" });
  });

  it("put writes the index attributes when the fields are present", async () => {
    const adapter = createMockAdapter();

    await executePut(entity, adapter, { userId: "u1", email: "a@b.c", team: "red" });

    expect(vi.mocked(adapter.putItem).mock.calls[0]![0].item).toMatchObject({
      gsi1pk: "EMAIL#a@b.c",
      gsi1sk: "TEAM#red",
    });
  });

  it("put still fails when only some of an index template's fields are present", async () => {
    const adapter = createMockAdapter();

    const result = await executePut(entity, adapter, { userId: "u1", email: "a@b.c" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
      expect(result.error.message).toContain('Index "gsi1"');
      expect(result.error.message).toContain('"team"');
    }
    expect(adapter.putItem).not.toHaveBeenCalled();
  });

  it("batchWrite and transactWrite apply the same sparse rule", async () => {
    const adapter = createMockAdapter();

    const batch = await executeBatchWrite(adapter, [
      { type: "put", entity, data: { userId: "u1" } } as BatchWriteRequestItem,
    ]);
    const transact = await executeTransactWrite(adapter, [
      { type: "put", entity, data: { userId: "u2" } } as TransactWriteRequestItem,
    ]);

    expect(batch.success).toBe(true);
    expect(transact.success).toBe(true);
    const batchItem = vi.mocked(adapter.batchWriteItem).mock.calls[0]![0][0]!.requests[0]!;
    const transactItem = vi.mocked(adapter.transactWriteItems).mock.calls[0]![0][0]!;
    expect(batchItem).toMatchObject({ type: "put", item: { pk: "USER#u1" } });
    expect(transactItem).toMatchObject({ type: "put", item: { pk: "USER#u2" } });
    for (const item of [
      (batchItem as { item: Record<string, unknown> }).item,
      (transactItem as { item: Record<string, unknown> }).item,
    ]) {
      expect(item).not.toHaveProperty("gsi1pk");
      expect(item).not.toHaveProperty("gsi1sk");
    }
  });
});

describe("PUT-2: generated attributes overwriting schema fields", () => {
  const DAY = 60 * 60 * 24;
  // Schema fields named like the table's key, index and TTL attributes.
  const clashing = defineEntity({
    name: "Clashing",
    schema: z.object({
      userId: z.string(),
      email: z.string(),
      pk: z.string().optional(),
      gsi1pk: z.string().optional(),
      expiresAt: z.number().optional(),
    }),
    table: usersTable,
    partitionKey: "USER#{{userId}}",
    sortKey: "PROFILE",
    indexes: { gsi1: { partitionKey: "EMAIL#{{email}}", sortKey: "USER#{{userId}}" } },
    ttl: { defaultTtlSeconds: 30 * DAY, autoUpdateTtlSeconds: 30 * DAY },
  });
  const base = { userId: "u1", email: "a@b.c" };

  it("reports a collision when a schema field shares the partition/sort key attribute name", async () => {
    const adapter = createMockAdapter();

    const result = await executePut(clashing, adapter, { ...base, pk: "my-own-value" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("key");
      expect(result.error.message).toContain('Item field "pk"');
    }
    expect(adapter.putItem).not.toHaveBeenCalled();
  });

  it("reports a collision when a schema field shares a GSI key attribute name", async () => {
    const adapter = createMockAdapter();

    const result = await executePut(clashing, adapter, { ...base, gsi1pk: "my-own-value" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('Item field "gsi1pk"');
  });

  it("allows a field that already holds the generated key value (e.g. an item read back)", async () => {
    const adapter = createMockAdapter();

    const result = await executePut(clashing, adapter, { ...base, pk: "USER#u1" });

    expect(result.success).toBe(true);
  });

  it("does not overwrite a caller-supplied TTL attribute value", async () => {
    const adapter = createMockAdapter();

    const result = await executePut(clashing, adapter, { ...base, expiresAt: 1234 });

    expect(result.success).toBe(true);
    expect(vi.mocked(adapter.putItem).mock.calls[0]![0].item["expiresAt"]).toBe(1234);
  });

  it("still fills in the default TTL when the caller supplies none", async () => {
    const adapter = createMockAdapter();
    const before = Math.floor(Date.now() / 1000);

    await executePut(clashing, adapter, base);

    const ttl = vi.mocked(adapter.putItem).mock.calls[0]![0].item["expiresAt"] as number;
    expect(ttl).toBeGreaterThanOrEqual(before + 30 * DAY);
  });

  it("update doesn't add an auto-TTL action when the update already sets the TTL attribute", async () => {
    const adapter = createMockAdapter();

    const result = await executeUpdate(clashing, adapter, base, (b) => b.set("expiresAt", 1234));

    expect(result.success).toBe(true);
    const call = vi.mocked(adapter.updateItem).mock.calls[0]![0];
    expect(call.updateExpression).toBe("SET #u0 = :u0");
    expect(call.expressionAttributeValues).toEqual({ ":u0": 1234 });
  });
});

describe("TTL-4: batchWrite and transactWrite default TTL", () => {
  it("put requests in batchWrite and transactWrite get the default TTL, like put", async () => {
    const adapter = createMockAdapter();
    const before = Math.floor(Date.now() / 1000);

    await executeBatchWrite(adapter, [
      { type: "put", entity: userEntity, data: validUser } as BatchWriteRequestItem,
    ]);
    await executeTransactWrite(adapter, [
      { type: "put", entity: userEntity, data: validUser } as TransactWriteRequestItem,
    ]);

    const batchItem = vi.mocked(adapter.batchWriteItem).mock.calls[0]![0][0]!.requests[0]! as {
      item: Record<string, unknown>;
    };
    const transactItem = vi.mocked(adapter.transactWriteItems).mock.calls[0]![0][0]! as {
      item: Record<string, unknown>;
    };
    for (const item of [batchItem.item, transactItem.item]) {
      expect(item["expiresAt"] as number).toBeGreaterThanOrEqual(before + 60 * 60 * 24 * 30);
    }
  });
});

describe("BAT-1: multiple entities on one table in BatchGet", () => {
  // A second entity on the same table as userEntity (single-table design).
  const orderEntity = defineEntity({
    name: "Order",
    schema: z.object({ userId: z.string(), orderId: z.string(), total: z.number() }),
    table: usersTable,
    partitionKey: "USER#{{userId}}",
    sortKey: "ORDER#{{orderId}}",
  });
  const userItem = { pk: "USER#u1", sk: "PROFILE", userId: "u1", name: "Ann", email: "a@b.c" };
  const orderItem = { pk: "USER#u1", sk: "ORDER#o1", userId: "u1", orderId: "o1", total: 42 };

  it("applies each entity's projection to its own keys", async () => {
    const adapter = createMockAdapter();
    vi.mocked(adapter.batchGetItem).mockResolvedValueOnce({
      responses: { UsersTable: [orderItem, userItem] },
      unprocessedKeys: [],
    });

    const result = await executeBatchGet(adapter, [
      { entity: userEntity, keys: [{ userId: "u1" }], projection: ["name"] },
      { entity: orderEntity, keys: [{ userId: "u1", orderId: "o1" }], projection: ["total"], consistentRead: true },
    ]);

    // One request for the table: the union of projections plus key attributes,
    // consistent because one entity asked for it.
    const tableRequest = vi.mocked(adapter.batchGetItem).mock.calls[0]![0][0]!;
    expect(Object.values(tableRequest.expressionAttributeNames ?? {})).toEqual(["name", "total", "pk", "sk"]);
    expect(tableRequest.consistentRead).toBe(true);
    // Each entity sees only what it asked for.
    expect(result).toEqual({
      success: true,
      data: { responses: { User: [{ name: "Ann" }], Order: [{ total: 42 }] } },
    });
  });

  it("groups returned items under the entity that requested them", async () => {
    const adapter = createMockAdapter();
    vi.mocked(adapter.batchGetItem).mockResolvedValueOnce({
      responses: { UsersTable: [orderItem, userItem] },
      unprocessedKeys: [],
    });

    const result = await executeBatchGet(adapter, [
      { entity: userEntity, keys: [{ userId: "u1" }] },
      { entity: orderEntity, keys: [{ userId: "u1", orderId: "o1" }], projection: ["total"] },
    ]);

    // One entity wants full items, so the table request has no projection.
    expect(vi.mocked(adapter.batchGetItem).mock.calls[0]![0][0]!.projectionExpression).toBeUndefined();
    expect(result).toEqual({
      success: true,
      data: { responses: { User: [userItem], Order: [{ total: 42 }] } },
    });
  });

  it("matches items to entities with a raw adapter too", async () => {
    const adapter = createRawMockAdapter();
    const marshal = (item: Record<string, unknown>) => {
      const m = marshallItem(item);
      if (!m.success) throw m.error;
      return m.data;
    };
    vi.mocked(adapter.batchGetItem).mockResolvedValueOnce({
      responses: { UsersTable: [marshal(orderItem), marshal(userItem)] },
      unprocessedKeys: [],
    });

    const result = await executeBatchGet(adapter, [
      { entity: userEntity, keys: [{ userId: "u1" }] },
      { entity: orderEntity, keys: [{ userId: "u1", orderId: "o1" }] },
    ]);

    expect(result).toEqual({
      success: true,
      data: { responses: { User: [userItem], Order: [orderItem] } },
    });
  });
});

describe("BAT-2: BatchWrite partial failure", () => {
  // 30 puts: chunk 1 holds requests 0-24, chunk 2 holds 25-29.
  const requests = Array.from(
    { length: 30 },
    (_, i): BatchWriteRequestItem => ({
      type: "put",
      entity: userEntity,
      data: { ...validUser, userId: `u${i}` },
    }),
  );
  const userIdsOf = (items: readonly BatchWriteRequestItem[]): string[] =>
    items.map((r) => (r as { data: { userId: string } }).data.userId);
  const noDelay = { retryOptions: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 } };

  it("the error identifies the items that were not written when a later chunk fails", async () => {
    const adapter = createMockAdapter();
    vi.mocked(adapter.batchWriteItem)
      .mockResolvedValueOnce({ unprocessedItems: [] })
      .mockRejectedValueOnce(new Error("throttled"));

    const result = await executeBatchWrite(adapter, requests);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("throttled");
      expect(userIdsOf(result.error.unprocessed)).toEqual(["u25", "u26", "u27", "u28", "u29"]);
    }
  });

  it("the error identifies the items still unprocessed after retries run out", async () => {
    // DynamoDB keeps returning u3 and u7 from chunk 1 as unprocessed.
    const stuck = (adapter: ReturnType<typeof createMockAdapter>) =>
      vi.mocked(adapter.batchWriteItem).mockImplementation(async (batch) => ({
        unprocessedItems: batch.map((b) => ({
          tableName: b.tableName,
          requests: b.requests.filter((r) => {
            const pk = r.type === "put" ? r.item["pk"] : undefined;
            const value = typeof pk === "object" && pk !== null ? (pk as { S: string }).S : pk;
            return value === "USER#u3" || value === "USER#u7";
          }),
        })).filter((b) => b.requests.length > 0),
      }));

    for (const adapter of [createMockAdapter(), createRawMockAdapter()]) {
      stuck(adapter);
      const result = await executeBatchWrite(adapter, requests, noDelay);

      expect(result.success).toBe(false);
      if (!result.success) {
        // The stuck items, plus all of chunk 2, which was never sent.
        expect(userIdsOf(result.error.unprocessed)).toEqual([
          "u3", "u7", "u25", "u26", "u27", "u28", "u29",
        ]);
      }
    }
  });

  it("lists every request when the batch fails before anything is sent", async () => {
    const adapter = createMockAdapter();
    const invalid = [
      ...requests.slice(0, 2),
      { type: "put", entity: userEntity, data: { userId: "bad" } } as BatchWriteRequestItem,
    ];

    const result = await executeBatchWrite(adapter, invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation");
      expect(result.error.unprocessed).toEqual(invalid);
    }
    expect(adapter.batchWriteItem).not.toHaveBeenCalled();
  });
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

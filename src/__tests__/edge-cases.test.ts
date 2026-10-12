/**
 * Pending regression tests for the High-severity entries in TODO/EDGE-CASES.md.
 *
 * Each `describe` is named after a stable entry ID. When fixing an entry,
 * replace its `it.todo` cases with real tests (or move them next to the
 * operation's own tests) and move the entry to "Resolved" in EDGE-CASES.md.
 */

import { describe, it } from "vitest";

describe("EXP-1: attribute names with non-word characters", () => {
  it.todo("compileUpdateActions produces valid placeholders for names containing '-', '.' or spaces");
  it.todo("query and scan projections alias names like 'user-id' with valid placeholders");
  it.todo("removeTtl aliases a TTL attribute name containing '-' with a valid placeholder");
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

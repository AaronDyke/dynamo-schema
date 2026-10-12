# Edge Cases

Known edge cases, surprising behaviours and boundary conditions in the library, with the fix for each.

- **Verified against:** commit `9899d04` (1.0.0 release)
- **Last verified:** 2026-10-12
- **Keep it current:** when a fix lands, move its entry to [Resolved](#resolved) and record the PR. When you add an entry, include a reproduction, and add an `it.todo` (or a failing test) to `src/__tests__/edge-cases.test.ts` under a `describe` named after the entry ID; the fix turns it into a real test.

## Severity rubric

| Severity | Meaning |
|----------|---------|
| **High** | Silent data corruption or loss, wrong results with no error, or a common, legitimate input that cannot work at all. |
| **Medium** | Fails with a late or misleading error (usually an AWS `ValidationException` instead of a library `Result` error), or an exception escapes the `Result` boundary. |
| **Low** | Surprising but harmless behaviour, or behaviour that only needs documenting. |

Entry IDs are stable. Never renumber them; retire an ID by moving its entry to [Resolved](#resolved).

---

## Summary

| ID | Issue | Severity |
|----|-------|----------|
| [KEY-6](#key-6-readme-says-a-bare-field-name-is-a-key-template) | README says a bare field name (`"userId"`) is a key template; it's a static literal | **High** |
| [EXP-2](#exp-2-user-supplied-expressionnames--expressionvalues-can-overwrite-generated-aliases) | User `expressionNames`/`expressionValues` can overwrite generated aliases | **High** |
| [EXP-3](#exp-3-filter-paths-with-dots-target-a-literal-top-level-attribute) | Filter paths with dots silently target a literal top-level attribute | **High** |
| [KEY-1](#key-1-field-values-containing-a-template-delimiter-corrupt-extraction) | Field values containing a delimiter corrupt key extraction | **High** |
| [MAR-1](#mar-1-date-map-and-class-instances-marshal-to-an-empty-map) | `Date`, `Map` and class instances marshal to an empty map | **High** |
| [PUT-1](#put-1-sparse-gsis-are-impossible) | Sparse GSIs are impossible: a missing index field fails the whole put | **High** |
| [PUT-2](#put-2-key-index-and-ttl-attributes-silently-overwrite-schema-fields) | Key, index and TTL attributes silently overwrite schema fields | **High** |
| [BAT-1](#bat-1-multiple-entities-on-one-table-are-merged-in-batchget) | BatchGet merges results and settings for entities sharing a table | **High** |
| [BAT-2](#bat-2-batchwrite-partial-failure-reports-no-progress) | BatchWrite returns an error after earlier chunks were already written | **High** |
| [BAT-3](#bat-3-entity-name-collisions-in-batchgetresult) | Entities with the same `name` collide in `BatchGetResult` | **High** |
| [HOOK-1](#hook-1-hooks-are-bypassed-by-batch-transaction-query-and-scan) | Hooks are bypassed by batch, transaction, query and scan | **High** |
| [UPD-1](#upd-1-overlapping-paths-in-one-update) | Overlapping paths in one update are only rejected by AWS | Medium |
| [UPD-2](#upd-2-add--delete-accept-any-value-type) | `add` / `delete` accept any value type | Medium |
| [UPD-3](#upd-3-update-values-are-never-schema-validated) | Update values are never schema-validated | Medium |
| [TXW-1](#txw-1-transactwrite-does-not-validate-empty-updates) | TransactWrite doesn't reject empty update expressions | Medium |
| [TXW-2](#txw-2-no-100-item--4-mb-pre-check) | TransactWrite has no 100-item / 4 MB pre-check | Medium |
| [TXW-3](#txw-3-no-auto-ttl-refresh-in-transactional-updates) | No auto-TTL refresh in transactional updates | Medium |
| [TXW-4](#txw-4-two-operations-on-the-same-item) | Two operations on the same item are only rejected by AWS | Low |
| [MAR-2](#mar-2-set-element-types-are-not-checked) | Set element types are not checked | Medium |
| [MAR-3](#mar-3-number-range-and-precision-are-not-checked) | Number range and precision are not checked | Medium |
| [MAR-4](#mar-4-circular-references-overflow-the-stack) | Circular references overflow the stack | Medium |
| [MAR-5](#mar-5-undefined-is-dropped-at-the-root-but-stored-as-null-when-nested) | `undefined` is dropped at the root but stored as `NULL` when nested | Medium |
| [MAR-6](#mar-6-sets-containing-an-empty-string-or-empty-binary) | Sets containing `""` or an empty binary pass through | Medium |
| [BAT-4](#bat-4-duplicate-keys-in-one-batch-are-rejected-by-aws) | Duplicate keys in a batch are only rejected by AWS | Medium |
| [QRY-1](#qry-1-sortkeycondition-silently-ignored-without-a-sort-key) | `sortKeyCondition` is silently ignored when there is no sort key | Medium |
| [QRY-2](#qry-2-limit-and-pagination-semantics) | `limit` applies before the filter; a call returns a single page | Medium |
| [QRY-3](#qry-3-limit-0-or-negative) | `limit` ≤ 0 is passed through to AWS | Low |
| [QRY-4](#qry-4-reversed-between-bounds) | Reversed `between` bounds silently return nothing | Low |
| [QRY-5](#qry-5-sort-key-values-are-not-templated) | Sort-key condition values are not templated | Low |
| [QRY-6](#qry-6-isattributemap-inspects-only-the-first-value) | `isAttributeMap` inspects only the first value of `startKey` | Low |
| [BAT-5](#bat-5-batchget-projection-omits-key-attributes) | BatchGet projection omits key attributes | Low |
| [KEY-2](#key-2-empty-string-key-or-key-field) | Empty-string keys and key fields are not rejected | Medium |
| [KEY-3](#key-3-malformed-placeholders-are-treated-as-literals) | Malformed placeholders (`{{}}`, `{{ id }}`) are treated as literals | Low |
| [KEY-4](#key-4-duplicate-field-in-one-template) | A duplicate field in one template is not checked on extraction | Low |
| [KEY-5](#key-5-non-string-field-values-are-stringified) | Non-string key field values are stringified (`false` → `"false"`) | Low |
| [TTL-1](#ttl-1-autoupdatettlseconds-without-a-table-ttl) | `autoUpdateTtlSeconds` without a table TTL silently does nothing | Medium |
| [TTL-2](#ttl-2-ttl-overflow-is-reported-as-a-marshalling-error) | TTL overflow is reported as a marshalling error | Low |
| [TTL-3](#ttl-3-very-short-ttl-windows) | Very short TTL windows are not checked | Low |
| [VAL-1](#val-1-a-throwing-schema-escapes-the-result-boundary) | A throwing or rejecting schema escapes the `Result` boundary | Medium |
| [HOOK-2](#hook-2-beforeput-output-is-not-re-validated) | `beforePut` output is not re-validated | Medium |
| [READ-1](#read-1-scan-returns-every-entity-in-the-table) | Scan returns every entity type in the table | Medium |
| [MAR-7](#mar-7-unmarshalled-numbers-are-always-number) | Unmarshalled numbers are always `number`, so `bigint` doesn't round-trip | Low |
| [EXP-4](#exp-4-needsalias-ignores-names-starting-with-a-digit) | `needsAlias` ignores names starting with a digit | Low |
| [PUT-3](#put-3-put-returns-the-locally-built-item) | `put` returns the locally built item, including key attributes | Low |

Open High-severity entries have pending `it.todo` tests in `src/__tests__/edge-cases.test.ts`, grouped by entry ID. Medium and Low entries have no regression tests yet.

---

## Expressions & aliasing

### EXP-2. User-supplied `expressionNames` / `expressionValues` can overwrite generated aliases
**Severity:** High · **Where:** query, scan, put, update, delete, transact-write (`{ ...generated, ...options.expressionNames }`)

**Behaviour:** User maps are spread last, so a user key that matches a generated alias wins. For example, a user `#f0` overrides the filter builder's `#f0`, and a user `#u0` overrides the update builder's first alias. The expression still compiles, but it reads or writes the **wrong attribute** with no error.

**Fix:** Detect overlapping keys while merging and return a `"validation"` error. Alternatively, give generated aliases a reserved prefix (such as `#__ds_`) that user aliases may not use. Until then, the README warns users not to use the `#u`/`#p`/`#f` + number forms.

### EXP-3. Filter paths with dots target a literal top-level attribute
**Severity:** High · **Where:** `src/operations/filter.ts`

**Behaviour:** Filter nodes map `#f{n}` → `path` as one name. `{ op: "eq", path: "address.city", ... }` therefore compares against a top-level attribute literally named `address.city`. The expression is valid, so the filter silently matches nothing. The typed builder limits `path` to `keyof T`, but raw `FilterNode` objects and string-keyed entities accept any string.

**Fix:** Support segmented paths (for example `["address", "city"]`, aliased `#f0.#f1`), or reject paths containing `.` and `[`. Update and projection names also treat a dot as part of the attribute name, which the README now documents; unlike filters, they don't let you write a nested path by accident.

### EXP-4. `needsAlias` ignores names starting with a digit
**Severity:** Low · **Where:** `needsAlias`, `buildExpressionAttributeNames` (exported utilities)

**Behaviour:** `needsAlias("1stPlace") === false`, but an unaliased name in an expression must start with a letter or `_`. No built-in operation is affected, because operations always alias every name. Only callers of the exported helpers are affected.

**Fix:** Change the check to `/^[A-Za-z_][A-Za-z0-9_]*$/` and treat a mismatch as needing an alias.

---

## Key templates

### KEY-1. Field values containing a template delimiter corrupt extraction
**Severity:** High · **Where:** `extractFieldsFromKey` (`src/keys/key-extractor.ts`)

**Behaviour:** Extraction looks for the **first** occurrence of the next literal (a non-greedy match). With template `{{orgId}}#{{userId}}`, the key `ORG#CHILD#u1` extracts as `{ orgId: "ORG", userId: "CHILD#u1" }`. There is no escaping mechanism, and building the key doesn't warn.

**Fix:** In `buildKeyValue`, reject field values that contain an adjacent literal delimiter, returning a `"key"` error. Document that delimiters must not appear in values.

### KEY-2. Empty-string key or key field
**Severity:** Medium · **Where:** `parseTemplate`, `buildKeyValue`

**Behaviour:** `parseTemplate("")` builds `""`, and `{ userId: "" }` passes the null/undefined guard (`USER#{{userId}}` → `"USER#"`). An empty key attribute is rejected by DynamoDB. An empty *component* is stored, but is almost certainly a bug. `extractFieldsFromKey` likewise returns `{ userId: "" }` for `"USER#"`.

**Fix:** Reject empty templates when the entity is defined. Reject empty field values in `buildKeyValue`, or make that configurable.

### KEY-3. Malformed placeholders are treated as literals
**Severity:** Low · **Where:** `TEMPLATE_REGEX` in `src/keys/template-parser.ts`

**Behaviour:** `{{}}` and `{{ userId }}` don't match `\{\{(\w+)\}\}`, so the whole template becomes a static literal (`isSimple: true`) that never interpolates.

**Fix:** After parsing, fail when the remaining literal text still contains `{{` or `}}`.

### KEY-4. Duplicate field in one template
**Severity:** Low · **Where:** `parseTemplate`, `extractFieldsFromKey`

**Behaviour:** `{{id}}#{{id}}` records `fields: ["id", "id"]`. Extracting `"a#b"` returns `{ id: "b" }`: the second value overwrites the first, and the mismatch goes undetected.

**Fix:** Reject duplicate fields when parsing, or check during extraction that repeated fields have equal values.

### KEY-5. Non-string field values are stringified
**Severity:** Low · **Where:** `buildKeyValue`

**Behaviour:** Values pass through `String()`, so `false` becomes `"false"`, `0` becomes `"0"`, and an object becomes `"[object Object]"`.

**Fix:** Accept only `string | number | bigint`, and return a `"key"` error for anything else.

### KEY-6. README says a bare field name is a key template
**Severity:** High · **Where:** README "Key definition formats" table, `parseTemplate`

**Behaviour:** The README lists `"userId"` as a "Simple field" format that "uses the field value directly (no `{{}}` needed)". The code doesn't do that: `parseTemplate` treats any string without `{{…}}` as a static literal (`isSimple: true`). An entity defined with `partitionKey: "userId"` writes every item with the key `"userId"`, so each put overwrites the previous item.

**Fix:** Either remove the README row (and point to `"{{userId}}"`), or make a bare name that matches a schema field act as a field reference. The second option is ambiguous with static values such as `"PROFILE"`, so removing the row is the safer choice.

---

## Marshalling

### MAR-1. `Date`, `Map` and class instances marshal to an empty map
**Severity:** High · **Where:** `marshallValue` → `marshallMap` (`src/marshalling/marshall.ts`)

**Behaviour:** Any non-array, non-Set object is passed to `Object.entries()`. `new Date()` and `new Map([["k", "v"]])` both become `{ M: {} }`, so **the data is discarded without error**. The same happens to `ArrayBuffer`, `URL` and most class instances.

**Fix:** Marshal only plain objects (`Object.getPrototypeOf(v) === Object.prototype || null`) and return an error for everything else. Optionally, convert `Date` to an ISO string by explicit opt-in.

### MAR-2. Set element types are not checked
**Severity:** Medium · **Where:** `marshallSet`

**Behaviour:** Only the first element picks the set type, and the rest are cast without checking: `new Set(["a", 1, true])` → `{ SS: ["a", 1, true] }`, and `new Set([1, "a"])` → `{ NS: ["1", "a"] }`. The values are not coerced. The result is an invalid payload that AWS rejects.

**Fix:** Check every element against the chosen type and return a `"marshalling"` error on a mismatch.

### MAR-3. Number range and precision are not checked
**Severity:** Medium · **Where:** `marshallValue`, `unmarshallValue`

**Behaviour:**
- **Marshalling:** Only non-finite numbers are rejected. `1e200` becomes `{ N: "1e+200" }`, outside DynamoDB's range (±1E-130 to ±9.99…E+125), and AWS rejects it.
- **Unmarshalling:** `Number()` keeps about 15–17 significant digits, while DynamoDB stores up to 38. Large IDs and high-precision decimals written by other clients are silently rounded.

**Fix:** Check the range when marshalling. When unmarshalling, offer a number mode (for example, return a `string` or `bigint` when the value doesn't round-trip exactly).

### MAR-4. Circular references overflow the stack
**Severity:** Medium · **Where:** `marshallMap`, `marshallList`

**Behaviour:** `obj.self = obj` recurses until `RangeError: Maximum call stack size exceeded`, which escapes the `Result` boundary. DynamoDB also limits nesting to 32 levels, which isn't enforced.

**Fix:** Track ancestors with a `WeakSet` (or a depth counter capped at 32) and return an error.

### MAR-5. `undefined` is dropped at the root but stored as `NULL` when nested
**Severity:** Medium · **Where:** `marshallItem` vs `marshallValue`

**Behaviour:** `{ a: undefined }` skips `a`, but `{ n: { a: undefined } }` stores `n.a` as `{ NULL: true }`, and `[undefined]` becomes `[{ NULL: true }]`. A round-trip turns nested `undefined` into `null`.

**Fix:** Skip `undefined` map entries at every depth, matching the AWS SDK's `removeUndefinedValues`. Decide and document the policy for lists.

### MAR-6. Sets containing an empty string or empty binary
**Severity:** Medium · **Where:** `marshallSet`

**Behaviour:** `new Set([""])` passes the empty-set guard and becomes `{ SS: [""] }`. DynamoDB rejects empty strings and empty binaries inside sets.

**Fix:** Reject empty elements in `marshallSet`.

### MAR-7. Unmarshalled numbers are always `number`
**Severity:** Low · **Where:** `unmarshallValue`

**Behaviour:** A `bigint` beyond `Number.MAX_SAFE_INTEGER` marshals exactly but comes back as an imprecise `number`. This is the read-side half of MAR-3.

**Fix:** Covered by the number-mode option in MAR-3.

---

## Put

### PUT-1. Sparse GSIs are impossible
**Severity:** High · **Where:** `executePut` index key loop (`src/operations/put.ts`)

**Behaviour:** For every index the entity declares, `buildKeyValue` runs, and a missing field returns a `"key"` error that aborts the put. An item that should *not* appear in a GSI (the standard sparse-index pattern) cannot be written.

**Fix:** When an index template's fields are absent, skip that index's attributes, and keep failing on partially present fields. Optionally, add a per-index `sparse: true` flag to make this explicit.

### PUT-2. Key, index and TTL attributes silently overwrite schema fields
**Severity:** High · **Where:** `executePut`

**Behaviour:** After validation, `itemData[pkName]`, `itemData[skName]`, the index key attributes and `itemData[ttlAttributeName]` are assigned unconditionally. A schema field with the same name (`pk`, `gsi1pk`, `expiresAt`, …) is replaced, and the returned item shows the overwritten value.

**Fix:** Detect name collisions between schema output and generated attributes when the entity is defined, if the schema shape is known, or else at put time. For TTL, only inject when the caller didn't supply a value.

### PUT-3. `put` returns the locally built item
**Severity:** Low (by design) · **Where:** `executePut`

**Behaviour:** The return value is the locally assembled record (validated data plus key, index and TTL attributes), not data read back from DynamoDB. At runtime it contains key attributes that `InferOutput<S>` doesn't declare.

**Fix:** Document this. Consider stripping generated attributes from the returned value, or widening the return type.

---

## Update

### UPD-1. Overlapping paths in one update
**Severity:** Medium · **Where:** `compileUpdateActions`

**Behaviour:** `.set("name", "a").set("name", "b")`, or a `set` plus a `remove` on the same path, compiles fine. DynamoDB then rejects it: *"Two document paths overlap with each other"*. The earlier value doesn't silently "win".

**Fix:** Detect duplicate or overlapping paths during compilation and return a `"validation"` error. Alternatively, collapse repeated `set` calls on a path into the last one.

### UPD-2. `add` / `delete` accept any value type
**Severity:** Medium · **Where:** `createUpdateBuilder`

**Behaviour:** `add("name", "suffix")` type-checks because the value type is `T[K]`. AWS rejects it at call time.

**Fix:** Narrow the types: `add` only for `number` or `Set` keys, `delete` only for `Set` keys. Optionally, check at runtime too.

### UPD-3. Update values are never schema-validated
**Severity:** Medium · **Where:** `executeUpdate`, transact-write `"update"`

**Behaviour:** `put` validates through the schema, but update values go straight to DynamoDB. `set("age", "not a number" as any)` writes invalid data.

**Fix:** Validate each `set` value against the field's schema where the schema library allows it, or document the gap clearly.

---

## TransactWrite (`src/operations/transact-write.ts`)

### TXW-1. TransactWrite does not validate empty updates
**Severity:** Medium

**Behaviour:** `executeUpdate` returns a `"validation"` error for an empty expression. The transactional `"update"` branch sends `UpdateExpression: ""`, and the failure comes back as a generic `"dynamo"` error.

**Fix:** Apply the same empty-expression check, and include the request's index in the message.

### TXW-2. No 100-item / 4 MB pre-check
**Severity:** Medium

**Behaviour:** All items go to one `transactWriteItems` call. DynamoDB rejects more than 100 items, or more than 4 MB in total, and the library reports it as a generic `"dynamo"` error.

**Fix:** Check the item count up front and return a `"validation"` error.

### TXW-3. No auto-TTL refresh in transactional updates
**Severity:** Medium

**Behaviour:** `executeUpdate` injects the `autoUpdateTtlSeconds` refresh; the transactional `"update"` branch doesn't.

**Fix:** Extract the TTL-injection step from `update.ts` and reuse it here.

### TXW-4. Two operations on the same item
**Severity:** Low

**Behaviour:** No check. DynamoDB cancels the transaction with a `ValidationError` that is hard to trace back to the duplicate request.

**Fix:** Detect duplicate table+key pairs and return a `"validation"` error that names both request indexes.

---

## Batch operations

### BAT-1. Multiple entities on one table are merged in BatchGet
**Severity:** High · **Where:** `executeBatchGet` (`src/operations/batch-get.ts`)

**Behaviour:** `tableConfigs` is keyed by table name. The **first** request's `projection` and `consistentRead` apply to every entity on that table. `processResponses` assigns every returned item to the first matching entity name, so in a single-table design, `OrderEntity` items show up under `responses.User`.

**Fix:** Merge projections (a union) and OR together `consistentRead` for each table. Match each returned item to its entity by comparing its key attributes against the requested keys, or by an entity-type attribute.

### BAT-2. BatchWrite partial failure reports no progress
**Severity:** High · **Where:** `executeBatchWrite` (`src/operations/batch-write.ts`)

**Behaviour:** Chunks of 25 are written one after another. If chunk *n* throws, or still has unprocessed items after the retries, the function returns an error, but chunks 1 to *n*-1 are already committed. The error doesn't say which items were written and which weren't, so callers can't safely retry.

**Fix:** Attach `{ unprocessed, failedChunkIndex }` (or the list of written keys) to the error, so callers can resume.

### BAT-3. Entity name collisions in `BatchGetResult`
**Severity:** High

**Behaviour:** `responses` is keyed by `entity.name`. Two entities that share a `name` (even on different tables) have their results merged under one key.

**Fix:** Reject duplicate entity names within one `batchGet` call, or key the results by entity reference.

### BAT-4. Duplicate keys in one batch are rejected by AWS
**Severity:** Medium

**Behaviour:** Repeated keys in `BatchGetEntityRequest.keys`, and repeated put/delete targets in a BatchWrite, are sent as they are. DynamoDB rejects the whole request with *"Provided list of item keys contains duplicates"*. It doesn't merely waste capacity.

**Fix:** Deduplicate BatchGet keys automatically. For BatchWrite, return a `"validation"` error.

### BAT-5. BatchGet projection omits key attributes
**Severity:** Low

**Behaviour:** When a projection is given, key attributes are only returned if the caller lists them. Callers can't tell which requested key a returned item belongs to, and the BAT-1 fix (matching items back to entities by key) needs them.

**Fix:** Always add the table's key attributes to BatchGet projections.

---

## Query & scan

### QRY-1. `sortKeyCondition` silently ignored without a sort key
**Severity:** Medium · **Where:** `buildKeyConditionExpression` (`src/operations/query.ts`)

**Behaviour:** If the table, or the queried index, has no sort key, a supplied `sortKeyCondition` is silently dropped, and the caller gets unfiltered results.

**Fix:** Return a `"validation"` error.

### QRY-2. `limit` and pagination semantics
**Severity:** Medium (documentation)

**Behaviour:** `limit` caps items *evaluated*, before the filter runs, and each call returns one page of at most 1 MB. A filtered query with `limit: 10` can return 0–10 items and a `lastKey`.

**Fix:** Document this in the README. Consider adding a paginating helper (for example `queryAll` or an async iterator).

### QRY-3. `limit: 0` or negative
**Severity:** Low

**Behaviour:** Passed through to AWS, which rejects it with a `ValidationException`.

**Fix:** Check for a positive integer up front.

### QRY-4. Reversed `between` bounds
**Severity:** Low

**Behaviour:** `{ between: ["Z", "A"] }` is valid syntax and silently returns 0 items.

**Fix:** Return a `"validation"` error when `lo > hi` in string comparison order.

### QRY-5. Sort-key values are not templated
**Severity:** Low (documentation)

**Behaviour:** The partition key goes through the entity's template, but `sortKeyCondition` values are raw strings. Callers must hand-write `"ORDER#2024"` and keep it in sync with the template.

**Fix:** Document this. Consider adding a templated form (for example `{ beginsWith: { orderDate: "2024" } }`).

### QRY-6. `isAttributeMap` inspects only the first value
**Severity:** Low · **Where:** `isAttributeMap` (`src/operations/query.ts`)

**Behaviour:** For raw adapters, `startKey` is re-marshalled unless its first value looks like `{ S | N | … : x }`. A plain key whose first value is itself an object with one type-like key is misread as already marshalled.

**Fix:** Check every value, or require callers to pass the `lastKey` from a previous result without changing it.

### READ-1. Scan returns every entity in the table
**Severity:** Medium · **Where:** `executeScan` (`src/operations/scan.ts`)

**Behaviour:** In a single-table design, `UserEntity.scan()` returns orders, products and so on, all cast to `InferOutput<S>`.

**Fix:** Add an optional entity-type discriminator to entities, and filter on it automatically (or validate each item). At minimum, document this.

---

## TTL

### TTL-1. `autoUpdateTtlSeconds` without a table TTL
**Severity:** Medium

**Behaviour:** If the table has no `ttl` config, the entity's `autoUpdateTtlSeconds` (and `defaultTtlSeconds`) are silently ignored on every write.

**Fix:** Return an error from `defineEntity` (or table validation) when an entity sets TTL options and its table has no TTL.

### TTL-2. TTL overflow is reported as a marshalling error
**Severity:** Low

**Behaviour:** A huge `defaultTtlSeconds` produces an out-of-range number. Today only `Infinity` is caught, and only by the marshaller (`"marshalling"` error). Finite but huge values are only rejected by AWS (see MAR-3).

**Fix:** Check that TTL seconds are positive, safe integers when the entity is defined.

### TTL-3. Very short TTL windows
**Severity:** Low (documentation)

**Behaviour:** `defaultTtlSeconds: 1` is accepted. DynamoDB deletes expired items lazily (usually within a few days), and expired items stay readable until then.

**Fix:** Document that TTL is not precise, and that reads should filter on the TTL attribute if precision matters.

---

## Hooks & validation

### HOOK-1. Hooks are bypassed by batch, transaction, query and scan
**Severity:** High · **Where:** hooks run only in `put.ts`, `get.ts`, `update.ts` and `delete.ts`

**Behaviour:** `beforePut`, `beforeUpdate` and `beforeDelete` don't run for `batchWrite` or `transactWrite`, and `afterGet` doesn't run for `batchGet`, `transactGet`, `query` or `scan`. Invariants enforced in hooks (`updatedAt` stamping, auditing, redaction) silently fail to apply.

**Fix:** Run hooks in every operation (with the same `skipHooks` opt-out). If that isn't done, document exactly which operations run hooks.

### HOOK-2. `beforePut` output is not re-validated
**Severity:** Medium · **Where:** `executePut`

**Behaviour:** Schema validation runs **before** `beforePut`, so whatever the hook returns is written without validation.

**Fix:** Validate after the hook, or validate both before and after.

### VAL-1. A throwing schema escapes the `Result` boundary
**Severity:** Medium · **Where:** `validate` (`src/validation/validate.ts`)

**Behaviour:** `await schema["~standard"].validate(value)` isn't wrapped in `try`/`catch`. A schema that throws or rejects produces an exception or rejected promise instead of an error `Result`.

**Fix:** Wrap the call and return a `"validation"` error that keeps the original error as `cause`.

---

## Resolved

| ID (old §) | Issue | Resolved by |
|------------|-------|-------------|
| §6.1 | GSI query used the table's sort key name | `dc25093`: `resolveQueryKeyInfo` resolves the index's own key names |
| §7.2 | Unprocessed batch items discarded after one retry | `b436a0b`: exponential-backoff retry, and an error once retries are exhausted |
| EXP-1 | Attribute names containing `-`, `.`, spaces and similar produced invalid placeholders in update, projection (query, scan, get, transactGet, batchGet) and remove-ttl expressions. Includes the alias half of BAT-5. | Positional placeholders (`#u0`/`:u0`, `#p0`, `#ttl`) and a shared `buildProjection` helper. Covered by the EXP-1 tests in `src/__tests__/edge-cases.test.ts`. |
| ENT-1 | `defineEntity` without a `sortKey` didn't type-check: the sort-key check distributed over the default `SK = never`, collapsing `config` to `never`. The same bug in `EntityKeyFields` made the key input type `{}` for such entities, so `get({})` type-checked. | Both conditionals wrapped as `[SK] extends [never]`. Covered by the ENT-1 tests in `src/__tests__/edge-cases.test.ts` (type-level checks run under `npm run type-check`). |
| §6.6 (partly) | Raw filter strings aren't aliased | `8af1103`: use the filter builder (`FilterNode` or a callback), which aliases automatically. Raw strings are still passed through as they are, by design. |

## Expected behaviour (document in the README; not defects)

- `executeBatchWrite(adapter, [])` returns `ok(undefined)` and `executeBatchGet(adapter, [])` returns `ok({ responses: {} })`, with no AWS call.
- `get` returns `ok(undefined)` when the item doesn't exist; callers must check for `undefined`.
- Validation fails when a schema returns `issues`, even if it also returns `value` (this follows the StandardSchemaV1 spec).
- An unrecognised `AttributeValue` type returns an `"Unrecognized AttributeValue type"` error.
- TTL attribute names that are reserved words (such as `ttl`) need aliasing in raw condition strings; builders alias them automatically.

## Retired entries

These entries from the previous version were dropped as incorrect:

- **§3.6 `NULL: false`:** DynamoDB rejects `NULL: false`, so it can never be read back.
- **§3.5 `{ N: "1e309" }` is valid:** it isn't; DynamoDB's maximum is about 1E+125. The real number issues are in MAR-3.
- **§10.1 as an operation bug:** operations always alias names; only the exported helper is affected (EXP-4).

# Edge Cases

This document catalogs known edge cases, surprising behaviours, and boundary conditions across the library. Cases are grouped by subsystem. Each entry notes the current behaviour and, where applicable, the risk or recommended mitigation.

---

## 1. Key Template Parser (`src/keys/template-parser.ts`)

### 1.1 Empty string template
**Input:** `parseTemplate("")`
**Current behaviour:** `isSimple: true`, single literal segment with value `""`. `buildKeyValue` returns `""` — an empty string key.
**Risk:** DynamoDB rejects empty-string partition key values with a service-level error. The library emits no library-level error; the failure surfaces only when the AWS call is made.

### 1.2 Empty placeholder `{{}}`
**Input:** `parseTemplate("USER#{{}}")`
**Current behaviour:** The regex `\{\{(\w+)\}\}` requires at least one word character, so `{{}}` is not matched. The entire string is treated as a static literal, **not** a field reference. No error is raised.
**Risk:** Silent misconfiguration — the template compiles correctly but never interpolates a field.

### 1.3 Whitespace inside placeholder `{{ userId }}`
**Input:** `parseTemplate("USER#{{ userId }}")` (space inside braces)
**Current behaviour:** Same as 1.2 — `\w+` does not match whitespace, so `{{ userId }}` is silently treated as a literal.
**Risk:** Silent misconfiguration.

### 1.4 Duplicate field names in one template
**Input:** `parseTemplate("{{id}}#{{id}}")`
**Current behaviour:** `fields` array contains `["id", "id"]` (duplicate). Key building works (both segments use the same value). Key extraction overwrites the first extracted value with the second — effectively returning a single `{ id: "..." }` result.
**Risk:** The duplication is accepted silently; extraction produces a single field as if there were no duplicate.

### 1.5 Field value containing the delimiter string
**Input:** Template `"{{orgId}}#{{userId}}"`, `orgId = "ORG#CHILD"`
**Built key:** `"ORG#CHILD#userId123"`
**Extraction:** `indexOf("#", 0)` finds the `#` at position 3 (inside `orgId`'s value), so `orgId` is extracted as `"ORG"` instead of `"ORG#CHILD"`.
**Risk:** Silent data corruption when field values happen to contain the delimiter. There is no way to escape delimiters. Use delimiters that cannot appear in field values (e.g. `::` instead of `#` if values may contain `#`).

### 1.6 Field value is an empty string `""`
**Input:** `buildKeyValue(parseTemplate("USER#{{userId}}"), { userId: "" })`
**Current behaviour:** Empty string passes the `null`/`undefined` guard; the built key is `"USER#"`.
**Risk:** If this is a partition key, DynamoDB rejects empty-string key components. If used as a sort key component, it stores and retrieves correctly but is probably unintended.

### 1.7 Field value that is `false` or `0`
**Input:** `buildKeyValue(template, { flag: false })`
**Current behaviour:** Both pass the null/undefined guard and are coerced with `String()` — `"false"` and `"0"` are stored in the key.
**Risk:** Likely intentional for number fields used in keys, but surprising for booleans. Consider documenting that only string-representable values should be used in key templates.

---

## 2. Key Extractor (`src/keys/key-extractor.ts`)

### 2.1 Delimiter appears multiple times in the key value
**Template:** `"{{orgId}}#USER#{{userId}}"`, key `"ACME#CORP#USER#u1"`
**Current behaviour:** `indexOf("USER#", 0)` finds the first occurrence of the literal after position 0. Since `"ACME#CORP"` doesn't contain `"USER#"`, the match falls at position 10 — giving `orgId = "ACME#CORP"`. This case works correctly.
**However:** With template `"{{a}}#{{b}}"` and key `"x#y#z"`, `indexOf("#", 0)` matches at position 1 (the first `#`), giving `a = "x"`, `b = "y#z"`. This is **greedy-last**: the *first* occurrence of the literal is used, so `a` gets the shortest possible match. Consumers expecting the last `#` to be the delimiter will be surprised.

### 2.2 Key shorter than the template prefix
**Template:** `"USER#{{userId}}"`, key `"USER"` (missing the `#`)
**Current behaviour:** `startsWith("USER#", 0)` fails → error: `Key value "USER" does not match template pattern at position 0`.
**Risk:** Well-handled, but the error message points to position 0 even though the actual mismatch is at the end of the string.

### 2.3 Field value is empty string in extraction result
**Template:** `"USER#{{userId}}"`, key `"USER#"`
**Current behaviour:** Extraction succeeds and returns `{ userId: "" }`.
**Risk:** An empty userId is probably invalid data, but no validation is applied on the extracted value.

---

## 3. Marshalling (`src/marshalling/marshall.ts`)

### 3.1 Mixed-type `Set`
**Input:** `new Set(["a", 1, true])`
**Current behaviour:** `marshallSet` inspects only the **first** element to determine the set type. First element `"a"` → `SS`. The remaining elements (number `1`, boolean `true`) are coerced to strings via JavaScript's implicit `String()`. The result is `{ SS: ["a", "1", "true"] }` — silently converting non-strings.
**Risk:** Data is stored as `["a", "1", "true"]` when the original set was mixed. Round-trip fidelity is lost.

### 3.2 `Set` containing empty string
**Input:** `new Set([""])`
**Current behaviour:** `set.size === 1` so the empty-set guard is bypassed. Marshalled as `{ SS: [""] }`.
**Risk:** DynamoDB does **not** allow empty strings inside String Sets (SS). The error surfaces at the service level with a generic `ValidationException`, not as a library-level marshalling error.

### 3.3 Circular object references
**Input:** `const obj: Record<string, unknown> = {}; obj.self = obj;`
**Current behaviour:** `marshallMap` recurses into `obj.self`, which recurses into `obj.self.self`, etc. Results in a JavaScript `Maximum call stack size exceeded` exception rather than a graceful `Result` error.
**Risk:** Uncaught exception escapes the `Result` boundary.

### 3.4 `BigInt` → `Number` precision loss on round-trip
**Marshal:** `BigInt(Number.MAX_SAFE_INTEGER + 1)` → `{ N: "9007199254740992" }`
**Unmarshal:** `Number("9007199254740992")` → `9007199254740992` (imprecise in JS `Number`).
**Risk:** BigInt values beyond `Number.MAX_SAFE_INTEGER` are marshalled correctly but unmarshalled as imprecise `number`. The round-trip is lossy with no warning.

### 3.5 Large numeric string in `N` type produces `Infinity` on unmarshal
**Input from DynamoDB:** `{ N: "1e309" }` (valid in DynamoDB's number type)
**Current behaviour:** `Number("1e309")` → `Infinity`. The marshaller rejects `Infinity` as input, but the **unmarshaller** does not validate `N` strings retrieved from DynamoDB. An out-of-range number stored externally silently becomes `Infinity` in JavaScript.

### 3.6 `NULL: false` attribute value
**Input:** `{ NULL: false }` (uncommon but spec-legal)
**Current behaviour:** `getAttributeValueType` returns `"NULL"`, and the unmarshaller returns `null` regardless of the boolean value.
**Risk:** A `NULL: false` value is indistinguishable from `NULL: true` after unmarshalling.

### 3.7 `Date` objects are silently marshalled as empty maps
**Input:** `new Date("2024-01-01")`
**Current behaviour:** `Date` is an object, not an Array or Set, so it falls through to `marshallMap`. `Object.entries(new Date())` returns `[]` (Date's numeric properties are not enumerable). Result: `{ M: {} }`.
**Risk:** The date value is silently discarded. No error is raised. Always convert `Date` to a string or Unix timestamp before storing.

### 3.8 JavaScript `Map` objects are silently marshalled as empty maps
**Input:** `new Map([["key", "value"]])`
**Current behaviour:** `Object.entries(new Map(...))` returns `[]` (Map's entries are not own enumerable properties). Result: `{ M: {} }`.
**Risk:** All map data is silently discarded. Use plain objects or convert with `Object.fromEntries()` first.

### 3.9 `undefined` inside nested objects vs. top-level items
**Top level** (`marshallItem`): `{ a: undefined }` → `a` is **skipped** (not written to DynamoDB).
**Nested** (`marshallMap` via `marshallValue`): `{ nested: { a: undefined } }` → `nested.a` is marshalled as `{ NULL: true }` and stored in DynamoDB.
**Risk:** Inconsistent behaviour depending on nesting depth. `undefined` at the root is dropped; `undefined` inside a nested object becomes `null`.

---

## 4. Unmarshalling (`src/marshalling/unmarshall.ts`)

### 4.1 Unrecognised `AttributeValue` type
**Input:** An `AttributeValue` with a key that doesn't match any known type.
**Current behaviour:** Falls through the `switch` to the `default` case and returns `err(new Error("Unrecognized AttributeValue type"))`.
**Risk:** Well-handled for the library's known types, but if AWS adds a new type in the future, items using that type will fail to unmarshal.

---

## 5. Update Expression Builder (`src/operations/update.ts`)

### 5.1 Same attribute path set multiple times
**Input:** `builder.set("name", "John").set("name", "Jane")`
**Compiled expression:** `SET #s0_name = :s0_name, #s1_name = :s1_name` with `{ "#s0_name": "name", "#s1_name": "name" }`.
**Current behaviour:** DynamoDB applies both assignments (last one in the expression wins). Both succeed without error.
**Risk:** The earlier value is silently discarded. The user might expect an error on duplicate paths.

### 5.2 Nested attribute paths using dot notation
**Input:** `builder.set("address.city", "NYC")`
**Current behaviour:** `aliasAttributeName("s0_address.city")` = `"#s0_address.city"`, mapped to `"address.city"` as a **single** attribute name. DynamoDB would attempt to find a top-level attribute literally named `"address.city"`, not the nested `address → city` path.
**Risk:** The expression will not update the nested `city` field; it will attempt to set an attribute with a literal dot in its name (which doesn't exist). DynamoDB will either error or create an unexpected attribute. Nested paths require separate aliases: `#address.#city` with two entries in `ExpressionAttributeNames`.

### 5.3 `add` or `delete` used with non-Set / non-numeric values
**Input:** `builder.add("name", "suffix")` (string, not number or Set)
**Current behaviour:** The builder accepts any `T[K]` value; no type check is enforced for `add`/`delete` operations.
**Risk:** DynamoDB will throw a `ValidationException` at call time. The library provides no upfront validation.

### 5.4 `compileUpdateActions` with no actions produces empty expression string
**Current behaviour:** If all action arrays are empty, `clauses` is empty and `updateExpression: ""` is returned.
**Risk:** `executeUpdate` catches this (returns a `"validation"` error). However, `executeTransactWrite` does **not** validate for an empty update expression before calling DynamoDB — see §8.1.

---

## 6. Query Operation (`src/operations/query.ts`)

### 6.1 GSI query uses the table's sort key — not the GSI's sort key
**Scenario:** Entity is queried against a GSI (via `options.indexName`) that has a different sort key attribute than the table's main sort key.
**Current behaviour:** `buildKeyConditionExpression` uses `entity.table.sortKey.name` regardless of the index being queried.
**Risk:** The key condition expression references the wrong attribute when the index's sort key differs from the table's sort key. DynamoDB returns a `ValidationException`. There is no way to specify an index-specific sort key name through the current API.

### 6.2 `sortKeyCondition` silently ignored when table has no sort key
**Input:** Provide `sortKeyCondition` on an entity whose table has no sort key.
**Current behaviour:** The condition is silently dropped. The query runs with only the partition key condition.
**Risk:** The caller believes they are filtering by sort key but the filter is never applied. No warning or error is returned.

### 6.3 `between` with reversed bounds
**Input:** `{ between: ["Z", "A"] }`
**Current behaviour:** Generates `SK BETWEEN :skLo AND :skHi` — valid DynamoDB syntax. DynamoDB returns 0 results because no key satisfies `Z ≤ SK ≤ A`.
**Risk:** Silent empty result set with no indication of the bound ordering issue. Add a guard or document that `lo` must be ≤ `hi`.

### 6.4 `limit: 0` or negative `limit`
**Input:** `options.limit = 0` or `options.limit = -1`
**Current behaviour:** Passed directly to DynamoDB, which throws a `ValidationException`.
**Risk:** The library provides no pre-validation of the `limit` value.

### 6.5 `isAttributeMap` heuristic false positive / false negative
The `isAttributeMap` helper decides whether to re-marshall a `startKey`. It inspects only the **first** value in the object.
**False positive:** A plain object whose first value happens to be `{ S: "..." }` (e.g. `{ pk: { S: "USER#1" } }`) is identified as an already-marshalled map and skipped. This is the intended behaviour for raw adapters but may surprise users of the DocumentClient adapter who pass DynamoDB-shaped keys.
**False negative:** An AttributeMap whose first attribute uses a less-common type key (like `B` or `NULL`) alongside other keys will be misidentified if it somehow has multiple keys in the wrapper object (which would be malformed anyway, but defensive coding should be considered).

### 6.6 Raw filter expression with reserved words
**Input:** `options.filter = "status = :val"` where `status` is a DynamoDB reserved word.
**Current behaviour:** The raw string is passed to DynamoDB unchanged. DynamoDB returns a `ValidationException`.
**Risk:** No auto-aliasing is applied to raw filter/condition strings. Users must handle reserved words in these strings manually.

---

## 7. Batch Operations

### 7.1 `BatchGet` with multiple entities sharing the same table
**Scenario:** Single-table design with two entities (e.g. `UserEntity` and `OrderEntity`) on the same table.
**Current behaviour:** `tableConfigs` is keyed by `tableName`. The **first** entity's `projection` and `consistentRead` are stored; subsequent entities on the same table are ignored. Additionally, the entity name for responses is resolved by finding the first `tableName` match in `chunkKeys` — all items returned for that table are attributed to the first entity's name.
**Risk:** For multi-entity BatchGet on a single table, projection settings of subsequent entities are silently dropped, and all results are grouped under the first entity's name.

### 7.2 Unprocessed items after the single retry are silently discarded
**Current behaviour (`batchWrite`, `batchGet`):** One retry is attempted for unprocessed items. If items remain unprocessed after the retry, the function returns `ok(undefined)` / `ok({ responses: ... })` without surfacing the partial failure.
**Risk:** Silent data loss or incomplete reads under sustained throttling.

### 7.3 `BatchWrite` with 0 items
**Input:** `executeBatchWrite(adapter, [])`
**Current behaviour:** No DynamoDB calls are made; returns `ok(undefined)` immediately.
**Risk:** Well-handled, but not documented. Callers can safely pass empty arrays.

### 7.4 `BatchGet` duplicate keys
**Input:** The same key repeated multiple times in a `BatchGetEntityRequest.keys` array.
**Current behaviour:** All duplicates are included as separate entries in the flat key list and contribute toward the 100-item chunk limit.
**Risk:** Duplicate keys waste capacity units. DynamoDB does not deduplicate within a `BatchGetItem` request.

---

## 8. TransactWrite Operation (`src/operations/transact-write.ts`)

### 8.1 Empty update action in a transactional update
**Scenario:** A `transactUpdate` request whose `builderFn` returns an unmodified empty builder.
**Current behaviour:** `compileUpdateActions` produces `updateExpression: ""`. Unlike `executeUpdate`, `executeTransactWrite` does **not** validate for an empty expression before calling DynamoDB.
**Risk:** DynamoDB throws a `ValidationException` for an empty `UpdateExpression`. The error surfaces as a generic `"dynamo"` error rather than the more helpful `"validation"` error that `executeUpdate` would return.

### 8.2 More than 100 items in a single transaction
**Current behaviour:** All items are passed to `adapter.transactWriteItems` in a single call with no upfront limit check.
**Risk:** DynamoDB rejects requests with more than 100 transact items. The error surfaces as a generic `"dynamo"` error. A pre-check with a clear message would improve debuggability.

### 8.3 Duplicate operations on the same item
**Scenario:** Two operations targeting the same partition key + sort key within one transaction.
**Current behaviour:** No deduplication or validation is performed.
**Risk:** DynamoDB rejects the transaction with a `TransactionCanceledException` (code `ValidationError`). The error message from DynamoDB is passed through but may be difficult to trace back to the specific duplicate item.

### 8.4 No auto-TTL injection in transactional updates
**Scenario:** An entity has `ttl.autoUpdateTtlSeconds` configured.
**Current behaviour:** `executeTransactWrite` does **not** inject the auto-TTL refresh for `"update"` type requests (unlike `executeUpdate` which does).
**Risk:** Users expecting TTL to be auto-refreshed inside transactions will silently miss the refresh.

---

## 9. TTL

### 9.1 TTL attribute name conflicts with a schema field
**Scenario:** `table.ttl.attributeName` matches a field defined in the entity's schema (e.g. schema has `expiresAt: z.number()` and table TTL is `{ attributeName: "expiresAt" }`).
**Current behaviour:** `executePut` **overwrites** the schema-validated `expiresAt` with the auto-computed TTL value: `itemData[ttlAttributeName] = Math.floor(Date.now() / 1000) + defaultTtlSeconds`.
**Risk:** The user's schema-provided value for that field is silently replaced. The returned item reflects the auto-computed TTL, not the user-provided value.

### 9.2 TTL attribute name is a DynamoDB reserved word
**Example:** `ttl: { attributeName: "ttl" }` — `"TTL"` is in the reserved-word list.
**Current behaviour:** The library stores the attribute without issue (reserved words only matter in expressions, not attribute names themselves). However, if users write condition expressions that reference the TTL attribute name directly (e.g. `"ttl > :now"`), DynamoDB will reject the expression.
**Risk:** Users must alias the TTL attribute name when referencing it in conditions. The library provides no automatic aliasing for the TTL attribute name in raw condition strings.

### 9.3 `autoUpdateTtlSeconds` configured on entity without table TTL
**Scenario:** Entity has `ttl.autoUpdateTtlSeconds` set, but the table has no `ttl` config.
**Current behaviour:** The check `entity.table.ttl?.attributeName` is falsy, so TTL injection is silently skipped on every update.
**Risk:** The entity configuration implies TTL auto-refresh, but nothing happens. No error or warning is emitted at entity definition time or operation time.

### 9.4 TTL value already in the past
**Scenario:** `defaultTtlSeconds: 1` — by the time the network round-trip completes, the computed TTL timestamp may already be expired.
**Current behaviour:** The item is written successfully. DynamoDB stores it but may delete it within seconds.
**Risk:** Items with very short TTL windows may be deleted before they can be read. No validation enforces a minimum TTL duration.

### 9.5 TTL seconds value that overflows JavaScript `Number`
**Input:** `defaultTtlSeconds: Number.MAX_SAFE_INTEGER`
**Current behaviour:** `Math.floor(Date.now() / 1000) + Number.MAX_SAFE_INTEGER` evaluates to `Infinity`. When marshalling, `Number.isFinite(Infinity)` is `false` → marshalling error: `"Cannot marshall non-finite number"`.
**Risk:** The overflow is caught by the marshaller, but the error is surfaced as a `"marshalling"` error rather than a `"validation"` error at the TTL configuration level.

---

## 10. Expression Attribute Names (`src/utils/expression-names.ts`)

### 10.1 Attribute names starting with a digit
**Example:** `"1stPlace"`, `"2024Revenue"`
**Current behaviour:** `needsAlias` checks for reserved words (none match) and special characters (`[^a-zA-Z0-9_]` — digits pass). Result: `needsAlias("1stPlace") === false`, so no alias is generated.
**Risk:** DynamoDB expression attribute names **without** an alias must start with `[a-zA-Z_]`. Using `1stPlace` directly in an expression (unaliased) causes a `ValidationException`. The library will not alias it automatically.

### 10.2 Alias key collisions between user-provided and auto-generated names
**Scenario:** User provides `expressionNames: { "#s0_name": "someOtherAttr" }` in update options, while `compileUpdateActions` also auto-generates `"#s0_name"` (index 0, path `"name"`).
**Current behaviour:** `{ ...compiled.expressionAttributeNames, ...options.expressionNames }` — the **user's** value wins because user names are spread last.
**Risk:** The auto-generated name alias is silently overridden. The update expression references `#s0_name` but it now maps to `"someOtherAttr"` instead of `"name"`. The wrong attribute is updated.

### 10.3 Deeply nested attribute paths (`address.city`, `tags[0]`)
**Input:** `builder.set("address.city", "NYC")`
**Current behaviour:** `aliasAttributeName("s0_address.city")` → `"#s0_address.city"`, mapped to the literal attribute name `"address.city"`.
**Risk:** DynamoDB treats `address.city` as a nested path only when **each component** is separately aliased (`#address.#city`). A single alias mapping to the dot-separated string treats `"address.city"` as a flat attribute name with a literal dot. The library does not support nested path expressions through the builder API.

---

## 11. Validation (`src/validation/validate.ts`)

### 11.1 Schema `validate()` function throws synchronously or rejects
**Current behaviour:** `const result = await schema["~standard"].validate(value)` — if the schema throws or rejects, the error propagates as an unhandled exception / rejected Promise rather than being wrapped in a `Result`.
**Risk:** A buggy or non-compliant StandardSchema implementation can cause unhandled promise rejections that escape the `Result` boundary.

### 11.2 Schema returning both `value` and `issues`
**Scenario:** A non-standard-compliant schema returns `{ value: x, issues: [{ message: "..." }] }`.
**Current behaviour:** `"issues" in result && result.issues !== undefined` → treated as a **failure**. The `value` is ignored.
**Risk:** A partially-valid schema response is always treated as a failure even if it contains a `value`. This is spec-correct per StandardSchemaV1 but may trip up users experimenting with custom schema adapters.

---

## 12. Put Operation (`src/operations/put.ts`)

### 12.1 `put` returns locally constructed item, not DynamoDB-confirmed data
**Current behaviour:** `executePut` returns `ok(itemData)` where `itemData` is the locally built record (with injected keys and TTL). DynamoDB `PutItem` does not return the stored item (`RETURN_VALUES` is not set).
**Risk:** If a DynamoDB trigger, condition, or default value modifies the item server-side, the returned data will not reflect those changes. Callers using the return value as a canonical record could operate on stale data.

### 12.2 Key attribute injected into the returned item but not in the schema
**Current behaviour:** `executePut` injects `pk`/`sk` attributes into `itemData` and returns that record. The partition/sort key attribute names are not part of the entity's schema type.
**Risk:** The returned `itemData` has extra fields (`pk`, `sk`) that do not appear in `StandardSchemaV1.InferOutput<S>`. The cast to `InferOutput<S>` hides them at the type level but they are present at runtime.

---

## 13. Get Operation (`src/operations/get.ts`)

### 13.1 Item not found returns `ok(undefined)` — not distinguishable from schema failure at type level
**Current behaviour:** When an item is not found, `executeGet` returns `ok(undefined)` (a successful `Result` with no data).
**Risk:** Well-designed per the `Result<T | undefined, E>` return type, but callers must always check for `undefined`. Easy to forget compared to pattern-matching `success: false`.

---

## 14. Scan Operation (`src/operations/scan.ts`)

### 14.1 Scan on an entity includes items from other entities in single-table designs
**Current behaviour:** `executeScan` scans the entire table (or GSI) and returns all matching items, regardless of entity type.
**Risk:** In single-table designs, a scan on the `UserEntity` will also return `OrderEntity` items, `ProductEntity` items, etc. The items are cast to `InferOutput<S>` without any entity-type filtering. Unmarshalled items from other entity types may fail schema validation if consumed downstream.

---

## 15. BatchGet / BatchWrite — Empty Request Arrays

| Operation | Input | Behaviour |
|-----------|-------|-----------|
| `executeBatchWrite` | `[]` | Returns `ok(undefined)` immediately, no DynamoDB call |
| `executeBatchGet` | `[]` | Returns `ok({ responses: {} })` immediately, no DynamoDB call |

Both are correct, but undocumented. Useful to know for callers that conditionally build request arrays.

---

## 16. Entity Name Collisions in `BatchGetResult`

### 16.1 Two entities with the same `name` on different tables
**Scenario:** `defineEntity({ name: "User", ... })` used for two different schemas on different tables.
**Current behaviour:** `BatchGetResult.responses` is keyed by entity name. Both tables' results are merged under the same key.
**Risk:** Results from one entity's table silently overwrite or merge with results from the other entity's table. Entity `name` values must be globally unique if `BatchGet` is used across entities.

---

## Summary Table

| # | Area | Severity | Handled? |
|---|------|----------|----------|
| 1.1 | Empty string template → empty key | Medium | No — AWS error |
| 1.2–1.3 | Empty/whitespace placeholder silently literal | Low | No |
| 1.5 | Field value contains delimiter | High | No |
| 1.6 | Empty string field value | Medium | No |
| 3.1 | Mixed-type Set silently coerces | High | No |
| 3.2 | Set containing empty string | Medium | No — AWS error |
| 3.3 | Circular reference stack overflow | High | No |
| 3.4 | BigInt precision loss on unmarshal | Medium | No |
| 3.7 | `Date` marshalled as empty map | High | No |
| 3.8 | `Map` marshalled as empty map | High | No |
| 3.9 | `undefined` nested ≠ `undefined` root | Medium | No |
| 5.2 | Dot-notation nested path in builder | High | No |
| 6.1 | GSI query uses wrong sort key attribute | High | No |
| 6.2 | `sortKeyCondition` silently ignored | Medium | No |
| 7.1 | Multi-entity BatchGet on single table | High | No |
| 7.2 | Retry unprocessed items silently discarded | High | No |
| 8.1 | Empty transact update expression | Medium | Partial — AWS error |
| 8.2 | TransactWrite > 100 items | Medium | No — AWS error |
| 8.4 | No auto-TTL in transactional updates | Medium | No |
| 9.1 | TTL attribute name conflicts with schema field | High | No |
| 9.3 | `autoUpdateTtlSeconds` without table TTL | Medium | No |
| 10.1 | Digit-starting attribute names not aliased | Medium | No |
| 10.2 | User-provided alias collides with auto-generated | Low | No |
| 10.3 | Nested path dot-notation in expressions | High | No |
| 11.1 | Schema validate throws → unhandled exception | Medium | No |
| 12.1 | `put` returns local data, not DynamoDB-confirmed | Low | By design |
| 16.1 | Entity name collision in BatchGet | High | No |

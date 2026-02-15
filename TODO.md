# TODO: Planned Features

## 1. Type-safe Filter / Condition Expression Builder

**Gap:** Filter expressions (in query/scan) and condition expressions (in put/delete/update) are currently raw strings. Users have to manually handle reserved word escaping, attribute name aliasing, and placeholder generation — exactly what the library handles internally for update expressions via `UpdateBuilder`.

**Feature:** A `FilterBuilder<T>` and `ConditionBuilder<T>` with the same ergonomics as `UpdateBuilder`:

```typescript
const result = await client.query(UserEntity, {
  key: { userId: '123' },
  filter: (f) =>
    f.and(
      f.eq('status', 'active'),
      f.gt('age', 18),
      f.beginsWith('email', 'admin@'),
      f.attributeExists('verifiedAt')
    )
});
```

This would handle reserved word aliasing, `:value` placeholder injection, and `AND`/`OR`/`NOT` composition automatically — making it impossible to write a malformed expression.

---

## 2. Cursor-based Pagination Utility

**Gap:** `query` and `scan` return `LastEvaluatedKey` for pagination, but users are on their own to manage it across requests. For REST/GraphQL APIs this means manual serialization, which is error-prone and leaks DynamoDB internals.

**Feature:** A `paginate()` helper that wraps query/scan with safe cursor encoding:

```typescript
const page = await client.paginate(UserEntity, {
  key: { userId: '123' },
  limit: 20,
  cursor: req.query.cursor, // opaque base64 token
});

// Returns { items, nextCursor, hasNextPage }
res.json({ users: page.items, next: page.nextCursor });
```

Cursors would be base64-encoded, and the utility would handle `LastEvaluatedKey` ↔ cursor round-tripping transparently.

---

## 3. Optimistic Locking (Version Field)

**Gap:** Concurrent writes to the same item have no built-in protection. The library has no concept of versions, so two processes can silently overwrite each other's changes.

**Feature:** An optional `version` option in `defineEntity` that auto-increments on every write and uses a condition expression to reject stale updates:

```typescript
const UserEntity = defineEntity({
  table: UserTable,
  schema: UserSchema,
  pk: 'USER#{{userId}}',
  sk: 'PROFILE',
  version: { field: 'version' }, // enable optimistic locking
});

// Automatically adds `attribute_not_exists(version) OR version = :currentVersion`
// and increments version on success. Returns ConditionalCheckFailedException as a Result error.
await client.put(UserEntity, userData);
```

---

## 4. BatchGet Auto-chunking + Unprocessed Items Retry

**Gap:** `BatchWrite` already auto-chunks to DynamoDB's 25-item limit, but `BatchGet` has no equivalent chunking for the 100-item limit. More critically, neither operation handles `UnprocessedKeys` / `UnprocessedItems` — when DynamoDB throttles a batch and returns only partial results, the library silently discards the rest.

**Feature:** Auto-chunk `BatchGet` to 100 items per request, and add retry logic with exponential backoff for unprocessed items in both batch operations:

```typescript
// Works transparently even with 500 items (auto-chunks + retries)
const { items } = await client.batchGet([
  { entity: UserEntity, keys: userIds.map(id => ({ userId: id })) },
]);
```

---

## 5. Middleware / Hook System

**Gap:** There's no way to attach cross-cutting behavior to operations — things like audit logging, soft-delete, `createdAt`/`updatedAt` auto-injection, or custom access control. Currently users have to wrap every call manually.

**Feature:** Per-entity lifecycle hooks defined in `defineEntity`:

```typescript
const UserEntity = defineEntity({
  table: UserTable,
  schema: UserSchema,
  pk: 'USER#{{userId}}',
  sk: 'PROFILE',
  hooks: {
    beforePut: (item) => ({ ...item, updatedAt: Date.now() }),
    afterGet: (item) => item ?? null,        // transform result
    beforeDelete: (key) => {                  // soft-delete example
      throw new ForbiddenError('Use deactivate instead');
    },
  },
});
```

Hooks would have full type-safety from the entity's schema type and could return modified data or throw to abort the operation.

---

## Priority Order

1. **#4 — BatchGet Auto-chunking + Retry** — Low effort, high correctness, consistency with existing BatchWrite behavior
2. **#1 — Filter/Condition Expression Builder** — High-value DX improvement, closes the biggest API gap
3. **#2 — Cursor-based Pagination** — Essential for API integration use cases
4. **#3 — Optimistic Locking** — Data integrity for concurrent write scenarios
5. **#5 — Middleware/Hook System** — Ecosystem expansion, enables advanced patterns

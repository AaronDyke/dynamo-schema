---
title: Filter Condition Expression Builder
priority: high
benefits: High-value DX improvement, closes the biggest API gap
---
Type-safe Filter / Condition Expression Builder

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

## Implementation Notes

### Status: ✅ Completed (2026-02-15)

### Design decisions

**Tree-based immutable condition nodes, not a chainable builder**

Unlike `UpdateBuilder` (which accumulates actions in a chain), filter conditions form a
_tree_ of composable nodes. So `FilterBuilder<T>` is a **stateless factory** — each method
returns a frozen `FilterNode` value that can be passed to `and/or/not` for composition.
`createUpdateBuilder` returns a new builder per step; `createFilterBuilder` returns a single
factory object whose methods produce nodes.

**`FilterInput` union for backward compatibility**

The `filter` and `condition` options in every operation accept a `FilterInput` union:
- `string` — legacy raw expression (user still supplies `expressionNames`/`expressionValues` manually)
- `FilterNode` — pre-built node from `createFilterBuilder<T>()`
- `(f: FilterBuilder<Record<string, unknown>>) => FilterNode` — inline callback

This is fully backward-compatible. Existing code passing raw strings continues to work.

**Counter-based unique alias generation**

Each leaf in the tree gets a fresh `#fN` / `:fN` alias pair using a mutable counter inside
the compile closure. This keeps alias keys short, avoids special-character issues in alias
names (attribute paths may contain dots/dashes), and is safe to use concurrently since each
`compileFilterNode()` call starts its own counter at zero.

For `between`, two value aliases are generated: `:f{N}lo` and `:f{N}hi`.

**`resolveFilterInput` internal helper**

Operations don't import `createFilterBuilder` or `compileFilterNode` directly. Instead, a
single `resolveFilterInput(input)` helper in `src/operations/filter.ts` handles all three
`FilterInput` variants and returns `{ expression, expressionAttributeNames, expressionAttributeValues }`.
Operations merge these into their existing name/value maps with user-provided overrides applied
last (highest priority).

### Files created / modified

| File | Change |
|------|--------|
| `src/types/filter-expression.ts` | ✨ New — `FilterNode`, `FilterBuilder<T>`, `CompiledFilter`, `FilterInput`, `DynamoAttributeType` |
| `src/operations/filter.ts` | ✨ New — `createFilterBuilder`, `compileFilterNode`, `resolveFilterInput` |
| `src/types/operations.ts` | Updated `filter`/`condition` fields to `FilterInput` in `QueryOptions`, `ScanOptions`, `PutOptions`, `DeleteOptions` |
| `src/operations/update.ts` | Updated `condition` in `UpdateOptions` to `FilterInput`; integrated `resolveFilterInput` |
| `src/operations/query.ts` | Integrated `resolveFilterInput` — merged filter names/values into expression maps |
| `src/operations/scan.ts` | Integrated `resolveFilterInput` |
| `src/operations/delete.ts` | Integrated `resolveFilterInput` |
| `src/operations/put.ts` | Integrated `resolveFilterInput` |
| `src/index.ts` | Exported `createFilterBuilder`, `compileFilterNode`, and all filter types |
| `src/__tests__/operations/filter-builder.test.ts` | ✨ New — 71 tests covering all operators, compilation, composition, and integration |
| `README.md` | Added "Filter / Condition Expression Builder" section with examples |

### Supported operators

`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `between`, `beginsWith`, `contains`,
`attributeExists`, `attributeNotExists`, `attributeType`, `and`, `or`, `not`

### Test results

340 tests passing across 26 test files (up from 269 tests in 25 files).

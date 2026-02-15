---
title: Middleware Hook System
priority: medium
benefits: Ecosystem expansion, enables advanced patterns
---
# Middleware / Hook System

## Requirements

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

The current accepted hooks would be (add any other hooks that make sense)
- beforePut
- beforeUpdate
- afterGet
- beforeDelete

Make sure to include the option to skip hooks in calls, the hooks would be run as default.
Add hook failure errors for easy debugging.
Add hooks into the test suite and create comprehensive tests to ensure functionality.
Update the README.md when finished inplementing with examples that are both human and AI readable.

## Implementation Notes

### 2026-02-15 — Implementation Start

**Approach:**
- Added a new `src/types/hooks.ts` file defining `EntityHooks<T>` with four hooks: `beforePut`, `beforeUpdate`, `afterGet`, `beforeDelete`
- Extended `DynamoError["type"]` to include `"hook"` for clear debugging of hook failures
- Added `skipHooks?: boolean` to `PutOptions`, `GetOptions`, `DeleteOptions`, and `UpdateOptions`
- Extended `EntityConfig` and `EntityDefinition` to carry an optional `hooks` field
- Updated `defineEntity` to freeze and store hooks on the entity definition
- Each operation (put, get, delete, update) calls its respective hook at the appropriate lifecycle point, wrapped in try/catch to produce typed `"hook"` errors
- Hook execution order:
  - `beforePut`: after schema validation, before key building — hook can modify the item
  - `beforeUpdate`: after builder function runs, before TTL injection — hook can modify UpdateActions
  - `afterGet`: after unmarshalling (or not-found check) — hook can transform or substitute the result
  - `beforeDelete`: before the DynamoDB call — hook can throw to abort (soft-delete pattern)
- Wrote a comprehensive test suite in `src/__tests__/operations/hooks.test.ts`
- Exported `EntityHooks` from `src/index.ts`
- Updated README.md with a dedicated "Lifecycle Hooks" section
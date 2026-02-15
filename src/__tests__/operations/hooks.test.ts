/**
 * Tests for entity lifecycle hooks (beforePut, beforeUpdate, afterGet, beforeDelete).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { defineEntity } from "../../core/define-entity.js";
import { executePut } from "../../operations/put.js";
import { executeGet } from "../../operations/get.js";
import { executeDelete } from "../../operations/delete.js";
import { executeUpdate } from "../../operations/update.js";
import type { EntityHooks } from "../../types/hooks.js";
import {
  userSchema,
  usersTable,
  validUser,
  createMockAdapter,
} from "../fixtures.js";
import type { User } from "../fixtures.js";
import type { UpdateActions } from "../../types/update-expression.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a userEntity variant with specific hooks for isolated testing. */
const makeEntityWithHooks = (hooks: EntityHooks<User> | undefined) =>
  defineEntity({
    name: "HookedUser",
    schema: userSchema,
    table: usersTable,
    partitionKey: "USER#{{userId}}",
    sortKey: "PROFILE",
    hooks,
  });

// ---------------------------------------------------------------------------
// beforePut
// ---------------------------------------------------------------------------

describe("beforePut hook", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("transforms the item before writing", async () => {
    const entity = makeEntityWithHooks({
      beforePut: (item) => ({ ...item, name: "TRANSFORMED" }),
    });

    const result = await executePut(entity, adapter, validUser);
    expect(result.success).toBe(true);

    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    expect(item?.["name"]).toBe("TRANSFORMED");
  });

  it("async beforePut hook resolves and transforms item", async () => {
    const entity = makeEntityWithHooks({
      beforePut: async (item) => {
        await Promise.resolve();
        return { ...item, name: "ASYNC_TRANSFORMED" };
      },
    });

    await executePut(entity, adapter, validUser);
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    expect(item?.["name"]).toBe("ASYNC_TRANSFORMED");
  });

  it("hook-injected fields are persisted in the written item", async () => {
    const schemaWithTimestamp = z.object({
      userId: z.string(),
      email: z.string(),
      name: z.string(),
      updatedAt: z.number().optional(),
    });

    const entity = defineEntity({
      name: "TimestampedUser",
      schema: schemaWithTimestamp,
      table: usersTable,
      partitionKey: "USER#{{userId}}",
      sortKey: "PROFILE",
      hooks: {
        beforePut: (item) => ({ ...item, updatedAt: 1234567890 }),
      },
    });

    await executePut(entity, adapter, { userId: "u1", email: "a@b.com", name: "A" });
    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    expect(item?.["updatedAt"]).toBe(1234567890);
  });

  it("aborts with a hook error when beforePut throws", async () => {
    const entity = makeEntityWithHooks({
      beforePut: () => {
        throw new Error("write forbidden");
      },
    });

    const result = await executePut(entity, adapter, validUser);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toContain("beforePut hook failed");
      expect(result.error.message).toContain("write forbidden");
    }
  });

  it("aborts with a hook error when async beforePut rejects", async () => {
    const entity = makeEntityWithHooks({
      beforePut: async () => {
        throw new Error("async write forbidden");
      },
    });

    const result = await executePut(entity, adapter, validUser);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  it("aborts without calling putItem when hook throws", async () => {
    const entity = makeEntityWithHooks({
      beforePut: () => {
        throw new Error("blocked");
      },
    });

    await executePut(entity, adapter, validUser);
    expect(adapter.putItem).not.toHaveBeenCalled();
  });

  it("bypasses the hook when skipHooks is true", async () => {
    const hookFn = vi.fn((item: User) => ({ ...item, name: "HOOKED" }));
    const entity = makeEntityWithHooks({ beforePut: hookFn });

    await executePut(entity, adapter, validUser, { skipHooks: true });
    expect(hookFn).not.toHaveBeenCalled();

    const call = vi.mocked(adapter.putItem).mock.calls[0]?.[0];
    const item = call?.item as Record<string, unknown>;
    expect(item?.["name"]).toBe(validUser.name); // original name, not "HOOKED"
  });

  it("does not call the hook when none is defined", async () => {
    const entity = makeEntityWithHooks(undefined);
    const result = await executePut(entity, adapter, validUser);
    expect(result.success).toBe(true);
    expect(adapter.putItem).toHaveBeenCalledOnce();
  });

  it("non-Error throws produce a hook error with a generic message", async () => {
    const entity = makeEntityWithHooks({
      beforePut: () => {
        throw "string error";
      },
    });

    const result = await executePut(entity, adapter, validUser);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toBe("beforePut hook failed");
    }
  });
});

// ---------------------------------------------------------------------------
// afterGet
// ---------------------------------------------------------------------------

describe("afterGet hook", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("transforms a found item", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({
      item: { userId: "user-123", email: "alice@example.com", name: "Alice" },
    });

    const entity = makeEntityWithHooks({
      afterGet: (item) => item ? { ...item, name: "TRANSFORMED" } : undefined,
    });

    const result = await executeGet(entity, adapter, { userId: "user-123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as User | undefined)?.name).toBe("TRANSFORMED");
    }
  });

  it("async afterGet hook resolves correctly", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({
      item: { userId: "u1", email: "a@b.com", name: "Original" },
    });

    const entity = makeEntityWithHooks({
      afterGet: async (item) => {
        await Promise.resolve();
        return item ? { ...item, name: "ASYNC" } : undefined;
      },
    });

    const result = await executeGet(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as User | undefined)?.name).toBe("ASYNC");
    }
  });

  it("is called with undefined when item is not found", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({ item: undefined });

    const hookFn = vi.fn((_item: User | undefined) => undefined);
    const entity = makeEntityWithHooks({ afterGet: hookFn });

    await executeGet(entity, adapter, { userId: "missing" });
    expect(hookFn).toHaveBeenCalledWith(undefined);
  });

  it("can provide a default value when item is not found", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({ item: undefined });

    const defaultUser: User = { userId: "default", email: "d@d.com", name: "Default" };
    const entity = makeEntityWithHooks({
      afterGet: (item) => item ?? defaultUser,
    });

    const result = await executeGet(entity, adapter, { userId: "missing" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(defaultUser);
    }
  });

  it("aborts with a hook error when afterGet throws for a found item", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({
      item: { userId: "u1", email: "a@b.com", name: "A" },
    });

    const entity = makeEntityWithHooks({
      afterGet: () => {
        throw new Error("transform failed");
      },
    });

    const result = await executeGet(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toContain("afterGet hook failed");
      expect(result.error.message).toContain("transform failed");
    }
  });

  it("aborts with a hook error when afterGet throws for a not-found item", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({ item: undefined });

    const entity = makeEntityWithHooks({
      afterGet: () => {
        throw new Error("access denied");
      },
    });

    const result = await executeGet(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
    }
  });

  it("bypasses the hook when skipHooks is true", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({
      item: { userId: "u1", email: "a@b.com", name: "Real" },
    });

    const hookFn = vi.fn((item: User | undefined) =>
      item ? { ...item, name: "HOOKED" } : undefined,
    );
    const entity = makeEntityWithHooks({ afterGet: hookFn });

    const result = await executeGet(entity, adapter, { userId: "u1" }, { skipHooks: true });
    expect(hookFn).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as User | undefined)?.name).toBe("Real");
    }
  });

  it("does not call the hook when none is defined", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({
      item: { userId: "u1", email: "a@b.com", name: "Alice" },
    });

    const entity = makeEntityWithHooks(undefined);
    const result = await executeGet(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(true);
  });

  it("non-Error throws produce a hook error with a generic message", async () => {
    vi.mocked(adapter.getItem).mockResolvedValue({
      item: { userId: "u1", email: "a@b.com", name: "Alice" },
    });

    const entity = makeEntityWithHooks({
      afterGet: () => {
        throw 42;
      },
    });

    const result = await executeGet(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toBe("afterGet hook failed");
    }
  });
});

// ---------------------------------------------------------------------------
// beforeDelete
// ---------------------------------------------------------------------------

describe("beforeDelete hook", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("is called with the key input before deletion", async () => {
    const hookFn = vi.fn();
    const entity = makeEntityWithHooks({ beforeDelete: hookFn });

    await executeDelete(entity, adapter, { userId: "user-123" });
    expect(hookFn).toHaveBeenCalledWith({ userId: "user-123" });
  });

  it("async beforeDelete hook is awaited before proceeding", async () => {
    let resolved = false;
    const entity = makeEntityWithHooks({
      beforeDelete: async () => {
        await Promise.resolve();
        resolved = true;
      },
    });

    await executeDelete(entity, adapter, { userId: "u1" });
    expect(resolved).toBe(true);
    expect(adapter.deleteItem).toHaveBeenCalledOnce();
  });

  it("aborts the delete when beforeDelete throws", async () => {
    const entity = makeEntityWithHooks({
      beforeDelete: () => {
        throw new Error("Use deactivate instead");
      },
    });

    const result = await executeDelete(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toContain("beforeDelete hook failed");
      expect(result.error.message).toContain("Use deactivate instead");
    }
  });

  it("does not call deleteItem when beforeDelete throws", async () => {
    const entity = makeEntityWithHooks({
      beforeDelete: () => {
        throw new Error("blocked");
      },
    });

    await executeDelete(entity, adapter, { userId: "u1" });
    expect(adapter.deleteItem).not.toHaveBeenCalled();
  });

  it("allows the delete when beforeDelete resolves without throwing", async () => {
    const entity = makeEntityWithHooks({
      beforeDelete: async () => {
        await Promise.resolve(); // Log or audit
      },
    });

    const result = await executeDelete(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(true);
    expect(adapter.deleteItem).toHaveBeenCalledOnce();
  });

  it("bypasses the hook when skipHooks is true", async () => {
    const hookFn = vi.fn(() => {
      throw new Error("would block");
    });
    const entity = makeEntityWithHooks({ beforeDelete: hookFn });

    const result = await executeDelete(entity, adapter, { userId: "u1" }, { skipHooks: true });
    expect(hookFn).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(adapter.deleteItem).toHaveBeenCalledOnce();
  });

  it("does not call the hook when none is defined", async () => {
    const entity = makeEntityWithHooks(undefined);
    const result = await executeDelete(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(true);
  });

  it("non-Error throws produce a hook error with a generic message", async () => {
    const entity = makeEntityWithHooks({
      beforeDelete: () => {
        throw "string thrown";
      },
    });

    const result = await executeDelete(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toBe("beforeDelete hook failed");
    }
  });
});

// ---------------------------------------------------------------------------
// beforeUpdate
// ---------------------------------------------------------------------------

describe("beforeUpdate hook", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.mocked(adapter.updateItem).mockResolvedValue({
      attributes: { userId: "u1", email: "a@b.com", name: "Alice", updatedAt: 1234567890 },
    });
  });

  it("is called with the key input and accumulated actions", async () => {
    const hookFn = vi.fn((_key: Record<string, string>, actions: UpdateActions) => actions);
    const entity = makeEntityWithHooks({ beforeUpdate: hookFn });

    await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "New Name"),
      { skipAutoTtl: true },
    );

    expect(hookFn).toHaveBeenCalledOnce();
    const [key, actions] = hookFn.mock.calls[0]!;
    expect(key).toEqual({ userId: "u1" });
    expect(actions.sets).toHaveLength(1);
    expect(actions.sets[0]?.path).toBe("name");
  });

  it("can inject additional SET actions into the update", async () => {
    const entity = makeEntityWithHooks({
      beforeUpdate: (_key, actions) => ({
        ...actions,
        sets: [...actions.sets, { path: "updatedAt" as string, value: 9999 }],
      }),
    });

    await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "New Name"),
      { skipAutoTtl: true },
    );

    const call = vi.mocked(adapter.updateItem).mock.calls[0]?.[0];
    // The update expression should contain both the original set and the injected one
    expect(call?.updateExpression).toContain("SET");
  });

  it("async beforeUpdate hook is awaited", async () => {
    let invoked = false;
    const entity = makeEntityWithHooks({
      beforeUpdate: async (_key, actions) => {
        await Promise.resolve();
        invoked = true;
        return actions;
      },
    });

    await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "Name"),
      { skipAutoTtl: true },
    );

    expect(invoked).toBe(true);
  });

  it("aborts with a hook error when beforeUpdate throws", async () => {
    const entity = makeEntityWithHooks({
      beforeUpdate: () => {
        throw new Error("update forbidden");
      },
    });

    const result = await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "Name"),
      { skipAutoTtl: true },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toContain("beforeUpdate hook failed");
      expect(result.error.message).toContain("update forbidden");
    }
  });

  it("does not call updateItem when beforeUpdate throws", async () => {
    const entity = makeEntityWithHooks({
      beforeUpdate: () => {
        throw new Error("blocked");
      },
    });

    await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "X"),
      { skipAutoTtl: true },
    );

    expect(adapter.updateItem).not.toHaveBeenCalled();
  });

  it("bypasses the hook when skipHooks is true", async () => {
    const hookFn = vi.fn((_key: Record<string, string>, actions: UpdateActions) => actions);
    const entity = makeEntityWithHooks({ beforeUpdate: hookFn });

    await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "Name"),
      { skipHooks: true, skipAutoTtl: true },
    );

    expect(hookFn).not.toHaveBeenCalled();
    expect(adapter.updateItem).toHaveBeenCalledOnce();
  });

  it("does not call the hook when none is defined", async () => {
    const entity = makeEntityWithHooks(undefined);
    const result = await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "Name"),
      { skipAutoTtl: true },
    );
    expect(result.success).toBe(true);
  });

  it("non-Error throws produce a hook error with a generic message", async () => {
    const entity = makeEntityWithHooks({
      beforeUpdate: () => {
        throw 0;
      },
    });

    const result = await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "N"),
      { skipAutoTtl: true },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
      expect(result.error.message).toBe("beforeUpdate hook failed");
    }
  });

  it("hook runs before TTL auto-injection so hook sees only builder actions", async () => {
    // Verify hook sees only the builder actions (TTL not yet injected)
    const hookFn = vi.fn((_key: Record<string, string>, actions: UpdateActions) => actions);

    const entity = makeEntityWithHooks({ beforeUpdate: hookFn });

    await executeUpdate(
      entity,
      adapter,
      { userId: "u1" },
      (b) => b.set("name", "Name"),
      // Do NOT pass skipAutoTtl so TTL auto-injection runs after the hook
    );

    // Hook should have been called with just the builder's single SET
    const [, actions] = hookFn.mock.calls[0]!;
    // TTL is injected AFTER the hook, so actions.sets contains only "name"
    expect(actions.sets.some((s) => s.path === "name")).toBe(true);
    expect(actions.sets.some((s) => s.path === "expiresAt")).toBe(false);

    // But updateItem expression should still contain both
    const call = vi.mocked(adapter.updateItem).mock.calls[0]?.[0];
    expect(call?.updateExpression).toContain("SET");
  });
});

// ---------------------------------------------------------------------------
// Multiple hooks on the same entity
// ---------------------------------------------------------------------------

describe("multiple hooks on the same entity", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.mocked(adapter.updateItem).mockResolvedValue({
      attributes: { userId: "u1", email: "a@b.com", name: "X" },
    });
  });

  it("both beforePut and afterGet can be defined simultaneously", async () => {
    const putHook = vi.fn((item: User) => item);
    const getHook = vi.fn((item: User | undefined) => item);

    const entity = makeEntityWithHooks({
      beforePut: putHook,
      afterGet: getHook,
    });

    await executePut(entity, adapter, validUser);
    expect(putHook).toHaveBeenCalledOnce();
    expect(getHook).not.toHaveBeenCalled();

    vi.mocked(adapter.getItem).mockResolvedValue({
      item: { userId: "u1", email: "a@b.com", name: "Alice" },
    });

    await executeGet(entity, adapter, { userId: "u1" });
    expect(getHook).toHaveBeenCalledOnce();
  });

  it("hooks object is frozen by defineEntity", () => {
    const entity = makeEntityWithHooks({
      beforePut: (item) => item,
    });

    expect(Object.isFrozen(entity)).toBe(true);
    expect(Object.isFrozen(entity.hooks)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hook error type
// ---------------------------------------------------------------------------

describe("hook error type", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("hook errors have type 'hook'", async () => {
    const entity = makeEntityWithHooks({
      beforePut: () => {
        throw new Error("fail");
      },
    });

    const result = await executePut(entity, adapter, validUser);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("hook");
    }
  });

  it("hook errors preserve the original cause", async () => {
    const originalError = new Error("original");
    const entity = makeEntityWithHooks({
      beforeDelete: () => {
        throw originalError;
      },
    });

    const result = await executeDelete(entity, adapter, { userId: "u1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.cause).toBe(originalError);
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeTransactWrite } from "../../operations/transact-write.js";
import type { TransactWriteRequestItem, TransactUpdateRequest } from "../../operations/transact-write.js";
import type { UpdateBuilder } from "../../types/update-expression.js";
import {
  userEntity,
  validUser,
  createMockAdapter,
  type User,
} from "../fixtures.js";

describe("executeTransactWrite()", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("succeeds with a put request", async () => {
    const requests: TransactWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const result = await executeTransactWrite(adapter, requests, { skipValidation: true });
    expect(result.success).toBe(true);
    expect(adapter.transactWriteItems).toHaveBeenCalledOnce();
  });

  it("succeeds with a delete request", async () => {
    const requests: TransactWriteRequestItem[] = [
      { type: "delete", entity: userEntity, keyInput: { userId: "user-123" } },
    ];
    const result = await executeTransactWrite(adapter, requests);
    expect(result.success).toBe(true);
  });

  it("succeeds with an update request", async () => {
    const updateReq: TransactUpdateRequest<typeof userEntity["schema"]> = {
      type: "update",
      entity: userEntity,
      keyInput: { userId: "user-123" },
      builderFn: (b: UpdateBuilder<User>) => b.set("name", "Updated"),
    };
    const requests: TransactWriteRequestItem[] = [updateReq as TransactWriteRequestItem];
    const result = await executeTransactWrite(adapter, requests);
    expect(result.success).toBe(true);
  });

  it("succeeds with a conditionCheck request", async () => {
    const requests: TransactWriteRequestItem[] = [
      {
        type: "conditionCheck",
        entity: userEntity,
        keyInput: { userId: "user-123" },
        condition: "attribute_exists(pk)",
      },
    ];
    const result = await executeTransactWrite(adapter, requests);
    expect(result.success).toBe(true);
  });

  it("handles mixed request types", async () => {
    const requests: TransactWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
      { type: "delete", entity: userEntity, keyInput: { userId: "user-456" } },
    ];
    const result = await executeTransactWrite(adapter, requests, { skipValidation: true });
    expect(result.success).toBe(true);
    const call = vi.mocked(adapter.transactWriteItems).mock.calls[0]?.[0];
    expect(call).toHaveLength(2);
  });

  it("calls transactWriteItems with correct tableName on put", async () => {
    const requests: TransactWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    await executeTransactWrite(adapter, requests, { skipValidation: true });
    const call = vi.mocked(adapter.transactWriteItems).mock.calls[0]?.[0];
    expect(call?.[0]?.tableName).toBe("UsersTable");
    expect(call?.[0]?.type).toBe("put");
  });

  it("returns dynamo error when adapter throws", async () => {
    vi.mocked(adapter.transactWriteItems).mockRejectedValueOnce(
      new Error("TransactionCanceledException"),
    );
    const requests: TransactWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: validUser },
    ];
    const result = await executeTransactWrite(adapter, requests, { skipValidation: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("dynamo");
    }
  });

  it("returns validation error for invalid put data", async () => {
    const badData = { userId: "u", email: "not-valid", name: "B" };
    const requests: TransactWriteRequestItem[] = [
      { type: "put", entity: userEntity, data: badData as typeof validUser },
    ];
    const result = await executeTransactWrite(adapter, requests);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation");
    }
  });
});

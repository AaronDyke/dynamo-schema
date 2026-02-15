BatchGet Auto-chunking + Unprocessed Items Retry

**Gap:** `BatchWrite` already auto-chunks to DynamoDB's 25-item limit, but `BatchGet` has no equivalent chunking for the 100-item limit. More critically, neither operation handles `UnprocessedKeys` / `UnprocessedItems` — when DynamoDB throttles a batch and returns only partial results, the library silently discards the rest.

**Feature:** Auto-chunk `BatchGet` to 100 items per request, and add retry logic with exponential backoff for unprocessed items in both batch operations:

```typescript
// Works transparently even with 500 items (auto-chunks + retries)
const { items } = await client.batchGet([
  { entity: UserEntity, keys: userIds.map(id => ({ userId: id })) },
]);
```

## Implementation Notes

### Status: ✅ Completed (2026-02-15)

### Pre-existing state

Reviewing the code before starting:
- **BatchGet**: already had 100-item chunking (`BATCH_GET_LIMIT = 100`) and a **single immediate retry** for unprocessed keys. No backoff, no configurable attempt limit.
- **BatchWrite**: already had 25-item chunking (`BATCH_WRITE_LIMIT = 25`) and a **single immediate retry** for unprocessed items. Same limitations.

So the chunking was already there; the gap was **exponential backoff** and **configurable retry limits**.

### Design decisions

**Shared `src/utils/retry.ts`**

Both operations need the same retry logic, so a shared utility was warranted. It provides:
- `RetryOptions` — `maxAttempts`, `baseDelayMs`, `maxDelayMs`
- `computeBackoffDelay(retryIndex, options)` — `min(base × 2^i, max)` formula
- `sleep(ms)` — `setTimeout`-based delay compatible with `vi.useFakeTimers()`

**`maxAttempts` semantics**

`maxAttempts` is the *total number of DynamoDB calls* (initial + retries). Default: `4`
(1 initial call + 3 retries at 100ms, 200ms, 400ms). This mirrors AWS SDK v3 defaults.

`maxAttempts: 1` means no retries at all — only the initial call.

**Hard error on exhaustion**

After all attempts, if items/keys remain unprocessed, the operation returns a `DynamoError`
with a descriptive message instead of silently discarding them. This is the bug described
in the TODO and is consistent with the library's Result-based error handling.

**`BatchGetOptions` added to `executeBatchGet` and `batchGet`**

`BatchGetOptions` is a new type with `retryOptions?: RetryOptions`. It's threaded through:
- `executeBatchGet(adapter, requests, options?)` ← new parameter
- `DynamoClient.batchGet(requests, options?)` ← updated signature
- `createClient().batchGet(...)` ← updated implementation

**`BatchWriteOptions.retryOptions` added**

`retryOptions?: RetryOptions` added to the existing `BatchWriteOptions` (which already had `skipValidation`).

**Response collection across retries**

For BatchGet, items returned in *both* the initial call and in retry responses are collected
into `allResponses`. The `processResponses` helper was extracted to eliminate the duplication
that existed in the old single-retry approach.

### Files created / modified

| File | Change |
|------|--------|
| `src/utils/retry.ts` | ✨ New — `RetryOptions`, `computeBackoffDelay`, `sleep` |
| `src/operations/batch-get.ts` | Replaced single-retry with exponential backoff loop; added `BatchGetOptions`; extracted `processResponses` helper |
| `src/operations/batch-write.ts` | Replaced single-retry with exponential backoff loop; added `retryOptions` to `BatchWriteOptions` |
| `src/core/create-client.ts` | Updated `DynamoClient.batchGet` signature + implementation to pass `options` |
| `src/index.ts` | Exported `BatchGetOptions`, `RetryOptions` |
| `src/__tests__/operations/batch-retry.test.ts` | ✨ New — 26 tests covering `computeBackoffDelay`, BatchGet retry, BatchWrite retry |
| `README.md` | Updated Batch Write + Batch Get sections with retry docs and options table |

### Test strategy

Tests use `vi.useFakeTimers()` + `vi.runAllTimersAsync()` to control `setTimeout` without
real delays. Where timing verification is needed (e.g. "second call is only made after delay"),
`vi.advanceTimersByTimeAsync()` advances to exactly the expected delay. Tests use
`baseDelayMs: 0` where only call-count matters.

### Test results

366 tests passing across 27 test files (up from 340 tests in 26 files).

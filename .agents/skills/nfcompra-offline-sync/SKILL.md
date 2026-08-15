---
name: nfcompra-offline-sync
description: "Use ONLY when working on the NFCompra Android offline sync pipeline: Room operation queue, WorkManager worker, operationId reconciliation, version conflicts, or retry logic. This is the most intricate subsystem; follow its invariants exactly."
---

# NFCompra Android Offline Sync

The offline-first product mutation pipeline. Changing it requires understanding these invariants.

## When to load
- WorkManager worker changes, Room operation queue changes, conflict resolution UI, `operationId`/version handling.

## How it works
- Every product mutation appends a persistent operation to Room (isolated per account) and schedules **unique WorkManager work** restricted to `NetworkType.CONNECTED`.
- The worker processes **one operation at a time in creation order**, keeps the same `operationId` across retries, and applies exponential backoff on transient failures.
- On success: update the product and delete **only that operation**, inside a single Room transaction. Creates reconcile temp IDs, versions, and the projection of later operations atomically.
- Error mapping:
  - `422`, `OPERATION_ID_REUSED`, `OPERATION_LOST`, and other non-retryable `409`s → `failed`, shown for manual review; they do NOT block later operations.
  - `OPERATION_IN_PROGRESS` → retry the same UUID.
  - `409 ITEM_VERSION_CONFLICT` → keep the server version without discarding local intent; UI offers "Use server version" or "Retry my change" (new operation, new UUID, current server version).
- Interrupted `syncing` rows resume with the stored UUID.
- The worker rejects credentials from another account and uses a **read-only Bearer client**: a `401` stays retryable without consuming or rotating the session's refresh token. Logout/recreate account clears the projection and pending operations.

## Rules
- Never break the "one operation deleted per success, atomically" invariant.
- Never let a late cached read overwrite the currently open household/list or a newer session.
- Conflict resolution must preserve user intent; do not silently drop local changes.
- Add regression coverage for: boot with cached Room data, two offline product mutations in one sync cycle, and an explicit version-conflict resolution.

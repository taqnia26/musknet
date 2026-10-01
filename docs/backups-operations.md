# Backups operations

## Storage backend (local by default; GCS is optional)

The backup feature does **not** require Replit Object Storage, its sidecar, or
Google credentials. `BACKUP_STORAGE_DRIVER` defaults to `local`. The API wiring
selects the driver explicitly and rejects unsupported values.

For a plain Linux VPS:

```sh
BACKUP_STORAGE_DRIVER=local
BACKUP_STORAGE_DIR=/var/lib/musk-ellolo/backups
```

`BACKUP_STORAGE_DIR` defaults to `.backups` relative to the API process's working
directory, resolved to an absolute path. Use an explicit absolute path on a
persistent disk in production. The service account must be able to create/write
this directory. The adapter creates private directories (0700) and files (0600),
and rejects insecure existing directories, symlink ancestry and object entries.
Never put this directory under served uploads or assets; the wiring rejects
that configuration. `PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` are
not required or used by the local driver.

Objects use a private, versioned binary envelope under
`.objects/<logical-root-sha256>/<object-key-sha256>.lbk`; do not edit these files
or treat them as ordinary uploaded files. The envelope persists the key, root,
raw bytes, content type, custom metadata, SHA-256, creation time, and a fresh
UUID on every replacement, including replacement with identical bytes.
The format is four-byte `LBK2` magic, a four-byte big-endian JSON-header length,
the bounded JSON header, then raw payload bytes. The returned generation hashes
the stored UUID and exact header bytes (including the payload digest). Intact
copies to another disk or VPS retain the generations recorded inside manifests.
A valid external content/header rewrite retaining the UUID still invalidates
stale generation conditions.
File/directory fsync and atomic rename publish the envelope as one object.
Cross-process directory locking protects generation preconditions and deletion;
abandoned locks fail closed rather than being guessed stale and removed.
Reads verify the payload digest and nanosecond file identity/stat stability.
Listing checks the bounded header, declared file size and stable file identity
without routinely scanning all historical payloads. If file stats change since
the adapter last observed an object, listing also verifies its payload digest;
reads always verify it. Physical inode/device/timestamps detect active races but
are deliberately not part of the portable generation token. The engine's own
hash, generation, timeCreated, and concurrent-change checks are unchanged.

Keep the directory on a local POSIX filesystem with reliable exclusive mkdir,
atomic rename and fsync semantics. All API workers must see the same disk and
run as the same service account. Do not use separate per-replica disks. A copy
on the same VPS does not protect against loss of the VPS/disk; arrange a
separate off-host copy of this private directory using your existing operations
process. Preserve the entire directory, not just some payload files.

### Optional GCS

Set `BACKUP_STORAGE_DRIVER=gcs` and configure the existing `PRIVATE_OBJECT_DIR`
(`bucket/prefix`) and optional `PUBLIC_OBJECT_SEARCH_PATHS`. GCS is **optional,
not required**. `BACKUP_GCS_AUTH` defaults to `adc`, using the Google SDK's
Application Default Credentials (for example an operator-managed
`GOOGLE_APPLICATION_CREDENTIALS` file). The Replit sidecar is used **only** when
`BACKUP_GCS_AUTH=replit` is explicitly selected; it is unavailable on a plain VPS.

Changing drivers does not migrate existing archives or cloud uploads. Existing
history stays in PostgreSQL, but an old archive can be inspected/restored only
with its original storage available. Keep that storage and its configuration;
do not delete it after switching. The local driver archives the existing
configured local contracts/served asset roots and objects already written
through its local namespace. It does not download remote uploads from GCS:
remote-file references without locally available objects cause backup to fail
explicitly, not silently omit the files.

### Verification without GCS

```sh
env -u BACKUP_GCS_INTEGRATION -u GOOGLE_APPLICATION_CREDENTIALS \
  pnpm exec vitest run artifacts/api-server/src/lib/backups/engine.test.ts \
  artifacts/api-server/src/lib/backups/local-storage.test.ts \
  artifacts/api-server/src/lib/backups/storage-config.test.ts
sh scripts/run-backup-e2e.sh
pnpm run typecheck
```

The end-to-end runner provisions a disposable PostgreSQL cluster and a temporary
local storage directory; it never restores the application's database. It
requires local PostgreSQL tools and an unprivileged account. GCS-specific
coverage is skipped unless `BACKUP_GCS_INTEGRATION=true` and
`GOOGLE_APPLICATION_CREDENTIALS` points to an existing credentials file.
The conservative upload quiet window remains unchanged, including for local
storage; the isolated tests inject zero/virtual wait rather than change production
backup or restore logic.

## Deployment and persistence

The backup control plane is stored in PostgreSQL tables `backup_records`,
`backup_settings`, `backup_runtime`, `backup_access_grants`,
`backup_external_facts`, `backup_invoice_highwater`, and
`backup_deferred_whatsapp`. Apply their
Drizzle migration/schema changes through the normal deployment migration process
before enabling the API or worker. The API and worker do not create or alter
tables at startup.

The API server should mount the backups router and call
`startBackupWorker()` from its normal server startup wiring. The worker uses a
PostgreSQL session advisory lock plus a persisted lease/heartbeat, so at most one
replica claims and runs a durable job. The worker coordination lock uses
one-integer key `764211902`; the shared/exclusive application write fence uses
the distinct one-integer key `764211904`, while the backup engine uses its own
two-integer lock. Its timer is process-local: daily/weekly
jobs are not guaranteed to wake an autoscaled deployment that has gone to
sleep. Keep at least one API worker process alive continuously or use a
continuously running worker deployment. On restart, an expired in-progress job
is marked `failed` with an explicit lease-expiry error; it is never reported as
completed merely because it had been running.

The storage probe is checked before queueing a manual backup and again before
each backup operation, including the mandatory restore safety snapshot. Storage
failures are surfaced to the caller or stored as sanitized job errors.

## Authorization and owner-password gate

Every endpoint requires a valid existing admin bearer session and a
superadministrator account. Every endpoint except `POST /admin/backups/unlock`
also requires the `X-Backup-Access` header. Unlock verifies the password hash
currently stored in `owner_credentials`; it does not create, seed, or read a
different environment password. The opaque 32-byte access token is stored only
as a SHA-256 hash, is bound to the current admin bearer-session hash and owner
password fingerprint, and expires absolutely after **10 minutes**. Changing
the owner credential invalidates existing grants.

Unlock and restore each verify the owner password anew. Restore also requires
`confirmation` to exactly equal the UUID in the route. Passwords are accepted
only in the unlock and restore POST bodies; the access token is returned only
once by unlock and must be sent in the header. Responses are marked
`Cache-Control: private, no-store`; request logging omits headers and bodies.
Incorrect owner-password attempts are persisted per admin session: **5 bad
attempts in a rolling 15-minute window** return HTTP 429 until the window
expires. A restore always reauthenticates even if the access grant has time
remaining.

## API

All paths below are relative to `/api`. API names and payloads:

* `POST /admin/backups/unlock` — body `{ "password": "..." }`; returns
  `{ "accessToken": "...", "expiresAt": "..." }`.
* `GET /admin/backups` — returns
  `{ backups, schedule, runtime, storage, exclusions }`. Backup entries expose
  `id`, `reason`, `status`, `createdAt`, `completedAt`, `bytes`, `rowCount`,
  `tableCount`, `fileCount`, `error`, and `safetyBackupId`. Counts are numeric
  and default to `0` while queued, never `null`. Reasons are `manual`,
  `scheduled`, `restore`, and `pre_restore`; `pre_restore` is the mandatory
  safety snapshot. The schedule contains `enabled`, `frequency`, `localDate`,
  `localTime`, `weekday`, `timeZone`, `nextRunAt`, and `lastRunAt`; runtime
  contains `busy`, `operation`, `jobId`, and `maintenance`; the sentinel
  `operation: "recovery_required"` signals operator recovery. Storage contains
  `ready` and `reason`. All response
  timestamps are ISO-8601 strings.
* `POST /admin/backups` — optional body `{ "label": "..." }`; returns
  `{ "job": record }` with HTTP 202.
* `PUT /admin/backups/schedule` — body
  `{ enabled, frequency, localDate, localTime, weekday, timeZone }`; frequency
  is `once`, `daily`, or `weekly`, time is local `HH:mm`, `weekday` is Sunday
  `0` through Saturday `6`, and `timeZone` is an IANA zone (default
  configuration uses `Asia/Riyadh`). One-time schedules require a future
  `localDate`. Returns `{ "schedule": schedule }`.
* `GET /admin/backups/:id/preview` — returns backup id/date/counts, `bytes`,
  `compatible`, `reason`, and `exclusions`.
* `POST /admin/backups/:id/restore` — body
  `{ "password": "...", "confirmation": "<exact route UUID>" }`; returns
  `{ "job": record }` with HTTP 202.

There are intentionally no delete or download endpoints. Job and schedule
state is durable and visible after API process restarts. Once-only schedules
are disabled when claimed. Daily and weekly catch-up after downtime produces
one catch-up job and advances `nextRunAt` to the next future occurrence rather
than enqueuing every missed interval.

## Restore safety and maintenance

Restore preview calls the backup engine's manifest/integrity inspection before
the restore can be queued. The worker checks it again and marks runtime
maintenance during the entire backup or restore job, including file reads and
writes. After setting maintenance, it obtains the exclusive application write
fence to drain already-admitted shared-fence writers before starting engine
work; API mutations and admitted background writers must hold the shared fence.
It creates and completes a separate `pre_restore` safety backup,
persists its UUID as `safetyBackupId`, and only then invokes the restore engine.
Normal completion or ordinary failure resets maintenance in the worker's
`finally` path. A restore never proceeds if the safety snapshot fails.

Every engine backup/restore currently waits a conservative 15 minutes after
draining writers, so previously issued direct-to-cloud upload URLs expire.
This applies even when the listed objects are old: a signed upload may not yet
have created its object. A manual backup therefore takes at least 15 minutes
plus copying; restore includes a safety backup and a second wait, so it takes
at least 30 minutes plus copying. Keep the worker alive throughout.

WhatsApp business ingress is durably queued separately from restored data and
replayed under the shared writer fence after maintenance. Current provider facts
are rehydrated on successive restores with terminal/uncertain precedence; they
must not be treated as an audit-only store or purged casually.

Use `getMaintenanceState()` in server middleware to read the persisted runtime
flag. While `maintenance` is true, block unsafe application requests. The outer
middleware must exempt the guarded `/admin/backups` namespace using
`backupExemptFromMaintenance(method, path)`; that router enforces a fresh
superadministrator session and access grant and rejects mutations when recovery
is required. Its authentication middleware is scoped to `/admin/backups`.

### Recovery-required state

If the engine throws `BackupRecoveryRequiredError`, or the worker lease expires
during a restore, the job remains `failed` and runtime persists
`recoveryRequired: true`, `operation: "recovery_required"`, and
`maintenance: true`. The worker neither clears this state nor resumes queued
jobs after restart. Reads remain available to a freshly authenticated and
unlocked superadministrator; mutations return HTTP 423 until recovery is
complete.

An authorized operator should:

1. Keep application writes blocked and inspect the failed restore record, its
   `safetyBackupId`, engine error, database state, and affected files. Do not
   mark the restore job completed or automatically retry it.
2. Verify the live database and file state against the completed safety
   snapshot, using a separately reviewed recovery procedure where needed. If
   verification is inconclusive, leave maintenance enabled and escalate.
3. Only after external validation confirms that the live store is consistent,
   use a privileged database session to clear the sentinel in a transaction:

   ```sql
   BEGIN;
   SELECT id, operation, job_id, maintenance, recovery_required
   FROM backup_runtime WHERE id = 1 FOR UPDATE;
   UPDATE backup_runtime
   SET operation = NULL,
       job_id = NULL,
       maintenance = false,
       recovery_required = false,
       lease_owner = NULL,
       lease_expires_at = NULL,
       heartbeat_at = now(),
       updated_at = now()
   WHERE id = 1 AND recovery_required = true;
   COMMIT;
   ```

   Keep the restore job `failed`; clearing runtime is an explicit operator
   attestation, not a fake completion or automatic resume. Queued jobs can run
   only after this deliberate clearing step.

## API error responses

Responses use `{ "error": "..." }`. Important status/error pairs:

* **401** — `Admin authentication required`, or `Owner password is incorrect`.
* **403** — `Super administrator access required`.
* **423** — `Backup access is locked; unlock with the owner password`, or
  `Backup access is expired or invalid; unlock again`, or
  `Backup recovery required; maintenance remains enabled until an operator completes recovery`.
* **429** — `Too many incorrect backup password attempts; try again in 15 minutes`.
* **400** — invalid UUID, schedule, label, missing password, or a confirmation
  that does not exactly match the requested backup UUID.
* **404** — `Completed backup not found`.
* **409** — another job is queued/running, or the selected backup fails
  schema/integrity compatibility checks.
* **503** — owner credential is not configured or backup storage is unavailable.

Stored job errors are truncated and sanitized; database URLs and credential
assignments are redacted. Never add password, bearer token, or raw secret values
to error messages or logs.
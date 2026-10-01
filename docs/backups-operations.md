# Backups operations

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
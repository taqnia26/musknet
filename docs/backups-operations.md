# Backups operations

## Deployment and persistence

The backup control plane is stored in PostgreSQL tables `backup_records`,
`backup_settings`, `backup_runtime`, and `backup_access_grants`. Apply their
Drizzle migration/schema changes through the normal deployment migration process
before enabling the API or worker. The API and worker do not create or alter
tables at startup.

The API server should mount the backups router and call
`startBackupWorker()` from its normal server startup wiring. The worker uses a
PostgreSQL session advisory lock plus a persisted lease/heartbeat, so at most one
replica claims and runs a durable job. Its timer is process-local: daily/weekly
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
  `tableCount`, `fileCount`, `error`, and `safetyBackupId`. The schedule
  contains `enabled`, `frequency`, `localDate`, `localTime`, `weekday`,
  `timeZone`, `nextRunAt`, and `lastRunAt`; runtime contains `busy`,
  `operation`, `jobId`, and `maintenance`; storage contains `ready` and
  `reason`.
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
the restore can be queued. The worker checks it again, marks runtime maintenance
before restore work, creates and completes a separate `restore-safety` backup,
persists its UUID as `safetyBackupId`, and only then invokes the restore engine.
Any error fails the restore job and the worker's `finally` path clears
maintenance. A restore never proceeds if the safety snapshot fails.

Use `getMaintenanceState()` in server middleware to read the persisted runtime
flag. While `maintenance` is true, block unsafe/non-GET application requests;
`backupExemptFromMaintenance(method, path)` identifies the guarded backups GET
paths that must remain readable. Backup POST/PUT routes are not exempt. Do not
mount a broad pathless authentication middleware for this feature; its router
auth is scoped to `/admin/backups`.

## API error responses

Responses use `{ "error": "..." }`. Important status/error pairs:

* **401** — `Admin authentication required`, or `Owner password is incorrect`.
* **403** — `Super administrator access required`.
* **423** — `Backup access is locked; unlock with the owner password`, or
  `Backup access is expired or invalid; unlock again`.
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
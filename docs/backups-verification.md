# Backup/restore verification

Run the real PostgreSQL backup-engine roundtrip from the repository root:

```sh
sh scripts/run-backup-e2e.sh
```

The script does not use `DATABASE_URL` from the shell. It starts a new local
PostgreSQL cluster under a private temporary directory, creates a uniquely
named test database, applies the repository's full Drizzle schema and current
accounting-integrity installer, runs the integration test, then stops and
removes the cluster. It requires local PostgreSQL binaries (`initdb`, `pg_ctl`,
and `psql`), Node, and pnpm; it must run as an unprivileged OS user.

The test invokes the actual `createBackupEngine` with the isolated `pg` pool,
an in-memory private-object storage transport, and a temporary local file root.
It exercises real PostgreSQL advisory locks, catalog/schema fingerprints,
transactions, constraints, sequences, and the installed journal triggers.
The test output includes an `ISOLATED_POSTGRES_BACKUP_EVIDENCE` record with the
PostgreSQL version, isolated database/data directory, non-empty backup row/table
and file counts, archive byte count/schema hash, rollback checks, and sequence
high-water evidence.

The current production `journal_entry_status` enum is `draft`, `posted`, and
`reversed`; it has no `voided` journal-entry value. The roundtrip therefore
verifies real posted and reversed journal entries and a `voided` purchase
receipt, using the actual installed ledger immutability/balance triggers.
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createBackupEngine,
  type BackupObjectStorage,
  type StoredObject,
} from "../../../artifacts/api-server/src/lib/backups/engine";

const runIntegration = process.env.BACKUP_POSTGRES_E2E === "true";
const { Pool } = pg;

class PrivateMemoryStorage implements BackupObjectStorage {
  readonly objectRoots = ["private-backup-e2e", "public-e2e-inputs"] as const;
  private readonly values = new Map<
    string,
    { key: string; root: string; data: Buffer; contentType: string; metadata: Record<string, string>; generation: string }
  >();
  private nextGeneration = 0;

  async list(prefix: string): Promise<StoredObject[]> {
    return [...this.values.values()]
      .filter((value) => !prefix || value.key.startsWith(prefix))
      .map((value) => ({
        key: value.key,
        size: value.data.length,
        generation: value.generation,
        contentType: value.contentType,
        metadata: { ...value.metadata },
        root: value.root,
      }));
  }

  private identity(key: string, root = this.objectRoots[0]) {
    if (!this.objectRoots.includes(root as (typeof this.objectRoots)[number])) {
      throw new Error(`Unconfigured isolated object root: ${root}`);
    }
    return `${root}\0${key}`;
  }

  async read(key: string, root?: string) {
    const value = this.values.get(this.identity(key, root));
    if (!value) throw new Error(`Missing isolated backup test object: ${key}`);
    return {
      data: Buffer.from(value.data),
      contentType: value.contentType,
      metadata: { ...value.metadata },
      generation: value.generation,
    };
  }

  async write(
    key: string,
    data: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; ifGenerationMatch?: string | null; root?: string },
  ) {
    const root = options.root ?? this.objectRoots[0];
    const identity = this.identity(key, root);
    const existing = this.values.get(identity);
    if (options.ifGenerationMatch === null && existing) {
      throw new Error(`Immutable test archive object already exists: ${key}`);
    }
    if (options.ifGenerationMatch && existing?.generation !== options.ifGenerationMatch) {
      throw new Error(`Test object generation conflict: ${key}`);
    }
    const value = {
      key,
      root,
      data: Buffer.from(data),
      contentType: options.contentType,
      metadata: { ...options.metadata },
      generation: String(++this.nextGeneration),
    };
    this.values.set(identity, value);
    return {
      key,
      size: value.data.length,
      generation: value.generation,
      contentType: value.contentType,
      metadata: { ...value.metadata },
      root,
    };
  }

  async delete(key: string, ifGenerationMatch?: string | null, root?: string) {
    const identity = this.identity(key, root);
    const existing = this.values.get(identity);
    if (!existing) return;
    if (ifGenerationMatch && existing.generation !== ifGenerationMatch) {
      throw new Error(`Test object generation conflict: ${key}`);
    }
    this.values.delete(identity);
  }

  tamper(key: string, data: Buffer) {
    const existing = this.values.get(this.identity(key));
    if (!existing) throw new Error(`Missing isolated backup test object: ${key}`);
    existing.data = Buffer.from(data);
  }
}

describe.runIf(runIntegration)("backup engine: disposable real PostgreSQL roundtrip", () => {
  const databaseUrl = process.env.DATABASE_URL;
  const clusterDirectory = process.env.BACKUP_E2E_CLUSTER_DIR;
  const expectedDatabase = process.env.BACKUP_E2E_DATABASE;
  let pool: InstanceType<typeof Pool>;
  let storage: PrivateMemoryStorage;
  let engine: ReturnType<typeof createBackupEngine>;
  let fileRoot: string;
  let initialObjectBytes: Buffer;
  let initialLocalBytes: Buffer;
  let archivedDatabaseBytes: Buffer;
  let payloadId: number;
  let postedEntryId: number;
  let postedLineId: number;
  let receiptId: number;
  let preRestoreSequenceHighwater: bigint;
  let databaseEvidence: { version: string; database: string; dataDirectory: string };

  beforeAll(async () => {
    if (!databaseUrl || !clusterDirectory || !expectedDatabase) {
      throw new Error("The isolated backup PostgreSQL runner must provide DATABASE_URL and cluster identity.");
    }
    const target = new URL(databaseUrl);
    expect(["127.0.0.1", "localhost", "::1"]).toContain(target.hostname);
    expect(target.password).toBe("");
    expect(target.pathname.slice(1)).toBe(expectedDatabase);
    expect(expectedDatabase).toMatch(/^backup_e2e_[a-z0-9_]+$/);

    pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      connectionTimeoutMillis: 5_000,
      query_timeout: 20_000,
      statement_timeout: 20_000,
    });
    const identity = await pool.query(
      `SELECT version() AS version, current_database() AS database,
              current_setting('data_directory') AS "dataDirectory",
              inet_server_addr()::text AS "serverAddress"`,
    );
    databaseEvidence = identity.rows[0] as typeof databaseEvidence;
    expect(databaseEvidence.database).toBe(expectedDatabase);
    expect(path.resolve(databaseEvidence.dataDirectory)).toBe(path.resolve(clusterDirectory));
    expect(String(identity.rows[0]?.serverAddress).split("/")[0]).toBe("127.0.0.1");

    const accountingRules = await pool.query(`
      SELECT t.tgname, pg_get_functiondef(p.oid) AS definition
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgrelid IN ('public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass)
         AND NOT t.tgisinternal
       ORDER BY t.tgname
    `);
    const triggerDefinitions = new Map(accountingRules.rows.map((row) => [String(row.tgname), String(row.definition)]));
    expect(triggerDefinitions.get("journal_entries_immutable")).toContain("posted journal entries are immutable");
    expect(triggerDefinitions.get("journal_entry_lines_immutable")).toContain("posted journal entry lines are immutable");
    expect(triggerDefinitions.get("journal_entries_balanced")).toContain("must contain at least two balanced lines");
    expect(triggerDefinitions.get("journal_entry_lines_balanced")).toContain("must contain at least two balanced lines");

    await pool.query(`
      CREATE TABLE public.roundtrip_payload (
        id serial PRIMARY KEY,
        exact_amount numeric(38,12) NOT NULL,
        binary_value bytea NOT NULL,
        object_reference text NOT NULL,
        local_reference text NOT NULL,
        marker text NOT NULL,
        CONSTRAINT roundtrip_payload_amount_nonnegative CHECK (exact_amount >= 0)
      );
      CREATE FUNCTION public.backup_e2e_restore_guard() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM public.backup_runtime
           WHERE id = 1 AND recovery_required = true
        ) THEN
          RAISE EXCEPTION 'backup e2e injected restore failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER backup_e2e_restore_guard
        BEFORE INSERT ON public.roundtrip_payload
        FOR EACH ROW EXECUTE FUNCTION public.backup_e2e_restore_guard();
    `);

    fileRoot = await mkdtemp(path.join(os.tmpdir(), "backup-e2e-files-"));
    storage = new PrivateMemoryStorage();
    initialObjectBytes = Buffer.from([0, 1, 17, 128, 254, 255]);
    initialLocalBytes = Buffer.from([255, 0, 34, 67, 200]);
    await storage.write("e2e/object.bin", initialObjectBytes, {
      contentType: "application/octet-stream",
      metadata: { fixture: "isolated-postgres-e2e" },
      root: "public-e2e-inputs",
    });
    await writeFile(path.join(fileRoot, "evidence.bin"), initialLocalBytes);

    engine = createBackupEngine({
      pool,
      storage,
      privateObjectRoot: "private-backup-e2e",
      fileRoots: [{ kind: "attached_assets", directory: fileRoot }],
      operationLockTimeoutMs: 5_000,
      uploadQuiescenceMs: 0,
    });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (fileRoot) await rm(fileRoot, { recursive: true, force: true });
  });

  it("verifies archive-before-write checks, transactional rollback, and faithful restore against PostgreSQL", async () => {
    const admin = await pool.query(
      `INSERT INTO admin_users (email, name, password_hash, is_super_admin)
       VALUES ('backup-e2e-admin@example.invalid', 'Admin before', 'fixture-hash-not-a-password', true)
       RETURNING id`,
    );
    const adminId = Number(admin.rows[0]!.id);
    const owner = await pool.query(
      `INSERT INTO owner_users (email, name, password_hash)
       VALUES ('backup-e2e-owner@example.invalid', 'Owner before', 'fixture-hash-not-a-password')
       RETURNING id`,
    );
    const ownerId = Number(owner.rows[0]!.id);
    const accounts = await pool.query(`
      INSERT INTO accounting_accounts (code, name_ar, name_en, account_type, normal_balance)
      VALUES
        ('E2E-CASH', 'نقد تجريبي', 'E2E Cash', 'asset', 'debit'),
        ('E2E-SALES', 'مبيعات تجريبية', 'E2E Sales', 'revenue', 'credit')
      RETURNING id
    `);
    const debitAccountId = Number(accounts.rows[0]!.id);
    const creditAccountId = Number(accounts.rows[1]!.id);

    await pool.query(`
      INSERT INTO backup_records (reason, label, status, bytes, row_count, table_count, file_count)
      VALUES ('manual', 'isolated control fixture', 'queued', 0, 0, 0, 0);
      INSERT INTO backup_settings (id, enabled, frequency, local_time, time_zone)
      VALUES (1, true, 'daily', '02:00', 'Asia/Riyadh');
      INSERT INTO backup_runtime (id, maintenance, recovery_required, lease_owner)
      VALUES (1, true, false, 'isolated-control-owner');
    `);
    await pool.query(
      `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at)
       VALUES ($1, 'test-only-admin-session-hash', now() + interval '2 hours')`,
      [adminId],
    );
    await pool.query(
      `INSERT INTO owner_sessions (owner_user_id, token_hash, expires_at)
       VALUES ($1, 'test-only-owner-session-hash', now() + interval '2 hours')`,
      [ownerId],
    );
    await pool.query(
      `INSERT INTO storefront_otp_records (phone, code, expires_at)
       VALUES ('+10000000001', '000001', now() + interval '5 minutes')`,
    );
    await pool.query(`
      INSERT INTO shiphero_webhook_events (message_id, event_type, payload, outcome)
      VALUES ('isolated-webhook-1', 'order.updated', '{"fixture":true}'::jsonb, 'received')
    `);

    const ledger = await pool.connect();
    try {
      await ledger.query("BEGIN");
      const original = await ledger.query(
        `INSERT INTO journal_entries (
           entry_number, entry_date, description, status, source_type, source_id,
           created_by
         )
         VALUES ('E2E-JOURNAL-ORIGINAL', '2026-01-02', 'Isolated posted and reversed fixture',
                 'draft', 'backup_e2e', 'original', $1)
         RETURNING id`,
        [adminId],
      );
      postedEntryId = Number(original.rows[0]!.id);
      const originalLines = await ledger.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, debit, credit)
         VALUES ($1, 1, $2, '123456789012345.6789', '0'),
                ($1, 2, $3, '0', '123456789012345.6789')
         RETURNING id`,
        [postedEntryId, debitAccountId, creditAccountId],
      );
      postedLineId = Number(originalLines.rows[0]!.id);
      await ledger.query(
        "UPDATE journal_entries SET status = 'posted', posted_by = $2, posted_at = now() WHERE id = $1",
        [postedEntryId, adminId],
      );
      const reversal = await ledger.query(
        `INSERT INTO journal_entries (
           entry_number, entry_date, description, status, source_type, source_id,
           reversal_of_entry_id, created_by
         )
         VALUES ('E2E-JOURNAL-REVERSAL', '2026-01-03', 'Isolated posted reversal',
                 'draft', 'backup_e2e', 'reversal', $1, $2)
         RETURNING id`,
        [postedEntryId, adminId],
      );
      const reversalId = Number(reversal.rows[0]!.id);
      await ledger.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, debit, credit)
         VALUES ($1, 1, $2, '0', '123456789012345.6789'),
                ($1, 2, $3, '123456789012345.6789', '0')`,
        [reversalId, debitAccountId, creditAccountId],
      );
      await ledger.query(
        "UPDATE journal_entries SET status = 'posted', posted_by = $2, posted_at = now() WHERE id = $1",
        [reversalId, adminId],
      );
      await ledger.query("UPDATE journal_entries SET status = 'reversed' WHERE id = $1", [postedEntryId]);
      await ledger.query("COMMIT");
    } catch (error) {
      await ledger.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      ledger.release();
    }

    const voidReceipt = await pool.query(
      `INSERT INTO purchase_receipts (
         receipt_number, vendor_name, receipt_date, amount, paid_amount, status, created_by
       )
       VALUES ('E2E-VOIDED-RECEIPT', 'Isolated vendor', '2026-01-03', '999999999999999.0001',
               '0', 'voided', $1)
       RETURNING id`,
      [adminId],
    );
    receiptId = Number(voidReceipt.rows[0]!.id);

    const payload = await pool.query(
      `INSERT INTO roundtrip_payload (
         exact_amount, binary_value, object_reference, local_reference, marker
       )
       VALUES (
         '12345678901234567890123456.123456789012',
         $1, '/objects/e2e/object.bin', '/api/media/evidence.bin', 'archived-value'
       )
       RETURNING id`,
      [Buffer.from([0, 255, 7, 128, 13, 10, 254])],
    );
    payloadId = Number(payload.rows[0]!.id);

    const exhibition = await pool.query(
      `INSERT INTO exhibitions (name, location, start_date, end_date, budget, status)
       VALUES ('Backup E2E invoice exhibition', 'Isolated test', '2026-01-01', '2026-01-02', 0, 'completed')
       RETURNING id`,
    );
    const snapshotInvoiceSequence = 401;
    await pool.query(
      `INSERT INTO tax_invoices (
         exhibition_id, sequence_number, invoice_number, seller_name, issue_datetime,
         seller_vat_number, subtotal, vat_amount, total_amount, qr_code_data
       )
       VALUES ($1, $2, 'E2E-INV-401', 'Isolated seller', '2026-01-01T00:00:00Z',
               'E2E-VAT', 100, 15, 115, 'isolated-qr')`,
      [exhibition.rows[0]!.id, snapshotInvoiceSequence],
    );

    const snapshot = await engine.runBackup({ id: "roundtrip", reason: "manual", actorId: adminId });
    expect(snapshot.rowCount).toBeGreaterThan(0);
    expect(snapshot.tableCount).toBeGreaterThan(0);
    expect(snapshot.fileCount).toBe(2);
    expect(snapshot.bytes).toBeGreaterThan(0);
    expect(snapshot.schemaHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await engine.inspectBackup("roundtrip")).toMatchObject({ compatible: true, fileCount: 2 });
    archivedDatabaseBytes = (await storage.read("backups/roundtrip/database.json.gz")).data;

    const immutableBefore = await pool.query(
      `SELECT id, exact_amount::text AS amount, encode(binary_value, 'hex') AS "binaryHex", marker
         FROM roundtrip_payload WHERE id = $1`,
      [payloadId],
    );
    expect(immutableBefore.rows[0]).toMatchObject({
      amount: "12345678901234567890123456.123456789012",
      binaryHex: "00ff07800d0afe",
      marker: "archived-value",
    });
    expect(await pool.query("SELECT status FROM journal_entries WHERE id = $1", [postedEntryId])).toMatchObject({
      rows: [{ status: "reversed" }],
    });
    expect(await pool.query("SELECT status FROM purchase_receipts WHERE id = $1", [receiptId])).toMatchObject({
      rows: [{ status: "voided" }],
    });

    await pool.query(
      `UPDATE roundtrip_payload
          SET exact_amount = '17.000000000001', binary_value = $2, marker = 'live-mutated'
        WHERE id = $1`,
      [payloadId, Buffer.from([9, 8, 7])],
    );
    await pool.query("UPDATE purchase_receipts SET status = 'posted' WHERE id = $1", [receiptId]);
    await pool.query("UPDATE admin_users SET name = 'Admin retained live' WHERE id = $1", [adminId]);
    await pool.query("UPDATE owner_users SET name = 'Owner retained live' WHERE id = $1", [ownerId]);
    await pool.query("UPDATE backup_records SET status = 'completed' WHERE label = 'isolated control fixture'");
    await pool.query("UPDATE backup_settings SET enabled = false WHERE id = 1");
    await pool.query("UPDATE backup_runtime SET maintenance = false WHERE id = 1");
    await pool.query(
      `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at)
       VALUES ($1, 'test-only-late-admin-session-hash', now() + interval '2 hours')`,
      [adminId],
    );
    await pool.query(
      `INSERT INTO storefront_otp_records (phone, code, expires_at)
       VALUES ('+10000000002', '000002', now() + interval '5 minutes')`,
    );
    await pool.query(`
      INSERT INTO shiphero_webhook_events (message_id, event_type, payload, outcome)
      VALUES ('isolated-webhook-late', 'order.updated', '{"fixture":"late"}'::jsonb, 'queued')
    `);
    const liveInvoiceHighwater = 90_001;
    await pool.query(
      `INSERT INTO tax_invoices (
         exhibition_id, sequence_number, invoice_number, seller_name, issue_datetime,
         seller_vat_number, subtotal, vat_amount, total_amount, qr_code_data
       )
       VALUES ($1, $2, 'E2E-INV-90001', 'Isolated seller', '2026-01-02T00:00:00Z',
               'E2E-VAT', 200, 30, 230, 'isolated-qr-late')`,
      [exhibition.rows[0]!.id, liveInvoiceHighwater],
    );
    expect(
      Number((await pool.query("SELECT max(sequence_number) AS maximum FROM tax_invoices")).rows[0]!.maximum),
    ).toBe(liveInvoiceHighwater);
    const objectAfterMutation = Buffer.from([99, 98, 97, 0]);
    const localAfterMutation = Buffer.from([1, 3, 3, 7, 255]);
    await storage.write("e2e/object.bin", objectAfterMutation, {
      contentType: "application/octet-stream",
      metadata: { fixture: "mutated-live-value" },
      root: "public-e2e-inputs",
    });
    await writeFile(path.join(fileRoot, "evidence.bin"), localAfterMutation);

    const sequence = await pool.query(
      "SELECT pg_get_serial_sequence('public.roundtrip_payload', 'id') AS name",
    );
    const sequenceName = String(sequence.rows[0]!.name);
    await pool.query("SELECT setval($1::regclass, 90000, true)", [sequenceName]);
    const changedPayload = await pool.query(
      `INSERT INTO roundtrip_payload (
         exact_amount, binary_value, object_reference, local_reference, marker
       )
       VALUES ('5.000000000000', $1, '/objects/e2e/object.bin', '/api/media/evidence.bin', 'post-snapshot')
       RETURNING id`,
      [Buffer.from([5])],
    );
    preRestoreSequenceHighwater = BigInt(
      (await pool.query("SELECT pg_sequence_last_value($1::regclass)::text AS value", [sequenceName])).rows[0]!.value,
    );
    expect(Number(changedPayload.rows[0]!.id)).toBeGreaterThan(90_000);

    const unchangedAfterFailedPreflight = async () => {
      const livePayload = await pool.query(
        `SELECT exact_amount::text AS amount, encode(binary_value, 'hex') AS "binaryHex", marker
           FROM roundtrip_payload WHERE id = $1`,
        [payloadId],
      );
      expect(livePayload.rows[0]).toMatchObject({
        amount: "17.000000000001",
        binaryHex: "090807",
        marker: "live-mutated",
      });
      expect((await storage.read("e2e/object.bin", "public-e2e-inputs")).data).toEqual(objectAfterMutation);
      expect(await readFile(path.join(fileRoot, "evidence.bin"))).toEqual(localAfterMutation);
    };

    await pool.query("ALTER TABLE roundtrip_payload ADD COLUMN schema_drift text");
    await expect(engine.runRestore("roundtrip")).rejects.toThrow(/schema does not match/i);
    await unchangedAfterFailedPreflight();
    await pool.query("ALTER TABLE roundtrip_payload DROP COLUMN schema_drift");

    storage.tamper("backups/roundtrip/database.json.gz", Buffer.from("corrupt archive bytes"));
    await expect(engine.runRestore("roundtrip")).rejects.toThrow(/corrupt/i);
    await unchangedAfterFailedPreflight();
    storage.tamper("backups/roundtrip/database.json.gz", archivedDatabaseBytes);

    await pool.query("UPDATE backup_runtime SET recovery_required = true WHERE id = 1");
    await expect(engine.runRestore("roundtrip")).rejects.toThrow(/backup e2e injected restore failure/);
    await unchangedAfterFailedPreflight();
    await pool.query("UPDATE backup_runtime SET recovery_required = false WHERE id = 1");

    await engine.runRestore("roundtrip");

    const restoredPayload = await pool.query(
      `SELECT exact_amount::text AS amount, encode(binary_value, 'hex') AS "binaryHex",
              object_reference AS "objectReference", local_reference AS "localReference", marker
         FROM roundtrip_payload WHERE id = $1`,
      [payloadId],
    );
    expect(restoredPayload.rowCount).toBe(1);
    expect(restoredPayload.rows[0]).toEqual({
      amount: "12345678901234567890123456.123456789012",
      binaryHex: "00ff07800d0afe",
      objectReference: "/objects/e2e/object.bin",
      localReference: "/api/media/evidence.bin",
      marker: "archived-value",
    });
    expect((await pool.query("SELECT count(*)::int AS count FROM roundtrip_payload")).rows[0]?.count).toBe(1);
    expect((await pool.query("SELECT status FROM journal_entries WHERE id = $1", [postedEntryId])).rows[0]?.status).toBe("reversed");
    expect((await pool.query("SELECT status FROM purchase_receipts WHERE id = $1", [receiptId])).rows[0]?.status).toBe("voided");
    expect(await pool.query("SELECT sequence_number, invoice_number FROM tax_invoices")).toMatchObject({
      rowCount: 1,
      rows: [{ sequence_number: snapshotInvoiceSequence, invoice_number: "E2E-INV-401" }],
    });
    expect(
      BigInt((await pool.query("SELECT max(value)::text AS value FROM backup_invoice_highwater")).rows[0]!.value),
    ).toBeGreaterThanOrEqual(BigInt(liveInvoiceHighwater));
    expect((await pool.query("SELECT id FROM journal_entries WHERE status = 'posted'")).rowCount).toBe(1);
    expect((await pool.query("SELECT id FROM journal_entries WHERE status = 'reversed'")).rowCount).toBe(1);
    expect((await pool.query("SELECT debit::text, credit::text FROM journal_entry_lines WHERE id = $1", [postedLineId])).rows[0]).toEqual({
      debit: "123456789012345.6789",
      credit: "0.0000",
    });

    expect((await storage.read("e2e/object.bin", "public-e2e-inputs")).data).toEqual(initialObjectBytes);
    expect(await readFile(path.join(fileRoot, "evidence.bin"))).toEqual(initialLocalBytes);
    expect((await storage.list("backups/roundtrip")).map((object) => object.key)).toEqual(
      expect.arrayContaining([
        "backups/roundtrip/database.json.gz",
        "backups/roundtrip/manifest.json",
        expect.stringMatching(/^backups\/roundtrip\/files\//),
      ]),
    );

    expect((await pool.query("SELECT name FROM admin_users WHERE id = $1", [adminId])).rows[0]?.name).toBe("Admin retained live");
    expect((await pool.query("SELECT name FROM owner_users WHERE id = $1", [ownerId])).rows[0]?.name).toBe("Owner retained live");
    expect((await pool.query("SELECT status FROM backup_records WHERE label = 'isolated control fixture'")).rows[0]?.status).toBe("completed");
    expect((await pool.query("SELECT enabled FROM backup_settings WHERE id = 1")).rows[0]?.enabled).toBe(false);
    expect((await pool.query("SELECT maintenance, recovery_required FROM backup_runtime WHERE id = 1")).rows[0]).toEqual({
      maintenance: false,
      recovery_required: false,
    });
    expect((await pool.query("SELECT count(*)::int AS count FROM admin_sessions")).rows[0]?.count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM owner_sessions")).rows[0]?.count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM storefront_otp_records")).rows[0]?.count).toBe(0);
    expect(await pool.query(
      `SELECT message_id, outcome FROM shiphero_webhook_events ORDER BY message_id`,
    )).toMatchObject({
      rows: [
        { message_id: "isolated-webhook-1", outcome: "quarantined" },
        { message_id: "isolated-webhook-late", outcome: "queued" },
      ],
    });

    const constraint = await pool.query(`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.roundtrip_payload'::regclass
         AND conname = 'roundtrip_payload_amount_nonnegative'
    `);
    expect(constraint.rowCount).toBe(1);
    await expect(
      pool.query(
        `INSERT INTO roundtrip_payload (
           exact_amount, binary_value, object_reference, local_reference, marker
         )
         VALUES ('-1', '\\x00', '/objects/e2e/object.bin', '/api/media/evidence.bin', 'invalid')`,
      ),
    ).rejects.toThrow(/roundtrip_payload_amount_nonnegative/);

    await expect(
      pool.query("UPDATE journal_entries SET description = 'forbidden' WHERE id = $1", [postedEntryId]),
    ).rejects.toThrow(/posted journal entries are immutable/);
    await expect(
      pool.query("UPDATE journal_entry_lines SET description = 'forbidden' WHERE id = $1", [postedLineId]),
    ).rejects.toThrow(/posted journal entry lines are immutable/);
    await expect(
      pool.query("DELETE FROM journal_entries WHERE id = $1", [postedEntryId]),
    ).rejects.toThrow(/posted journal entries are immutable/);

    const providerCustomer = await pool.query(
      `INSERT INTO storefront_customers (phone, name)
       VALUES ('+10000000003', 'Backup E2E provider parent')
       RETURNING id`,
    );
    const providerOrder = await pool.query(
      `INSERT INTO storefront_orders (
         user_id, order_number, subtotal, shipping_cost, discount, tax, total,
         address_json, shipping_method, payment_method, status, payment_status
       )
       VALUES ($1, 'E2E-PROVIDER-PARENT-ORDER', 10, 0, 0, 0, 10,
               '{"fixture":"isolated"}', 'standard', 'cash', 'pending_review', 'pending')
       RETURNING id`,
      [providerCustomer.rows[0]!.id],
    );
    const parentSnapshot = await engine.runBackup({
      id: "roundtrip-with-provider-parent",
      reason: "manual",
      actorId: adminId,
    });
    expect(parentSnapshot.rowCount).toBeGreaterThan(0);
    expect(await engine.inspectBackup("roundtrip-with-provider-parent")).toMatchObject({ compatible: true });

    const dispatchPayload = { zLast: "z", aFirst: "a", nested: { y: 2, b: 1 } };
    const dispatchResponse = { zResponse: 2, aResponse: 1 };
    const dispatch = await pool.query(
      `INSERT INTO shiphero_dispatches (
         order_id, order_number, status, remote_order_id, payload, response,
         attempts, sent_at, last_attempt_at
       )
       VALUES ($1, 'E2E-PROVIDER-PARENT-ORDER', 'sent', 'e2e-remote-dispatch',
               $2::jsonb, $3::jsonb, 1, '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z')
       RETURNING id`,
      [providerOrder.rows[0]!.id, JSON.stringify(dispatchPayload), JSON.stringify(dispatchResponse)],
    );
    const dispatchId = Number(dispatch.rows[0]!.id);

    // The older archive predates both the business parent and its terminal provider dispatch.
    // The dispatch must be retained as a typed JSONB fact when the parent disappears.
    await engine.runRestore("roundtrip");
    expect((await pool.query("SELECT id FROM storefront_orders WHERE id = $1", [providerOrder.rows[0]!.id])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM shiphero_dispatches WHERE id = $1", [dispatchId])).rowCount).toBe(0);
    const parkedDispatch = await pool.query(
      `SELECT source_table, row_hash, payload
         FROM backup_external_facts
        WHERE source_table = 'shiphero_dispatches'`,
    );
    expect(parkedDispatch.rowCount).toBe(1);
    const factRow = parkedDispatch.rows[0]!;
    const factPayload = factRow.payload as {
      format: string;
      version: number;
      sourceTable: string;
      columns: { name: string; type: string }[];
      values: (string | null)[];
    };
    expect(factPayload).toMatchObject({
      format: "replit-external-provider-fact",
      version: 1,
      sourceTable: "shiphero_dispatches",
    });
    const factJson = JSON.stringify({
      format: factPayload.format,
      version: factPayload.version,
      sourceTable: factPayload.sourceTable,
      columns: factPayload.columns,
      values: factPayload.values,
    });
    expect(createHash("sha256").update(factJson).digest("hex")).toBe(factRow.row_hash);
    const dispatchPayloadIndex = factPayload.columns.findIndex((column) => column.name === "payload");
    expect(dispatchPayloadIndex).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(factPayload.values[dispatchPayloadIndex]!)).toEqual(dispatchPayload);

    // This compatible archive contains the business parent but predates its dispatch.
    // Rehydration now succeeds from backup_external_facts without duplicating the send.
    await engine.runRestore("roundtrip-with-provider-parent");
    expect((await pool.query("SELECT id FROM storefront_orders WHERE id = $1", [providerOrder.rows[0]!.id])).rowCount).toBe(1);
    const rehydratedDispatch = await pool.query(
      `SELECT id, order_id, status, remote_order_id, payload, response
         FROM shiphero_dispatches
        WHERE order_id = $1`,
      [providerOrder.rows[0]!.id],
    );
    expect(rehydratedDispatch).toMatchObject({
      rowCount: 1,
      rows: [{
        id: dispatchId,
        order_id: Number(providerOrder.rows[0]!.id),
        status: "sent",
        remote_order_id: "e2e-remote-dispatch",
        payload: dispatchPayload,
        response: dispatchResponse,
      }],
    });
    expect(await pool.query(
      `SELECT message_id, outcome FROM shiphero_webhook_events ORDER BY message_id`,
    )).toMatchObject({
      rows: [
        { message_id: "isolated-webhook-1", outcome: "quarantined" },
        { message_id: "isolated-webhook-late", outcome: "queued" },
      ],
    });

    const sequenceNext = BigInt(
      (await pool.query("SELECT nextval($1::regclass)::text AS value", [sequenceName])).rows[0]!.value,
    );
    expect(sequenceNext).toBeGreaterThan(preRestoreSequenceHighwater);

    console.log(
      "ISOLATED_POSTGRES_BACKUP_EVIDENCE",
      JSON.stringify({
        postgres: databaseEvidence.version,
        database: databaseEvidence.database,
        dataDirectory: databaseEvidence.dataDirectory,
        snapshot: {
          rows: snapshot.rowCount,
          tables: snapshot.tableCount,
          files: snapshot.fileCount,
          bytes: snapshot.bytes,
          schemaHash: snapshot.schemaHash,
        },
        roundtrip: "numeric, bytea, constraints, journal triggers, private objects, local files, and protected/ephemeral policies verified",
        rollback: "schema preflight, corrupt archive, and injected post-file/pre-commit failure left live rows and both file stores unchanged",
        sequence: { highwaterBeforeRestore: String(preRestoreSequenceHighwater), nextGeneratedId: String(sequenceNext) },
      }),
    );
  }, 210_000);
});
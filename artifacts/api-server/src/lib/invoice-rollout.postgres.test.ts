import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { db, pool, ordersTable, companyOrdersTable, orderEditAuditsTable, invoiceDesignSettingsTable } from "@workspace/db";

describe.skipIf(process.env.INDIVIDUAL_INVOICE_POSTGRES_E2E!=="true")("additive rollout from the base schema",()=>{
  it("upgrades missing order prerequisites and invoice settings idempotently without business writes",async()=>{
    const target=new URL(process.env.DATABASE_URL!);
    expect(["localhost","127.0.0.1","[::1]"]).toContain(target.hostname);
    const identity=await pool.query("select current_database() db, current_setting('data_directory') directory");
    expect(identity.rows[0].db).toBe(process.env.INDIVIDUAL_INVOICE_E2E_DATABASE);
    expect(identity.rows[0].directory).toBe(process.env.INDIVIDUAL_INVOICE_E2E_CLUSTER_DIR);
    // Only reconstructed tables must be empty. Other isolated suites may retain
    // immutable invoice fixtures; the upgrade must leave those exactly unchanged.
    const invoiceSnapshot=JSON.stringify((await pool.query("SELECT * FROM tax_invoices ORDER BY id")).rows);
    for(const table of ["storefront_orders","company_orders","order_edit_audits"]) {
      const count=await pool.query(`SELECT count(*)::int n FROM ${table}`);
      expect(count.rows[0].n).toBe(0);
    }
    await pool.query(`DROP TABLE invoice_design_settings; DROP TABLE order_edit_audits;
      ALTER TABLE storefront_orders DROP COLUMN admin_edit_snapshot;
      ALTER TABLE company_orders DROP COLUMN admin_edit_snapshot;`);
    const files=["order-editing-prerequisites.sql","invoice-design-settings.sql"];
    for(let pass=0;pass<2;pass++) for(const file of files) {
      await pool.query(readFileSync(new URL(`../../../../lib/db/sql/${file}`,import.meta.url),"utf8"));
    }
    expect(await db.select().from(ordersTable).limit(1)).toEqual([]);
    expect(await db.select().from(companyOrdersTable).limit(1)).toEqual([]);
    expect(await db.select().from(orderEditAuditsTable).limit(1)).toEqual([]);
    const [settings]=await db.select().from(invoiceDesignSettingsTable);
    expect(settings).toMatchObject({id:1,revision:0,draft:null,published:null});
    const constraints=await pool.query(`SELECT conname,contype FROM pg_constraint WHERE conrelid='order_edit_audits'::regclass`);
    expect(constraints.rows.filter(r=>r.contype==="f")).toHaveLength(3);
    expect(constraints.rows.filter(r=>r.contype==="c")).toHaveLength(4);
    expect(constraints.rows.filter(r=>r.contype==="u")).toHaveLength(1);
    const snapshots=await pool.query(`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
      WHERE table_name IN ('storefront_orders','company_orders') AND column_name='admin_edit_snapshot'`);
    expect(snapshots.rows).toHaveLength(2);
    expect(snapshots.rows.every(r=>r.data_type==="jsonb"&&r.is_nullable==="YES")).toBe(true);
    const checks=await pool.query(`SELECT conname FROM pg_constraint WHERE conname IN
      ('storefront_orders_admin_edit_snapshot_check','company_orders_admin_edit_snapshot_check')`);
    expect(checks.rows).toHaveLength(2);
    expect(JSON.stringify((await pool.query("SELECT * FROM tax_invoices ORDER BY id")).rows)).toBe(invoiceSnapshot);
  });
});
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db, pool, adminUsersTable, adminPermissionsTable, adminUserPermissionsTable, adminSessionsTable,
  invoiceDesignSettingsTable, invoicesTable,
} from "@workspace/db";
import { createTemplate, sampleInvoice } from "@workspace/invoice-document/core";
import app from "../app";
import { createAdminSession } from "../lib/admin-auth";
import { closeInvoiceBrowser, createSharedInvoicePdf } from "../lib/invoice-browser-pdf";
import { sendInvoiceEmail } from "../lib/invoice-email";
const intercepted=vi.hoisted(()=>({body:null as Record<string,any>|null}));
vi.mock("@replit/connectors-sdk",()=>({ReplitConnectors:class {
  async proxy(_connector:string,_path:string,options:{body:Record<string,any>}) {
    intercepted.body=options.body;return new Response(JSON.stringify({id:"mock-only-no-email"}));
  }
}}));
const ids=[1801000001,1801000002,1801000003,1801000004],tokens:string[]=[];
const path="/api/admin/finance/invoice-design",publicPath="/api/admin/invoices/design";
const auth=(index:number)=>({Authorization:`Bearer ${tokens[index]}`});
let invoiceFingerprint:string;

describe.skipIf(process.env.INDIVIDUAL_INVOICE_POSTGRES_E2E!=="true").sequential("global invoice design in isolated development PostgreSQL",()=>{
  beforeAll(async()=>{
    const target=new URL(process.env.DATABASE_URL!);
    expect(["localhost","127.0.0.1","[::1]"]).toContain(target.hostname);
    const identity=await pool.query("select current_database() db, current_setting('data_directory') directory");
    expect(identity.rows[0].db).toBe(process.env.INDIVIDUAL_INVOICE_E2E_DATABASE);
    expect(identity.rows[0].directory).toBe(process.env.INDIVIDUAL_INVOICE_E2E_CLUSTER_DIR);
    await db.insert(invoiceDesignSettingsTable).values({id:1}).onConflictDoNothing();
    await db.insert(adminPermissionsTable).values([
      {module:"finance",action:"view"},{module:"finance",action:"edit"},{module:"invoices",action:"view"},
    ]).onConflictDoNothing();
    const permissions=await db.select().from(adminPermissionsTable);
    await db.insert(adminUsersTable).values(ids.map((id,n)=>({
      id,email:`invoice-design-${n}@test.invalid`,name:"Isolated invoice designer",passwordHash:"test-only",
    })));
    await db.insert(adminUserPermissionsTable).values(permissions.flatMap(p=>{
      const who=p.module==="finance"?(p.action==="view"?[ids[0],ids[1]]:p.action==="edit"?[ids[1]]:[]):p.module==="invoices"&&p.action==="view"?[ids[2]]:[];
      return who.map(id=>({adminUserId:id,permissionId:p.id}));
    }));
    tokens.push(...await Promise.all(ids.map(createAdminSession)));
    invoiceFingerprint=JSON.stringify(await db.select().from(invoicesTable));
  });
  afterAll(async()=>{
    await closeInvoiceBrowser();
    vi.unstubAllGlobals();
    await db.update(invoiceDesignSettingsTable).set({draft:null,published:null,updatedBy:null,publishedBy:null});
    await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId,ids));
    await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId,ids));
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id,ids));
  });
  it("separates finance viewing/editing and invoice-only published reading",async()=>{
    await request(app).get(path).expect(401);
    await request(app).get(path).set(auth(3)).expect(403);
    await request(app).get(path).set(auth(0)).expect(200);
    await request(app).put(path).set(auth(0)).send({revision:0,design:createTemplate()}).expect(403);
    await request(app).get(publicPath).set(auth(2)).expect(200);
    await request(app).get(path).set(auth(2)).expect(403);
    await request(app).get(publicPath).set(auth(3)).expect(403);
  });
  it("persists a draft without publishing and rejects concurrent updates",async()=>{
    const first=await request(app).get(path).set(auth(1)).expect(200),revision=first.body.revision;
    const design=createTemplate("formal");
    const saved=await request(app).put(path).set(auth(1)).send({revision,design}).expect(200);
    expect(saved.body.revision).toBe(revision+1);
    const secondSession=await request(app).get(path).set(auth(0)).expect(200);
    expect(secondSession.body.draft).toEqual(design);
    expect(secondSession.body.updatedBy).toBe(ids[1]);
    const active=await request(app).get(publicPath).set(auth(2)).expect(200);
    expect(active.body.design).toEqual(first.body.published);
    await request(app).put(path).set(auth(1)).send({revision,design:createTemplate("modern")}).expect(409);
    expect((await request(app).get(path).set(auth(1))).body.draft).toEqual(design);
  });
  it("keeps the previous publication when submitted design is unsafe",async()=>{
    const before=(await request(app).get(path).set(auth(1))).body;
    for(const design of [
      {...createTemplate(),html:"<script>alert(1)</script>"},
      {...createTemplate(),elements:createTemplate().elements.filter(e=>e.kind!=="seller")},
      {...createTemplate(),elements:createTemplate().elements.map(e=>e.kind==="totals"?{...e,color:"#ffffff"}:e)},
    ]) await request(app).post(`${path}/publish`).set(auth(1)).send({revision:before.revision,design}).expect(400);
    expect((await request(app).get(path).set(auth(1))).body).toEqual(before);
  });
  it("publishes one shared document snapshot, mocks email attachment and resets without changing invoices",async()=>{
    const before=(await request(app).get(path).set(auth(1))).body;
    const design=createTemplate("modern");
    const published=await request(app).post(`${path}/publish`).set(auth(1)).send({revision:before.revision,design}).expect(200);
    expect(published.body.published).toEqual(design);
    expect(published.body.publishedBy).toBe(ids[1]);
    const active=(await request(app).get(publicPath).set(auth(2)).expect(200)).body;
    expect(active.design).toEqual(design);
    const invoice=sampleInvoice(),pdf=await createSharedInvoicePdf(invoice,"ar");
    vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init:{body:string})=>{
      intercepted.body=JSON.parse(init.body);return new Response(JSON.stringify({id:"mock-only-no-email"}));
    }));
    const delivery=await sendInvoiceEmail({recipient:"invoice-test@test.invalid",invoice,pdf});
    expect(delivery).toBe("mock-only-no-email");
    expect(intercepted.body!.attachments[0].content).toBe(pdf.toString("base64"));
    const reset=await request(app).post(`${path}/reset`).set(auth(1)).send({revision:published.body.revision}).expect(200);
    expect(reset.body.published).toEqual(createTemplate());
    expect(JSON.stringify(await db.select().from(invoicesTable))).toBe(invoiceFingerprint);
  },30_000);
});
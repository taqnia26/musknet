import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable, adminUsersTable, db,
  distributorContractsTable, uploadedContractFilesTable, wholesaleDistributorsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";
import { hashContractToken } from "../lib/contracts";

let userId: number;
let token: string;
let contractsEditorId: number;
let contractsEditorToken: string;
const contractIds: number[] = [];
const uploadedContractFileIds: number[] = [];
const distributorIds: number[] = [];

beforeAll(async () => {
  const [user] = await db.insert(adminUsersTable).values({
    email: `contract-pdf-${Date.now()}@example.test`,
    name: "Contract PDF test",
    passwordHash: await hashAdminPassword("test-password-not-used"),
    isSuperAdmin: true,
    isActive: true,
  }).returning();
  userId = user.id;
  token = await createAdminSession(userId);
  await db.insert(adminPermissionsTable).values({ module: "contracts", action: "edit" }).onConflictDoNothing();
  const [permission] = await db.select().from(adminPermissionsTable)
    .where(and(eq(adminPermissionsTable.module, "contracts"), eq(adminPermissionsTable.action, "edit")));
  const [editor] = await db.insert(adminUsersTable).values({
    email: `contract-editor-${Date.now()}@example.test`,
    name: "Contract editor",
    passwordHash: await hashAdminPassword("test-password-not-used"),
    isSuperAdmin: false,
    isActive: true,
  }).returning();
  contractsEditorId = editor.id;
  await db.insert(adminUserPermissionsTable).values({ adminUserId: contractsEditorId, permissionId: permission.id });
  contractsEditorToken = await createAdminSession(contractsEditorId);
});

afterAll(async () => {
  if (uploadedContractFileIds.length) {
    await db.delete(uploadedContractFilesTable).where(inArray(uploadedContractFilesTable.id, uploadedContractFileIds));
  }
  for (const id of contractIds) await db.delete(distributorContractsTable).where(eq(distributorContractsTable.id, id));
  if (distributorIds.length) await db.delete(wholesaleDistributorsTable).where(inArray(wholesaleDistributorsTable.id, distributorIds));
  if (userId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, userId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, userId));
  }
  if (contractsEditorId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, contractsEditorId));
    await db.delete(adminUserPermissionsTable).where(eq(adminUserPermissionsTable.adminUserId, contractsEditorId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, contractsEditorId));
  }
});

const pdfParser = (response: { on(event: string, handler: (...args: any[]) => void): unknown }, callback: (error: Error | null, body: Buffer) => void) => {
  const parts: Buffer[] = [];
  response.on("data", (part: Buffer) => parts.push(part));
  response.on("end", () => callback(null, Buffer.concat(parts)));
  response.on("error", (error: Error) => callback(error, Buffer.alloc(0)));
};

describe("administrator contract PDF download", () => {
  it("keeps every legacy draft type on its original template through editing, signing and PDF", async () => {
    const types = [
      "موزع", "امتياز", "وكالة",
      "عقد توريد أجل المملكة العربية السعودية", "عقد توريد نقد المملكة العربية السعودية",
      "عقد توريد أجل دول الخليج", "عقد توريد نقد دول الخليج",
    ];
    for (const [index, contractType] of types.entries()) {
      const [legacy] = await db.insert(distributorContractsTable).values({
        contractNumber: `LEGACY-${Date.now()}-${index}`, contractType, templateVersion: 0,
        sellerName: "بائع سابق", sellerCrNumber: "111", sellerCrDate: "01/01/2025",
        sellerCrIssuer: "جهة", sellerAddress: "العنوان السابق", sellerRepName: "ممثل",
        sellerRepTitle: "مدير", buyerCompanyName: "مشتري سابق", products: [], createdBy: userId,
      }).returning();
      contractIds.push(legacy.id);
      const updated = await request(app).patch(`/api/admin/contracts/${legacy.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ contractType, contractDate: null, sellerAddress: `عنوان معدل ${index}` }).expect(200);
      expect(updated.body).toMatchObject({ templateVersion: 0, contractType, sellerAddress: `عنوان معدل ${index}`, status: "draft" });
      const signed = await request(app).post(`/api/admin/contracts/${legacy.id}/seller-sign`)
        .set("Authorization", `Bearer ${token}`)
        .send({ signaturePath: `/objects/uploads/contracts/signatures/legacy-${index}` }).expect(200);
      expect(signed.body).toMatchObject({ templateVersion: 0, status: "seller_signed" });
      const pdf = await request(app).get(`/api/admin/contracts/${legacy.id}/pdf`)
        .set("Authorization", `Bearer ${token}`).buffer(true).parse(pdfParser).expect(200);
      expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });
  it("resolves a final PDF's verification link without exposing legal data", async () => {
    const [row] = await db.insert(distributorContractsTable).values({
      contractNumber: `VERIFY-${Date.now()}`, contractType: "عقد توريد أجل المملكة العربية السعودية",
      status: "final", sellerName: "اسم سري", sellerCrNumber: "7003185274",
      sellerCrDate: "01/01/2027", sellerCrIssuer: "وزارة التجارة", sellerAddress: "العنوان",
      sellerRepName: "ممثل", sellerRepTitle: "مدير", buyerCompanyName: "المشتري",
      products: [], createdBy: userId, downloadTokenHash: hashContractToken("verification-test-token-that-is-long-enough"),
      downloadTokenExpiresAt: new Date(Date.now() + 60_000),
    }).returning();
    contractIds.push(row.id);
    const response = await request(app).get("/api/public/contracts/by-download-token/verification-test-token-that-is-long-enough").expect(200);
    expect(response.body).toEqual({ contractNumber: row.contractNumber, status: "final", sellerSignedAt: null, buyerSignedAt: null });
    expect(JSON.stringify(response.body)).not.toContain("اسم سري");
    await request(app).get("/api/public/contracts/by-download-token/incorrect-but-well-formed-token-that-is-long-enough").expect(404);
  });
  it("previews the full contract without storing temporary data", async () => {
    const response = await request(app).post("/api/admin/contracts/preview")
      .set("Authorization", `Bearer ${token}`).send({ contractType: "عقد توريد أجل المملكة العربية السعودية", marginPercent: "12", paymentDays: 22 }).expect(200);
    expect(response.body.sections.map((section: { heading: string }) => section.heading))
      .toEqual(expect.arrayContaining(["تمهيد", "تعريفات ومصطلحات", "الملحق (أ): المنتجات", "نسخ العقد والتوقيعات"]));
    expect(response.body.sections.find((section: { heading: string }) => section.heading === "طريقة الدفع (السداد حسب الكميات المباعة)").paragraphs.join(" "))
      .toContain("22 يوماً");
    expect(response.body.missing).toContain("ممثل المشتري");
    expect(response.body.products).toHaveLength(9);
    await request(app).post("/api/admin/contracts/preview").send({}).expect(401);
  });
  it("rejects cash terms that contradict the deferred-payment Word template", async () => {
    await request(app).post("/api/admin/contracts").set("Authorization", `Bearer ${token}`).send({
      contractType: "عقد توريد نقد المملكة العربية السعودية",
      sellerName: "بائع", sellerCrNumber: "123", sellerCrDate: "01/01/2027",
      sellerCrIssuer: "الرياض", sellerAddress: "الرياض", sellerRepName: "ممثل",
      sellerRepTitle: "مدير", buyerCompanyName: "مشتري",
    }).expect(400);
  });
  it("lets a contracts editor without site-content access read only legal defaults and create a contract", async () => {
    const headers = { Authorization: `Bearer ${contractsEditorToken}` };
    const content = await request(app).get("/api/admin/site-content").set(headers).expect(200);
    expect(content.body.every((entry: { key: string }) => entry.key === "seller_legal_profile")).toBe(true);
    await request(app).put("/api/admin/site-content").set(headers).send({ items: [] }).expect(403);
    const created = await request(app).post("/api/admin/contracts").set(headers).send({
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      sellerName: "مؤسسة مسك اللولو للتجارة",
      sellerCrNumber: "7003185274",
      sellerCrDate: "02/07/2011",
      sellerCrIssuer: "وزارة التجارة",
      sellerAddress: "الرياض، حي السليمانية",
      sellerRepName: "ممثل اختباري",
      sellerRepTitle: "مدير اختباري",
      buyerCompanyName: "موزع اختباري",
    }).expect(201);
    contractIds.push(created.body.id);
    expect(created.body.sellerCrNumber).toBe("7003185274");
  });
  it("returns binary Arabic PDF for a new draft and an existing contract without changing saved seller data", async () => {
    const input = {
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      sellerName: "مؤسسة مسك اللولو للتجارة",
      sellerCrNumber: "7003185274",
      sellerCrDate: "02/07/2011",
      sellerCrIssuer: "وزارة التجارة",
      sellerAddress: "الرياض، حي السليمانية، شارع امرؤ القيس، مبنى 3394",
      sellerRepName: "ممثل اختباري",
      sellerRepTitle: "مدير اختباري",
      buyerCompanyName: "موزع اختباري",
    };
    const created = await request(app).post("/api/admin/contracts")
      .set("Authorization", `Bearer ${token}`).send(input).expect(201);
    contractIds.push(created.body.id);
    const existing = await db.insert(distributorContractsTable).values({
      ...input, sellerName: "اسم محفوظ سابقاً", contractNumber: `PDF-EXISTING-${Date.now()}`,
      createdBy: userId, products: [],
    }).returning();
    contractIds.push(existing[0].id);

    for (const id of [created.body.id, existing[0].id]) {
      const response = await request(app).get(`/api/admin/contracts/${id}/pdf`)
        .set("Authorization", `Bearer ${token}`).buffer(true).parse(pdfParser).expect(200);
      expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
      expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
      expect(response.body.length).toBeGreaterThan(1000);
      const saved = await request(app).get(`/api/admin/contracts/${id}`)
        .set("Authorization", `Bearer ${token}`).expect(200);
      expect(saved.body.sellerName).toBe(id === created.body.id ? input.sellerName : "اسم محفوظ سابقاً");
    }
    await request(app).get(`/api/admin/contracts/${created.body.id}/pdf`).expect(401);
  });

  it("records credit approvals on contracts and uploaded metadata without modifying signed-file identity", async () => {
    const [distributor] = await db.insert(wholesaleDistributorsTable).values({
      companyName: `Credit approval test ${Date.now()}`,
      contactName: "Credit reviewer",
      phone: `057${String(Date.now()).slice(-7)}`,
      isActive: true,
    }).returning();
    distributorIds.push(distributor.id);
    const [contract] = await db.insert(distributorContractsTable).values({
      contractNumber: `CREDIT-APPROVAL-${Date.now()}`,
      distributorId: distributor.id,
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      status: "final",
      sellerName: "Seller",
      sellerCrNumber: "111",
      sellerCrDate: "01/01/2027",
      sellerCrIssuer: "Test",
      sellerAddress: "Test address",
      sellerRepName: "Tester",
      sellerRepTitle: "Manager",
      buyerCompanyName: distributor.companyName,
      products: [],
      createdBy: userId,
    }).returning();
    contractIds.push(contract.id);
    const [termContract] = await db.insert(distributorContractsTable).values({
      contractNumber: `CREDIT-TERM-${Date.now()}`,
      distributorId: distributor.id,
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      status: "draft",
      templateVersion: 1,
      contractCreditLimit: "1234.50",
      sellerName: "Seller",
      sellerCrNumber: "111",
      sellerCrDate: "01/01/2027",
      sellerCrIssuer: "Test",
      sellerAddress: "Test address",
      sellerRepName: "Tester",
      sellerRepTitle: "Manager",
      buyerCompanyName: distributor.companyName,
      products: [],
      createdBy: userId,
    }).returning();
    contractIds.push(termContract.id);
    const signedObjectPath = `/objects/uploads/contracts/files/signed-credit-${Date.now()}.pdf`;
    const [uploaded] = await db.insert(uploadedContractFilesTable).values({
      ownerType: "distributor",
      ownerId: distributor.id,
      ownerName: distributor.companyName,
      fileName: "signed-credit.pdf",
      objectPath: signedObjectPath,
      mimeType: "application/pdf",
      sizeBytes: 100,
      contractType: "Saudi distributor agreement",
      discountPercent: "0.00",
      paymentTerm: "due_on_issue",
      termsConfirmedAt: new Date(),
      termsConfirmedBy: userId,
      uploadedBy: userId,
    }).returning();
    uploadedContractFileIds.push(uploaded.id);
    const reason = "Finance reviewed company exposure and approved the limit";
    const approval = { creditLimit: 1234.5, reason };

    const generatedResponse = await request(app).put(`/api/admin/contracts/${contract.id}/credit-limit`)
      .set("Authorization", `Bearer ${contractsEditorToken}`)
      .send(approval).expect(200);
    expect(generatedResponse.body).toMatchObject({
      creditLimit: "1234.50",
      creditLimitApprovedBy: contractsEditorId,
      creditLimitApprovalReason: reason,
    });
    expect(generatedResponse.body.creditLimitApprovedAt).toBeTruthy();
    expect(generatedResponse.body.contractCreditLimit).toBeNull();

    await request(app).put(`/api/admin/contracts/${termContract.id}/credit-limit`)
      .set("Authorization", `Bearer ${contractsEditorToken}`)
      .send({ ...approval, creditLimit: 1235 }).expect(409);
    const [unapprovedTermContract] = await db.select().from(distributorContractsTable)
      .where(eq(distributorContractsTable.id, termContract.id));
    expect(unapprovedTermContract.contractCreditLimit).toBe("1234.50");
    expect(unapprovedTermContract.creditLimit).toBeNull();
    const approvedTermContract = await request(app).put(`/api/admin/contracts/${termContract.id}/credit-limit`)
      .set("Authorization", `Bearer ${contractsEditorToken}`)
      .send({ ...approval, creditLimit: 1234.5 }).expect(200);
    expect(approvedTermContract.body.contractCreditLimit).toBe("1234.50");
    expect(approvedTermContract.body.creditLimit).toBe("1234.50");
    const editedTerm = await request(app).patch(`/api/admin/contracts/${termContract.id}`)
      .set("Authorization", `Bearer ${contractsEditorToken}`)
      .send({ contractCreditLimit: 1300 }).expect(200);
    const [updatedTermContract] = await db.select().from(distributorContractsTable)
      .where(eq(distributorContractsTable.id, termContract.id));
    expect(updatedTermContract.contractCreditLimit).toBe("1300.00");
    expect(updatedTermContract.creditLimit).toBeNull();
    expect(updatedTermContract.creditLimitApprovedBy).toBeNull();
    await db.update(distributorContractsTable).set({
      contractCreditLimit: "1400.00",
      updatedAt: new Date(Date.now() + 5_000),
    }).where(eq(distributorContractsTable.id, termContract.id));
    await request(app).post(`/api/admin/contracts/${termContract.id}/seller-sign`)
      .set("Authorization", `Bearer ${contractsEditorToken}`)
      .send({
        signaturePath: `/objects/uploads/contracts/signatures/stale-${termContract.id}`,
        expectedUpdatedAt: editedTerm.body.updatedAt,
      }).expect(409);

    const uploadedResponse = await request(app).put(`/api/admin/contract-files/${uploaded.id}/credit-limit`)
      .set("Authorization", `Bearer ${contractsEditorToken}`)
      .send(approval).expect(200);
    expect(uploadedResponse.body).toMatchObject({
      creditLimit: 1234.5,
      creditLimitApprovedBy: contractsEditorId,
      creditLimitApprovalReason: reason,
    });
    expect(uploadedResponse.body).not.toHaveProperty("objectPath");
    expect(uploadedResponse.body.creditLimitApprovedAt).toBeTruthy();
    const [savedFile] = await db.select().from(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, uploaded.id));
    expect(savedFile.objectPath).toBe(signedObjectPath);
  });
});
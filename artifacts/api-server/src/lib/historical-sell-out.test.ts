import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  analyzeHistoricalSellOutWorkbook,
  calculateHistoricalSaleAmounts,
} from "./historical-sell-out";

function workbookFixture() {
  const workbook = new ExcelJS.Workbook();
  const items = workbook.addWorksheet("Item Master");
  items.addRow(["Barcode", "ITEM_DESC", "Catergory", "RSP EX VAT", "RSP With VAT"]);
  items.addRow(["6287000000001", "Test perfume", "Perfume", "100", "115"]);

  const sales = workbook.addWorksheet("Master Sales");
  sales.addRow([
    "Year", "Month", "Code", "Satus", "Region", "Area", "Type of Chain", "Retailer",
    "Stores", "Mall Name", "SALES SUPERVISOR", "VPN", "Description", "Catergory",
    "Sell out QTY", "Sell-out Value",
  ]);
  sales.addRow([
    2025, new Date("2025-01-01T00:00:00.000Z"), 1, "New", "Central", "Riyadh",
    "Local Chain", "Test store", "Test store", "Test mall", "Tester", "6287000000001",
    "Test perfume", "Perfume", 2, 230,
  ]);
  sales.addRow([
    2025, new Date("2025-01-01T00:00:00.000Z"), 2, "New", "Central", "Riyadh",
    "Local Chain", "Other store", "Other store", "Test mall", "Tester", "9999999999999",
    "Other perfume", "Perfume", 1, 115,
  ]);
  const formulaErrorRow = sales.addRow([]);
  formulaErrorRow.getCell(8).value = { formula: "NA()", result: { error: "#N/A" } } as never;
  formulaErrorRow.getCell(13).value = { formula: "NA()", result: { error: "#N/A" } } as never;
  return workbook;
}

describe("historical Sell-Out import planning", () => {
  it("calculates VAT using exact four-decimal ledger amounts", () => {
    expect(calculateHistoricalSaleAmounts("115")).toEqual({
      gross: "115.0000",
      net: "100.0000",
      vat: "15.0000",
    });
    expect(calculateHistoricalSaleAmounts("299.97")).toEqual({
      gross: "299.9700",
      net: "260.8435",
      vat: "39.1265",
    });
  });

  it("accepts a brand linked by Item Master barcode and preserves the Excel row in the source ID", () => {
    const analysis = analyzeHistoricalSellOutWorkbook(
      workbookFixture(),
      { fileName: "fixture.xlsm", sha256: "a".repeat(64), fingerprint: "a".repeat(24) },
      {
        expectedItemMasterCount: 1,
        storefrontBarcodes: new Set(["6287000000001"]),
        storefrontProductCount: 1,
        existingSourceIds: new Set(),
      },
    );
    expect(analysis.entries).toHaveLength(1);
    expect(analysis.entries[0]).toMatchObject({
      excelRow: 2,
      barcode: "6287000000001",
      gross: "230.0000",
      net: "200.0000",
      vat: "30.0000",
    });
    expect(analysis.entries[0].sourceId).toContain("row-2:barcode-6287000000001:month-2025-01");
    expect(analysis.workbook.sourceRows).toBe(2);
    expect(analysis.workbook.excludedRows).toBe(1);
  });

  it("reports every missing barcode and excludes it without guessing by description", () => {
    const analysis = analyzeHistoricalSellOutWorkbook(
      workbookFixture(),
      { fileName: "fixture.xlsm", sha256: "b".repeat(64), fingerprint: "b".repeat(24) },
      {
        expectedItemMasterCount: 1,
        storefrontBarcodes: new Set(["6287000000001"]),
        storefrontProductCount: 1,
      },
    );
    expect(analysis.exclusions.barcodesMissingFromItemMaster).toEqual(["9999999999999"]);
    expect(analysis.exclusions.barcodesMissingFromStorefront).toEqual(["9999999999999"]);
    expect(analysis.exclusions.rows[0].reasons).toEqual([
      "missing_item_master_barcode",
      "missing_storefront_barcode",
    ]);
  });

  it("reads all 85 populated Item Master rows instead of stopping after ten", () => {
    const workbook = workbookFixture();
    const items = workbook.getWorksheet("Item Master")!;
    for (let index = 2; index <= 85; index += 1) {
      items.addRow([
        String(6_287_000_000_001 + index - 1),
        `Test perfume ${index}`,
        "Perfume",
        "100",
        "115",
      ]);
    }

    const analysis = analyzeHistoricalSellOutWorkbook(
      workbook,
      { fileName: "fixture.xlsm", sha256: "c".repeat(64), fingerprint: "c".repeat(24) },
      {
        expectedItemMasterCount: 85,
        storefrontBarcodes: new Set(["6287000000001"]),
        storefrontProductCount: 1,
      },
    );

    expect(analysis.itemMaster).toMatchObject({
      scannedRows: 85,
      populatedRows: 85,
      emptyRows: 0,
      actualItems: 85,
    });
  });
});
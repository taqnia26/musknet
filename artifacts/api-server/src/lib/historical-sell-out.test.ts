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

  const sellOut = workbook.addWorksheet("Sell-Out");
  sellOut.addRow(["Sell-Out 2025"]);
  sellOut.addRow([]);
  sellOut.addRow([null, null, null, null, "Month"]);
  sellOut.addRow(["BRAND", "Retailer", "BARCODE", "Description", new Date("2025-01-01T00:00:00.000Z"), "Grand Total"]);
  sellOut.addRow(["Partner brand", "Test store", "6287000000001", "Test perfume", 2, 2]);
  sellOut.addRow(["Other brand", "Other store", "9999999999999", "Other perfume", 1, 1]);
  sellOut.addRow(["Grand Total", null, null, null, 3, 3]);
  return workbook;
}

describe("historical Sell-Out import planning", () => {
  it("calculates VAT using exact four-decimal ledger amounts", () => {
    expect(calculateHistoricalSaleAmounts("1", "115")).toEqual({
      gross: "115.0000",
      net: "100.0000",
      vat: "15.0000",
    });
    expect(calculateHistoricalSaleAmounts("3", "99.99")).toEqual({
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
      excelRow: 5,
      barcode: "6287000000001",
      gross: "230.0000",
      net: "200.0000",
      vat: "30.0000",
    });
    expect(analysis.entries[0].sourceId).toContain("row-5:barcode-6287000000001:month-2025-01");
    expect(analysis.workbook.summaryRowsExcluded).toBe(1);
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
      "brand_mismatch",
      "missing_item_master_barcode",
      "missing_storefront_barcode",
    ]);
  });
});
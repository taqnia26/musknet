import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS, { type Cell, type Workbook, type Worksheet } from "exceljs";

const MONEY_SCALE = 10_000n;
const VAT_RATE_NUMERATOR = 115n;
const VAT_RATE_DENOMINATOR = 100n;
const DEFAULT_ALLOWED_BRANDS = new Set(["مسك اللولو", "musk ellolo"]);

type Decimal = { numerator: bigint; denominator: bigint };

export type HistoricalSellOutEntry = {
  sourceId: string;
  excelRow: number;
  barcode: string;
  brand: string;
  retailer: string;
  description: string;
  month: string;
  quantity: string;
  priceWithVat: string;
  gross: string;
  net: string;
  vat: string;
};

export type ExcludedSellOutRow = {
  excelRow: number;
  brand: string;
  retailer: string;
  barcode: string | null;
  description: string;
  reasons: Array<"brand_mismatch" | "missing_item_master_barcode" | "missing_storefront_barcode">;
};

export type InvalidSellOutCell = {
  excelRow: number;
  barcode: string | null;
  month: string;
  value: string;
  reason: string;
};

export type HistoricalSellOutAnalysis = {
  source: {
    fileName: string;
    sha256: string;
    fingerprint: string;
    sellOutSheet: string;
    itemMasterSheet: string;
  };
  workbook: {
    worksheetRows: number;
    sourceRows: number;
    detailRows: number;
    summaryRowsExcluded: number;
    monthlyColumns: string[];
  };
  itemMaster: {
    expectedItems: number;
    scannedRows: number;
    populatedRows: number;
    emptyRows: number;
    actualItems: number;
    duplicateBarcodes: string[];
    conflictingBarcodes: string[];
    items: Array<{
      excelRow: number;
      barcode: string;
      description: string;
      priceWithVat: string;
    }>;
  };
  storefront: {
    products: number;
    productsWithBarcode: number;
  };
  exclusions: {
    rows: ExcludedSellOutRow[];
    brandMismatchRows: number;
    itemMasterMissingRows: number;
    storefrontMissingRows: number;
    invalidCells: InvalidSellOutCell[];
    zeroQuantityCellsSkipped: number;
    barcodesMissingFromItemMaster: string[];
    barcodesMissingFromStorefront: string[];
  };
  entries: HistoricalSellOutEntry[];
  entriesAlreadyImported: number;
  totals: {
    gross: string;
    net: string;
    vat: string;
  };
  blockingIssues: string[];
  warnings: string[];
};

export type AnalyzeHistoricalSellOutOptions = {
  filePath: string;
  expectedItemMasterCount?: number;
  allowedBrands?: Iterable<string>;
  storefrontBarcodes: ReadonlySet<string>;
  storefrontProductCount: number;
  existingSourceIds?: ReadonlySet<string>;
  sellOutSheetName?: string;
  itemMasterSheetName?: string;
};

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Decimal denominator must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return rounded * sign;
}

function decimalFrom(value: unknown): Decimal {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(raw);
  if (!match) throw new Error(`Invalid decimal value: ${raw || "(blank)"}`);

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  let numerator = BigInt(`${whole}${fraction}`) * sign;
  let denominator = 10n ** BigInt(fraction.length);

  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  return { numerator, denominator };
}

function decimalText(value: unknown): string {
  const decimal = decimalFrom(value);
  const scaled = roundDivide(decimal.numerator * MONEY_SCALE, decimal.denominator);
  return moneyText(scaled);
}

function moneyText(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / MONEY_SCALE}.${String(absolute % MONEY_SCALE).padStart(4, "0")}`;
}

function scaledMoney(value: string): bigint {
  const match = /^(-?)(\d+)\.(\d{4})$/.exec(value);
  if (!match) throw new Error(`Invalid four-decimal money value: ${value}`);
  const amount = BigInt(match[2]) * MONEY_SCALE + BigInt(match[3]);
  return match[1] ? -amount : amount;
}

export function calculateHistoricalSaleAmounts(quantity: string | number, priceWithVat: string | number) {
  const quantityDecimal = decimalFrom(quantity);
  const priceDecimal = decimalFrom(priceWithVat);
  if (quantityDecimal.numerator <= 0n) throw new Error("Quantity must be positive");
  if (priceDecimal.numerator <= 0n) throw new Error("RSP With VAT must be positive");

  const gross = roundDivide(
    quantityDecimal.numerator * priceDecimal.numerator * MONEY_SCALE,
    quantityDecimal.denominator * priceDecimal.denominator,
  );
  const net = roundDivide(gross * VAT_RATE_DENOMINATOR, VAT_RATE_NUMERATOR);
  const vat = gross - net;
  return { gross: moneyText(gross), net: moneyText(net), vat: moneyText(vat) };
}

function unwrappedValue(cell: Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) {
    return (value as { result?: unknown }).result;
  }
  return value;
}

function displayValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizedText(value: unknown): string {
  return displayValue(value).toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

function normalizedHeader(value: unknown): string {
  return normalizedText(value).replace(/[\s_-]+/g, "");
}

function normalizeBarcode(value: unknown): string | null {
  const raw = displayValue(value).replace(/\s+/g, "");
  const match = /^(\d+)(?:\.0+)?$/.exec(raw);
  return match?.[1] ?? null;
}

function parseMonth(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const raw = displayValue(value);
  const match = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/.exec(raw);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
  return null;
}

function findHeaderRow(worksheet: Worksheet, expected: string[], searchLimit = 25): number {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, searchLimit); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const actual = expected.map((_, index) => normalizedHeader(unwrappedValue(row.getCell(index + 1))));
    if (actual.every((value, index) => value === normalizedHeader(expected[index]))) return rowNumber;
  }
  throw new Error(`Could not find headers ${expected.join(", ")} in worksheet ${worksheet.name}`);
}

function requireWorksheet(workbook: Workbook, name: string): Worksheet {
  const worksheet = workbook.getWorksheet(name);
  if (!worksheet) throw new Error(`Worksheet "${name}" was not found`);
  return worksheet;
}

function sourceIdFor(fingerprint: string, row: number, barcode: string, month: string) {
  return `${fingerprint}:row-${row}:barcode-${barcode}:month-${month}`;
}

export async function workbookIdentity(filePath: string) {
  const bytes = await readFile(filePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    fileName: path.basename(filePath),
    sha256,
    fingerprint: sha256.slice(0, 24),
  };
}

export async function analyzeHistoricalSellOut(options: AnalyzeHistoricalSellOutOptions): Promise<HistoricalSellOutAnalysis> {
  const identity = await workbookIdentity(options.filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(options.filePath);
  return analyzeHistoricalSellOutWorkbook(workbook, identity, options);
}

export function analyzeHistoricalSellOutWorkbook(
  workbook: Workbook,
  identity: { fileName: string; sha256: string; fingerprint: string },
  options: Omit<AnalyzeHistoricalSellOutOptions, "filePath">,
): HistoricalSellOutAnalysis {
  const sellOutSheetName = options.sellOutSheetName ?? "Sell-Out";
  const itemMasterSheetName = options.itemMasterSheetName ?? "Item Master";
  const expectedItems = options.expectedItemMasterCount ?? 85;
  const sellOutSheet = requireWorksheet(workbook, sellOutSheetName);
  const itemMasterSheet = requireWorksheet(workbook, itemMasterSheetName);
  const itemHeaderRow = findHeaderRow(itemMasterSheet, ["Barcode", "ITEM_DESC", "Catergory", "RSP EX VAT", "RSP With VAT"]);
  const sellOutHeaderRow = findHeaderRow(sellOutSheet, ["BRAND", "Retailer", "BARCODE", "Description"]);
  const allowedBrands = new Set(
    [...(options.allowedBrands ?? DEFAULT_ALLOWED_BRANDS)].map((brand) => normalizedText(brand)),
  );

  const itemMaster = new Map<string, { description: string; priceWithVat: string; excelRow: number }>();
  const duplicateBarcodes = new Set<string>();
  const conflictingBarcodes = new Set<string>();
  const scannedItemMasterRows = Math.max(0, itemMasterSheet.rowCount - itemHeaderRow);
  let populatedItemMasterRows = 0;
  for (let rowNumber = itemHeaderRow + 1; rowNumber <= itemMasterSheet.rowCount; rowNumber += 1) {
    const row = itemMasterSheet.getRow(rowNumber);
    const values = Array.from({ length: 5 }, (_, index) => unwrappedValue(row.getCell(index + 1)));
    if (values.every((value) => displayValue(value) === "")) continue;
    populatedItemMasterRows += 1;
    const barcode = normalizeBarcode(values[0]);
    const priceValue = values[4];
    if (!barcode) throw new Error(`Item Master row ${rowNumber} has a price but no valid barcode`);
    if (displayValue(priceValue) === "") throw new Error(`Item Master row ${rowNumber} barcode ${barcode} has no RSP With VAT`);
    const priceWithVat = decimalText(priceValue);
    if (scaledMoney(priceWithVat) <= 0n) throw new Error(`Item Master row ${rowNumber} barcode ${barcode} has a non-positive RSP With VAT`);
    const item = {
      description: displayValue(values[1]),
      priceWithVat,
      excelRow: rowNumber,
    };
    const previous = itemMaster.get(barcode);
    if (previous) {
      duplicateBarcodes.add(barcode);
      if (previous.priceWithVat !== item.priceWithVat) conflictingBarcodes.add(barcode);
    } else {
      itemMaster.set(barcode, item);
    }
  }

  const monthColumns: Array<{ column: number; month: string }> = [];
  const header = sellOutSheet.getRow(sellOutHeaderRow);
  for (let column = 5; column <= sellOutSheet.columnCount; column += 1) {
    const value = unwrappedValue(header.getCell(column));
    if (normalizedHeader(value) === "grandtotal") break;
    const month = parseMonth(value);
    if (!month) throw new Error(`Sell-Out header column ${column} is not a valid month`);
    monthColumns.push({ column, month });
  }
  if (!monthColumns.length) throw new Error("Sell-Out worksheet has no monthly columns");

  const excludedRows: ExcludedSellOutRow[] = [];
  const invalidCells: InvalidSellOutCell[] = [];
  const missingItemMasterBarcodes = new Set<string>();
  const missingStorefrontBarcodes = new Set<string>();
  const entries: HistoricalSellOutEntry[] = [];
  let entriesAlreadyImported = 0;
  let sourceRows = 0;
  let detailRows = 0;
  let summaryRowsExcluded = 0;
  let zeroQuantityCellsSkipped = 0;
  let grossTotal = 0n;
  let netTotal = 0n;
  let vatTotal = 0n;

  for (let rowNumber = sellOutHeaderRow + 1; rowNumber <= sellOutSheet.rowCount; rowNumber += 1) {
    const row = sellOutSheet.getRow(rowNumber);
    const rowValues = Array.from({ length: sellOutSheet.columnCount }, (_, index) =>
      unwrappedValue(row.getCell(index + 1)));
    if (rowValues.every((value) => displayValue(value) === "")) continue;
    sourceRows += 1;

    const brand = displayValue(rowValues[0]);
    const retailer = displayValue(rowValues[1]);
    const barcode = normalizeBarcode(rowValues[2]);
    const description = displayValue(rowValues[3]);
    if (!barcode || !description || !retailer) {
      summaryRowsExcluded += 1;
      continue;
    }
    detailRows += 1;

    const reasons: ExcludedSellOutRow["reasons"] = [];
    const linkedToItemMaster = itemMaster.has(barcode);
    if (!allowedBrands.has(normalizedText(brand)) && !linkedToItemMaster) reasons.push("brand_mismatch");
    if (!linkedToItemMaster) {
      reasons.push("missing_item_master_barcode");
      missingItemMasterBarcodes.add(barcode);
    }
    if (!options.storefrontBarcodes.has(barcode)) {
      reasons.push("missing_storefront_barcode");
      missingStorefrontBarcodes.add(barcode);
    }
    if (reasons.length) {
      excludedRows.push({ excelRow: rowNumber, brand, retailer, barcode, description, reasons });
      continue;
    }

    const item = itemMaster.get(barcode)!;
    for (const monthColumn of monthColumns) {
      const quantityValue = rowValues[monthColumn.column - 1];
      if (displayValue(quantityValue) === "") continue;
      let quantity: Decimal;
      try {
        quantity = decimalFrom(quantityValue);
      } catch (error) {
        invalidCells.push({
          excelRow: rowNumber,
          barcode,
          month: monthColumn.month,
          value: displayValue(quantityValue),
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (quantity.numerator === 0n) {
        zeroQuantityCellsSkipped += 1;
        continue;
      }
      if (quantity.numerator < 0n) {
        invalidCells.push({
          excelRow: rowNumber,
          barcode,
          month: monthColumn.month,
          value: displayValue(quantityValue),
          reason: "Negative quantities require an explicit returns policy and are not imported",
        });
        continue;
      }

      const sourceId = sourceIdFor(identity.fingerprint, rowNumber, barcode, monthColumn.month);
      if (options.existingSourceIds?.has(sourceId)) {
        entriesAlreadyImported += 1;
        continue;
      }
      const quantityText = displayValue(quantityValue);
      const amounts = calculateHistoricalSaleAmounts(quantityText, item.priceWithVat);
      entries.push({
        sourceId,
        excelRow: rowNumber,
        barcode,
        brand,
        retailer,
        description,
        month: monthColumn.month,
        quantity: quantityText,
        priceWithVat: item.priceWithVat,
        ...amounts,
      });
      grossTotal += scaledMoney(amounts.gross);
      netTotal += scaledMoney(amounts.net);
      vatTotal += scaledMoney(amounts.vat);
    }
  }

  const blockingIssues: string[] = [];
  if (itemMaster.size !== expectedItems) {
    blockingIssues.push(
      `Item Master has ${populatedItemMasterRows} populated row(s) and ${itemMaster.size} unique product(s) `
      + `across ${scannedItemMasterRows} row position(s); ${expectedItems} unique products were expected`,
    );
  }
  if (conflictingBarcodes.size) {
    blockingIssues.push(`Item Master has conflicting RSP With VAT values for ${conflictingBarcodes.size} barcode(s)`);
  }
  if (invalidCells.length) {
    blockingIssues.push(`Sell-Out contains ${invalidCells.length} invalid quantity cell(s)`);
  }
  if (!entries.length && !entriesAlreadyImported) {
    blockingIssues.push("No journal entries qualify for import");
  }

  const warnings: string[] = [];
  if (options.storefrontBarcodes.size === 0) {
    warnings.push("No storefront product has a barcode in the sku column");
  }
  if (summaryRowsExcluded) warnings.push(`${summaryRowsExcluded} subtotal/summary row(s) were excluded`);
  if (zeroQuantityCellsSkipped) warnings.push(`${zeroQuantityCellsSkipped} zero-quantity cell(s) were skipped`);

  return {
    source: {
      ...identity,
      sellOutSheet: sellOutSheetName,
      itemMasterSheet: itemMasterSheetName,
    },
    workbook: {
      worksheetRows: sellOutSheet.rowCount,
      sourceRows,
      detailRows,
      summaryRowsExcluded,
      monthlyColumns: monthColumns.map(({ month }) => month),
    },
    itemMaster: {
      expectedItems,
      scannedRows: scannedItemMasterRows,
      populatedRows: populatedItemMasterRows,
      emptyRows: scannedItemMasterRows - populatedItemMasterRows,
      actualItems: itemMaster.size,
      duplicateBarcodes: [...duplicateBarcodes].sort(),
      conflictingBarcodes: [...conflictingBarcodes].sort(),
      items: [...itemMaster.entries()]
        .map(([barcode, item]) => ({ barcode, ...item }))
        .sort((left, right) => left.excelRow - right.excelRow),
    },
    storefront: {
      products: options.storefrontProductCount,
      productsWithBarcode: options.storefrontBarcodes.size,
    },
    exclusions: {
      rows: excludedRows,
      brandMismatchRows: excludedRows.filter((row) => row.reasons.includes("brand_mismatch")).length,
      itemMasterMissingRows: excludedRows.filter((row) => row.reasons.includes("missing_item_master_barcode")).length,
      storefrontMissingRows: excludedRows.filter((row) => row.reasons.includes("missing_storefront_barcode")).length,
      invalidCells,
      zeroQuantityCellsSkipped,
      barcodesMissingFromItemMaster: [...missingItemMasterBarcodes].sort(),
      barcodesMissingFromStorefront: [...missingStorefrontBarcodes].sort(),
    },
    entries,
    entriesAlreadyImported,
    totals: {
      gross: moneyText(grossTotal),
      net: moneyText(netTotal),
      vat: moneyText(vatTotal),
    },
    blockingIssues,
    warnings,
  };
}

export function addMoney(left: string, right: string) {
  return moneyText(scaledMoney(left) + scaledMoney(right));
}
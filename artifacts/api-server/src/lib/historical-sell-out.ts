import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS, { type Cell, type Workbook, type Worksheet } from "exceljs";

const MONEY_SCALE = 10_000n;
const VAT_RATE_NUMERATOR = 115n;
const VAT_RATE_DENOMINATOR = 100n;

type Decimal = { numerator: bigint; denominator: bigint };

export type HistoricalSellOutEntry = {
  sourceId: string;
  excelRow: number;
  barcode: string;
  retailer: string;
  description: string;
  month: string;
  quantity: string;
  gross: string;
  net: string;
  vat: string;
};

type ExclusionReason =
  | "invalid_month"
  | "missing_retailer"
  | "missing_barcode"
  | "missing_description"
  | "invalid_quantity"
  | "non_positive_quantity"
  | "invalid_sell_out_value"
  | "non_positive_sell_out_value"
  | "missing_item_master_barcode"
  | "missing_storefront_barcode";

export type ExcludedSellOutRow = {
  excelRow: number;
  month: string | null;
  retailer: string;
  barcode: string | null;
  description: string;
  reasons: ExclusionReason[];
};

export type HistoricalSellOutAnalysis = {
  source: {
    fileName: string;
    sha256: string;
    fingerprint: string;
    salesSheet: string;
    itemMasterSheet: string;
  };
  workbook: {
    worksheetRows: number;
    sourceRows: number;
    eligibleRows: number;
    excludedRows: number;
    months: string[];
  };
  itemMaster: {
    expectedItems: number | null;
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
    reasonCounts: Record<ExclusionReason, number>;
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
  storefrontBarcodes: ReadonlySet<string>;
  storefrontProductCount: number;
  existingSourceIds?: ReadonlySet<string>;
  salesSheetName?: string;
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

export function calculateHistoricalSaleAmounts(sellOutValue: unknown) {
  const grossDecimal = decimalFrom(sellOutValue);
  const gross = roundDivide(grossDecimal.numerator * MONEY_SCALE, grossDecimal.denominator);
  if (gross <= 0n) throw new Error("Sell-out Value must be positive");
  const net = roundDivide(gross * VAT_RATE_DENOMINATOR, VAT_RATE_NUMERATOR);
  const vat = gross - net;
  return { gross: moneyText(gross), net: moneyText(net), vat: moneyText(vat) };
}

function unwrappedValue(cell: Cell): unknown {
  let value: unknown = cell.value;
  if (value && typeof value === "object" && "result" in value) {
    value = (value as { result?: unknown }).result ?? null;
  }
  if (value && typeof value === "object" && "error" in value) return null;
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

function findHeaderColumns(
  worksheet: Worksheet,
  requiredHeaders: string[][],
  searchLimit = 25,
): { rowNumber: number; columns: Map<string, number> } {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, searchLimit); rowNumber += 1) {
    const columns = new Map<string, number>();
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const header = normalizedHeader(unwrappedValue(row.getCell(column)));
      if (header) columns.set(header, column);
    }
    if (requiredHeaders.every((aliases) => aliases.some((alias) => columns.has(normalizedHeader(alias))))) {
      return { rowNumber, columns };
    }
  }
  throw new Error(`Could not find required Master Sales headers in worksheet ${worksheet.name}`);
}

function requireColumn(columns: Map<string, number>, ...aliases: string[]): number {
  for (const alias of aliases) {
    const column = columns.get(normalizedHeader(alias));
    if (column) return column;
  }
  throw new Error(`Required column ${aliases.join(" / ")} was not found`);
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
  const salesSheetName = options.salesSheetName ?? "Master Sales";
  const itemMasterSheetName = options.itemMasterSheetName ?? "Item Master";
  const expectedItems = options.expectedItemMasterCount ?? null;
  const salesSheet = requireWorksheet(workbook, salesSheetName);
  const itemMasterSheet = requireWorksheet(workbook, itemMasterSheetName);
  const itemHeaderRow = findHeaderRow(itemMasterSheet, ["Barcode", "ITEM_DESC", "Catergory", "RSP EX VAT", "RSP With VAT"]);
  const masterSalesHeaders = findHeaderColumns(salesSheet, [
    ["Year"],
    ["Month"],
    ["Retailer"],
    ["VPN"],
    ["Description"],
    ["Sell out QTY"],
    ["Sell-out Value"],
  ]);
  const monthColumn = requireColumn(masterSalesHeaders.columns, "Month");
  const retailerColumn = requireColumn(masterSalesHeaders.columns, "Retailer");
  const barcodeColumn = requireColumn(masterSalesHeaders.columns, "VPN");
  const descriptionColumn = requireColumn(masterSalesHeaders.columns, "Description");
  const quantityColumn = requireColumn(masterSalesHeaders.columns, "Sell out QTY");
  const valueColumn = requireColumn(masterSalesHeaders.columns, "Sell-out Value");

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

  const excludedRows: ExcludedSellOutRow[] = [];
  const missingItemMasterBarcodes = new Set<string>();
  const missingStorefrontBarcodes = new Set<string>();
  const months = new Set<string>();
  const entries: HistoricalSellOutEntry[] = [];
  let entriesAlreadyImported = 0;
  let sourceRows = 0;
  let grossTotal = 0n;
  let netTotal = 0n;
  let vatTotal = 0n;

  for (let rowNumber = masterSalesHeaders.rowNumber + 1; rowNumber <= salesSheet.rowCount; rowNumber += 1) {
    const row = salesSheet.getRow(rowNumber);
    const rowValues = Array.from({ length: salesSheet.columnCount }, (_, index) =>
      unwrappedValue(row.getCell(index + 1)));
    if (rowValues.every((value) => displayValue(value) === "")) continue;
    sourceRows += 1;

    const month = parseMonth(rowValues[monthColumn - 1]);
    const retailer = displayValue(rowValues[retailerColumn - 1]);
    const barcode = normalizeBarcode(rowValues[barcodeColumn - 1]);
    const description = displayValue(rowValues[descriptionColumn - 1]);
    const quantityValue = rowValues[quantityColumn - 1];
    const sellOutValue = rowValues[valueColumn - 1];
    const reasons: ExclusionReason[] = [];
    if (!month) reasons.push("invalid_month");
    if (!retailer) reasons.push("missing_retailer");
    if (!barcode) reasons.push("missing_barcode");
    if (!description) reasons.push("missing_description");

    let quantityState: "valid" | "invalid" | "non_positive" = "invalid";
    try {
      quantityState = decimalFrom(quantityValue).numerator > 0n ? "valid" : "non_positive";
    } catch {
      quantityState = "invalid";
    }
    if (quantityState === "invalid") reasons.push("invalid_quantity");
    if (quantityState === "non_positive") reasons.push("non_positive_quantity");

    let amounts: ReturnType<typeof calculateHistoricalSaleAmounts> | null = null;
    try {
      amounts = calculateHistoricalSaleAmounts(sellOutValue);
    } catch (error) {
      if (error instanceof Error && error.message === "Sell-out Value must be positive") {
        reasons.push("non_positive_sell_out_value");
      } else {
        reasons.push("invalid_sell_out_value");
      }
    }

    if (barcode && !itemMaster.has(barcode)) {
      reasons.push("missing_item_master_barcode");
      missingItemMasterBarcodes.add(barcode);
    }
    if (barcode && !options.storefrontBarcodes.has(barcode)) {
      reasons.push("missing_storefront_barcode");
      missingStorefrontBarcodes.add(barcode);
    }
    if (reasons.length) {
      excludedRows.push({ excelRow: rowNumber, month, retailer, barcode, description, reasons });
      continue;
    }

    const validMonth = month!;
    const validBarcode = barcode!;
    const validAmounts = amounts!;
    months.add(validMonth);
    const sourceId = sourceIdFor(identity.fingerprint, rowNumber, validBarcode, validMonth);
    if (options.existingSourceIds?.has(sourceId)) {
      entriesAlreadyImported += 1;
      continue;
    }
    entries.push({
      sourceId,
      excelRow: rowNumber,
      barcode: validBarcode,
      retailer,
      description,
      month: validMonth,
      quantity: displayValue(quantityValue),
      ...validAmounts,
    });
    grossTotal += scaledMoney(validAmounts.gross);
    netTotal += scaledMoney(validAmounts.net);
    vatTotal += scaledMoney(validAmounts.vat);
  }

  const blockingIssues: string[] = [];
  if (expectedItems !== null && itemMaster.size !== expectedItems) {
    blockingIssues.push(
      `Item Master has ${populatedItemMasterRows} populated row(s) and ${itemMaster.size} unique product(s) `
      + `across ${scannedItemMasterRows} row position(s); ${expectedItems} unique products were expected`,
    );
  }
  if (conflictingBarcodes.size) {
    blockingIssues.push(`Item Master has conflicting RSP With VAT values for ${conflictingBarcodes.size} barcode(s)`);
  }
  if (!entries.length && !entriesAlreadyImported) {
    blockingIssues.push("No journal entries qualify for import");
  }

  const warnings: string[] = [];
  if (options.storefrontBarcodes.size === 0) {
    warnings.push("No storefront product has a barcode in the sku column");
  }
  if (excludedRows.length) warnings.push(`${excludedRows.length} Master Sales row(s) were excluded`);

  const reasonCounts = {
    invalid_month: 0,
    missing_retailer: 0,
    missing_barcode: 0,
    missing_description: 0,
    invalid_quantity: 0,
    non_positive_quantity: 0,
    invalid_sell_out_value: 0,
    non_positive_sell_out_value: 0,
    missing_item_master_barcode: 0,
    missing_storefront_barcode: 0,
  } satisfies Record<ExclusionReason, number>;
  for (const row of excludedRows) {
    for (const reason of row.reasons) reasonCounts[reason] += 1;
  }

  return {
    source: {
      ...identity,
      salesSheet: salesSheetName,
      itemMasterSheet: itemMasterSheetName,
    },
    workbook: {
      worksheetRows: salesSheet.rowCount,
      sourceRows,
      eligibleRows: entries.length,
      excludedRows: excludedRows.length,
      months: [...months].sort(),
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
      reasonCounts,
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
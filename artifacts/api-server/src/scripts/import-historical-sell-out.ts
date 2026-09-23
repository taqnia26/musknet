import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import {
  adminUsersTable,
  db,
  journalEntriesTable,
  pool,
  productsTable,
} from "@workspace/db";
import {
  ensureStandardAccountingChart,
  postJournalEntry,
  trialBalance,
} from "../lib/accounting";
import {
  addMoney,
  analyzeHistoricalSellOut,
  type HistoricalSellOutAnalysis,
} from "../lib/historical-sell-out";

type CliOptions = {
  filePath: string;
  apply: boolean;
  confirmDevelopment: boolean;
  actorEmail?: string;
  outputDirectory: string;
  expectedItems?: number;
  cashAccountCode: "1110" | "1120";
};

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function parseArgs(argv: string[]): CliOptions {
  let filePath = "";
  let apply = false;
  let confirmDevelopment = false;
  let actorEmail: string | undefined;
  let outputDirectory = ".local/reports";
  let expectedItems: number | undefined;
  let cashAccountCode: "1110" | "1120" = "1120";

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--") continue;
    if (argument === "--file") filePath = next();
    else if (argument === "--apply") apply = true;
    else if (argument === "--confirm-development") confirmDevelopment = true;
    else if (argument === "--actor-email") actorEmail = next().trim().toLowerCase();
    else if (argument === "--output-directory") outputDirectory = next();
    else if (argument === "--expected-items") expectedItems = Number(next());
    else if (argument === "--cash-account") {
      const value = next();
      if (value !== "1110" && value !== "1120") throw new Error("--cash-account must be 1110 or 1120");
      cashAccountCode = value;
    } else if (argument === "--preview") {
      apply = false;
    } else if (argument === "--help") {
      console.log(`Historical Sell-Out importer

Usage:
  pnpm import:sell-out --file <workbook.xlsm> [--preview]
  pnpm import:sell-out --file <workbook.xlsm> --apply --confirm-development [--actor-email <admin email>]

Safety:
  Preview is the default and never writes journal entries.
  Apply is rejected in a deployment/production environment and requires --confirm-development.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!filePath) throw new Error("--file is required");
  if (expectedItems !== undefined && (!Number.isInteger(expectedItems) || expectedItems <= 0)) {
    throw new Error("--expected-items must be a positive integer");
  }
  return {
    filePath: path.resolve(workspaceRoot, filePath),
    apply,
    confirmDevelopment,
    actorEmail,
    outputDirectory: path.resolve(workspaceRoot, outputDirectory),
    expectedItems,
    cashAccountCode,
  };
}

function markdownList(values: string[], emptyText = "لا يوجد") {
  return values.length ? values.map((value) => `- \`${value}\``).join("\n") : `- ${emptyText}`;
}

function renderReport(
  analysis: HistoricalSellOutAnalysis,
  mode: "preview" | "applied",
  createdEntries: number,
  balanceBefore: { debit: string; credit: string; difference: string },
  balanceAfter: { debit: string; credit: string; difference: string },
) {
  const examples = analysis.exclusions.rows.slice(0, 10).map((row) =>
    `- صف ${row.excelRow}: ${row.month ?? "تاريخ غير صالح"} / ${row.retailer || "بدون بائع"} / `
    + `${row.barcode ?? "بدون باركود"} / ${row.description || "بدون وصف"} — ${row.reasons.join(", ")}`,
  );
  return `# تقرير استيراد Master Sales التاريخي

## حالة التشغيل
- الوضع: **${mode === "preview" ? "معاينة فقط — لم تُكتب أي قيود" : "تنفيذ على بيئة التطوير"}**
- الملف: \`${analysis.source.fileName}\`
- SHA-256: \`${analysis.source.sha256}\`
- ورقة المبيعات: \`${analysis.source.salesSheet}\`
- ورقة المنتجات: \`${analysis.source.itemMasterSheet}\`

## إحصاءات المصدر
- إجمالي صفوف ورقة Master Sales: **${analysis.workbook.worksheetRows}**
- صفوف منطقة البيانات غير الفارغة: **${analysis.workbook.sourceRows}**
- الصفوف المؤهلة الجديدة: **${analysis.workbook.eligibleRows}**
- الصفوف المستبعدة: **${analysis.workbook.excludedRows}**
- الأشهر: ${analysis.workbook.months.join("، ")}
- مواضع الصفوف المفحوصة في Item Master بعد الرأس: **${analysis.itemMaster.scannedRows}**
- صفوف Item Master المملوءة فعلياً: **${analysis.itemMaster.populatedRows}**
- صفوف Item Master المنسقة والفارغة: **${analysis.itemMaster.emptyRows}**
- منتجات Item Master الفريدة ذات الباركود: **${analysis.itemMaster.actualItems}**
- العدد المتوقع المفروض يدوياً: **${analysis.itemMaster.expectedItems ?? "غير محدد"}**
- منتجات المتجر: **${analysis.storefront.products}**
- منتجات المتجر ذات SKU/باركود: **${analysis.storefront.productsWithBarcode}**

## الاستبعادات
- تاريخ غير صالح: **${analysis.exclusions.reasonCounts.invalid_month}**
- بائع مفقود: **${analysis.exclusions.reasonCounts.missing_retailer}**
- باركود VPN مفقود أو غير صالح: **${analysis.exclusions.reasonCounts.missing_barcode}**
- وصف مفقود: **${analysis.exclusions.reasonCounts.missing_description}**
- كمية غير صالحة: **${analysis.exclusions.reasonCounts.invalid_quantity}**
- كمية صفرية أو سالبة: **${analysis.exclusions.reasonCounts.non_positive_quantity}**
- قيمة Sell-out Value غير صالحة: **${analysis.exclusions.reasonCounts.invalid_sell_out_value}**
- قيمة Sell-out Value صفرية أو سالبة: **${analysis.exclusions.reasonCounts.non_positive_sell_out_value}**
- باركود غير موجود في Item Master: **${analysis.exclusions.reasonCounts.missing_item_master_barcode}**
- باركود غير موجود في storefront_products: **${analysis.exclusions.reasonCounts.missing_storefront_barcode}**

### أمثلة الاستبعاد
${examples.length ? examples.join("\n") : "- لا يوجد"}

### جميع الباركودات غير الموجودة في Item Master
${markdownList(analysis.exclusions.barcodesMissingFromItemMaster)}

### جميع الباركودات غير الموجودة في storefront_products
${markdownList(analysis.exclusions.barcodesMissingFromStorefront)}

## القيود والمبالغ
- القيود المؤهلة الجديدة: **${analysis.entries.length}**
- القيود الموجودة مسبقاً والمتجاوزة: **${analysis.entriesAlreadyImported}**
- القيود المنشأة فعلياً: **${createdEntries}**
- إجمالي المبلغ قبل الضريبة: **${analysis.totals.net} ريال سعودي**
- إجمالي الضريبة: **${analysis.totals.vat} ريال سعودي**
- إجمالي المبلغ شامل الضريبة: **${analysis.totals.gross} ريال سعودي**

## ميزان المراجعة
- قبل التشغيل — مدين: **${balanceBefore.debit}**، دائن: **${balanceBefore.credit}**، الفرق: **${balanceBefore.difference}**
- ${mode === "preview" ? "المتوقع بعد الاستيراد" : "بعد الاستيراد"} — مدين: **${balanceAfter.debit}**، دائن: **${balanceAfter.credit}**، الفرق: **${balanceAfter.difference}**
- متوازن: **${balanceAfter.difference === "0.0000" ? "نعم" : "لا"}**

## موانع التنفيذ
${analysis.blockingIssues.length ? analysis.blockingIssues.map((issue) => `- ${issue}`).join("\n") : "- لا يوجد"}

## تحذيرات
${analysis.warnings.length ? analysis.warnings.map((warning) => `- ${warning}`).join("\n") : "- لا يوجد"}
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.apply) {
    if (!options.confirmDevelopment) throw new Error("--apply requires --confirm-development");
    if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
      throw new Error("Historical Sell-Out import is blocked in production/deployment environments");
    }
  }

  const products = await db.select({ sku: productsTable.sku }).from(productsTable);
  const storefrontBarcodes = new Set(
    products.map((product) => product.sku?.trim()).filter((sku): sku is string => Boolean(sku)),
  );
  const existing = await db.select({ sourceId: journalEntriesTable.sourceId })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.sourceType, "historical_import"));
  const existingSourceIds = new Set(
    existing.map((entry) => entry.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId)),
  );
  const analysis = await analyzeHistoricalSellOut({
    filePath: options.filePath,
    expectedItemMasterCount: options.expectedItems,
    storefrontBarcodes,
    storefrontProductCount: products.length,
    existingSourceIds,
  });
  const before = (await trialBalance()).totals;
  let createdEntries = 0;

  if (options.apply) {
    if (analysis.blockingIssues.length) {
      throw new Error(`Import blocked:\n- ${analysis.blockingIssues.join("\n- ")}`);
    }
    const actorEmail = options.actorEmail ?? process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!actorEmail) throw new Error("--actor-email or ADMIN_EMAIL is required for --apply");
    const [actor] = await db.select({ id: adminUsersTable.id, isActive: adminUsersTable.isActive })
      .from(adminUsersTable)
      .where(eq(adminUsersTable.email, actorEmail))
      .limit(1);
    if (!actor?.isActive) throw new Error(`Active administrator ${actorEmail} was not found`);

    await ensureStandardAccountingChart();
    await db.transaction(async (tx) => {
      for (const entry of analysis.entries) {
        await postJournalEntry({
          entryDate: `${entry.month}-01`,
          description: `مبيعات تاريخية مستوردة - ${entry.retailer} - ${entry.description} - ${entry.month}`,
          createdBy: actor.id,
          sourceType: "historical_import",
          sourceId: entry.sourceId,
          lines: [
            { accountCode: options.cashAccountCode, debit: entry.gross },
            { accountCode: "4100", credit: entry.net },
            { accountCode: "2120", credit: entry.vat },
          ],
        }, tx);
        createdEntries += 1;
      }
    });
  }

  const mode = options.apply ? "applied" : "preview";
  const after = options.apply
    ? (await trialBalance()).totals
    : {
        debit: addMoney(before.debit, analysis.totals.gross),
        credit: addMoney(before.credit, analysis.totals.gross),
        difference: before.difference,
      };
  const reportPayload = {
    mode,
    createdEntries,
    analysis,
    trialBalance: { before, after },
  };
  await mkdir(options.outputDirectory, { recursive: true });
  const baseName = `historical-master-sales-${mode}-${analysis.source.fingerprint}`;
  const jsonPath = path.join(options.outputDirectory, `${baseName}.json`);
  const markdownPath = path.join(options.outputDirectory, `${baseName}.md`);
  await writeFile(jsonPath, `${JSON.stringify(reportPayload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderReport(analysis, mode, createdEntries, before, after), "utf8");

  console.log(JSON.stringify({
    mode,
    source: analysis.source.fileName,
    report: { markdownPath, jsonPath },
    entriesPlanned: analysis.entries.length,
    entriesCreated: createdEntries,
    totals: analysis.totals,
    blockingIssues: analysis.blockingIssues,
    trialBalance: { before, after },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
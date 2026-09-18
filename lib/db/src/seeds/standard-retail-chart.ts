import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  accountingAccountsTable,
  expenseCategoryAccountMappingsTable,
  type AccountingAccount,
} from "../schema/accounting";

type AccountSeed = Pick<
  AccountingAccount,
  "code" | "nameAr" | "nameEn" | "accountType" | "normalBalance" | "isPosting"
> & { parentCode?: string };

export const standardRetailChart: readonly AccountSeed[] = [
  { code: "1000", nameAr: "الأصول", nameEn: "Assets", accountType: "asset", normalBalance: "debit", isPosting: false },
  { code: "1100", nameAr: "الأصول المتداولة", nameEn: "Current Assets", accountType: "asset", normalBalance: "debit", isPosting: false, parentCode: "1000" },
  { code: "1110", nameAr: "النقدية", nameEn: "Cash on Hand", accountType: "asset", normalBalance: "debit", isPosting: true, parentCode: "1100" },
  { code: "1120", nameAr: "البنوك", nameEn: "Bank Accounts", accountType: "asset", normalBalance: "debit", isPosting: true, parentCode: "1100" },
  { code: "1130", nameAr: "الذمم المدينة", nameEn: "Accounts Receivable", accountType: "asset", normalBalance: "debit", isPosting: true, parentCode: "1100" },
  { code: "1140", nameAr: "المخزون", nameEn: "Inventory", accountType: "asset", normalBalance: "debit", isPosting: true, parentCode: "1100" },
  { code: "1150", nameAr: "ضريبة القيمة المضافة المدخلة", nameEn: "Input VAT", accountType: "asset", normalBalance: "debit", isPosting: true, parentCode: "1100" },
  { code: "1200", nameAr: "الأصول غير المتداولة", nameEn: "Non-current Assets", accountType: "asset", normalBalance: "debit", isPosting: false, parentCode: "1000" },
  { code: "1210", nameAr: "المعدات والتجهيزات", nameEn: "Equipment and Fixtures", accountType: "asset", normalBalance: "debit", isPosting: true, parentCode: "1200" },
  { code: "1290", nameAr: "مجمع الإهلاك", nameEn: "Accumulated Depreciation", accountType: "asset", normalBalance: "credit", isPosting: true, parentCode: "1200" },
  { code: "2000", nameAr: "الالتزامات", nameEn: "Liabilities", accountType: "liability", normalBalance: "credit", isPosting: false },
  { code: "2100", nameAr: "الالتزامات المتداولة", nameEn: "Current Liabilities", accountType: "liability", normalBalance: "credit", isPosting: false, parentCode: "2000" },
  { code: "2110", nameAr: "الذمم الدائنة", nameEn: "Accounts Payable", accountType: "liability", normalBalance: "credit", isPosting: true, parentCode: "2100" },
  { code: "2120", nameAr: "ضريبة القيمة المضافة المستحقة", nameEn: "Output VAT Payable", accountType: "liability", normalBalance: "credit", isPosting: true, parentCode: "2100" },
  { code: "2130", nameAr: "المصروفات المستحقة", nameEn: "Accrued Expenses", accountType: "liability", normalBalance: "credit", isPosting: true, parentCode: "2100" },
  { code: "2140", nameAr: "ذمم مستحقة للمالك", nameEn: "Owner Payable", accountType: "liability", normalBalance: "credit", isPosting: true, parentCode: "2100" },
  { code: "3000", nameAr: "حقوق الملكية", nameEn: "Equity", accountType: "equity", normalBalance: "credit", isPosting: false },
  { code: "3100", nameAr: "رأس المال", nameEn: "Capital", accountType: "equity", normalBalance: "credit", isPosting: true, parentCode: "3000" },
  { code: "3200", nameAr: "الأرباح المبقاة", nameEn: "Retained Earnings", accountType: "equity", normalBalance: "credit", isPosting: true, parentCode: "3000" },
  { code: "4000", nameAr: "الإيرادات", nameEn: "Revenue", accountType: "revenue", normalBalance: "credit", isPosting: false },
  { code: "4100", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", accountType: "revenue", normalBalance: "credit", isPosting: true, parentCode: "4000" },
  { code: "4110", nameAr: "إيرادات الشحن", nameEn: "Shipping Income", accountType: "revenue", normalBalance: "credit", isPosting: true, parentCode: "4000" },
  { code: "4190", nameAr: "مردودات وخصومات المبيعات", nameEn: "Sales Returns and Discounts", accountType: "revenue", normalBalance: "debit", isPosting: true, parentCode: "4000" },
  { code: "5000", nameAr: "تكلفة المبيعات", nameEn: "Cost of Sales", accountType: "expense", normalBalance: "debit", isPosting: false },
  { code: "5100", nameAr: "تكلفة البضاعة المباعة", nameEn: "Cost of Goods Sold", accountType: "expense", normalBalance: "debit", isPosting: true, parentCode: "5000" },
  { code: "6000", nameAr: "المصروفات التشغيلية", nameEn: "Operating Expenses", accountType: "expense", normalBalance: "debit", isPosting: false },
  { code: "6110", nameAr: "مصروف الإيجار", nameEn: "Rent Expense", accountType: "expense", normalBalance: "debit", isPosting: true, parentCode: "6000" },
  { code: "6120", nameAr: "مصروف الرواتب", nameEn: "Salaries Expense", accountType: "expense", normalBalance: "debit", isPosting: true, parentCode: "6000" },
  { code: "6130", nameAr: "مصروف المرافق", nameEn: "Utilities Expense", accountType: "expense", normalBalance: "debit", isPosting: true, parentCode: "6000" },
  { code: "6140", nameAr: "مصروف التسويق", nameEn: "Marketing Expense", accountType: "expense", normalBalance: "debit", isPosting: true, parentCode: "6000" },
  { code: "6150", nameAr: "مصروف الشحن", nameEn: "Shipping Expense", accountType: "expense", normalBalance: "debit", isPosting: true, parentCode: "6000" },
  { code: "6190", nameAr: "مصروفات تشغيلية أخرى", nameEn: "Other Operating Expenses", accountType: "expense", normalBalance: "debit", isPosting: true, parentCode: "6000" },
];

const expenseAccountCodes = {
  rent: "6110",
  salaries: "6120",
  utilities: "6130",
  marketing: "6140",
  shipping: "6150",
  other: "6190",
} as const;

/**
 * Upserts the standard bilingual retail chart by stable account code.
 * It is safe to run repeatedly and preserves existing account IDs.
 */
export async function seedStandardRetailChart(db: NodePgDatabase<any>): Promise<void> {
  await db.transaction(async (tx) => {
    const accountIds = new Map<string, number>();

    for (const account of standardRetailChart) {
      const parentId = account.parentCode ? accountIds.get(account.parentCode) : null;
      if (account.parentCode && parentId === undefined) {
        throw new Error(`Parent account ${account.parentCode} must be seeded before ${account.code}`);
      }

      const [saved] = await tx.insert(accountingAccountsTable).values({
        code: account.code,
        nameAr: account.nameAr,
        nameEn: account.nameEn,
        accountType: account.accountType,
        normalBalance: account.normalBalance,
        parentId,
        isPosting: account.isPosting,
        isActive: true,
      }).onConflictDoUpdate({
        target: accountingAccountsTable.code,
        set: {
          nameAr: account.nameAr,
          nameEn: account.nameEn,
          accountType: account.accountType,
          normalBalance: account.normalBalance,
          parentId,
          isPosting: account.isPosting,
          isActive: true,
          updatedAt: new Date(),
        },
      }).returning({ id: accountingAccountsTable.id });

      if (!saved) throw new Error(`Failed to seed accounting account ${account.code}`);
      accountIds.set(account.code, saved.id);
    }

    for (const [category, code] of Object.entries(expenseAccountCodes)) {
      const accountId = accountIds.get(code);
      if (accountId === undefined) throw new Error(`Missing expense account ${code}`);

      await tx.insert(expenseCategoryAccountMappingsTable).values({
        category: category as keyof typeof expenseAccountCodes,
        accountId,
      }).onConflictDoUpdate({
        target: expenseCategoryAccountMappingsTable.category,
        set: { accountId, updatedAt: new Date() },
      });
    }
  });
}
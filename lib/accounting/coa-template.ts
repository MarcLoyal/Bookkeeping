/**
 * PH SME chart-of-accounts template (SPEC.md §11). Seeded for every new
 * client at onboarding. fsLineMapping drives financial-statement assembly so
 * report code never hardcodes an account code (spec §11 closing note).
 */

export type AccountTemplateEntry = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  normalBalance: "debit" | "credit";
  fsLineMapping: string;
  parentCode?: string;
};

export const FS_LINES = {
  currentAssets: "current_assets",
  nonCurrentAssets: "noncurrent_assets",
  currentLiabilities: "current_liabilities",
  nonCurrentLiabilities: "noncurrent_liabilities",
  equity: "equity",
  revenue: "revenue",
  cogs: "cost_of_sales",
  operatingExpenses: "operating_expenses",
  otherIncome: "other_income",
} as const;

export const PH_SME_CHART_OF_ACCOUNTS: AccountTemplateEntry[] = [
  // Assets 1000s
  { code: "1010", name: "Cash on Hand", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1020", name: "Cash in Bank", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1030", name: "Accounts Receivable", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1035", name: "Allowance for Doubtful Accounts", type: "asset", normalBalance: "credit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1040", name: "Inventory", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1050", name: "Input VAT", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1055", name: "Deferred Input VAT", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1060", name: "Creditable Withholding Tax", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1070", name: "Prepaid Expenses", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.currentAssets },
  { code: "1080", name: "Property & Equipment", type: "asset", normalBalance: "debit", fsLineMapping: FS_LINES.nonCurrentAssets },
  { code: "1085", name: "Accumulated Depreciation", type: "asset", normalBalance: "credit", fsLineMapping: FS_LINES.nonCurrentAssets },

  // Liabilities 2000s
  { code: "2010", name: "Accounts Payable", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.currentLiabilities },
  { code: "2020", name: "Output VAT", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.currentLiabilities },
  { code: "2030", name: "VAT Payable", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.currentLiabilities },
  { code: "2040", name: "Withholding Tax Payable — Compensation", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.currentLiabilities },
  { code: "2050", name: "Withholding Tax Payable — Expanded", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.currentLiabilities },
  { code: "2060", name: "SSS/PhilHealth/Pag-IBIG Payable", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.currentLiabilities },
  { code: "2070", name: "Income Tax Payable", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.currentLiabilities },
  { code: "2080", name: "Loans Payable", type: "liability", normalBalance: "credit", fsLineMapping: FS_LINES.nonCurrentLiabilities },

  // Equity 3000s
  { code: "3010", name: "Owner's Capital / Share Capital", type: "equity", normalBalance: "credit", fsLineMapping: FS_LINES.equity },
  { code: "3020", name: "Owner's Drawings", type: "equity", normalBalance: "debit", fsLineMapping: FS_LINES.equity },
  { code: "3030", name: "Retained Earnings", type: "equity", normalBalance: "credit", fsLineMapping: FS_LINES.equity },
  { code: "3040", name: "Income Summary", type: "equity", normalBalance: "credit", fsLineMapping: FS_LINES.equity },

  // Income 4000s
  { code: "4010", name: "Sales — Vatable", type: "income", normalBalance: "credit", fsLineMapping: FS_LINES.revenue },
  { code: "4020", name: "Sales — Zero-Rated", type: "income", normalBalance: "credit", fsLineMapping: FS_LINES.revenue },
  { code: "4030", name: "Sales — Exempt", type: "income", normalBalance: "credit", fsLineMapping: FS_LINES.revenue },
  { code: "4040", name: "Service Income", type: "income", normalBalance: "credit", fsLineMapping: FS_LINES.revenue },
  { code: "4050", name: "Sales Returns & Allowances", type: "income", normalBalance: "debit", fsLineMapping: FS_LINES.revenue },
  { code: "4060", name: "Sales Discounts", type: "income", normalBalance: "debit", fsLineMapping: FS_LINES.revenue },
  { code: "4070", name: "Other Income", type: "income", normalBalance: "credit", fsLineMapping: FS_LINES.otherIncome },

  // Expenses 5000s
  { code: "5010", name: "Cost of Sales", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.cogs },
  { code: "5020", name: "Purchases", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.cogs },
  { code: "5030", name: "Salaries & Wages", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5040", name: "SSS/PhilHealth/Pag-IBIG Contributions", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5050", name: "Rent", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5060", name: "Utilities", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5070", name: "Communication", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5080", name: "Supplies", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5090", name: "Repairs & Maintenance", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5100", name: "Transportation & Travel", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5110", name: "Professional Fees", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5120", name: "Taxes & Licenses", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5130", name: "Depreciation", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5140", name: "Bad Debts", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5150", name: "Bank Charges", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
  { code: "5160", name: "Miscellaneous", type: "expense", normalBalance: "debit", fsLineMapping: FS_LINES.operatingExpenses },
];

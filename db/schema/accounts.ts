import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accountTypeEnum, normalBalanceEnum } from "./enums";
import { clients } from "./clients";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g. "1010"
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    normalBalance: normalBalanceEnum("normal_balance").notNull(),
    parentId: uuid("parent_id").references((): any => accounts.id, { onDelete: "set null" }),
    isPostable: boolean("is_postable").notNull().default(true),
    // Which financial statement line this account rolls up to, so FS assembly
    // never hardcodes account codes (spec §11).
    fsLineMapping: text("fs_line_mapping").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    index("accounts_client_id_idx").on(t.clientId),
    uniqueIndex("accounts_client_code_idx").on(t.clientId, t.code),
  ]
);

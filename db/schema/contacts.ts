import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { contactTypeEnum, vatStatusEnum } from "./enums";
import { clients } from "./clients";
import { accounts } from "./accounts";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    type: contactTypeEnum("type").notNull(),
    registeredName: text("registered_name").notNull(),
    tin: text("tin"), // mandatory for anything appearing on SLSP — validated at the app boundary, not the DB, so drafts can be saved incomplete
    address: text("address"),
    vatStatus: vatStatusEnum("vat_status"),
    defaultAccountId: uuid("default_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    defaultEwtCode: text("default_ewt_code"),
  },
  (t) => [index("contacts_client_id_idx").on(t.clientId)]
);

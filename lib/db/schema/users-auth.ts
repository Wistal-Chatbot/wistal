import { sql } from "drizzle-orm";
import { boolean, check, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { chatbot } from "./shared";

export const appUsers = chatbot.table(
  "app_users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull().unique(),
    name: text("name"),
    isAdmin: boolean("is_admin").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("app_users_wistal_email_check", sql`lower(${table.email}) LIKE '%@wistal.com.pl'`),
  ],
);

export const authVerificationTokens = chatbot.table(
  "auth_verification_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("auth_tokens_wistal_email_check", sql`lower(${table.email}) LIKE '%@wistal.com.pl'`),
  ],
);

export type AppUser = typeof appUsers.$inferSelect;
export type NewAppUser = typeof appUsers.$inferInsert;
export type AuthVerificationToken = typeof authVerificationTokens.$inferSelect;
export type NewAuthVerificationToken =
  typeof authVerificationTokens.$inferInsert;

import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, timestamps } from "./_shared.js";
import { adminRole, auditAction } from "./enums.js";

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: adminRole("role").notNull().default("staff"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  action: auditAction("action").notNull(),
  diff: jsonb("diff").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

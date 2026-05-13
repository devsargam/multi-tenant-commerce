import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  char,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, timestamps } from "./_shared.js";

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  phone: text("phone"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  passwordHash: text("password_hash"),
  acceptsMarketing: boolean("accepts_marketing").notNull().default(false),
  defaultBillingAddressId: uuid("default_billing_address_id").references(
    (): AnyPgColumn => addresses.id,
    { onDelete: "set null" },
  ),
  defaultShippingAddressId: uuid("default_shipping_address_id").references(
    (): AnyPgColumn => addresses.id,
    { onDelete: "set null" },
  ),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  label: text("label"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  company: text("company"),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  region: text("region"),
  postalCode: text("postal_code").notNull(),
  country: char("country", { length: 2 }).notNull(),
  phone: text("phone"),
  isDefaultBilling: boolean("is_default_billing").notNull().default(false),
  isDefaultShipping: boolean("is_default_shipping").notNull().default(false),
});

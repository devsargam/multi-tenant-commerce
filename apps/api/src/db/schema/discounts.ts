import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared.js";
import { customers } from "./customers.js";
import { discountAppliesTo, discountType } from "./enums.js";
import { orders } from "./orders.js";

export const discounts = pgTable("discounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").unique(),
  type: discountType("type").notNull(),
  value: integer("value").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  usageLimit: integer("usage_limit"),
  usageLimitPerCustomer: integer("usage_limit_per_customer"),
  minSubtotalCents: integer("min_subtotal_cents"),
  appliesTo: discountAppliesTo("applies_to").notNull().default("all"),
  ...timestamps,
});

export const discountRedemptions = pgTable(
  "discount_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discountId: uuid("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    perCustomerIdx: index("discount_redemptions_customer_idx").on(
      t.discountId,
      t.customerId,
    ),
  }),
);

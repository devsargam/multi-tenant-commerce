import {
  char,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared.js";
import { paymentMethod, paymentRecordStatus } from "./enums.js";
import { orders } from "./orders.js";

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerPaymentId: text("provider_payment_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  status: paymentRecordStatus("status").notNull().default("pending"),
  method: paymentMethod("method").notNull(),
  cardLast4: text("card_last4"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  rawResponse: jsonb("raw_response").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason"),
  status: paymentRecordStatus("status").notNull().default("pending"),
  createdBy: uuid("created_by"),
  ...timestamps,
});

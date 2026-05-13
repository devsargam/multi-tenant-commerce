import {
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, timestamps } from "./_shared.js";
import { customers } from "./customers.js";
import {
  cartStatus,
  fulfillmentStatus,
  orderEventType,
  orderStatus,
  paymentStatus,
} from "./enums.js";
import { productVariants } from "./products.js";

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    sessionToken: text("session_token"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    status: cartStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    sessionIdx: index("carts_session_token_idx").on(t.sessionToken),
    customerIdx: index("carts_customer_idx").on(t.customerId),
    statusExpiresIdx: index("carts_status_expires_idx").on(t.status, t.expiresAt),
  }),
);

export const cartItems = pgTable("cart_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    email: citext("email").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    fulfillmentStatus: fulfillmentStatus("fulfillment_status")
      .notNull()
      .default("unfulfilled"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountTotalCents: integer("discount_total_cents").notNull().default(0),
    taxTotalCents: integer("tax_total_cents").notNull().default(0),
    shippingTotalCents: integer("shipping_total_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    billingAddress: jsonb("billing_address").$type<Record<string, unknown>>(),
    shippingAddress: jsonb("shipping_address").$type<Record<string, unknown>>(),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    customerIdx: index("orders_customer_idx").on(t.customerId),
    statusIdx: index("orders_status_idx").on(t.status),
    placedAtIdx: index("orders_placed_at_idx").on(t.placedAt),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => ({
    orderIdx: index("order_items_order_idx").on(t.orderId),
    variantIdx: index("order_items_variant_idx").on(t.variantId),
  }),
);

export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  type: orderEventType("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

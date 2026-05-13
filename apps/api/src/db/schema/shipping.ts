import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared.js";
import { shipmentStatus, shippingRateType } from "./enums.js";
import { inventoryLocations } from "./inventory.js";
import { orderItems, orders } from "./orders.js";

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => inventoryLocations.id, {
    onDelete: "set null",
  }),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  status: shipmentStatus("status").notNull().default("pending"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  ...timestamps,
});

export const shipmentItems = pgTable(
  "shipment_items",
  {
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.shipmentId, t.orderItemId] }),
  }),
);

export const shippingZones = pgTable("shipping_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  countries: text("countries").array().notNull().default([] as string[]),
});

export const shippingRates = pgTable("shipping_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => shippingZones.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: shippingRateType("type").notNull().default("flat"),
  priceCents: integer("price_cents").notNull(),
  minWeight: integer("min_weight"),
  maxWeight: integer("max_weight"),
  minSubtotal: integer("min_subtotal"),
  maxSubtotal: integer("max_subtotal"),
});

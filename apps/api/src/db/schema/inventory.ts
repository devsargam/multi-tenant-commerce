import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared.js";
import { inventoryMovementReason } from "./enums.js";
import { productVariants } from "./products.js";

export const inventoryLocations = pgTable("inventory_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: jsonb("address").$type<Record<string, unknown>>(),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});

export const inventoryItems = pgTable(
  "inventory_items",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocations.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    available: integer("available").generatedAlwaysAs(
      sql`on_hand - reserved`,
    ),
    reorderPoint: integer("reorder_point"),
    ...timestamps,
  },
  (t) => ({
    pk: primaryKey({ columns: [t.variantId, t.locationId] }),
  }),
);

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => inventoryLocations.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: inventoryMovementReason("reason").notNull(),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

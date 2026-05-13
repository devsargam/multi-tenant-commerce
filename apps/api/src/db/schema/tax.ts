import {
  char,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

export const taxClasses = pgTable("tax_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  taxClassId: uuid("tax_class_id")
    .notNull()
    .references(() => taxClasses.id, { onDelete: "cascade" }),
  country: char("country", { length: 2 }).notNull(),
  region: text("region"),
  rate: numeric("rate", { precision: 5, scale: 4 }).notNull(),
  name: text("name").notNull(),
});

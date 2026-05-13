import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { softDelete, timestamps } from "./_shared.js";
import { brands } from "./brands.js";
import { productStatus } from "./enums.js";
import { taxClasses } from "./tax.js";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    shortDescription: text("short_description"),
    status: productStatus("status").notNull().default("draft"),
    brandId: uuid("brand_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    defaultVariantId: uuid("default_variant_id"),
    taxClassId: uuid("tax_class_id").references(() => taxClasses.id, {
      onDelete: "set null",
    }),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    statusIdx: index("products_status_idx").on(t.status),
    metadataIdx: index("products_metadata_gin_idx").using("gin", t.metadata),
  }),
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    compareAtPriceCents: integer("compare_at_price_cents"),
    costCents: integer("cost_cents"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    weightGrams: integer("weight_grams"),
    dimensions: jsonb("dimensions").$type<{
      length: number;
      width: number;
      height: number;
      unit: "cm" | "in";
    }>(),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    productIdx: index("product_variants_product_idx").on(t.productId),
  }),
);

export const productOptions = pgTable("product_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const productOptionValues = pgTable("product_option_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  optionId: uuid("option_id")
    .notNull()
    .references(() => productOptions.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  position: integer("position").notNull().default(0),
});

export const variantOptionValues = pgTable(
  "variant_option_values",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    optionValueId: uuid("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.variantId, t.optionValueId] }),
  }),
);

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => productVariants.id, {
    onDelete: "cascade",
  }),
  url: text("url").notNull(),
  alt: text("alt"),
  position: integer("position").notNull().default(0),
  width: integer("width"),
  height: integer("height"),
});


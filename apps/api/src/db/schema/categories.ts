import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { products } from "./products.js";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
    onDelete: "set null",
  }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  position: integer("position").notNull().default(0),
});

export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.categoryId] }),
  }),
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const productTags = pgTable(
  "product_tags",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.tagId] }),
  }),
);

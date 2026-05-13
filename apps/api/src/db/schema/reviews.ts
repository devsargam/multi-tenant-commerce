import { check, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "./_shared.js";
import { customers } from "./customers.js";
import { reviewStatus } from "./enums.js";
import { products } from "./products.js";

export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    rating: smallint("rating").notNull(),
    title: text("title"),
    body: text("body"),
    status: reviewStatus("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => ({
    ratingCheck: check(
      "product_reviews_rating_check",
      sql`${t.rating} BETWEEN 1 AND 5`,
    ),
  }),
);

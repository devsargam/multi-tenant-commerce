import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared.js";

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  description: text("description"),
  ...timestamps,
});

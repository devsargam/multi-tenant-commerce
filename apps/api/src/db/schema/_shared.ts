import { sql } from "drizzle-orm";
import { customType, timestamp } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => "citext",
});

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
};

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

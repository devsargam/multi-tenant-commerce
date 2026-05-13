import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/scalable_commerce";

export const pool = new pg.Pool({ connectionString });

export const db = drizzle(pool, { schema, casing: "snake_case" });

export type Db = typeof db;
export { schema };

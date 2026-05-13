import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/scalable_commerce";

async function main() {
  const pool = new pg.Pool({ connectionString });
  await pool.query("CREATE EXTENSION IF NOT EXISTS citext");
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

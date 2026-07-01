import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../schemas/index";

/**
 * Lazy database initializer.
 * Only throws DATABASE_URL error when someone actually tries to use `db`,
 * not at module import time. This prevents client-side bundles from crashing
 * when they import server function files that reference db.
 */
type DB = ReturnType<typeof createDb>;

function createDb() {
  if (typeof process === "undefined" || !process.env.DATABASE_URL) {
    const hint =
      typeof process === "undefined"
        ? "Database accessed from client-side bundle — server functions only"
        : "DATABASE_URL is not set in environment variables";
    throw new Error(hint);
  }

  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}

let _db: DB | null = null;

function getDb(): DB {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    return getDb()[prop as keyof DB];
  },
});

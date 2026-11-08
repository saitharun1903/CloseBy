import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __closebyDb?: { db: DB; sql: postgres.Sql } };

export function getDb(): DB {
  if (!globalForDb.__closebyDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const sql = postgres(url, { max: 10, idle_timeout: 30, prepare: true });
    globalForDb.__closebyDb = { db: drizzle(sql, { schema }), sql };
  }
  return globalForDb.__closebyDb.db;
}

export async function closeDb() {
  if (globalForDb.__closebyDb) {
    await globalForDb.__closebyDb.sql.end({ timeout: 5 });
    globalForDb.__closebyDb = undefined;
  }
}

export { schema };

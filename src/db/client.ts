import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema.js";

const { Pool } = pkg;

export type Database = ReturnType<typeof createDb>;

export function createPool(connectionString?: string): pkg.Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return new Pool({ connectionString: url, max: 10 });
}

export function createDb(pool?: pkg.Pool) {
  const p = pool ?? createPool();
  return { db: drizzle(p, { schema }), pool: p };
}

import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import pkg from "pg";
import * as schema from "./schema.js";

const { Pool } = pkg;

export type Database = ReturnType<typeof createDb>;

/** Either the pool-backed db or a transaction handle, so a helper can run inside both. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

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

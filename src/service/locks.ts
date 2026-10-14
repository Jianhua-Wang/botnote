import type pkg from "pg";

/**
 * Stable keys for Postgres advisory locks shared by every daemon instance on
 * the same database. Never renumber: an older build must contend for the
 * same key as a newer one during a rolling restart.
 */
export const LOCK_KEYS = {
  recurrenceMaterializer: 7401,
  trashPurge: 7402,
  sessionPrune: 7403
} as const;

export type LockKey = (typeof LOCK_KEYS)[keyof typeof LOCK_KEYS];

export type LockedRun<T> = { acquired: true; value: T } | { acquired: false };

/**
 * Run fn while a dedicated pool connection holds a session-level advisory
 * lock. If another session already holds it, fn is not run and
 * { acquired: false } is returned immediately. The work itself may use the
 * shared db handle; only the lock lives on the dedicated connection.
 */
export async function withAdvisoryLock<T>(
  pool: pkg.Pool,
  key: LockKey,
  fn: () => Promise<T>
): Promise<LockedRun<T>> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [key]
    );
    if (!res.rows[0]?.locked) return { acquired: false };
    try {
      return { acquired: true, value: await fn() };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}

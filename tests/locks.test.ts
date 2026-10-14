import { afterAll, describe, expect, it } from "vitest";
import { LOCK_KEYS, withAdvisoryLock } from "../src/service/locks.js";
import { createTestDb } from "./test_db.js";

const { pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("withAdvisoryLock", () => {
  it("runs the work and reports the value when the lock is free", async () => {
    const run = await withAdvisoryLock(pool, LOCK_KEYS.trashPurge, async () => 42);
    expect(run).toEqual({ acquired: true, value: 42 });
  });

  it("skips a second caller while the first still holds the lock, then frees it", async () => {
    const holding = deferred();
    const release = deferred();
    const first = withAdvisoryLock(pool, LOCK_KEYS.recurrenceMaterializer, async () => {
      holding.resolve();
      await release.promise;
      return "first";
    });
    await holding.promise;

    const second = await withAdvisoryLock(pool, LOCK_KEYS.recurrenceMaterializer, async () => "second");
    expect(second).toEqual({ acquired: false });

    const other = await withAdvisoryLock(pool, LOCK_KEYS.sessionPrune, async () => "other key");
    expect(other).toEqual({ acquired: true, value: "other key" });

    release.resolve();
    expect(await first).toEqual({ acquired: true, value: "first" });

    const third = await withAdvisoryLock(pool, LOCK_KEYS.recurrenceMaterializer, async () => "third");
    expect(third).toEqual({ acquired: true, value: "third" });
  });

  it("releases the lock even when the work throws", async () => {
    await expect(
      withAdvisoryLock(pool, LOCK_KEYS.trashPurge, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const again = await withAdvisoryLock(pool, LOCK_KEYS.trashPurge, async () => "ok");
    expect(again).toEqual({ acquired: true, value: "ok" });
  });
});

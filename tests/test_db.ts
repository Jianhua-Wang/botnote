import { createDb, createPool } from "../src/db/client.js";

export function testDatabaseUrl(): string {
  const url = process.env.BOTNOTE_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "BOTNOTE_TEST_DATABASE_URL is required for tests. Refusing to run against DATABASE_URL."
    );
  }

  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(
      `BOTNOTE_TEST_DATABASE_URL must point to a test database; got database '${dbName}'.`
    );
  }

  return url;
}

export function createTestDb() {
  return createDb(createPool(testDatabaseUrl()));
}

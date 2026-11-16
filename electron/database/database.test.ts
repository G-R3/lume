import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, getDatabase, getLibraryDatabasePath, initializeDatabase } from ".";

afterEach(closeDatabase);

describe("library database lifecycle", () => {
  it("uses separate development and packaged database names", () => {
    expect(getLibraryDatabasePath("/data", false)).toBe(join("/data", "lume-dev.sqlite"));
    expect(getLibraryDatabasePath("/data", true)).toBe(join("/data", "lume.sqlite"));
  });

  it.each([
    { columns: "'paused', 'unscanned', NULL, NULL", check: "library_sources_status_check" },
    { columns: "'active', 'pending', NULL, NULL", check: "library_sources_scan_check" },
    { columns: "'active', 'unscanned', 1, NULL", check: "library_sources_scan_check" },
    { columns: "'active', 'unscanned', NULL, 'stale'", check: "library_sources_scan_check" },
    { columns: "'active', 'ok', NULL, NULL", check: "library_sources_scan_check" },
    { columns: "'active', 'ok', 1, 'stale'", check: "library_sources_scan_check" },
    { columns: "'off', 'missing', 1, NULL", check: "library_sources_scan_check" },
  ])("rejects a source row of ($columns)", async ({ check, columns }) => {
    const database = await openTestDatabase();

    expect(() =>
      database.exec(`
        INSERT INTO library_sources
          (path, status, last_scan_outcome, last_scanned_at, last_scan_error_message, created_at, updated_at)
        VALUES ('/Music', ${columns}, 1, 1)
      `),
    ).toThrow(check);
  });

  it("keeps a single onboarding row", async () => {
    const database = await openTestDatabase();

    expect(() => database.exec("INSERT INTO app_state (id, onboarded_at) VALUES (2, 1)")).toThrow(
      "app_state_singleton_check",
    );
  });
});

async function openTestDatabase(
  location = ":memory:",
  migrationsFolder = join(import.meta.dirname, "../../drizzle"),
) {
  await initializeDatabase({ location, migrationsFolder });

  return getDatabase().$client;
}

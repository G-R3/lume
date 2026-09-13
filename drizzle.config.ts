import { defineConfig } from "drizzle-kit";
import { getDevelopmentDatabasePath } from "./scripts/development-database-path.mjs";

export default defineConfig({
  dialect: "sqlite",
  schema: "./electron/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: getDevelopmentDatabasePath(),
  },
});

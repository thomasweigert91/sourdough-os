import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { getMigrationDatabaseUrl } from "./src/db/env";

// Wie bei Next: .env.local vor .env; bereits gesetzte Variablen werden nicht überschrieben.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: getMigrationDatabaseUrl() },
});

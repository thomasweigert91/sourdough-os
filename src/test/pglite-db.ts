// Test-Helfer: In-Memory-Postgres (PGlite) mit den echten Migrationen aus drizzle/.
// Nur für Tests gedacht, niemals für Produktivcode. Es entsteht keine Verbindung zu Neon.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
);

export async function createTestDb(): Promise<{
  db: PgliteDatabase<typeof schema>;
  /** Leert user, session und account (verification über keine Fremdschlüssel verbunden). */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle({ client, schema });

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    db,
    reset: async () => {
      await client.exec('TRUNCATE "user", "verification" CASCADE');
    },
    close: async () => {
      await client.close();
    },
  };
}

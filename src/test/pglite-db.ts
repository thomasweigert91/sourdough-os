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

/**
 * PGlite-`db` mit nachgebildetem `batch` (F010). `drizzle-orm/pglite` hat kein `batch`;
 * auf Neon (neon-http) läuft `db.batch` als eine nicht interaktive Postgres-Transaktion.
 * Hier: BEGIN, Statements nacheinander, COMMIT bzw. bei einem Fehler ROLLBACK.
 */
export type BatchTestDb = PgliteDatabase<typeof schema> & {
  batch: (queries: readonly PromiseLike<unknown>[]) => Promise<unknown[]>;
};

export async function createTestDb(): Promise<{
  db: PgliteDatabase<typeof schema>;
  /** Wie `db`, zusätzlich mit `batch` (Transaktion auf der einen PGlite-Verbindung). */
  batchDb: BatchTestDb;
  /** Leert user, session und account (verification über keine Fremdschlüssel verbunden). */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle({ client, schema });

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  // Eine Verbindung: Batches nacheinander ausführen, damit sich Transaktionen nicht überlappen.
  let queue: Promise<unknown> = Promise.resolve();

  async function runBatch(queries: readonly PromiseLike<unknown>[]): Promise<unknown[]> {
    await client.exec("BEGIN");
    try {
      const results: unknown[] = [];
      for (const query of queries) {
        results.push(await query);
      }
      await client.exec("COMMIT");
      return results;
    } catch (error) {
      await client.exec("ROLLBACK");
      throw error;
    }
  }

  function batch(queries: readonly PromiseLike<unknown>[]): Promise<unknown[]> {
    const next = queue.then(() => runBatch(queries));
    queue = next.catch(() => undefined);
    return next;
  }

  // `db` selbst bleibt unverändert. Eine im Test gesetzte eigene Eigenschaft "batch"
  // (z. B. über vi.spyOn) landet auf dem Ziel und hat dann Vorrang.
  const ownBatch = (target: object) => Object.prototype.hasOwnProperty.call(target, "batch");
  const batchDb = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "batch" && !ownBatch(target)) return batch;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      return prop === "batch" || Reflect.has(target, prop);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === "batch" && !ownBatch(target)) {
        return { value: batch, writable: true, enumerable: false, configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  }) as unknown as BatchTestDb;

  return {
    db,
    batchDb,
    reset: async () => {
      await client.exec('TRUNCATE "user", "verification" CASCADE');
    },
    close: async () => {
      await client.close();
    },
  };
}

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { NeonHttpDatabase as NeonHttpDatabaseType } from "drizzle-orm/neon-http";
import type * as Schema from "@/db/schema";

const MESSAGE = "DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.";
// Dummy-URL: neon() baut beim Erzeugen keine Verbindung auf, es entsteht kein Netzwerkverkehr.
const POOLED_URL =
  "postgresql://user:pass@ep-test-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const UNPOOLED_URL =
  "postgresql://user:pass@ep-test-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("F002 typisierte db-Instanz (@/db)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("F002/AC-3 exportiert unter @/db eine Drizzle-Instanz des Neon-HTTP-Drivers", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);
    const { db } = await import("@/db");
    const { NeonHttpDatabase } = await import("drizzle-orm/neon-http");

    expect(db).toBeInstanceOf(NeonHttpDatabase);
    expectTypeOf(db).toExtend<NeonHttpDatabaseType<typeof Schema>>();
  });

  it("F002/AC-3 verbindet db über die neon()-HTTP-Query-Funktion aus @neondatabase/serverless", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);
    const { db } = await import("@/db");

    expect(typeof db.$client).toBe("function");
  });

  it("F002/AC-3 verdrahtet das Schema mit der Tabelle healthcheck", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);
    const { db } = await import("@/db");

    expect(db.query.healthcheck).toBeDefined();
  });

  it("F002/AC-4 bricht den Import von @/db ohne DATABASE_URL mit dem Hinweistext ab", async () => {
    await expect(import("@/db")).rejects.toThrow(MESSAGE);
  });

  it("F002/AC-4 bricht den Import von @/db mit leerer DATABASE_URL mit dem Hinweistext ab", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("@/db")).rejects.toThrow(MESSAGE);
  });

  it("F002/AC-4 bricht den Import von @/db ab, wenn nur DATABASE_URL_UNPOOLED gesetzt ist", async () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", UNPOOLED_URL);
    await expect(import("@/db")).rejects.toThrow(MESSAGE);
  });
});

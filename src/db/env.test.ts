// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MESSAGE = "DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.";
const POOLED_URL =
  "postgresql://user:pass@ep-test-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const UNPOOLED_URL =
  "postgresql://user:pass@ep-test-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

async function loadEnvModule() {
  return import("./env");
}

describe("F002 Env-Prüfung (src/db/env.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("getDatabaseUrl", () => {
    it("F002/AC-4 wirft den Hinweistext, wenn DATABASE_URL nicht gesetzt ist", async () => {
      const { getDatabaseUrl } = await loadEnvModule();
      expect(() => getDatabaseUrl()).toThrow(MESSAGE);
    });

    it("F002/AC-4 wirft den Hinweistext, wenn DATABASE_URL leer ist", async () => {
      vi.stubEnv("DATABASE_URL", "");
      const { getDatabaseUrl } = await loadEnvModule();
      expect(() => getDatabaseUrl()).toThrow(MESSAGE);
    });

    it("F002/AC-4 wirft den Hinweistext, wenn DATABASE_URL nur aus Leerzeichen besteht", async () => {
      vi.stubEnv("DATABASE_URL", "   ");
      const { getDatabaseUrl } = await loadEnvModule();
      expect(() => getDatabaseUrl()).toThrow(MESSAGE);
    });

    it("F002/AC-4 wirft einen Error mit exakt dem Hinweistext als message", async () => {
      const { getDatabaseUrl } = await loadEnvModule();
      let caught: unknown;
      try {
        getDatabaseUrl();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(MESSAGE);
    });

    it("F002/AC-4 liest DATABASE_URL zur Aufrufzeit und gibt den gesetzten Wert zurück", async () => {
      const { getDatabaseUrl } = await loadEnvModule();
      expect(() => getDatabaseUrl()).toThrow(MESSAGE);
      vi.stubEnv("DATABASE_URL", POOLED_URL);
      expect(getDatabaseUrl()).toBe(POOLED_URL);
    });

    it("F002/AC-4 exportiert den Hinweistext als Konstante", async () => {
      const { MISSING_DATABASE_URL_MESSAGE } = await loadEnvModule();
      expect(MISSING_DATABASE_URL_MESSAGE).toBe(MESSAGE);
    });
  });

  describe("getMigrationDatabaseUrl", () => {
    it("F002/AC-4 wirft den Hinweistext, wenn DATABASE_URL nicht gesetzt ist", async () => {
      const { getMigrationDatabaseUrl } = await loadEnvModule();
      expect(() => getMigrationDatabaseUrl()).toThrow(MESSAGE);
    });

    it("F002/AC-4 wirft den Hinweistext, wenn DATABASE_URL leer ist", async () => {
      vi.stubEnv("DATABASE_URL", "");
      const { getMigrationDatabaseUrl } = await loadEnvModule();
      expect(() => getMigrationDatabaseUrl()).toThrow(MESSAGE);
    });

    it("F002/AC-4 wirft den Hinweistext, wenn DATABASE_URL nur aus Leerzeichen besteht", async () => {
      vi.stubEnv("DATABASE_URL", "   ");
      const { getMigrationDatabaseUrl } = await loadEnvModule();
      expect(() => getMigrationDatabaseUrl()).toThrow(MESSAGE);
    });

    it("F002/AC-4 wirft den Hinweistext auch dann, wenn nur DATABASE_URL_UNPOOLED gesetzt ist", async () => {
      vi.stubEnv("DATABASE_URL_UNPOOLED", UNPOOLED_URL);
      const { getMigrationDatabaseUrl } = await loadEnvModule();
      expect(() => getMigrationDatabaseUrl()).toThrow(MESSAGE);
    });

    it("F002/AC-2 bevorzugt DATABASE_URL_UNPOOLED für Migrationen", async () => {
      vi.stubEnv("DATABASE_URL", POOLED_URL);
      vi.stubEnv("DATABASE_URL_UNPOOLED", UNPOOLED_URL);
      const { getMigrationDatabaseUrl } = await loadEnvModule();
      expect(getMigrationDatabaseUrl()).toBe(UNPOOLED_URL);
    });

    it("F002/AC-2 fällt auf DATABASE_URL zurück, wenn DATABASE_URL_UNPOOLED fehlt", async () => {
      vi.stubEnv("DATABASE_URL", POOLED_URL);
      const { getMigrationDatabaseUrl } = await loadEnvModule();
      expect(getMigrationDatabaseUrl()).toBe(POOLED_URL);
    });

    it("F002/AC-2 fällt auf DATABASE_URL zurück, wenn DATABASE_URL_UNPOOLED leer ist", async () => {
      vi.stubEnv("DATABASE_URL", POOLED_URL);
      vi.stubEnv("DATABASE_URL_UNPOOLED", "");
      const { getMigrationDatabaseUrl } = await loadEnvModule();
      expect(getMigrationDatabaseUrl()).toBe(POOLED_URL);
    });
  });
});

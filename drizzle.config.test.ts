// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// dotenv wird gemockt: Kein Unit-Test darf die echten .env/.env.local laden.
const { configMock } = vi.hoisted(() => ({ configMock: vi.fn() }));
vi.mock("dotenv", () => ({
  config: configMock,
  default: { config: configMock },
}));

const MESSAGE = "DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.";
const POOLED_URL =
  "postgresql://user:pass@ep-test-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const UNPOOLED_URL =
  "postgresql://user:pass@ep-test-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_KIT_BIN = path.join(ROOT, "node_modules", "drizzle-kit", "bin.cjs");
const CONFIG_PATH = path.join(ROOT, "drizzle.config.ts");
const CLI_TIMEOUT_MS = 60_000;

/** Kopie der aktuellen Umgebung ohne Datenbank-Variablen. */
function envWithoutDatabaseVars(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^DATABASE_URL(_UNPOOLED)?$/i.test(key)) delete env[key];
  }
  return env;
}

async function loadConfig() {
  return (await import("./drizzle.config")).default;
}

describe("F002 drizzle.config.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    configMock.mockReset();
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("F002/AC-2 F003/AC-2 konfiguriert PostgreSQL, Schema-Verzeichnis und Migrationsordner und nutzt die direkte Verbindung", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);
    vi.stubEnv("DATABASE_URL_UNPOOLED", UNPOOLED_URL);

    const config = await loadConfig();

    expect(config).toMatchObject({
      dialect: "postgresql",
      schema: "./src/db/schema",
      out: "./drizzle",
      dbCredentials: { url: UNPOOLED_URL },
    });
  });

  it("F002/AC-2 fällt ohne DATABASE_URL_UNPOOLED auf DATABASE_URL zurück", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);

    const config = await loadConfig();

    expect(config).toMatchObject({ dbCredentials: { url: POOLED_URL } });
  });

  it("F002/AC-2 fällt bei leerer DATABASE_URL_UNPOOLED auf DATABASE_URL zurück", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);
    vi.stubEnv("DATABASE_URL_UNPOOLED", "");

    const config = await loadConfig();

    expect(config).toMatchObject({ dbCredentials: { url: POOLED_URL } });
  });

  it("F002/AC-2 lädt die Env-Dateien per dotenv in der Reihenfolge .env.local, .env", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);

    await loadConfig();

    expect(configMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: [".env.local", ".env"] }),
    );
  });

  it("F002/AC-2 verwendet Werte, die dotenv beim Laden der Config bereitstellt", async () => {
    configMock.mockImplementation(() => {
      process.env.DATABASE_URL = POOLED_URL;
      process.env.DATABASE_URL_UNPOOLED = UNPOOLED_URL;
      return { parsed: {} };
    });

    const config = await loadConfig();

    expect(config).toMatchObject({ dbCredentials: { url: UNPOOLED_URL } });
  });

  it("F002/AC-4 bricht das Laden der Config ohne DATABASE_URL mit dem Hinweistext ab", async () => {
    await expect(import("./drizzle.config")).rejects.toThrow(MESSAGE);
  });

  it("F002/AC-4 bricht das Laden der Config ab, wenn nur DATABASE_URL_UNPOOLED gesetzt ist", async () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", UNPOOLED_URL);
    await expect(import("./drizzle.config")).rejects.toThrow(MESSAGE);
  });
});

describe("F002 drizzle-kit CLI", () => {
  it(
    "F002/AC-4 drizzle-kit migrate endet ohne DATABASE_URL mit Exit-Code ungleich 0 und dem Hinweistext",
    () => {
      expect(fs.existsSync(DRIZZLE_KIT_BIN)).toBe(true);
      expect(fs.existsSync(CONFIG_PATH)).toBe(true);

      // Leeres Arbeitsverzeichnis: dotenv findet dort weder .env.local noch .env.
      const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), "f002-no-env-"));
      try {
        const result = spawnSync(
          process.execPath,
          [DRIZZLE_KIT_BIN, "migrate", `--config=${CONFIG_PATH}`],
          {
            cwd: emptyCwd,
            env: envWithoutDatabaseVars(),
            encoding: "utf8",
            timeout: CLI_TIMEOUT_MS,
          },
        );
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

        expect(result.error).toBeUndefined();
        expect(typeof result.status).toBe("number");
        expect(result.status).not.toBe(0);
        expect(output).toContain(MESSAGE);
      } finally {
        fs.rmSync(emptyCwd, { recursive: true, force: true });
      }
    },
    CLI_TIMEOUT_MS + 10_000,
  );

  it(
    "F002/AC-6 drizzle-kit migrate endet bei nicht erreichbarer Datenbank mit Exit-Code ungleich 0",
    () => {
      expect(fs.existsSync(DRIZZLE_KIT_BIN)).toBe(true);
      expect(fs.existsSync(CONFIG_PATH)).toBe(true);

      // Explizit gesetzte Werte überschreibt dotenv nicht. Verbindung nur zu localhost, nie zu Neon.
      const unreachableUrl = "postgresql://user:wrong@127.0.0.1/neondb";
      const result = spawnSync(
        process.execPath,
        [DRIZZLE_KIT_BIN, "migrate", "--config=drizzle.config.ts"],
        {
          cwd: ROOT,
          env: {
            ...envWithoutDatabaseVars(),
            DATABASE_URL: unreachableUrl,
            DATABASE_URL_UNPOOLED: unreachableUrl,
          },
          encoding: "utf8",
          timeout: CLI_TIMEOUT_MS,
        },
      );

      // Nur der Exit-Code zählt: Die Log-Texte von drizzle-kit sind keine stabile Schnittstelle.
      expect(result.error).toBeUndefined();
      expect(typeof result.status).toBe("number");
      expect(result.status).not.toBe(0);
    },
    CLI_TIMEOUT_MS + 10_000,
  );
});

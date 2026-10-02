// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Prüft die Migration 0003 für Rezepte und Zutaten sowie die Drift zwischen Schema und Migrationen.
// Liest weder .env noch .env.local und verbindet sich nie mit Neon.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.join(ROOT, "drizzle");
const DRIZZLE_KIT_BIN = path.join(ROOT, "node_modules", "drizzle-kit", "bin.cjs");
const CLI_TIMEOUT_MS = 60_000;

interface Journal {
  dialect: string;
  entries: Array<{ idx: number; tag: string }>;
}

function readJournal(dir: string = DRIZZLE_DIR): Journal {
  return JSON.parse(fs.readFileSync(path.join(dir, "meta", "_journal.json"), "utf8")) as Journal;
}

function migrationFiles(dir: string = DRIZZLE_DIR): string[] {
  return fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
}

function findRecipesMigrationSql(): string {
  const files = fs.readdirSync(DRIZZLE_DIR).filter((name) => /^0003_.+\.sql$/.test(name));
  expect(files, "genau eine Datei drizzle/0003_*.sql").toHaveLength(1);
  return fs.readFileSync(path.join(DRIZZLE_DIR, files[0]), "utf8");
}

/** Alle Dateien eines Migrationsordners (inkl. meta/) als relative, sortierte Liste. */
function listFiles(dir: string): string[] {
  const result: string[] = [];
  const walk = (current: string, prefix: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else result.push(rel);
    }
  };
  walk(dir, "");
  return result.sort();
}

/** Kopie der aktuellen Umgebung ohne Datenbank-Variablen. */
function envWithoutDatabaseVars(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^DATABASE_URL(_UNPOOLED)?$/i.test(key)) delete env[key];
  }
  return env;
}

describe("F006 Migration für Rezepte und Zutaten", () => {
  it("F006/AC-7 das Journal enthält 0000 bis 0002 unverändert und als vierten Eintrag 0003_recipes", () => {
    const journal = readJournal();

    expect(journal.dialect).toBe("postgresql");
    // Spätere Migrationen (0004_* …) sind erlaubt, die ersten vier Einträge sind fest.
    expect(journal.entries.length).toBeGreaterThanOrEqual(4);
    expect(journal.entries.slice(0, 4).map((entry) => entry.tag)).toEqual([
      "0000_init",
      "0001_auth_core",
      "0002_user_preference",
      "0003_recipes",
    ]);
    expect(journal.entries[3].idx).toBe(3);
  });

  it("F006/AC-7 es gibt genau eine neue Migrationsdatei drizzle/0003_*.sql und den Snapshot 0003", () => {
    const files = migrationFiles();

    expect(files.filter((name) => /^0003_.+\.sql$/.test(name))).toEqual(["0003_recipes.sql"]);
    expect(files.slice(0, 4)).toEqual([
      "0000_init.sql",
      "0001_auth_core.sql",
      "0002_user_preference.sql",
      "0003_recipes.sql",
    ]);
    expect(fs.existsSync(path.join(DRIZZLE_DIR, "meta", "0003_snapshot.json"))).toBe(true);
  });

  it("F006/AC-7 die Migration legt den Enum ingredient_type und die Tabellen recipes und recipe_ingredients an", () => {
    const sql = findRecipesMigrationSql();
    const created = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);

    expect(sql).toContain('CREATE TYPE "public"."ingredient_type"');
    for (const value of ["flour", "water", "starter", "salt", "other"]) {
      expect(sql, `Enum-Wert ${value}`).toContain(`'${value}'`);
    }
    expect([...created].sort()).toEqual(["recipe_ingredients", "recipes"]);
  });

  it("F006/AC-7 die Migration verknüpft recipes mit user und recipe_ingredients mit recipes per Cascade", () => {
    const sql = findRecipesMigrationSql();

    expect(sql).toMatch(
      /FOREIGN KEY \("user_id"\) REFERENCES "public"\."user"\("id"\) ON DELETE cascade/i,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \("recipe_id"\) REFERENCES "public"\."recipes"\("id"\) ON DELETE cascade/i,
    );
    expect([...sql.matchAll(/ON DELETE cascade/gi)]).toHaveLength(2);
  });

  it("F006/AC-7 die Migration legt Indizes auf recipes.user_id und recipe_ingredients.recipe_id an", () => {
    const sql = findRecipesMigrationSql();

    expect(sql).toMatch(/CREATE INDEX "[^"]+" ON "recipes" USING btree \("user_id"\)/);
    expect(sql).toMatch(/CREATE INDEX "[^"]+" ON "recipe_ingredients" USING btree \("recipe_id"\)/);
  });

  it(
    "F006/AC-7 ein erneutes drizzle-kit generate erzeugt keine weitere Migrationsdatei (keine Drift)",
    () => {
      expect(fs.existsSync(DRIZZLE_KIT_BIN)).toBe(true);
      // Vorbedingung: Die Migration 0003 liegt vor.
      expect(migrationFiles()).toContain("0003_recipes.sql");

      // Temp-Ordner innerhalb des Projekts und relative Pfade: drizzle-kit verdoppelt unter Windows
      // absolute --out-Pfade und endet trotzdem mit Exit 0. Ohne --config, also ohne DB-URL und dotenv.
      const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-f006-drift-"));
      try {
        fs.cpSync(DRIZZLE_DIR, tmpDir, { recursive: true });
        const before = listFiles(tmpDir);

        const result = spawnSync(
          process.execPath,
          [
            DRIZZLE_KIT_BIN,
            "generate",
            "--dialect=postgresql",
            "--schema=./src/db/schema",
            `--out=./${path.basename(tmpDir)}`,
          ],
          {
            cwd: ROOT,
            env: envWithoutDatabaseVars(),
            encoding: "utf8",
            timeout: CLI_TIMEOUT_MS,
          },
        );
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

        expect(result.error).toBeUndefined();
        expect(result.status, output).toBe(0);
        expect(output).not.toMatch(/Error/);
        expect(output).toMatch(/recipes/);
        expect(output).toMatch(/recipe_ingredients/);
        expect(listFiles(tmpDir)).toEqual(before);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    CLI_TIMEOUT_MS + 10_000,
  );
});

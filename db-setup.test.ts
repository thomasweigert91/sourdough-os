// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Hinweis: Diese Datei liest .env und .env.local nie. Sie prüft nur, ob Git sie ignoriert.
const ROOT = path.dirname(fileURLToPath(import.meta.url));

type DependencyMap = Record<string, string>;
interface PackageJson {
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  scripts?: Record<string, string>;
}
interface PackageLock {
  packages: Record<string, PackageJson & { version?: string }>;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

function git(args: string[]) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

const RUNTIME_DEPENDENCIES = ["drizzle-orm", "@neondatabase/serverless", "dotenv"];
const DEV_DEPENDENCIES = ["drizzle-kit"];

describe("F002 Projekt-Setup für Neon + Drizzle", () => {
  describe("Pakete", () => {
    it.each(RUNTIME_DEPENDENCIES)(
      "F002/AC-1 package.json führt %s unter dependencies (nicht unter devDependencies)",
      (name) => {
        const pkg = readJson<PackageJson>("package.json");
        expect(pkg.dependencies?.[name]).toEqual(expect.any(String));
        expect(pkg.devDependencies?.[name]).toBeUndefined();
      },
    );

    it.each(DEV_DEPENDENCIES)(
      "F002/AC-1 package.json führt %s unter devDependencies (nicht unter dependencies)",
      (name) => {
        const pkg = readJson<PackageJson>("package.json");
        expect(pkg.devDependencies?.[name]).toEqual(expect.any(String));
        expect(pkg.dependencies?.[name]).toBeUndefined();
      },
    );

    it("F002/AC-1 package-lock.json ist synchron, damit npm ci durchläuft", () => {
      const pkg = readJson<PackageJson>("package.json");
      const lock = readJson<PackageLock>("package-lock.json");
      const rootEntry = lock.packages[""];

      for (const name of RUNTIME_DEPENDENCIES) {
        expect(rootEntry.dependencies?.[name], `${name} in lock dependencies`).toBe(
          pkg.dependencies?.[name],
        );
        expect(rootEntry.devDependencies?.[name], `${name} nicht in lock devDependencies`).toBeUndefined();
      }
      for (const name of DEV_DEPENDENCIES) {
        expect(rootEntry.devDependencies?.[name], `${name} in lock devDependencies`).toBe(
          pkg.devDependencies?.[name],
        );
        expect(rootEntry.dependencies?.[name], `${name} nicht in lock dependencies`).toBeUndefined();
      }
      for (const name of [...RUNTIME_DEPENDENCIES, ...DEV_DEPENDENCIES]) {
        expect(lock.packages[`node_modules/${name}`], `node_modules/${name} im Lockfile`).toBeDefined();
      }
    });
  });

  describe("Skripte", () => {
    it.each([
      ["db:generate", "generate"],
      ["db:migrate", "migrate"],
      ["db:push", "push"],
      ["db:studio", "studio"],
    ])(
      "F002/AC-2 Skript %s ruft drizzle-kit %s mit drizzle.config.ts auf",
      (script, command) => {
        const pkg = readJson<PackageJson>("package.json");
        expect(pkg.scripts?.[script]).toBe(`drizzle-kit ${command} --config=drizzle.config.ts`);
      },
    );

    it("F002/AC-2 drizzle.config.ts liegt im Projektwurzelverzeichnis", () => {
      expect(fs.existsSync(path.join(ROOT, "drizzle.config.ts"))).toBe(true);
    });
  });

  describe("Migrationen", () => {
    it("F002/AC-5 das Migrations-Journal enthält die erste Migration 0000_init für PostgreSQL", () => {
      const journalPath = path.join(ROOT, "drizzle", "meta", "_journal.json");
      expect(fs.existsSync(journalPath)).toBe(true);

      const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
        dialect: string;
        entries: Array<{ tag: string }>;
      };
      expect(journal.dialect).toBe("postgresql");
      expect(journal.entries).toEqual(
        expect.arrayContaining([expect.objectContaining({ tag: "0000_init" })]),
      );
    });

    it("F002/AC-5 die Migration drizzle/0000_init.sql legt die Tabelle healthcheck an", () => {
      const sqlPath = path.join(ROOT, "drizzle", "0000_init.sql");
      expect(fs.existsSync(sqlPath)).toBe(true);
      expect(fs.readFileSync(sqlPath, "utf8")).toContain('CREATE TABLE "healthcheck"');
    });
  });

  describe("Zugangsdaten", () => {
    it.each([".env", ".env.local"])("F002/AC-7 Git ignoriert %s", (file) => {
      expect(git(["check-ignore", "-q", file]).status).toBe(0);
    });

    it("F002/AC-7 .env und .env.local sind nicht im Git-Index", () => {
      const result = git(["ls-files", "--", ".env", ".env.local"]);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    it("F002/AC-7 .env.example wird nicht ignoriert und kann versioniert werden", () => {
      expect(git(["check-ignore", "-q", ".env.example"]).status).toBe(1);
    });

    it("F002/AC-7 .env.example enthält DATABASE_URL und DATABASE_URL_UNPOOLED ohne Werte", () => {
      const examplePath = path.join(ROOT, ".env.example");
      expect(fs.existsSync(examplePath)).toBe(true);

      const content = fs.readFileSync(examplePath, "utf8");
      expect(content).toMatch(/^DATABASE_URL=[ \t]*\r?$/m);
      expect(content).toMatch(/^DATABASE_URL_UNPOOLED=[ \t]*\r?$/m);
    });
  });
});

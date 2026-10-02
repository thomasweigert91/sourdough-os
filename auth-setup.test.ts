// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Hinweis: Diese Datei liest .env und .env.local nie. Sie prüft nur, ob Git sie ignoriert.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.join(ROOT, "drizzle");

type DependencyMap = Record<string, string>;
interface PackageJson {
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
}
interface PackageLock {
  packages: Record<string, PackageJson & { version?: string }>;
}
interface Journal {
  dialect: string;
  entries: Array<{ idx: number; tag: string }>;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

function git(args: string[]) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function findAuthMigrationSql(): string {
  const files = fs.readdirSync(DRIZZLE_DIR).filter((name) => /^0001_.+\.sql$/.test(name));
  expect(files, "genau eine Datei drizzle/0001_*.sql").toHaveLength(1);
  return fs.readFileSync(path.join(DRIZZLE_DIR, files[0]), "utf8");
}

describe("F003 Projekt-Setup für Better-Auth", () => {
  describe("Paket better-auth", () => {
    it("F003/AC-1 package.json führt better-auth unter dependencies (nicht unter devDependencies)", () => {
      const pkg = readJson<PackageJson>("package.json");
      expect(pkg.dependencies?.["better-auth"]).toEqual(expect.any(String));
      expect(pkg.devDependencies?.["better-auth"]).toBeUndefined();
    });

    it("F003/AC-1 package-lock.json enthält better-auth mit demselben Versionsbereich", () => {
      const pkg = readJson<PackageJson>("package.json");
      const lock = readJson<PackageLock>("package-lock.json");
      const rootEntry = lock.packages[""];

      expect(pkg.dependencies?.["better-auth"]).toEqual(expect.any(String));
      expect(rootEntry.dependencies?.["better-auth"]).toBe(pkg.dependencies?.["better-auth"]);
      expect(rootEntry.devDependencies?.["better-auth"]).toBeUndefined();
      expect(lock.packages["node_modules/better-auth"], "node_modules/better-auth im Lockfile").toBeDefined();
    });
  });

  describe("Migration 0001 für das Auth-Schema", () => {
    // Gelockert in F005 (vom Nutzer genehmigt): spätere Migrationen wie 0002_* sind erlaubt.
    it("F003/AC-2 das Journal beginnt mit 0000_init, gefolgt von einem Eintrag 0001_*", () => {
      const journal = readJson<Journal>("drizzle/meta/_journal.json");

      expect(journal.entries.length).toBeGreaterThanOrEqual(2);
      expect(journal.entries[0].tag).toBe("0000_init");
      expect(journal.entries[1].tag).toMatch(/^0001_.+/);
    });

    it("F003/AC-2 die SQL-Datei und der Snapshot der Migration 0001 existieren", () => {
      const sqlFiles = fs.readdirSync(DRIZZLE_DIR).filter((name) => /^0001_.+\.sql$/.test(name));
      expect(sqlFiles).toHaveLength(1);
      expect(fs.existsSync(path.join(DRIZZLE_DIR, "meta", "0001_snapshot.json"))).toBe(true);
    });

    it("F003/AC-2 die Migration legt genau die Tabellen user, session, account und verification an", () => {
      const sql = findAuthMigrationSql();
      const created = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);

      expect([...created].sort()).toEqual(["account", "session", "user", "verification"]);
    });

    it("F003/AC-2 die Migration verwendet Cascade-Fremdschlüssel von session und account auf user", () => {
      const sql = findAuthMigrationSql();

      expect(sql).toMatch(/FOREIGN KEY \("user_id"\) REFERENCES "public"\."user"\("id"\) ON DELETE cascade/i);
      expect([...sql.matchAll(/ON DELETE cascade/gi)]).toHaveLength(2);
    });

    it("F003/AC-2 die Migration setzt eindeutige Constraints auf email und token", () => {
      const sql = findAuthMigrationSql();

      expect(sql).toMatch(/UNIQUE\s*\("email"\)/);
      expect(sql).toMatch(/UNIQUE\s*\("token"\)/);
    });

    it("F003/AC-2 die Migration nutzt timestamp with time zone und keine Zeitstempel ohne Zeitzone", () => {
      const sql = findAuthMigrationSql();

      expect(sql).toContain("timestamp with time zone");
      expect(sql).not.toMatch(/timestamp(?! with time zone)/);
    });

    it("F003/AC-2 die Migration legt Indizes auf session.user_id, account.user_id und verification.identifier an", () => {
      const sql = findAuthMigrationSql();

      expect(sql).toMatch(/CREATE INDEX "[^"]+" ON "session" USING btree \("user_id"\)/);
      expect(sql).toMatch(/CREATE INDEX "[^"]+" ON "account" USING btree \("user_id"\)/);
      expect(sql).toMatch(/CREATE INDEX "[^"]+" ON "verification" USING btree \("identifier"\)/);
    });

    it("F003/AC-2 die Migration 0000_init bleibt unverändert und legt nur healthcheck an", () => {
      const sql = fs.readFileSync(path.join(DRIZZLE_DIR, "0000_init.sql"), "utf8");
      const created = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);

      expect(created).toEqual(["healthcheck"]);
    });

    it("F003/AC-2 drizzle.config.ts verweist auf das Schema-Verzeichnis src/db/schema", () => {
      const config = fs.readFileSync(path.join(ROOT, "drizzle.config.ts"), "utf8");

      expect(config).toMatch(/schema:\s*["']\.\/src\/db\/schema["']/);
      expect(fs.existsSync(path.join(ROOT, "src", "db", "schema.ts"))).toBe(false);
      expect(fs.existsSync(path.join(ROOT, "src", "db", "schema", "auth.ts"))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, "src", "db", "schema", "index.ts"))).toBe(true);
    });
  });

  describe("Umgebungsvariablen", () => {
    it("F003/AC-7 .env.example enthält BETTER_AUTH_SECRET und BETTER_AUTH_URL ohne Werte", () => {
      const examplePath = path.join(ROOT, ".env.example");
      expect(fs.existsSync(examplePath)).toBe(true);

      const content = fs.readFileSync(examplePath, "utf8");
      expect(content).toMatch(/^BETTER_AUTH_SECRET=[ \t]*\r?$/m);
      expect(content).toMatch(/^BETTER_AUTH_URL=[ \t]*\r?$/m);
    });

    it("F003/AC-7 .env.local bleibt von Git ignoriert und ungetrackt", () => {
      expect(git(["check-ignore", "-q", ".env.local"]).status).toBe(0);

      const result = git(["ls-files", "--", ".env.local"]);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig, type AnyPgColumn, type AnyPgTable } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";

// Dummy-URL: neon() baut beim Erzeugen keine Verbindung auf, es entsteht kein Netzwerkverkehr.
const POOLED_URL =
  "postgresql://user:pass@ep-test-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";

async function loadSchema() {
  return await import("@/db/schema");
}

function column(table: AnyPgTable, name: string): AnyPgColumn {
  const found = getTableConfig(table).columns.find((candidate) => candidate.name === name);
  expect(found, `Spalte ${getTableName(table)}.${name}`).toBeDefined();
  return found as AnyPgColumn;
}

function isUnique(table: AnyPgTable, name: string): boolean {
  const config = getTableConfig(table);
  const col = column(table, name);
  return (
    col.isUnique === true ||
    config.uniqueConstraints.some(
      (constraint) => constraint.columns.length === 1 && constraint.columns[0].name === name,
    )
  );
}

function indexedColumnNames(table: AnyPgTable): string[][] {
  return getTableConfig(table).indexes.map((index) =>
    index.config.columns.map((col) => ("name" in col ? String(col.name) : "")),
  );
}

describe("F003 Auth-Schema (@/db/schema)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("F003/AC-2 exportiert healthcheck, user, session, account und verification über @/db/schema", async () => {
    const schema = await loadSchema();

    expect(getTableName(schema.healthcheck)).toBe("healthcheck");
    expect(getTableName(schema.user)).toBe("user");
    expect(getTableName(schema.session)).toBe("session");
    expect(getTableName(schema.account)).toBe("account");
    expect(getTableName(schema.verification)).toBe("verification");
  });

  it("F003/AC-2 verwendet Text-Primärschlüssel in allen vier Auth-Tabellen", async () => {
    const schema = await loadSchema();

    for (const table of [schema.user, schema.session, schema.account, schema.verification]) {
      const id = column(table, "id");
      expect(id.primary, `${getTableName(table)}.id ist Primärschlüssel`).toBe(true);
      expect(id.getSQLType(), `${getTableName(table)}.id ist text`).toBe("text");
    }
  });

  it("F003/AC-2 speichert alle Zeitstempel als timestamptz", async () => {
    const schema = await loadSchema();
    const timestampColumns: Array<[AnyPgTable, string[]]> = [
      [schema.user, ["created_at", "updated_at"]],
      [schema.session, ["expires_at", "created_at", "updated_at"]],
      [
        schema.account,
        ["access_token_expires_at", "refresh_token_expires_at", "created_at", "updated_at"],
      ],
      [schema.verification, ["expires_at", "created_at", "updated_at"]],
    ];

    for (const [table, names] of timestampColumns) {
      for (const name of names) {
        expect(column(table, name).getSQLType(), `${getTableName(table)}.${name}`).toBe(
          "timestamp with time zone",
        );
      }
    }
  });

  it("F003/AC-2 verknüpft session.user_id und account.user_id per Cascade-Fremdschlüssel mit user.id", async () => {
    const schema = await loadSchema();

    for (const table of [schema.session, schema.account]) {
      const { foreignKeys } = getTableConfig(table);
      const userKeys = foreignKeys.filter((fk) => {
        const ref = fk.reference();
        return (
          getTableName(ref.foreignTable) === "user" &&
          ref.columns.map((col) => col.name).join() === "user_id" &&
          ref.foreignColumns.map((col) => col.name).join() === "id"
        );
      });

      expect(userKeys, `${getTableName(table)}.user_id -> user.id`).toHaveLength(1);
      expect(userKeys[0].onDelete).toBe("cascade");
    }
  });

  it("F003/AC-2 macht user.email und session.token eindeutig", async () => {
    const schema = await loadSchema();

    expect(isUnique(schema.user, "email")).toBe(true);
    expect(isUnique(schema.session, "token")).toBe(true);
  });

  it("F003/AC-2 legt Indizes auf session.user_id, account.user_id und verification.identifier an", async () => {
    const schema = await loadSchema();

    expect(indexedColumnNames(schema.session)).toContainEqual(["user_id"]);
    expect(indexedColumnNames(schema.account)).toContainEqual(["user_id"]);
    expect(indexedColumnNames(schema.verification)).toContainEqual(["identifier"]);
  });

  it("F003/AC-2 enthält account.provider_id und account.password für Zugangsdaten-Konten", async () => {
    const schema = await loadSchema();

    expect(column(schema.account, "provider_id").notNull).toBe(true);
    expect(column(schema.account, "password").notNull).toBe(false);
  });

  it("F003/AC-2 db.query kennt healthcheck, user, session, account und verification", async () => {
    vi.stubEnv("DATABASE_URL", POOLED_URL);
    const { db } = await import("@/db");

    expect(db.query.healthcheck).toBeDefined();
    expect(db.query.user).toBeDefined();
    expect(db.query.session).toBeDefined();
    expect(db.query.account).toBeDefined();
    expect(db.query.verification).toBeDefined();
  });
});

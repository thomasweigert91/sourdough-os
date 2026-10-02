# Plan F002: Database Provisioning und ORM Setup (Neon + Drizzle)

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Drizzle ORM wird über den HTTP-Driver (`drizzle-orm/neon-http` + `neon()` aus `@neondatabase/serverless`) angebunden. Die Prüfung der Umgebungsvariablen steckt in einem kleinen, testbaren Modul `src/db/env.ts`. Es wirft den exakten AC-4-Fehlertext und wird sowohl von `src/db/index.ts` (App, `@/db`) als auch von `drizzle.config.ts` (drizzle-kit) genutzt. So gibt es eine einzige Quelle für den Text.

**Entscheidung Env-Datei:** `drizzle.config.ts` lädt per `dotenv` `config({ path: [".env.local", ".env"], quiet: true })`. Das entspricht der Next-Priorität (`.env.local` vor `.env`; bei dotenv gewinnt der erste Wert, bereits gesetzte Shell-Variablen werden nicht überschrieben). Ticket und Fehlertext nennen `.env.local` als maßgebliche Datei. `.env` dient als Fallback. `quiet: true` unterdrückt die Log-Zeile von dotenv 18. `src/db/index.ts` lädt **kein** dotenv, weil Next `.env*` für die App selbst lädt.

**Entscheidung Migrations-Verbindung:** drizzle-kit nutzt `DATABASE_URL_UNPOOLED` (direkte Verbindung, wie Neon für Migrationen und DDL empfiehlt), mit Fallback auf `DATABASE_URL`, wenn `DATABASE_URL_UNPOOLED` fehlt oder leer ist. `DATABASE_URL` ist trotzdem immer Pflicht (AC-4 wörtlich), damit auch `db:migrate` den Fehlertext zeigt. Die App (`@/db`) nutzt die gepoolte `DATABASE_URL`.

Verworfene Alternativen: `@next/env` mit `loadEnvConfig` (wird in der Next-Doku empfohlen, aber das Ticket verlangt `dotenv` in AC-1). WebSocket-Driver `neon-serverless` (Ticket legt HTTP fest). Fehlermeldung über `console.error` + `process.exit(1)` in der Config (lässt sich in Vitest nicht importieren). Stattdessen wird geworfen: drizzle-kit 0.31 fängt Fehler beim Laden der Config ab, gibt `error.message` auf stderr aus und beendet sich mit Exit 1 (im brocli-Handler `unknown_error` geprüft).

Geprüfte Versionen (npm `latest`, Stand heute; installiert wird erst in der Phase implement): `drizzle-orm@0.45.3`, `drizzle-kit@0.31.11`, `@neondatabase/serverless@1.2.0`, `dotenv@18.0.5`. Gegen die Typdefinitionen der Tarballs abgeglichen: `drizzle({ client, schema })` aus `drizzle-orm/neon-http` liefert `NeonHttpDatabase<TSchema> & { $client }`. `defineConfig` wird von `drizzle-kit` exportiert. dotenv 18 akzeptiert `path: string[]` und `quiet`. Für `migrate` verwendet drizzle-kit mit `@neondatabase/serverless` intern einen WebSocket-`Pool` mit eigenem `ws`. `ws` muss also nicht installiert werden.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| package.json | ändern | Abhängigkeiten `drizzle-orm`, `@neondatabase/serverless`, `dotenv` (dependencies), `drizzle-kit` (devDependencies); Skripte `db:generate`, `db:migrate`, `db:push`, `db:studio` |
| package-lock.json | ändern | Wird von `npm install` aktualisiert, damit `npm ci` funktioniert |
| .gitignore | ändern | Ausnahme `!.env.example` direkt nach `.env*` |
| .env.example | neu | Vorlage mit `DATABASE_URL=` und `DATABASE_URL_UNPOOLED=` ohne Werte |
| drizzle.config.ts | neu | drizzle-kit-Konfiguration: dotenv laden, Dialekt, Schema, Migrationsordner, Zugangsdaten |
| src/db/env.ts | neu | `getDatabaseUrl()`, `getMigrationDatabaseUrl()`, Fehlertext-Konstante |
| src/db/schema.ts | neu | Minimale Platzhalter-Tabelle `healthcheck` für die erste Migration |
| src/db/index.ts | neu | Typisierte `db`-Instanz (neon-http) als `@/db` |
| drizzle/0000_init.sql | neu | Erste Migration, erzeugt mit `npm run db:generate -- --name=init` |
| drizzle/meta/_journal.json | neu | Migrations-Journal von drizzle-kit (generiert) |
| drizzle/meta/0000_snapshot.json | neu | Schema-Snapshot von drizzle-kit (generiert) |
| src/db/env.test.ts | neu | Unit-Tests für die Env-Prüfung (AC-2, AC-4) |
| src/db/index.test.ts | neu | Tests für den Import von `@/db` (AC-3, AC-4) |
| drizzle.config.test.ts | neu | Tests für den Config-Inhalt und die CLI-Fehlerfälle (AC-2, AC-4, AC-6) |
| db-setup.test.ts | neu | Projekt-Setup-Tests: Pakete, Skripte, Migrationsdateien, Git-Ignore (AC-1, AC-2, AC-5, AC-7) |

## Komponenten & Datenfluss
Keine UI-Komponenten. Module und Signaturen (für den Test-Writer verbindlich):

**`src/db/env.ts`**
```ts
export const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.";

/** Liest process.env.DATABASE_URL zur Aufrufzeit. Wirft new Error(MISSING_DATABASE_URL_MESSAGE), wenn undefined oder leer/nur Leerzeichen. */
export function getDatabaseUrl(): string;

/** Ruft zuerst getDatabaseUrl() auf (wirft wie oben). Gibt DATABASE_URL_UNPOOLED zurück, wenn gesetzt und nicht leer, sonst DATABASE_URL. */
export function getMigrationDatabaseUrl(): string;
```
Keine Imports aus `@/`-Pfaden und keine weiteren Abhängigkeiten, weil drizzle-kit die Datei über tsx lädt.

**`src/db/schema.ts`**
```ts
import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";
export const healthcheck = pgTable("healthcheck", {
  id: serial("id").primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
```
Platzhalter, der laut Ticket in einem späteren Ticket ersetzt wird.

**`src/db/index.ts`**
```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseUrl } from "./env";
import * as schema from "./schema";

export const db = drizzle({ client: neon(getDatabaseUrl()), schema });
export type Database = typeof db;
```
`getDatabaseUrl()` wird beim Laden des Moduls ausgeführt, damit schon der Import von `@/db` ohne Variable mit dem AC-4-Text scheitert. `neon()` baut keine Verbindung auf, Netzwerk entsteht erst bei der ersten Query. Deshalb ist das Modul in Tests mit einer Dummy-URL ohne Netzwerk importierbar.

**`drizzle.config.ts`** (Projektwurzel)
```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { getMigrationDatabaseUrl } from "./src/db/env";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: getMigrationDatabaseUrl() },
});
```
Wichtig: Der Named Import `{ config }` aus `dotenv` (Tests mocken ihn). Die Pfade sind relativ zum Arbeitsverzeichnis, also zur Projektwurzel, aus der `npm run` startet.

**`package.json`-Skripte (exakte Werte)**
- `"db:generate": "drizzle-kit generate --config=drizzle.config.ts"`
- `"db:migrate": "drizzle-kit migrate --config=drizzle.config.ts"`
- `"db:push": "drizzle-kit push --config=drizzle.config.ts"`
- `"db:studio": "drizzle-kit studio --config=drizzle.config.ts"`

**Datenfluss**
- App: Next lädt `.env.local`/`.env` → `process.env.DATABASE_URL` (gepoolt) → `src/db/index.ts` → `neon()` HTTP-Client → `db`.
- CLI: `npm run db:*` → drizzle-kit lädt `drizzle.config.ts` (tsx) → dotenv füllt `process.env` aus `.env.local`, danach `.env` → `getMigrationDatabaseUrl()` (direkt, sonst gepoolt) → drizzle-kit verbindet sich per WebSocket-Pool → schreibt `drizzle.__drizzle_migrations`.
- Fehler: fehlt die Variable, wirft `env.ts` das `Error`. In der App bricht der Modul-Import ab, im CLI gibt drizzle-kit die Message auf stderr aus und beendet sich mit Exit 1. Ist Neon nicht erreichbar oder sind die Zugangsdaten falsch (AC-6), scheitert die Migration innerhalb von drizzle-kit mit Exit ungleich 0, und es wird nichts eingetragen. Die Migration läuft in einer Transaktion.

**Neue Abhängigkeiten:** `drizzle-orm` ^0.45.3 (ORM), `@neondatabase/serverless` ^1.2.0 (HTTP-Driver; wird auch von drizzle-kit erkannt), `dotenv` ^18.0.5 (Env für drizzle-kit, laut AC-1 unter dependencies), `drizzle-kit` ^0.31.11 (CLI, devDependency). Alle kommen aus AC-1, weitere gibt es nicht.

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Pakete installieren: `npm install drizzle-orm @neondatabase/serverless dotenv` und `npm install -D drizzle-kit`. Die Einträge in `package.json` und `package-lock.json` prüfen (AC-1)
2. `.gitignore` um `!.env.example` direkt unter `.env*` ergänzen und `.env.example` mit den Zeilen `DATABASE_URL=` und `DATABASE_URL_UNPOOLED=` anlegen. `.env`/`.env.local` weder lesen noch ändern (AC-7)
3. `src/db/env.ts` mit `MISSING_DATABASE_URL_MESSAGE`, `getDatabaseUrl()` und `getMigrationDatabaseUrl()` wie oben spezifiziert (AC-4, AC-2)
4. `src/db/schema.ts` mit der Platzhalter-Tabelle `healthcheck` (AC-3, AC-5)
5. `src/db/index.ts` mit `db` über `drizzle({ client: neon(getDatabaseUrl()), schema })` und `export type Database` (AC-3, AC-4)
6. `drizzle.config.ts` mit dotenv-Laden (`.env.local`, `.env`, quiet) und `defineConfig` wie oben (AC-2, AC-4)
7. Die vier `db:*`-Skripte mit exakt den oben genannten Werten in `package.json` eintragen (AC-2)
8. Erste Migration mit `npm run db:generate -- --name=init` erzeugen und `drizzle/` vollständig einchecken (SQL und `meta/`). Dabei keine Env-Inhalte ausgeben (AC-5)
9. Gate-Checks lokal ausführen: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm audit --audit-level=high` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7)
10. Übergabe an den Nutzer zur manuellen Prüfung: `npm run db:migrate` gegen Neon mit Exit 0 und Eintrag in `drizzle.__drizzle_migrations` (AC-5); dann mit absichtlich falschem Passwort in einer Shell-Variable `DATABASE_URL_UNPOOLED=...` erneut ausführen, Exit ungleich 0 und kein neuer Eintrag (AC-6)

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle Testdateien beginnen mit `// @vitest-environment node`, weil das Projekt sonst jsdom nutzt. Testnamen tragen den Tag `F002/AC-n`. Kein Test öffnet eine Netzwerkverbindung zur Datenbank, und kein Test liest den Inhalt von `.env` oder `.env.local`. Env-Werte werden mit `vi.stubEnv(name, undefined | wert)` gesetzt, danach folgen `vi.unstubAllEnvs()` und `vi.resetModules()` in `afterEach`/`beforeEach`. Module werden dynamisch importiert (`await import(...)`), damit die Prüfung auf Modulebene je Test neu läuft. Dummy-URLs haben das Format `postgresql://user:pass@ep-test-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require`. Für Pooled und Unpooled werden unterscheidbare Hosts verwendet.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit (Dateiinhalt) | db-setup.test.ts | `package.json`: `drizzle-orm`, `@neondatabase/serverless`, `dotenv` stehen in `dependencies`, `drizzle-kit` in `devDependencies` (und nicht im jeweils anderen Abschnitt). `package-lock.json`: `packages[""]` führt dieselben Einträge in denselben Abschnitten, und `packages["node_modules/<name>"]` existiert für alle vier. Damit ist der Lockfile synchron und `npm ci` läuft durch |
| AC-2 | Unit (Dateiinhalt) | db-setup.test.ts | `scripts["db:generate"\|"db:migrate"\|"db:push"\|"db:studio"]` entsprechen exakt `drizzle-kit <generate\|migrate\|push\|studio> --config=drizzle.config.ts`. Die Datei `drizzle.config.ts` existiert im Projektwurzelverzeichnis |
| AC-2 | Unit | drizzle.config.test.ts | `vi.mock("dotenv", () => ({ config: vi.fn() }))`. Mit gesetzter `DATABASE_URL` und `DATABASE_URL_UNPOOLED` liefert `(await import("./drizzle.config")).default` `dialect: "postgresql"`, `schema: "./src/db/schema.ts"`, `out: "./drizzle"` und `dbCredentials.url` = UNPOOLED-Wert. Ohne oder mit leerer `DATABASE_URL_UNPOOLED` ist `dbCredentials.url` = `DATABASE_URL`. Der dotenv-Mock `config` wurde mit `expect.objectContaining({ path: [".env.local", ".env"] })` aufgerufen |
| AC-2 | Unit | src/db/env.test.ts | `getMigrationDatabaseUrl()` bevorzugt `DATABASE_URL_UNPOOLED`, fällt bei fehlender oder leerer Variable auf `DATABASE_URL` zurück |
| AC-3 | Unit | src/db/index.test.ts | Mit Dummy-`DATABASE_URL` liefert `await import("@/db")` ein `db`, das `instanceof NeonHttpDatabase` ist (aus `drizzle-orm/neon-http`). `typeof db.$client === "function"` (neon-HTTP-Query-Funktion). `db.query.healthcheck` ist definiert (Schema verdrahtet). Typebene: `expectTypeOf(db).toExtend<NeonHttpDatabase<typeof import("@/db/schema")>>()`, geprüft durch `npx tsc --noEmit` im Gate-Check `typecheck` |
| AC-4 | Unit | src/db/env.test.ts | `getDatabaseUrl()` und `getMigrationDatabaseUrl()` werfen bei `DATABASE_URL` undefined, `""` und `"   "` einen Fehler mit exakt `DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.` (als String-Literal im Test, nicht über die Konstante). `getMigrationDatabaseUrl()` wirft auch dann, wenn nur `DATABASE_URL_UNPOOLED` gesetzt ist |
| AC-4 | Unit | src/db/index.test.ts | Ohne `DATABASE_URL` wird `import("@/db")` mit genau diesem Text abgewiesen (`rejects.toThrow("DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.")`) |
| AC-4 | Unit | drizzle.config.test.ts | dotenv gemockt, beide Variablen nicht gesetzt: `import("./drizzle.config")` wird mit dem exakten Text abgewiesen |
| AC-4 | Integration (CLI-Prozess) | drizzle.config.test.ts | `spawnSync(process.execPath, [<root>/node_modules/drizzle-kit/bin.cjs, "migrate", "--config=<absoluter Pfad zu drizzle.config.ts>"], { cwd: <leeres fs.mkdtempSync-Verzeichnis>, env: process.env ohne DATABASE_URL/DATABASE_URL_UNPOOLED, encoding: "utf8", timeout: 60_000 })`. Durch das temporäre cwd findet dotenv keine echte `.env.local`, ohne dass sie gelesen werden muss. Erwartet: `status !== 0`, und `stdout + stderr` enthält den exakten Text. Test-Timeout 60 s, danach das Temp-Verzeichnis löschen |
| AC-5 | Unit (Dateiinhalt), Stellvertreter | db-setup.test.ts | Das Test-Gate verlangt für jede AC einen getaggten Test, deshalb gibt es einen Stellvertreter ohne Netzwerk: `drizzle/meta/_journal.json` existiert, hat `dialect: "postgresql"` und mindestens einen Eintrag mit `tag: "0000_init"`. `drizzle/0000_init.sql` existiert und enthält `CREATE TABLE "healthcheck"` |
| AC-5 | Manuell (Nutzer) | keine (Arbeitsschritt 10) | `npm run db:migrate` endet mit Exit 0, und `select * from drizzle.__drizzle_migrations` in Neon zeigt die angewendete Migration |
| AC-6 | Integration (CLI-Prozess), Stellvertreter | drizzle.config.test.ts | `spawnSync(process.execPath, [<root>/node_modules/drizzle-kit/bin.cjs, "migrate", "--config=drizzle.config.ts"], { cwd: <Projektwurzel>, env: { ...process.env, DATABASE_URL: "postgresql://user:wrong@127.0.0.1/neondb", DATABASE_URL_UNPOOLED: <gleicher Wert> }, encoding: "utf8", timeout: 60_000 })`. Die Werte sind explizit gesetzt, deshalb überschreibt dotenv sie nicht, und es geht nur eine lokale Verbindung raus (keine Verbindung zu Neon). cwd muss die Projektwurzel sein, damit `./drizzle` gefunden wird. Erwartet: `status !== 0`. Die Ausgabe enthält `Using '@neondatabase/serverless' driver` (belegt, dass die Config geladen wurde und der Verbindungsaufbau tatsächlich lief), aber weder `migrations applied successfully` noch `_journal.json` (sonst wäre die Ursache ein fehlender Migrationsordner und keine fehlgeschlagene Verbindung). Test-Timeout 60 s |
| AC-6 | Manuell (Nutzer) | keine (Arbeitsschritt 10) | `npm run db:migrate` mit falschem Passwort gegen den echten Neon-Host endet mit Exit ungleich 0, und in `drizzle.__drizzle_migrations` kommt kein neuer Eintrag hinzu |
| AC-7 | Integration (git) | db-setup.test.ts | `spawnSync("git", ["check-ignore", "-q", f])`: Exit 0 für `.env` und `.env.local`, Exit 1 für `.env.example`. `git ls-files -- .env .env.local` liefert eine leere Ausgabe. `.env.example` existiert und enthält per Regex `^DATABASE_URL=\s*$` und `^DATABASE_URL_UNPOOLED=\s*$` (Multiline), also keine Werte. Die Inhalte von `.env`/`.env.local` werden dabei nicht gelesen |

## Risiken & Rollback
- **Pflicht-Variable auch für `db:generate`/`db:studio`:** Die Config prüft `DATABASE_URL` beim Laden. Deshalb braucht auch `db:generate` (das keine DB-Verbindung benötigt) die Variable. Das ist bewusst so, um AC-4 einfach zu halten.
- **Fehler auf Modulebene in `@/db`:** Jeder Import ohne `DATABASE_URL` scheitert sofort, also auch ein künftiger `next build` auf einem Hoster ohne gesetzte Variable. Das verlangt AC-4. Deployment-Variablen sind nicht im Scope.
- **Client-Bundle:** Importiert eine Client-Komponente `@/db`, wirft sie zur Laufzeit den AC-4-Fehler, weil `DATABASE_URL` ohne `NEXT_PUBLIC_`-Präfix nicht ins Bundle kommt. Es gibt kein Leck, aber auch keinen Build-Schutz. `server-only` liegt außerhalb des Tickets und ist für ein Folge-Ticket empfohlen.
- **drizzle-kit nutzt für `migrate` WebSocket statt HTTP:** drizzle-kit erkennt `@neondatabase/serverless` und verbindet sich über einen WebSocket-`Pool` mit eigenem `ws` (Port 443). Die App nutzt dagegen HTTP. Ist WebSocket in einem Netz blockiert, scheitert AC-5, nicht aber die App. Würde später `pg` oder `postgres` installiert, würde drizzle-kit diesen Treiber bevorzugen.
- **Exit-Code bei Config-Fehler:** Ausgewertet aus dem gebündelten Code von drizzle-kit 0.31.11 (brocli `unknown_error` → `console.error(message)` + `process.exit(1)`). Ein Minor-Update könnte das ändern. Der CLI-Test in `drizzle.config.test.ts` würde das sofort zeigen.
- **CLI-Tests unter Windows:** Der tsx-Start dauert einige Sekunden. Beide CLI-Tests haben deshalb ein eigenes Timeout von 60 s. Der AC-4-Test öffnet kein Netzwerk, weil die Config schon vor dem Verbindungsaufbau wirft. Der AC-6-Stellvertreter verbindet sich nur mit `127.0.0.1` (Neon-WebSocket auf `wss://127.0.0.1/v2`, Port 443). Lauscht dort lokal ein anderer Dienst, scheitert die Verbindung trotzdem, aber die Fehlermeldung lautet anders. Der Test prüft deshalb nur den Exit-Code und Negativ-Texte.
- **Abweichung von der Vorgabe „automatisiert nur AC-1 bis AC-4 und AC-7“:** Das Test-Gate (`gateTests`) verlangt für jede AC des Tickets einen getaggten Test. AC-5 und AC-6 bekommen deshalb Stellvertreter-Tests ohne Neon (Migrationsdateien bzw. Verbindungsfehler gegen localhost). Die eigentliche Abnahme gegen Neon bleibt manuell beim Nutzer.
- **npm audit:** drizzle-kit bringt transitiv `esbuild`/`@esbuild-kit/*` mit, für die moderate Advisories bekannt sind. Der Gate-Check nutzt `--audit-level=high`. Sollte dort doch ein high-Befund auftauchen, nicht still `overrides` setzen, sondern dem Hauptagenten melden.
- **dotenv 18 (neue Major-Version):** API (`path`-Array, `quiet`) gegen die Typdefinitionen von 18.0.5 geprüft.
- **Zugangsdaten:** Implementer und Tests dürfen `.env`/`.env.local` weder lesen noch ausgeben. Die Ausgabe von `db:generate` enthält keine URL.
- **Rollback:** Commit zurücknehmen (`git revert`). Ist die Migration in Neon schon angewendet, in Neon `drop table healthcheck; drop schema drizzle cascade;` ausführen oder den Neon-Branch zurücksetzen. Weitere Datenmigrationen gibt es nicht, und die App selbst nutzt `@/db` noch nirgends.

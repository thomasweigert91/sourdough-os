# Plan F003: Better-Auth Core Setup und Auth-Schema

## Ansatz
Better-Auth 1.7.x wird als Serverinstanz `auth` in `src/lib/auth.ts` aufgebaut (Drizzle-Adapter, Provider `pg`, auf der bestehenden `db` aus `@/db`, E-Mail/Passwort aktiv, OAuth-Slots für GitHub/Google nur bei vollständigen Variablen). Die Env-Prüfung steckt in `src/lib/auth-env.ts` (Muster wie `src/db/env.ts`: Prüfung zur Aufrufzeit, deutsche Meldungen, keine `@/`-Importe) und wird von `auth.ts` beim Modulladen aufgerufen. Ein Catch-all-Route-Handler `src/app/api/auth/[...all]/route.ts` hängt `auth` über `toNextJsHandler` an `/api/auth/*`; weil Next dieses Routenmodul beim `next build` ("Collecting page data") lädt, scheitert der Build ohne `BETTER_AUTH_*` (AC-7), genau wie `@/db` ohne `DATABASE_URL`. Das Schema wird von `src/db/schema.ts` in das Verzeichnis `src/db/schema/` überführt (`healthcheck.ts`, `auth.ts`, `index.ts`); `@/db/schema` bleibt als Importpfad gültig, `drizzle.config.ts` zeigt auf das Verzeichnis. Der Client-Helper `src/lib/auth-client.ts` ist ein reines `createAuthClient()` aus `better-auth/react` ohne Server-Imports.

Test-Empfehlung für AC-3 bis AC-5: Die Handler-Tests laufen gegen eine In-Memory-Datenbank (PGlite, neue devDependency `@electric-sql/pglite`) und nicht gegen Neon. `@/db` wird per `vi.doMock` durch eine Drizzle-PGlite-Instanz ersetzt, auf die die echten Migrationen aus `drizzle/` angewendet werden (damit wird auch die generierte `0001`-SQL mitgeprüft). Vorteil: keine Testdaten in der Produktions-DB, kein Netzwerk, keine Aufräumlogik, deterministisch in CI. Verworfen: (a) echte Neon-DB mit Aufräumen (schreibt in die Produktions-DB, bricht bei Abbruch/Netzfehler mit Resten ab, braucht Zugangsdaten in jedem Testlauf); (b) Better-Auth-Memory-Adapter (prüft das Drizzle-Schema, `provider_id`, Hash-Spalte und Migration nicht). Verworfen auch: ein automatisierter `next build`-Test (langsam, kollidiert mit `.next` eines laufenden Servers); AC-7 für den Build wird stattdessen durch einen Unit-Test des Routenmodul-Imports plus einen dokumentierten manuellen Build-Lauf in der implement-Phase belegt.

Bewusst nicht enthalten: `nextCookies()`-Plugin (nur für Server Actions nötig, kein AC), Middleware/Proxy, Transaktionen (siehe Risiken).

## Betroffene Dateien
| Pfad | Aktion | Zweck |
|---|---|---|
| package.json | ändern | `better-auth` (`^1.7.7`) unter `dependencies`; `@electric-sql/pglite` unter `devDependencies` (AC-1) |
| package-lock.json | ändern | Lock-Einträge für beide Pakete (per `npm install`, nicht von Hand) (AC-1) |
| .env.example | ändern | `BETTER_AUTH_SECRET=`, `BETTER_AUTH_URL=` mit Hinweistext; optional `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` leer (AC-6, AC-7) |
| src/db/schema.ts | löschen | wird durch `src/db/schema/` ersetzt (Datei hätte sonst Vorrang vor `schema/index.ts`) (AC-2) |
| src/db/schema/healthcheck.ts | neu | unveränderte Tabelle `healthcheck` (AC-2) |
| src/db/schema/auth.ts | neu | Tabellen `user`, `session`, `account`, `verification` (AC-2) |
| src/db/schema/index.ts | neu | `export * from "./healthcheck"; export * from "./auth";` (AC-2) |
| drizzle.config.ts | ändern | `schema: "./src/db/schema"` (AC-2) |
| drizzle.config.test.ts | ändern | Erwartung `schema` auf `"./src/db/schema"` anpassen (AC-2) |
| drizzle/0001_auth_core.sql | neu | generierte Migration (`npm run db:generate -- --name=auth_core`) (AC-2) |
| drizzle/meta/0001_snapshot.json | neu | generierter Snapshot (AC-2) |
| drizzle/meta/_journal.json | ändern | generierter Journal-Eintrag `0001_auth_core` (AC-2) |
| src/lib/auth-env.ts | neu | `getAuthEnv()`, `getSocialProviders()`, Meldungskonstanten (AC-6, AC-7) |
| src/lib/auth.ts | neu | `auth`-Serverinstanz, `server-only` (AC-3 bis AC-7) |
| src/lib/auth-client.ts | neu | `authClient` + Destrukturierung `signIn`, `signUp`, `signOut`, `useSession` (AC-8) |
| src/app/api/auth/[...all]/route.ts | neu | `export const { GET, POST } = toNextJsHandler(auth)` (AC-3 bis AC-5, AC-7) |
| src/test/pglite-db.ts | neu | Test-Helfer `createTestDb()` (PGlite + Drizzle + Migrationen) (AC-3 bis AC-5) |
| auth-setup.test.ts | neu | Projekt-Setup-Test im Wurzelverzeichnis (Muster `db-setup.test.ts`) (AC-1, AC-2, AC-7) |
| src/db/auth-schema.test.ts | neu | Schema- und `@/db`-Tests (AC-2) |
| src/lib/auth-env.test.ts | neu | Env-Prüfung und OAuth-Slot-Auswahl (AC-6, AC-7) |
| src/lib/auth.test.ts | neu | Laden von `auth.ts` und Routenmodul, OAuth-Konfiguration (AC-6, AC-7) |
| src/lib/auth-handler.test.ts | neu | Registrierung/Anmeldung/Sitzung über den Route-Handler gegen PGlite (AC-3, AC-4, AC-5) |
| src/lib/auth-client.test.ts | neu | Client-Helper (AC-8) |

Hinweis: Im Verzeichnis `src/db/schema/` dürfen nur Schema-Dateien liegen (drizzle-kit liest jede Datei darin, nicht rekursiv; `index.ts` wird dedupliziert). Tests daher außerhalb (`src/db/auth-schema.test.ts`). Schema-Dateien nutzen ausschließlich relative Importe, da drizzle-kit keinen `@/`-Alias auflöst.

## Komponenten & Datenfluss
Keine UI-Komponenten. Serverseitiger Fluss:

```
HTTP /api/auth/*  ->  src/app/api/auth/[...all]/route.ts  (GET, POST)
                      -> toNextJsHandler(auth)
                      -> auth (src/lib/auth.ts)
                         -> getAuthEnv()           (auth-env.ts, wirft deutsche Meldung)
                         -> drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } })
                         -> db (@/db, neon-http)   -> Neon
Client (Browser):   src/lib/auth-client.ts -> createAuthClient() -> /api/auth/* (gleicher Ursprung)
```

**src/db/schema/auth.ts** (Drizzle `pgTable`, TS-Property camelCase, DB-Spalte snake_case; alle Zeitstempel `timestamp(..., { withTimezone: true })`):
- `user`: `id text PK`, `name text notNull`, `email text notNull unique`, `emailVerified boolean default false notNull` (`email_verified`), `image text`, `createdAt`/`updatedAt` `defaultNow().notNull()` (`updatedAt` zusätzlich `$onUpdate(() => new Date())`).
- `session`: `id text PK`, `expiresAt notNull`, `token text notNull unique`, `createdAt`, `updatedAt`, `ipAddress text`, `userAgent text`, `userId text notNull references user.id onDelete cascade`; Index `session_user_id_idx` auf `user_id`.
- `account`: `id text PK`, `accountId text notNull`, `providerId text notNull`, `userId text notNull references user.id onDelete cascade`, `accessToken`, `refreshToken`, `idToken` (text), `accessTokenExpiresAt`, `refreshTokenExpiresAt` (timestamptz), `scope text`, `password text`, `createdAt`, `updatedAt`; Index `account_user_id_idx`.
- `verification`: `id text PK`, `identifier text notNull`, `value text notNull`, `expiresAt notNull`, `createdAt`, `updatedAt`; Index `verification_identifier_idx`.
- Exportierte Namen exakt `user`, `session`, `account`, `verification` (Better-Auth findet Modelle über diese Schlüssel; `db.query.<name>` entsteht daraus). Feldnamen müssen den Better-Auth-Feldern entsprechen (z. B. `userId`, `providerId`, `expiresAt`).

**src/lib/auth-env.ts** (keine `@/`-Importe, kein `server-only`, damit direkt testbar):
```ts
export const MISSING_SECRET_MESSAGE = "BETTER_AUTH_SECRET ist nicht gesetzt. Bitte in .env.local eintragen.";
export const SHORT_SECRET_MESSAGE = "BETTER_AUTH_SECRET ist zu kurz. Mindestens 32 Zeichen erforderlich.";
export const MISSING_URL_MESSAGE = "BETTER_AUTH_URL ist nicht gesetzt. Bitte in .env.local eintragen.";
export const INVALID_URL_MESSAGE = "BETTER_AUTH_URL ist keine gültige URL. Beispiel: http://localhost:3000";
export const MIN_SECRET_LENGTH = 32;

export interface AuthEnv { secret: string; url: string }
export interface OAuthCredentials { clientId: string; clientSecret: string }
export interface SocialProviderCredentials { github?: OAuthCredentials; google?: OAuthCredentials }

/** Liest BETTER_AUTH_SECRET und BETTER_AUTH_URL zur Aufrufzeit. Prüfreihenfolge: Secret fehlt, Secret zu kurz, URL fehlt, URL ungültig. Wirft Error mit der Meldung. */
export function getAuthEnv(): AuthEnv;
/** Provider ist nur enthalten, wenn Client-ID und Secret gesetzt (nicht leer/Leerraum) sind. Wirft nie. */
export function getSocialProviders(): SocialProviderCredentials;
```
Details: Leer/nur Leerraum zählt wie nicht gesetzt (gleicher `readNonEmpty`-Helfer wie in `src/db/env.ts`, hier als kleine lokale Kopie, damit `src/db/env.ts` unverändert bleibt). URL-Prüfung: `new URL(value)` in try/catch und `protocol` muss `http:` oder `https:` sein (`localhost:3000` parst als Schema `localhost:` und fällt deshalb an der Protokollprüfung durch). Rückgabe `url` ist der unveränderte Eingabewert (getrimmt nicht verändern). Beim Import der Datei passiert nichts.

**src/lib/auth.ts**:
```ts
import "server-only";
export const auth: ReturnType<typeof betterAuth>; // betterAuth({ secret, baseURL, database, emailAndPassword: { enabled: true }, socialProviders })
```
- `const { secret, url } = getAuthEnv();` auf Modulebene (Fehler beim Import, wie `@/db`); `getSocialProviders()` wird in `socialProviders` gespreizt (`{ ...(github && { github }), ...(google && { google }) }`), ohne Credentials bleibt das Objekt leer.
- `database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } })`; `transaction` bleibt `false` (neon-http kennt keine Transaktionen).
- Passwortlänge 8 bis 128 ist der Better-Auth-Standard, keine eigene Konfiguration. `emailVerified` bleibt `false`, `requireEmailVerification` wird nicht gesetzt.
- `auth.options.socialProviders` ist für Tests lesbar.

**src/app/api/auth/[...all]/route.ts**: `import { toNextJsHandler } from "better-auth/next-js"; import { auth } from "@/lib/auth"; export const { GET, POST } = toNextJsHandler(auth);`. Route ist dynamisch (Catch-all), wird nicht vorgerendert; das Modul wird beim Build trotzdem geladen und löst die Env-Prüfung aus.

**src/lib/auth-client.ts**:
```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
```
Kein `baseURL` (gleicher Ursprung, `/api/auth` ist Standard), keine Imports von `@/db`, `@/lib/auth`, `server-only` oder `process.env`.

**src/test/pglite-db.ts** (Test-Helfer, kein Produktivcode):
```ts
export async function createTestDb(): Promise<{
  db: PgliteDatabase<typeof schema>;   // drizzle-orm/pglite mit `import * as schema from "@/db/schema"`
  reset: () => Promise<void>;          // TRUNCATE "user" CASCADE (leert user, session, account)
  close: () => Promise<void>;
}>;
```
Wendet `migrate(db, { migrationsFolder: <Projektwurzel>/drizzle })` aus `drizzle-orm/pglite/migrator` an.

Lade-/Fehlerzustände: Serverseitig keine eigenen; Fehler (400/401/422) liefert Better-Auth als JSON mit `code`/`message`. Fehlende Env wirft beim Laden (Build, Dev-Start, Request-Import) mit der deutschen Meldung. Neue Abhängigkeiten: `better-auth` (Pflicht laut Ticket), `@electric-sql/pglite` (devDependency, nur für Tests, begründet oben). Weitere Pakete (`@better-auth/*`) kommen transitiv.

## Arbeitsschritte
1. `npm install better-auth@^1.7.7` und `npm install -D @electric-sql/pglite`; `package.json` und `package-lock.json` prüfen (`better-auth` unter `dependencies`) (AC-1)
2. Schema umstellen: `src/db/schema/healthcheck.ts` (Inhalt 1:1 aus `src/db/schema.ts`), `src/db/schema/auth.ts`, `src/db/schema/index.ts` anlegen, `src/db/schema.ts` löschen; `drizzle.config.ts` und `drizzle.config.test.ts` auf `./src/db/schema` ändern (AC-2)
3. Migration erzeugen: `npm run db:generate -- --name=auth_core`; prüfen, dass genau `0001_auth_core.sql`, `meta/0001_snapshot.json` und der Journal-Eintrag entstehen und nur die vier Tabellen angelegt werden (Cascade-FKs, Unique auf `user.email`/`session.token`, drei Indizes, `timestamp with time zone`, Text-IDs); ein zweiter Lauf von `npm run db:generate` meldet "No schema changes, nothing to migrate" (AC-2)
4. `src/lib/auth-env.ts` mit `getAuthEnv()` und `getSocialProviders()` (AC-6, AC-7)
5. `src/lib/auth.ts` mit `server-only`, Env-Prüfung, Drizzle-Adapter, E-Mail/Passwort, OAuth-Slots (AC-3, AC-4, AC-5, AC-6, AC-7)
6. `src/app/api/auth/[...all]/route.ts` mit `toNextJsHandler` (AC-3, AC-4, AC-5)
7. `src/lib/auth-client.ts` (AC-8)
8. `.env.example` um `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (mit Hinweis, z. B. `openssl rand -base64 32`, Beispiel-URL `http://localhost:3000`) und die vier optionalen OAuth-Variablen (leer) erweitern (AC-6, AC-7)
9. Lokal `.env.local` um `BETTER_AUTH_SECRET` (mind. 32 Zeichen, zufällig) und `BETTER_AUTH_URL=http://localhost:3000` ergänzen (gitignored; Werte und `DATABASE_URL` nie ausgeben oder protokollieren) (AC-7)
10. `npm run db:migrate` gegen Neon ausführen; prüfen, dass die vier Tabellen existieren (z. B. über ein kurzes Node-Skript, das nur Tabellennamen aus `information_schema` liest und keine Verbindungsdaten ausgibt) (AC-2)
11. Build-Prüfung manuell: `next build` mit gesetzten Variablen läuft durch; mit leerem/fehlendem `BETTER_AUTH_SECRET` bzw. `BETTER_AUTH_URL` (in der Shell leer überschreiben, z. B. `BETTER_AUTH_SECRET= npx next build`, Next überschreibt bereits gesetzte Variablen nicht) scheitert er mit der jeweiligen Meldung. Falls Next das Routenmodul beim Build nicht lädt: Fallback siehe Risiken (AC-7)
12. Manueller Smoke-Test mit `next dev`: `POST /api/auth/sign-up/email`, danach Testnutzer in Neon wieder löschen (nur bei Bedarf; die automatisierten Tests laufen gegen PGlite) (AC-3, AC-4)
13. `npm test`, `npm run lint`, `npx tsc --noEmit` ausführen; alle bisherigen F002-Tests müssen grün bleiben (AC-2)

Hinweis zur Reihenfolge: Die Tests werden laut Workflow vor dem Code geschrieben (Phase tests); Schritt 1 und 3 (Pakete, generierte Migration) sind Voraussetzung dafür, dass die Tests ausführbar rot/grün werden. Der Test-Writer testet gegen die oben festgelegten Pfade, Exporte und Meldungstexte.

## Teststrategie
Alle Tests sind Vitest-Tests. Server-Tests mit `// @vitest-environment node`, Client-Test mit dem jsdom-Standard. Env jeweils per `vi.stubEnv` und `vi.resetModules()` (Muster `src/db/index.test.ts`). Keine echte Verbindung zu Neon; `DATABASE_URL` wird, wo `@/db` echt geladen wird, mit einer Dummy-URL gesetzt (`neon()` verbindet nicht).

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit (Dateien lesen) | auth-setup.test.ts | `better-auth` steht in `package.json` unter `dependencies`, nicht unter `devDependencies`; `package-lock.json`-Wurzeleintrag hat denselben Versionsbereich und `node_modules/better-auth` ist im Lock vorhanden |
| AC-2 | Unit (Dateien lesen) | auth-setup.test.ts | Journal enthält `0000_init` und genau einen weiteren Eintrag `0001_*`; `drizzle/0001_*.sql` und `drizzle/meta/0001_snapshot.json` existieren; SQL legt genau `user`, `session`, `account`, `verification` an (je `CREATE TABLE`, keine weiteren), enthält `ON DELETE cascade`, Unique auf `email` und `token`, `timestamp with time zone`, die drei Indizes; `0000_init.sql` unverändert (enthält `healthcheck`) |
| AC-2 | Unit + CLI | auth-setup.test.ts | `drizzle-kit generate --config=drizzle.config.ts` (spawnSync, Dummy-`DATABASE_URL`, cwd Projektwurzel) meldet "No schema changes, nothing to migrate" und erzeugt keine neuen Dateien (Test-Writer darf diesen Fall als manuellen Schritt 3 belassen, falls er zu fragil ist) |
| AC-2 | Unit | src/db/auth-schema.test.ts | `import("@/db/schema")` exportiert `healthcheck`, `user`, `session`, `account`, `verification`; `getTableConfig` zeigt Text-Primärschlüssel, `timestamptz` bei Zeitspalten, Cascade-FK von `session.userId` und `account.userId` auf `user.id`, Unique-Spalten `user.email` und `session.token`, Indizes auf `session.user_id`, `account.user_id`, `verification.identifier`; `(await import("@/db")).db.query` kennt `healthcheck`, `user`, `session`, `account`, `verification` (Dummy-`DATABASE_URL`) |
| AC-2 | Unit | drizzle.config.test.ts | `schema` ist `"./src/db/schema"`, übrige Erwartungen unverändert; alle bestehenden F002-Tests (`src/db/*.test.ts`, `db-setup.test.ts`) bleiben grün |
| AC-3 | Integration (PGlite) | src/lib/auth-handler.test.ts | Route-Handler `POST` aus `@/app/api/auth/[...all]/route` mit `Request` an `http://localhost:3000/api/auth/sign-up/email` (Header `content-type: application/json`, `origin: http://localhost:3000`): Status 200; je ein Eintrag in `user` und `account` mit `providerId === "credential"`; `account.password` ist nicht leer, ungleich dem Klartext und enthält ihn nicht |
| AC-4 | Integration (PGlite) | src/lib/auth-handler.test.ts | Sign-in mit richtigen Daten: Status 200, `set-cookie` enthält Sitzungs-Cookie, `session`-Zeile mit `userId` des Kontos; `GET /api/auth/get-session` mit diesem Cookie liefert `user.email`; falsches Passwort: Status 401, kein `set-cookie`, keine neue `session`-Zeile; `get-session` ohne Cookie liefert `null` im Body |
| AC-5 | Integration (PGlite) | src/lib/auth-handler.test.ts | Zweite Registrierung mit gleicher E-Mail: Status 4xx und weiterhin genau eine `user`-Zeile; Registrierung mit Passwort unter 8 Zeichen: Status 4xx, weder `user` noch `account` angelegt; optional 129 Zeichen: 4xx |
| AC-6 | Unit | src/lib/auth-env.test.ts | `getSocialProviders()` ohne Variablen leer; nur ID gesetzt oder nur Secret gesetzt: Provider fehlt; beide gesetzt: genau dieser Provider (GitHub und Google je getrennt); leere/Leerraum-Werte zählen als nicht gesetzt |
| AC-6 | Unit + Integration | src/lib/auth.test.ts, src/lib/auth-handler.test.ts | `auth.options.socialProviders` ohne Variablen leer bzw. mit genau dem vollständig konfigurierten Provider; `auth.ts` lädt ohne OAuth-Variablen fehlerfrei; `POST /api/auth/sign-in/social` mit `provider: "github"` ohne Credentials liefert 4xx; E-Mail/Passwort funktioniert parallel (siehe AC-3) |
| AC-7 | Unit | src/lib/auth-env.test.ts | `getAuthEnv()` wirft exakt die vier Meldungen (Secret fehlt, Secret leer, Secret 31 Zeichen, URL fehlt, URL leer, `localhost:3000`, `ftp://x`); gültige Werte (32 Zeichen, `http://localhost:3000`, `https://...`) liefern `{ secret, url }`; Import von `auth-env.ts` allein wirft nie (Prüfung zur Aufrufzeit) |
| AC-7 | Unit | src/lib/auth.test.ts | Mit `vi.doMock("@/db", ...)` lehnt `import("@/lib/auth")` und `import("@/app/api/auth/[...all]/route")` ohne gesetzte Variablen mit der jeweiligen Meldung ab (modelliert das Laden des Routenmoduls beim `next build`); mit gültigen Variablen gelingt der Import |
| AC-7 | Unit (Dateien lesen) | auth-setup.test.ts | `.env.example` enthält `BETTER_AUTH_SECRET=` und `BETTER_AUTH_URL=` ohne Werte (Zeilenmuster wie in `db-setup.test.ts`); `.env.local` bleibt von Git ignoriert und ungetrackt |
| AC-7 | Manuell (Implementierer, Beleg im Review) | Schritt 11 | `next build` scheitert real ohne die Variablen mit der Meldung und läuft mit Variablen durch |
| AC-8 | Unit (jsdom) | src/lib/auth-client.test.ts | Import von `@/lib/auth-client` gelingt ohne `BETTER_AUTH_*` und `DATABASE_URL` und auch dann, wenn `@/db` und `@/lib/auth` per `vi.doMock` auf eine werfende Factory gesetzt sind; `authClient` hat `signUp.email`, `signIn.email`, `signOut` (Funktionen), `useSession` (Funktion); die benannten Exporte `signIn`, `signUp`, `signOut`, `useSession` sind identisch mit denen der Instanz; Quelltext enthält keine Importe von `@/db`, `@/lib/auth` oder `server-only` |

Testaufbau für `src/lib/auth-handler.test.ts`: `beforeAll` erstellt per `createTestDb()` die PGlite-Instanz (Timeout großzügig, z. B. 60 s), `vi.doMock("@/db", () => ({ db }))`, setzt `BETTER_AUTH_SECRET` (32+ zufällige Zeichen) und `BETTER_AUTH_URL=http://localhost:3000` per `vi.stubEnv`, importiert danach die Route; `beforeEach` ruft `reset()`; `afterAll` ruft `close()`. Testdaten verwenden ausschließlich `@example.com`-Adressen.

## Risiken & Rollback
- **Env-Prüfung beim Build**: Dass `next build` das Routenmodul lädt und dadurch scheitert, ist die Annahme hinter AC-7 und wird in Schritt 11 real geprüft. Lädt Next das Modul nicht, wird `getAuthEnv()` zusätzlich in `next.config.ts` aufgerufen (nur für `PHASE_PRODUCTION_BUILD`); das erfordert eine Änderung an `next.config.ts` und eine Rückmeldung an den Hauptagenten, ist aber kein stilles Umplanen. Folge der Anforderung: In CI und auf jeder Build-Umgebung müssen `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` und `DATABASE_URL` gesetzt sein (im Repo existiert keine CI-Konfiguration).
- **Keine Transaktionen mit neon-http**: Der Drizzle-Adapter läuft mit `transaction: false` (Standard); Registrierung legt `user` und `account` nacheinander an, bei einem Abbruch dazwischen kann ein `user` ohne `account` übrig bleiben. Für dieses Ticket akzeptiert; ein späterer Wechsel auf den WebSocket-Pool-Driver wäre die Abhilfe.
- **Neue Testabhängigkeit PGlite**: lädt WASM, erhöht Installationsgröße und Testlaufzeit (Sekunden). Abweichung von Neon (Postgres-Version/Extensions) ist für die vier einfachen Tabellen unkritisch; die Echt-DB-Migration wird in Schritt 10/12 einmal real belegt.
- **Migration in Produktions-DB**: Schritt 10 schreibt in die produktive Neon-Datenbank. Die Migration legt nur neue Tabellen an (kein Datenverlust); Rollback: Tabellen `session`, `account`, `verification`, `user` droppen und den letzten Eintrag aus `drizzle.__drizzle_migrations` löschen, danach `0001`-Dateien und Journal-Eintrag entfernen (so wurde die frühere Probe-Migration bereits zurückgenommen).
- **Schema-Verzeichnis**: Eine Datei `src/db/schema.ts` neben `src/db/schema/` würde Importe von `@/db/schema` kapern; deshalb wird sie gelöscht. Weitere Dateien (auch Tests) im Verzeichnis bricht `drizzle-kit`.
- **Geheimnisse**: `DATABASE_URL` und `BETTER_AUTH_SECRET` dürfen weder in Logs noch in Testausgaben oder Fehlermeldungen erscheinen; die Meldungen enthalten nur Variablennamen. Testdateien setzen nur Dummy-Werte.
- **Breaking Changes Next 16 / Better-Auth 1.7**: Routen-API (`route.ts` mit `GET`/`POST`) ist unverändert; `middleware` heißt in dieser Next-Version `proxy`, wird hier aber nicht berührt (Routenschutz außerhalb des Scopes). Better-Auth-Optionen wurden gegen `node_modules/better-auth/dist` geprüft (`drizzleAdapter` mit `provider: "pg"`, `toNextJsHandler`, `createAuthClient` aus `better-auth/react`).
- **Gesamt-Rollback**: Commit revertieren (Pakete, Dateien, `src/db/schema.ts` wiederherstellen) und, falls Schritt 10 schon lief, die vier Tabellen wie oben aus Neon entfernen. Es gibt keinen Feature-Flag; ohne Auth-Route ist die App funktional unverändert.

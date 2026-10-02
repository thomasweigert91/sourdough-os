# Review F003: Better-Auth Core Setup und Auth-Schema

**Status:** APPROVED
**Diff-Hash:** 2e6115004bcc

## Akzeptanzkriterien
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `package.json:18` `better-auth ^1.7.7` unter `dependencies`; `auth-setup.test.ts` "F003/AC-1 package.json ..." und "package-lock.json ..." (Lock-Wurzeleintrag und `node_modules/better-auth`). |
| AC-2 | ✅ | `drizzle/0001_auth_core.sql` legt genau die vier Tabellen an (Text-IDs, `timestamp with time zone`, 2 Cascade-FKs, `user_email_unique`, `session_token_unique`, 3 Indizes); Journal-Eintrag `0001_auth_core`, `meta/0001_snapshot.json` vorhanden. Eigener Lauf `npm run db:generate` meldet "No schema changes, nothing to migrate". Neon (read-only geprüft): Tabellen `account, healthcheck, session, user, verification`, 2 Migrationseinträge. `src/db/schema/{healthcheck,auth,index}.ts`, `src/db/schema.ts` entfernt, `drizzle.config.ts:10` auf `./src/db/schema`. Tests: `auth-setup.test.ts` (Migration 0001), `src/db/auth-schema.test.ts`, `drizzle.config.test.ts`; alle 118 Tests grün. |
| AC-3 | ✅ | `src/lib/auth.ts:13-26` (Drizzle-Adapter, `emailAndPassword.enabled`); `src/lib/auth-handler.test.ts` "F003/AC-3 ..." (Status 200, je ein `user`/`account` mit `providerId` credential, Passwort nur als Hash) gegen PGlite mit den echten Migrationen. |
| AC-4 | ✅ | `auth-handler.test.ts` "F003/AC-4 ..." (200 + `session_token`-Cookie + `session`-Zeile mit `userId`; `get-session` liefert Nutzer; falsches Passwort 401 ohne Cookie und ohne `session`; `get-session` ohne Cookie `null`). |
| AC-5 | ✅ | `auth-handler.test.ts` "F003/AC-5 ..." (doppelte E-Mail 4xx und genau ein `user`; Passwort < 8 sowie > 128 4xx, kein `user`/`account`). |
| AC-6 | ✅ | `src/lib/auth-env.ts:79-87` `getSocialProviders()` (nur bei ID und Secret); `src/lib/auth.ts:22-25`; `auth.test.ts` "F003/AC-6 ..." (leer, genau GitHub, genau Google, halb gesetzt inaktiv); `auth-handler.test.ts` "F003/AC-6 ..." (social ohne Credentials 4xx, E-Mail/Passwort funktioniert). |
| AC-7 | ✅ | `src/lib/auth-env.ts:47-65` mit exakten Meldungen, Prüfung zur Aufrufzeit; `auth.test.ts` "F003/AC-7 ..." (Import von `@/lib/auth` und Routenmodul bricht mit jeweiliger Meldung ab); `auth-setup.test.ts` (`.env.example`, `.env.local` ignoriert/ungetrackt). Eigener Build: `BETTER_AUTH_SECRET= npx next build` scheitert mit der Meldung ("Failed to collect page data for /api/auth/[...all]"); `npx next build` mit gesetzten Variablen läuft durch, Route `/api/auth/[...all]` als dynamisch gelistet. |
| AC-8 | ✅ | `src/lib/auth-client.ts:4-6` (`createAuthClient` aus `better-auth/react`, keine Server-/DB-Importe); `src/lib/auth-client.test.ts` (Import ohne Env und mit werfenden `@/db`/`@/lib/auth`-Mocks, `signUp.email`, `signIn.email`, `signOut`, `useSession`). |

## Befunde
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | NIT | src/lib/auth-env.ts:31 | `readNonEmpty` gibt den ungetrimmten Wert zurück; ein Secret mit führendem/folgendem Leerraum zählt für die 32-Zeichen-Prüfung mit dem Leerraum. Entspricht dem Plan ("Eingabewert unverändert") und dem Muster in `src/db/env.ts`. | Optional später mit trim vereinheitlichen; kein Handlungsbedarf in F003. | offen |
| 2 | NIT | src/test/pglite-db.ts:19 | Kommentar nennt "user, session und account" und "verification über keine Fremdschlüssel verbunden", `reset` leert aber explizit auch `verification`. Kleine Inkonsistenz zwischen Kommentar und Code. | Kommentar auf "leert user (inkl. session, account) und verification" anpassen. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders (keine Komponenten im Diff; Client-Helper ist trivial)
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert (`server-only` in `auth.ts`, kein `NEXT_PUBLIC_`, `.env.local` ignoriert, Passwort nur als Hash, Env-Meldungen enthalten nur Variablennamen)
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast (nicht zutreffend, keine UI)
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab (Handler-Tests gegen PGlite mit echten Migrationen; `vitest run`: 10 Dateien, 118 Tests grün)
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade (`tsc --noEmit` sauber, ESLint ohne Befund im Diff; einzige Warnung liegt in `.claude/workflow/lib.mjs`, außerhalb des Scopes)
- [x] Scope: nur, was Ticket und Plan verlangen (`0000_init` und `healthcheck` unverändert, keine Plugins, keine UI, kein Routenschutz)

## Fazit
Alle acht Akzeptanzkriterien sind durch Tests und eigene Läufe belegt (Tests, `tsc`, `db:generate` ohne Änderungen, Neon-Tabellen vorhanden, `next build` mit und ohne Variablen). Die Umsetzung folgt dem Plan ohne Scope-Abweichung; es gibt nur zwei NITs ohne Auswirkung auf Verhalten. Die dokumentierte Einschränkung (keine Transaktionen mit neon-http) ist im Plan als bewusst akzeptiertes Risiko aufgeführt.

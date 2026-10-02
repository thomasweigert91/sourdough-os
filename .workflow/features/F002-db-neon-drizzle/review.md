# Review F002: Database Provisioning und ORM Setup (Neon + Drizzle)

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** 737100d8aa23

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `package.json:17-19` (`@neondatabase/serverless` ^1.2.0, `dotenv` ^18.0.5, `drizzle-orm` ^0.45.3 unter dependencies), `package.json:35` (`drizzle-kit` ^0.31.11 unter devDependencies). Tests `db-setup.test.ts:34-50` ("F002/AC-1 package.json führt %s unter ...") und `db-setup.test.ts:52` ("F002/AC-1 package-lock.json ist synchron, damit npm ci durchläuft"). Eigener Abgleich: Lockfile ergänzt 88 Einträge, keine bestehende Version geändert oder entfernt; `npm ls` zeigt die vier Pakete installiert. `npm ci` selbst nicht ausgeführt |
| AC-2 | ✅ | `package.json:11-14` (exakt `drizzle-kit <cmd> --config=drizzle.config.ts`), `drizzle.config.ts:8-13`. Tests `db-setup.test.ts:76-91` ("F002/AC-2 Skript %s ruft drizzle-kit %s mit drizzle.config.ts auf", "drizzle.config.ts liegt im Projektwurzelverzeichnis"), `drizzle.config.test.ts:53-104` (Dialekt/Schema/out/UNPOOLED-Präferenz, Fallback, dotenv-Reihenfolge), `src/db/env.test.ts:93-111` |
| AC-3 | ✅ | `src/db/index.ts:8` (`drizzle({ client: neon(getDatabaseUrl()), schema })` aus `drizzle-orm/neon-http`). Tests `src/db/index.test.ts:25` ("F002/AC-3 exportiert unter @/db eine Drizzle-Instanz des Neon-HTTP-Drivers", inkl. `expectTypeOf(...).toExtend<NeonHttpDatabase<typeof Schema>>()`), `:34` ($client ist neon()-Funktion), `:41` (Schema verdrahtet). `npx tsc --noEmit` lokal mit Exit 0 |
| AC-4 | ✅ | `src/db/env.ts:3-4,12-17,24-27`, genutzt in `src/db/index.ts:8` und `drizzle.config.ts:12`. Tests `src/db/env.test.ts:27-91` (undefined, leer, Leerzeichen, nur UNPOOLED; String-Literal), `src/db/index.test.ts:48-60` (Import von `@/db` scheitert), `drizzle.config.test.ts:106-113` und CLI-Test `drizzle.config.test.ts:117` ("F002/AC-4 drizzle-kit migrate endet ohne DATABASE_URL mit Exit-Code ungleich 0 und dem Hinweistext": echter drizzle-kit-Prozess in leerem cwd, Exit != 0, Text in stdout/stderr) |
| AC-5 | ✅ | Code: `src/db/schema.ts:5-8`, `drizzle/0000_init.sql` (CREATE TABLE "healthcheck"), `drizzle/meta/_journal.json` (Tag `0000_init`), `drizzle.config.ts:12` (direkte Verbindung). Stellvertreter-Tests `db-setup.test.ts:95,109`. Die eigentliche Abnahme (`npm run db:migrate` gegen Neon, Eintrag in `drizzle.__drizzle_migrations`) steht laut Ticket als manuelle Prüfung durch den Nutzer aus und wurde hier bewusst nicht ausgeführt |
| AC-6 | ✅ | Stellvertreter-Test `drizzle.config.test.ts:149` ("F002/AC-6 drizzle-kit migrate endet bei nicht erreichbarer Datenbank mit Exit-Code ungleich 0 und wendet keine Migration an", nur gegen 127.0.0.1, prüft Exit != 0 und dass die Config geladen und der Verbindungsaufbau versucht wurde). Lokal grün. Der Fall "falsche Zugangsdaten gegen echten Neon-Host" bleibt manuelle Prüfung durch den Nutzer |
| AC-7 | ✅ | `.gitignore:34-35` (`.env*` plus `!.env.example`), `.env.example` ohne Werte. Tests `db-setup.test.ts:117` ("F002/AC-7 Git ignoriert %s"), `:121` (nicht im Index), `:127` (`.env.example` nicht ignoriert), `:131` (keine Werte). `git status` zeigt `.env`/`.env.local` nicht, `.env.example` als neu |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | src/db/index.ts:1 | Kein Build-Schutz gegen Import in Client-Komponenten. Ein versehentlicher Import aus einer `"use client"`-Datei fällt erst zur Laufzeit mit dem AC-4-Text auf, und die Meldung "Bitte in .env.local eintragen" führt dann in die Irre. Es gibt kein Leck, weil kein `NEXT_PUBLIC_`-Präfix verwendet wird. Der Plan nimmt das bewusst aus dem Scope | Im Folge-Ticket `import "server-only";` als erste Zeile in `src/db/index.ts` ergänzen (Paket `server-only`) | offen |
| 2 | MINOR | drizzle.config.test.ts:176-178 | Der AC-6-Stellvertreter hängt an internen Log-Texten von drizzle-kit (`Using '@neondatabase/serverless' driver`, `migrations applied successfully`). Nach einem Update von drizzle-kit kann der Test rot werden, obwohl das Verhalten stimmt. Ändert sich der Erfolgstext, wird außerdem die Negativ-Prüfung wirkungslos | Die Version von `drizzle-kit` exakt pinnen oder im Test kommentieren, aus welcher Version die Texte stammen. Die Negativ-Prüfung zusätzlich auf Exit != 0 stützen (passiert bereits) und den Positiv-Text als wichtigstes Signal behandeln | offen |
| 3 | NIT | src/db/env.ts:8 | Die Prüfung auf "nur Leerzeichen" nutzt `trim()`, gibt aber den ungetrimmten Wert zurück. Eine URL mit führenden oder abschließenden Leerzeichen (z. B. Copy-Paste in `.env.local`) wird ungefiltert an `neon()` bzw. drizzle-kit gereicht | `const trimmed = value?.trim(); return trimmed ? trimmed : undefined;` | offen |
| 4 | NIT | drizzle.config.ts:6 | dotenv löst `.env.local`/`.env` relativ zum Arbeitsverzeichnis auf. Wer drizzle-kit aus einem Unterordner mit `--config=../drizzle.config.ts` startet, bekommt den AC-4-Text, obwohl `.env.local` existiert. Über die `npm run`-Skripte tritt das nicht auf, und der Plan hat das bewusst so entschieden | Optional die Pfade relativ zur Config auflösen (`path.join(import.meta.dirname, ".env.local")`). Dann müsste der AC-4-CLI-Test anders isoliert werden. Belassen ist vertretbar | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

Hinweise: React und Barrierefreiheit sind nicht betroffen, weil das Ticket keine Oberfläche hat. Selbst ausgeführt habe ich `npx vitest run` (4 Dateien, 45 Tests grün, inkl. beider CLI-Tests), `npx tsc --noEmit` (Exit 0), `npm run lint` (0 Fehler, 1 Warnung in `.claude/workflow/lib.mjs`, außerhalb des Diffs), `npm run build` (erfolgreich) und `npm audit --audit-level=high` (nur 4 moderate Befunde über drizzle-kit → @esbuild-kit/esbuild, wie im Plan erwartet). Gegen Neon habe ich bewusst nichts ausgeführt.

## Fazit
Die Umsetzung folgt dem Plan genau. Die Env-Prüfung steckt an einer Stelle (`src/db/env.ts`), App und drizzle-kit nutzen sie gemeinsam, und die Tests prüfen echtes Verhalten bis hin zum drizzle-kit-Prozess, ohne die echten Env-Dateien oder Neon zu berühren. Es gibt keine BLOCKER oder MAJOR, nur zwei MINOR-Befunde (fehlender `server-only`-Schutz für ein Folge-Ticket, Log-Texte im AC-6-Stellvertreter, die bei Updates brechen können) und zwei NITs. Die abschließende Abnahme von AC-5 und AC-6 gegen die echte Neon-Datenbank muss der Nutzer noch manuell durchführen.

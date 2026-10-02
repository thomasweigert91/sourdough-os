# F002: Database Provisioning und ORM Setup (Neon + Drizzle)

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
Ticket 0.1 (Typ: Infrastructure / Data, 3 Story Points). Sourdough OS ist bisher ein frisches Next.js-Projekt (Next 16, React 19, Vitest) ohne Datenbank. Wer im Repo entwickelt, kann noch keine Daten speichern oder Schemas versionieren. Betroffen sind alle Entwicklerinnen, die künftige Features mit Persistenz bauen. Benötigt wird eine Serverless-PostgreSQL-Instanz bei Neon, angebunden über Drizzle ORM (schlank, type-safe, geeignet für Serverless/Edge-Runtimes).

**Voraussetzung:** Das Neon-Projekt und die echte `DATABASE_URL` kann nur der Nutzer selbst anlegen bzw. liefern (siehe Offene Fragen).

## Ziel
Eine Entwicklerin trägt die `DATABASE_URL` in `.env.local` ein und kann danach über `npm run db:*`-Befehle Migrationen erzeugen, anwenden, das Schema pushen und Drizzle Studio öffnen. Im Code steht unter `@/db` (Datei `src/db/index.ts`) eine typisierte `db`-Instanz bereit. Eine erste Migration läuft erfolgreich gegen die Neon-Instanz und belegt damit, dass die Verbindung funktioniert.

## Akzeptanzkriterien

### AC-1: Benötigte Pakete sind installiert
- **Angenommen** die Entwicklerin hat das Repo frisch geklont
- **Wenn** sie `npm ci` ausführt
- **Dann** endet der Befehl mit Exit-Code 0, und in `package.json` stehen `drizzle-orm`, `@neondatabase/serverless` und `dotenv` unter `dependencies` sowie `drizzle-kit` unter `devDependencies`

### AC-2: Datenbank-Skripte sind in package.json verfügbar
- **Angenommen** die Pakete sind installiert und im Projektwurzelverzeichnis liegt `drizzle.config.ts`
- **Wenn** die Entwicklerin `npm run` ohne Argument ausführt
- **Dann** listet die Ausgabe die Skripte `db:generate`, `db:migrate`, `db:push` und `db:studio`, und jedes davon ruft das entsprechende `drizzle-kit`-Kommando (`generate`, `migrate`, `push`, `studio`) mit der Konfiguration aus `drizzle.config.ts` auf

### AC-3: Typisierte db-Instanz ist importierbar
- **Angenommen** die Pakete sind installiert
- **Wenn** die Entwicklerin in einer Datei unter `src/` `import { db } from "@/db"` schreibt und `npx tsc --noEmit` ausführt
- **Dann** meldet TypeScript für diesen Import keinen Fehler, und `db` ist eine Drizzle-Instanz, die über einen Neon-Driver aus `@neondatabase/serverless` (HTTP oder WebSocket, siehe Offene Fragen) verbunden ist

### AC-4: Verständlicher Fehler bei fehlender DATABASE_URL
- **Angenommen** weder `.env.local` noch die Umgebung enthält eine Variable `DATABASE_URL`
- **Wenn** die Entwicklerin `npm run db:migrate` ausführt oder Code startet, der `@/db` importiert
- **Dann** bricht der Vorgang mit Exit-Code ungleich 0 ab, und die Ausgabe enthält den Text `DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.`

### AC-5: Erfolgreiche Migration gegen Neon (Connection-Test)
- **Angenommen** `.env.local` enthält eine gültige `DATABASE_URL` des Neon-Projekts und im Repo liegt mindestens eine mit `npm run db:generate` erzeugte Migration
- **Wenn** die Entwicklerin `npm run db:migrate` ausführt
- **Dann** endet der Befehl mit Exit-Code 0, ohne Fehlermeldung, und in der Neon-Datenbank ist die Migration in der Drizzle-Migrationstabelle (`drizzle.__drizzle_migrations`) als angewendet eingetragen

### AC-6: Nicht erreichbare oder ungültige Datenbank
- **Angenommen** `.env.local` enthält eine syntaktisch gültige `DATABASE_URL`, die aber auf keine erreichbare Neon-Instanz zeigt oder falsche Zugangsdaten enthält
- **Wenn** die Entwicklerin `npm run db:migrate` ausführt
- **Dann** endet der Befehl mit Exit-Code ungleich 0, und es wird keine Migration als angewendet eingetragen

### AC-7: Zugangsdaten werden nicht eingecheckt
- **Angenommen** die Entwicklerin hat `.env` und `.env.local` mit ihrer `DATABASE_URL` angelegt
- **Wenn** sie `git status` ausführt
- **Dann** erscheinen weder `.env` noch `.env.local` als neue oder geänderte Datei, während `.env.example` versioniert werden kann

## UI & Barrierefreiheit
Keine Oberfläche. Das Ticket betrifft nur Infrastruktur und Entwickler-Befehle.

## Nicht im Scope
- Fachliches Datenmodell der App (Rezepte, Starter, Backvorgänge usw.); höchstens eine minimale Tabelle für den Migrations-Test (siehe Offene Fragen)
- Seiten, API-Routen oder Server Actions, die Daten lesen oder schreiben
- Seed-Daten
- Einrichtung von Neon-Branches, Preview-Datenbanken oder Produktions-Deployment (z. B. Umgebungsvariablen bei einem Hoster)
- Automatisierte Tests gegen die echte Neon-Datenbank in CI

## Offene Fragen
- [x] Wer legt das Neon-Projekt an und liefert die `DATABASE_URL` (Pooled Connection String)? → Der Nutzer hat das Projekt angelegt und `DATABASE_URL` (gepoolt) sowie `DATABASE_URL_UNPOOLED` (direkt) in `.env` und `.env.local` eingetragen. AC-5 und AC-6 prüft der Nutzer manuell gegen Neon; automatisierte Tests decken AC-1 bis AC-4 und AC-7 ab. Hinweis für den Plan: Neon empfiehlt für Migrationen (drizzle-kit) die direkte Verbindung; ob `DATABASE_URL_UNPOOLED` dafür genutzt wird, entscheidet der Plan.
- [x] Welcher Driver soll verwendet werden: HTTP (`drizzle-orm/neon-http`) oder WebSocket (`drizzle-orm/neon-serverless`)? → HTTP (`drizzle-orm/neon-http`).
- [x] Soll für den Migrations-Test bereits ein erstes Schema mit einer Tabelle angelegt werden (ohne Schema erzeugt `db:generate` keine Migration)? → Ja, eine minimale Platzhalter-Tabelle in `src/db/schema.ts`, die in einem späteren Ticket durch das echte Datenmodell ersetzt oder entfernt wird.
- [x] Soll eine `.env.example` mit `DATABASE_URL=` (ohne Wert) angelegt werden? → Ja, mit `DATABASE_URL=` und `DATABASE_URL_UNPOOLED=` ohne Werte; `.gitignore` bekommt die Ausnahme `!.env.example`.
- [x] Ist der Fehlertext in AC-4 (`DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.`) so in Ordnung? → Ja.
- [x] Sollen die Migrationsdateien in einem bestimmten Ordner liegen und eingecheckt werden? → Ja, Ordner `drizzle/` im Projektwurzelverzeichnis, eingecheckt.

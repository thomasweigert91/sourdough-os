# Review F006: Drizzle Schema für Rezepte und Zutaten

<!-- Rolle: code-reviewer. Alle Platzhalter ersetzt. -->

**Status:** APPROVED
**Diff-Hash:** 53b0b3ff5446

## Akzeptanzkriterien
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `src/db/schema/recipes.ts:24-36` (UUID `defaultRandom`, optionale Spalten nullable, `createdAt`/`updatedAt` `defaultNow().notNull()`); Tests `F006/AC-1 legt ein Rezept nur mit Namen an …` und `F006/AC-1 vergibt für zwei Rezepte unterschiedliche IDs` (`src/db/recipes-schema.test.ts:59-90`) |
| AC-2 | ✅ | `recipes.ts:25-28` (FK + notNull), `recipes.ts:40` (Check `length(trim(name)) > 0`); `it.each` `F006/AC-2 lehnt ein Rezept %s ab und speichert nichts` (ohne Namen per Raw-SQL, leer, nur Leerzeichen, unbekannte Person) mit Zählung vorher/nachher, plus Gegenprobe `" Landbrot "` (`recipes-schema.test.ts:92-130`) |
| AC-3 | ✅ | `recipes.ts:54-60` (Enum, `numeric(…,2)` mode number, `starterHydration` Default 100); Test `F006/AC-3 speichert Mehl und Starter …` liest über `db.query.recipes … with ingredients` und prüft 500/100, 100/20, Hydration 100 und `typeof number` (`recipes-schema.test.ts:173-208`); alle fünf Typen per `it.each` (`:210-225`) |
| AC-4 | ✅ | `recipes.ts:50-56`, `:65-68` (FK, notNull, Enum, drei Checks ≥ 0); `it.each` `F006/AC-4 lehnt eine Zutat %s ab und speichert nichts` mit allen Ticket-Fällen (Typ `yeast`, ohne Menge/Prozent per Raw-SQL, -1 für Menge/Prozent/Starter-Hydration, unbekannte Rezept-ID) plus leere Namen (`recipes-schema.test.ts:227-304`) |
| AC-5 | ✅ | `recipes.ts:27`, `:52` (`onDelete: "cascade"`), `drizzle/0003_recipes.sql:31-32`; Tests `F006/AC-5 löscht beim Löschen eines Rezepts auch beide Zutaten` und `F006/AC-5 löscht beim Löschen eines Kontos …, andere bleiben unverändert` (Vorher/Nachher-Vergleich per `toEqual`, `recipes-schema.test.ts:389-425`) |
| AC-6 | ✅ | `numeric(6|10, 2)` mit `mode: "number"` (`recipes.ts:33`, `:55-58`); Tests `F006/AC-6 speichert die Zielhydration 75.5 ohne Rundung` und `F006/AC-6 speichert Menge, Bäckerprozent und Starter-Hydration …` mit `toBe(75.5/12.5/2.5/80)` (`recipes-schema.test.ts:132-141`, `:306-332`) |
| AC-7 | ✅ | `src/db/schema/index.ts:4`, `drizzle/0003_recipes.sql`, Journal `idx 3`; `recipes-setup.test.ts` (Journal, genau eine `0003_*.sql`, Enum/Tabellen/FK/Index im SQL, Drift-Test per `drizzle-kit generate` in Temp-Kopie ohne neue Dateien) und `recipes-schema.test.ts:450-524` (Exporte, `getTableConfig`-Indizes/Cascade, `db.query.recipes` aus `@/db`, verschachtelte relationale Queries in beide Richtungen). Lauf gegen Neon ist laut Plan Schritt 7 manuell, siehe Befund 1 |
| AC-8 | ✅ | `recipes.ts:24`, `:36` (kein `$onUpdate`), `:41-42` (Checks ≥ 0), `:61` (`position` Default 0); Tests `F006/AC-8 übernimmt eine vom Client vergebene UUID und … updatedAt unverändert`, `F006/AC-8 lehnt ein Rezept mit %s ab` (-1 / -0.5), `F006/AC-8 liest Zutaten nach position sortiert …` (`recipes-schema.test.ts:143-169`, `:334-370`) |

## Befunde
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | drizzle/0003_recipes.sql:1 | Der in AC-7 geforderte fehlerfreie `npm run db:migrate` gegen Neon ist nicht nachgewiesen (Plan Schritt 7, manuell, braucht `.env.local`). Automatisch belegt ist nur der Lauf auf PGlite mit denselben Migrationen. | Vor dem Merge bzw. Abschluss `npm run db:migrate` gegen Neon ausführen und das Ergebnis festhalten. Bei Fehler auf den im Plan genannten Fallback (unqualifizierte Spalten in Checks) gehen. | offen |
| 2 | NIT | recipes-setup.test.ts:125 | Der Drift-Test legt `.tmp-f006-drift-*` im Projekt-Root an. Wird der Prozess hart abgebrochen, greift `finally` nicht. Dann bleibt eine Kopie von `drizzle/` liegen, die nicht in `.gitignore` steht und versehentlich committet werden könnte. | `.tmp-*` in `.gitignore` aufnehmen. | offen |
| 3 | NIT | recipes-setup.test.ts:151-152 | `expect(output).toMatch(/recipes/)` hängt am Konsolenformat von drizzle-kit (Tabellenübersicht). Ein Update von drizzle-kit kann den Test ohne echte Drift brechen. | Die Assertion entfernen oder als reinen Plausibilitätscheck kommentieren. Die Aussage trägt `listFiles(tmpDir)` gleich `before`. | offen |
| 4 | NIT | src/db/schema/recipes.ts:74 | `userRelations` liegt in `recipes.ts`, nicht bei `user` in `auth.ts`. Das ist im Plan bewusst so entschieden und kommentiert, wird aber bei weiteren user-Relationen leicht übersehen. | Beim nächsten Feature mit user-Relationen `userRelations` in eine zentrale `relations.ts` verschieben. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten): NULL erfüllt die Checks (optionale Felder bleiben leer erlaubt), Namen nur aus Leerzeichen werden abgelehnt, der Überlauf bei `numeric(6,2)` ist im Plan dokumentiert
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders: nicht betroffen, keine UI
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert: Integrität per FK, Enum und Checks in der DB. Der Drift-Test entfernt `DATABASE_URL*` aus der Umgebung, `sql.raw` in `countRows` bekommt nur feste Tabellennamen
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast: nicht betroffen
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab. Echte Migrationen auf PGlite, Zählung vor und nach Ablehnung. Eigener Lauf: 41/41 F006-Tests und 299/299 gesamt grün, `tsc --noEmit` und eslint ohne Befund
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen. Dateiliste deckt sich exakt mit dem Plan

## Fazit
Schema, Migration und Tests setzen Ticket und Plan genau um. Die DB erzwingt alle Regeln selbst, und jede AC ist durch Verhaltenstests gegen PGlite mit den echten Migrationen belegt, inklusive Drift-Prüfung per drizzle-kit. Offen ist nur der manuelle Neon-Lauf aus AC-7 (MINOR), der vor dem Abschluss nachgeholt werden sollte, dazu drei NITs zur Robustheit der Tests.

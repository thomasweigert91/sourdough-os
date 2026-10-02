# F006: Drizzle Schema für Rezepte und Zutaten

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
Sourdough OS kann bisher nur Konten (Better-Auth) und Nutzer-Präferenzen (`user_preference`) speichern. Für Rezepte und Teigberechnungen gibt es noch keine Datenhaltung. Spätere Features (Rezeptliste, Rezept-Editor, Bäckerprozent-Rechner) brauchen eine dauerhafte Ablage von Rezepten, ihren Zutaten und Berechnungsmetadaten in Neon, eindeutig einer angemeldeten Person zugeordnet. Betroffen ist zunächst das Entwicklungsteam; Endnutzer sehen in diesem Ticket keine neue Oberfläche.

## Ziel
Jede angemeldete Person kann (über spätere Features) eigene Rezepte mit Name, Beschreibung, Zielteiggewicht und Zielhydration sowie beliebig vielen Zutaten mit Typ, Grammmenge, Bäckerprozent und ggf. Starter-Hydration dauerhaft speichern. Rezepte gehören genau einer Person und verschwinden mit deren Konto; Zutaten verschwinden mit ihrem Rezept.

## Akzeptanzkriterien

### AC-1: Rezept wird mit Pflicht- und optionalen Feldern gespeichert
- **Angenommen** eine Person mit bestehendem Konto und die Migration ist in der Datenbank eingespielt
- **Wenn** ein Rezept nur mit Namen „Landbrot“ für diese Person angelegt wird
- **Dann** existiert genau ein Rezept mit automatisch vergebener, eindeutiger ID, Name „Landbrot“, leerer Beschreibung, leerem Zielteiggewicht, leerer Zielhydration sowie gesetztem Erstellungs- und Änderungszeitpunkt

### AC-2: Rezept ohne Namen oder ohne gültige Person wird abgelehnt
- **Angenommen** die Migration ist eingespielt
- **Wenn** ein Rezept ohne Namen angelegt wird, oder für eine Personen-ID, die nicht existiert
- **Dann** lehnt die Datenbank den Eintrag ab und es wird kein Rezept gespeichert

### AC-3: Zutat wird mit Typ, Menge und Bäckerprozent gespeichert
- **Angenommen** ein bestehendes Rezept „Landbrot“
- **Wenn** eine Zutat „Weizenmehl 550“ vom Typ `flour` mit 500 g und 100 % sowie eine Zutat „Starter“ vom Typ `starter` mit 100 g und 20 % ohne Angabe der Starter-Hydration angelegt werden
- **Dann** sind beide Zutaten dem Rezept zugeordnet, die Werte werden unverändert zurückgelesen (500 / 100 bzw. 100 / 20) und die Starter-Hydration beider Zutaten ist 100.0

### AC-4: Ungültige Zutaten werden abgelehnt
- **Angenommen** ein bestehendes Rezept
- **Wenn** eine Zutat mit einem Typ außerhalb von `flour`, `water`, `starter`, `salt`, `other` angelegt wird, oder ohne Grammmenge, oder ohne Bäckerprozent, oder mit negativer Grammmenge, negativem Bäckerprozent oder negativer Starter-Hydration, oder für eine nicht existierende Rezept-ID
- **Dann** lehnt die Datenbank den Eintrag ab und es wird keine Zutat gespeichert

### AC-5: Kaskadierendes Löschen
- **Angenommen** eine Person mit einem Rezept, das zwei Zutaten hat
- **Wenn** das Rezept gelöscht wird
- **Dann** sind auch beide Zutaten gelöscht
- **Und wenn** stattdessen das Konto der Person gelöscht wird, sind ihr Rezept und dessen Zutaten gelöscht, während Rezepte anderer Personen unverändert bleiben

### AC-6: Nachkommastellen bleiben erhalten
- **Angenommen** ein bestehendes Rezept
- **Wenn** Zielhydration 75.5, eine Zutat mit 12.5 g, Bäckerprozent 2.5 und Starter-Hydration 80.0 gespeichert werden
- **Dann** werden exakt diese Werte ohne Rundung zurückgelesen

### AC-7: Migration und Exporte
- **Angenommen** der Stand von `main` mit den Migrationen 0000 bis 0002
- **Wenn** `npm run db:generate` und anschließend `npm run db:migrate` ausgeführt werden
- **Dann** entsteht genau eine neue Migrationsdatei im Ordner `drizzle/`, sie läuft ohne Fehler gegen Neon durch, ein erneutes `db:generate` erzeugt keine weitere Datei, und beide Tabellen sowie ihre Relationen (Person → Rezepte, Rezept → Zutaten) sind über `src/db/schema/index.ts` importierbar

### AC-8: Vom Client vergebene IDs, Zeitstempel und Reihenfolge
- **Angenommen** eine Person mit bestehendem Konto
- **Wenn** ein Rezept mit einer vom Client erzeugten UUID und einem vom Client gesetzten `updatedAt` angelegt wird, und dazu Zutaten mit `position` 0, 1, 2 (eine davon ohne `position`)
- **Dann** werden ID und `updatedAt` unverändert gespeichert, die Zutaten lassen sich nach `position` sortiert lesen und die Zutat ohne Angabe hat `position` 0
- **Und wenn** ein Rezept mit negativem Zielteiggewicht oder negativer Zielhydration angelegt wird, lehnt die Datenbank den Eintrag ab

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket.

## Nicht im Scope
- Oberflächen zum Anlegen, Bearbeiten, Anzeigen oder Löschen von Rezepten
- API-Routen, Server Actions und Offline-Sync für Rezepte
- Berechnungslogik (Bäckerprozent aus Grammmengen, Teiggewicht, Hydration inkl. Starter-Anteil)
- Prüfung fachlicher Plausibilität (z. B. Summe der Mehl-Prozente = 100)
- Teilen von Rezepten zwischen Personen

## Offene Fragen
- [x] 1. ID-Format: UUID oder Cuid2? → UUID mit Default `defaultRandom()` (DB-erzeugt); eine vom Client mitgegebene UUID wird ebenfalls akzeptiert. Gilt für `recipes` und `recipe_ingredients`.
- [x] 2. Zielteiggewicht: Ganzzahl oder Dezimalzahl? → Ganzzahl in Gramm.
- [x] 3. Genauigkeit der Dezimalfelder (Menge, Bäckerprozent, Hydration)? → zwei Nachkommastellen.
- [x] 4. Werte ≥ 0 auf Datenbankebene erzwingen? → ja, per Check-Constraint (Menge, Bäckerprozent, Zielhydration, Starter-Hydration, Zielteiggewicht).
- [x] 5. Starter-Hydration für Nicht-Starter-Zutaten? → Default 100.0 für alle, fachlich nur bei `starter` ausgewertet.
- [x] 6. Reihenfolge-Spalte `position`? → ja, Ganzzahl, not null, Default 0.
- [x] 7. `updatedAt`? → Spalte mit `defaultNow()`; der Client setzt den Wert bei Änderungen selbst (analog `user_preference`, „letzte Änderung gewinnt“). Kein automatisches Überschreiben durch ORM/DB.
- [x] 8. Index auf `recipes.user_id` und `recipe_ingredients.recipe_id`? → ja, beide.

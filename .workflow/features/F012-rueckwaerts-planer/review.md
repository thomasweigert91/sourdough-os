# Review F012: Datenschema und Engine für den adaptiven Rückwärts-Planer

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** f17f27cc9736

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | Code: `src/lib/baking-engine/schedule.ts:269` (Hauptkette rückwärts, `end = cursor`), `:276` (Vorheizen am Backbeginn), `:158` (`mergeDefined` überspringt `undefined`), `:287` (Phasen in `PHASE_IDS`-Reihenfolge). Tests: `schedule.test.ts:130` „erzeugt für So 11.10.2026 12:00 die acht Phasen …“, `:139` „Hauptkette ist lückenlos …“, `:189` „ohne Dauern, mit leerem durations-Objekt, mit undefined-Werten …“, `:215` neue Instanz/Eingabe unverändert |
| AC-2 | ✅ | Code: `schedule.ts:275` (`bakeStartMs = intervals.bake.start`), `:320` (`start = phases[0].start`). Tests: `schedule.test.ts:228` (Ziel 12:00 → 09:15/Sa 08:15), `:237` (Ziel 08:30 → 05:45/Sa 04:45), jeweils Abgleich mit `phase("bake").start` und `phases[0].start` |
| AC-3 | ✅ | Code: `schedule.ts:294` (`at_i = bulkStart + i × interval`, `manual: true`). Tests: `schedule.test.ts:248` (14:45/15:15/15:45/16:15), `:268` (nur Stockgare trägt Durchgänge), `:277` (3 × 45 Min. → 15:00/15:45/16:30, alle Phasen unverändert), `:296` (Teil-Override) |
| AC-4 | ✅ | Code: `schedule.ts:276` (Vorheizen unabhängig von Kaltgare), `:287` (Dauer 0 → `continue`). Tests: `schedule.test.ts:314` (30 Min. Kaltgare, alle Zeiten, keine Warnung), `:332` (0 Min., 7 Phasen, Formgebung endet beim Backbeginn) |
| AC-5 | ✅ | Code: `schedule.ts:312` (`sleepWarning: manual && warns(start)`), `MANUAL_PHASES` (`:131`). Tests: `schedule.test.ts:356` (alle Zeiten inkl. Durchgänge), `:380` (`warnedSteps` = levain/preheat/bake), `:386` (Kaltgare/Auskühlen ohne Warnung), `:395` (manuelle Phasen) |
| AC-6 | ✅ | Code: `schedule.ts:240` (`isInSleepWindow`, Beginn inkl./Ende exkl., über Mitternacht), `:229` (`localMinuteOfDay`, `hourCycle: "h23"`). Tests: `schedule.test.ts:409` (16:15 → 23:00 warnt), `:419` (16:14 → 22:59 nicht), `:429` (10:45 → 07:00 nicht), `:441` (10:44 → 06:59 beide warnen), jeweils `warnedSteps` exakt |
| AC-7 | ✅ | Code: `schedule.ts:178` (Zeitzone), `:217` (`Intl.DateTimeFormat` mit `timeZone`, gecacht). Tests: `schedule.test.ts:461` (Fenster 00:00–09:00 → levain/preheat, Backen nicht), `:472` (America/New_York → levain/preheat/bake, Zeiten wie AC-1), `:489` (Standard Europe/Berlin) |
| AC-8 | ✅ | Code: Dauern als ms-Differenz (`schedule.ts:269`), Ortszeit nur in `localMinuteOfDay`. Tests: `schedule.test.ts:499` (25.10. 12:00, Kaltgare = 14 × 3 600 000 ms, Start Sa 09:15 +02:00, keine Warnung), `:528` (07:00 Winterzeit ohne Warnung), `:537` (06:59 warnt als einziger Schritt). Zusätzlich selbst mit `TZ=UTC` und `TZ=Pacific/Auckland` ausgeführt: 84/84 grün |
| AC-9 | ✅ | Code: `schedule.ts:183` (`validate`, feste Reihenfolge, wirft vor jeder Berechnung), `:207` (`count × interval >= bulk`). Tests: `schedule.test.ts:548` (Literaltexte), `:555` (ungültiges Datum, NaN, String), `:568` (8 Phasen × −1/−0,5/NaN/±Infinity), `:581` (10 bzw. 9 × 30 Min.), `:597` (Stockgare 0), `:608` (8 × 30 passt), `:617` (ungültige Anzahl/Abstand); `expectThrowMessage` stellt sicher, dass kein Ergebnis geliefert wird |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | BACKLOG.md:1 | Neue Datei außerhalb von Ticket und Plan (Plan, Schritt 9: „`git status` zeigt nur die zwei neuen Dateien“). Enthält Projekt- und Blueprint-Notizen, keinen F012-Code. | Nicht im F012-Commit mitnehmen, sondern getrennt committen oder vorerst ungetrackt lassen. | offen |
| 2 | MINOR | src/lib/baking-engine/schedule.ts:178 | `timeZone` wird nicht geprüft. Eine ungültige Zone wirft erst in `timeFormatter` (`:217`) einen englischen `RangeError` und auch nur dann, wenn überhaupt ein manueller Schritt geprüft wird (alle manuellen Dauern 0 und `count: 0` → kein Fehler). Im Plan als Risiko akzeptiert, für die spätere UI aber eine uneinheitliche Fehlerquelle. | Im Folgeticket mit UI-Eingabe die Zone vorab prüfen (z. B. `try { new Intl.DateTimeFormat("en-US", { timeZone }) }`) und eine deutsche `*_MESSAGE` werfen. Im BACKLOG vermerken. | offen |
| 3 | NIT | src/lib/baking-engine/schedule.ts:320 | `start` ist der Beginn der ersten Phase in fester Reihenfolge, nicht der früheste Beginn. Bei exotischer Konfiguration (z. B. Levain/Mischen/Stockgare/Kaltgare = 0, Formgebung 30, Vorheizen 60) beginnt das Vorheizen vor `start`. Ticket-Definition ist wörtlich erfüllt, die Aussage im Plan („Das ist dann auch der früheste Beginn“) stimmt aber nur für den dort genannten Fall. | JSDoc an `ScheduleTimeline.start` um diesen Fall ergänzen oder für die UI später bewusst `min(start)` verwenden. | offen |
| 4 | NIT | src/lib/baking-engine/schedule.ts:207 | Keine Obergrenze für `count`: `count: 1e9, intervalMinutes: 1e-7` besteht die Prüfung und erzeugt eine Milliarde Durchgänge (`:294`). Derzeit kein Nutzerpfad, relevant erst mit UI/Server Action. | Bei Anbindung an Nutzereingaben `count` sinnvoll begrenzen (z. B. ≤ 20) oder im Formular validieren. | offen |
| 5 | NIT | src/lib/baking-engine/schedule.test.ts:597 | Zwei im Plan beschriebene Randfälle sind nicht getestet: `count: 0` bei `bulkFermentation: 0` wirft nicht, und ein Teil-Override des Schlaf-Fensters (nur `startMinute`) nimmt für das andere Feld den Standard. | Je einen kurzen Testfall ergänzen. | offen |
| 6 | NIT | src/lib/baking-engine/schedule.ts:259 | `config` ist Pflichtparameter (ticketkonform), ein JS-Aufruf ohne Konfiguration endet in einem `TypeError` bei `config.durations`. | Optional `config: ScheduleConfig = {}` als Default, ändert die Signatur für TS-Aufrufer nicht. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders (nicht anwendbar, reines TS-Modul ohne Komponenten)
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast (nicht anwendbar, keine Oberfläche)
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen (Ausnahme: `BACKLOG.md`, Befund 1)

## Fazit
Die Engine setzt Ticket und Plan sauber um: Dauern in echter Zeit über ms-Arithmetik, Ortszeit nur für die Schlaf-Warnung über gecachtes `Intl.DateTimeFormat`, Validierung vor jeder Berechnung mit den vorgegebenen deutschen Meldungen. Alle neun AC sind durch präzise Tests mit festen ISO-Offsets belegt; 208 Tests im Ordner `baking-engine` sind grün, `tsc` und `eslint` melden nichts, und die Tests laufen auch unter `TZ=UTC` und `TZ=Pacific/Auckland` grün. Offen sind nur MINOR- und NIT-Punkte: `BACKLOG.md` nicht mit F012 committen, die Prüfung der Zeitzone für das UI-Folgeticket vormerken.

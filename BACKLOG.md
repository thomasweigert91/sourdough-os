# Backlog

## Sourdough-OS (Projekt D:\sourdough-os)

### Manuelle Abnahme F010 und F011 (bereits gepusht)

- [ ] F010: Speichern angemeldet mit Doppelklick, in Neon genau ein Rezept mit Zutaten
- [ ] F010: DDT-Warnung (unter 4 °C, über 45 °C), Slider mit Pfeiltasten, 320 px, Dunkelmodus
- [ ] F010: Gast-Hinweis, "Lokal merken", Abmelden (Konto-Stand weg, Gast-Stand bleibt), offline
- [ ] F011: Mehlwechsel (Weizen 550 -> Dinkel 630) mit Schalter an/aus und bei "Ziel-Teiggewicht"
- [ ] F011: Alter Stand "Weizenmehl"/"Roggenmehl" wird zu Weizen 550/Roggen 1150
- [ ] F011: Mehltyp im Konto-Rezept als Zutatenname prüfen

### Folgetickets (Produkt)

- [ ] F011: Hinweis anzeigen, wenn das Wasser beim Mehlwechsel nicht angepasst wurde (Mehlanteile ergeben nicht 100 %)
- [ ] F010: Rezeptname und Zutaten: Grenzen (200 Zeichen, 50 Zutaten) schon im Feld anzeigen
- [ ] F010: Abgelaufene Sitzung - ungespeicherte Eingaben automatisch lokal merken
- [ ] F010: Speichern - Hinweis, wenn sich der Inhalt während des Speicherns ändert
- [ ] Rückwärts-Planer, aufgeteilt in zwei Tickets:
  - [ ] Schema `baking_schedules` und `schedule_steps` (mit Neon-Abnahme)
  - [x] Reine Funktion `generateBackwardSchedule` mit Tests (Zeitzone, Schlaf-Fenster, Standarddauern klären)
- [ ] Weitere Mehle: Weizen 812, Dinkel 812/1050, Hartweizen, Urgetreide (bei Bedarf)

### Technische Schulden

- [ ] F005: Test `offline-sync.test.tsx` zeitunabhängig machen, danach `maxWorkers: 4` aus `vitest.config.mts` entfernen
- [ ] F002: `drizzle-kit` exakt pinnen, `server-only` in `src/db/index.ts`, `.tmp-*` in `.gitignore`
- [ ] Workflow-Änderungen (`allow-green`, Anleitung) getrennt committen
- [ ] F013: `generateBackwardSchedule(target, null)` wirft englischen TypeError (Standard greift nur bei `undefined`). Niedrige Priorität: Die eigene Server-Action übergibt nie `null`.
- [ ] F013: `durations`, `stretchAndFold` oder `sleepWindow` als Ganzes mit `null` nehmen still den Standard, einzelne Felder mit `null` werden abgelehnt (inkonsistent). Niedrige Priorität, gleicher Aufrufweg.
- [ ] F013: Sehr große Phasendauern (z. B. 1e12) enden in englischem `RangeError: Invalid time value`. Wird in der Server-Action (F014a) per AC abgefangen: jede Dauer höchstens 10 080 Min. (7 Tage).

## Blueprint (Projekt D:\code\react-feature-workflow)

- [ ] `allow-green` und Anleitung aus D:\sourdough-os\.claude\ übernehmen, Test in `test/e2e.mjs`
- [ ] Stop-Gate-Hook korrigieren (verbraucht Versuche, während der Implementer noch läuft)
- [ ] Parallele Builds bei `wf advance` abfangen (trat in F013 erneut auf)
- [ ] Schreibsperre auch über die Shell prüfen (Diff-Hash nach jedem Schritt)
- [ ] Danach `node test/e2e.mjs` laufen lassen

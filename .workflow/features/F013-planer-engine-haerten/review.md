# Review F013: F012b: Planer-Engine härten (Zeitzone, Schlaf-Fenster, Obergrenze, frühester Beginn)

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** 92cb7643973f

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `schedule.ts:144` (Meldung), `schedule.ts:195` (Standard nur bei `undefined`), `schedule.ts:237-246` (Typprüfung, dann `timeFormatter` im `try/catch`, ungültige Zone landet nicht im Cache, weil `new Intl.DateTimeFormat` vor `set` wirft). Tests in `schedule.hardening.test.ts:117-175`: „F013/AC-1 Zeitzone „%s“ (%s) wirft …“ (6 Fälle, `expectThrowMessage` prüft auch, dass kein Ergebnis kommt), „… wirft nicht und liefert einen Plan“ (3×2), „Zeitzone null (%s) …“, „… keine Zeichenkette …“, „nur eine fehlende Zeitzone (undefined) nimmt den Standard Europe/Berlin“ (Plan `toEqual` explizit Berlin plus Warnungen). |
| AC-2 | ✅ | `schedule.ts:142-143`, `schedule.ts:232-235`, Helfer `isValidMinuteOfDay` `schedule.ts:250-252` (`typeof number` + `Number.isInteger` + 0..1439). `mergeDefined` (`schedule.ts:175-185`) überspringt nur `undefined`, `null`/Text kommen bei der Prüfung an. Tests `schedule.hardening.test.ts:185-244`: 10 Zahlenfälle, 4 Nicht-Zahl-Fälle, Grenzwerte 0/1439, „Beginn gleich Ende (600/600) … kein Schritt warnt“ (bei diesem Ziel würden mit Standardfenster drei Schritte warnen, der Test ist also aussagekräftig), „nur ein fehlender Wert (undefined) nimmt den Standard“. |
| AC-3 | ✅ | `schedule.ts:69`, `schedule.ts:140-141`, Prüfung `schedule.ts:223-225` vor jeder Schleife. Tests `schedule.hardening.test.ts:248-294`: „20 Durchgänge im Abstand von 10 Min. ergeben genau 20 …“ (Länge, Indizes 1–20, Zeitpunkt des 20.), 21 mit Abstand 10 und 30, „1e9 Durchgänge im Abstand von 1e-7 Min. … in unter 100 ms“ (wirft, also kein Plan und kein Durchgang; `performance.now()`-Messung). |
| AC-4 | ✅ | Reihenfolge in `validate` `schedule.ts:200-247` entspricht exakt 1–7 aus dem Ticket, `validate` läuft vor jeder Berechnung (`schedule.ts:304-305`). Tests `schedule.hardening.test.ts:298-420`: alle drei Ticket-Beispiele plus „Kette: jede Prüfung meldet nur dann, wenn alle früheren bestehen“ (alle 7 Stufen, jeweils mit späteren Fehlern zugleich). |
| AC-5 | ✅ | `schedule.ts:363` (`reduce`/`Math.min` mit Startwert `targetMs`), JSDoc `schedule.ts:127` nennt den frühesten Beginn aller Phasen, Modul-JSDoc `schedule.ts:15`. Phasen-Reihenfolge unverändert. Tests `schedule.hardening.test.ts:424-472`: So 08:15 statt 08:45 (inkl. `phases`-Reihenfolge), Referenz Sa 08:15, ohne Phasen `start` = `target`. |
| AC-6 | ✅ | `schedule.ts:302` (`config: ScheduleConfig = {}`). Tests `schedule.hardening.test.ts:476-490`: „ohne zweites Argument wirft die Funktion nicht“, „… derselbe Plan wie mit leerer Konfiguration {}“ (`toEqual`). Aufruf ohne Cast, `npx tsc --noEmit` ohne Fehler (selbst ausgeführt). |
| AC-7 | ✅ | Tests `schedule.hardening.test.ts:494-539`: „Stockgare 0 Min. mit 0 Durchgängen …“ (keine Phase Stockgare, Kette lückenlos), „Schlaf-Fenster nur mit Beginn 22:00, Ziel So 15:45 …“ (Formgebung Sa 22:30, `warnedSteps` = `["shaping"]`), „… Ziel So 10:45 …“ (Levain Sa 07:00, Vorheizen So 07:00, keine Warnung, belegt Ende-Standard 07:00 ausschließlich). Keine Code-Änderung nötig, Verhalten aus F012. |
| AC-8 | ✅ | `git diff --stat` zeigt nur `schedule.ts` geändert, `schedule.test.ts` unberührt. Selbst ausgeführt: `npx vitest run src/lib/baking-engine` 6 Dateien / 274 Tests grün, `TZ=UTC npx vitest run src/lib/baking-engine/schedule.hardening.test.ts` 66 Tests grün, `npx tsc --noEmit` ohne Fehler, `npx eslint src/lib/baking-engine` ohne Meldung. Zusätzlich Tests mit wechselnder Prozess-Zeitzone `schedule.hardening.test.ts:542-595`. |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | src/lib/baking-engine/schedule.ts:302 | Der Default-Parameter greift nur bei `undefined`. `generateBackwardSchedule(target, null)` endet weiter in `TypeError: Cannot read properties of null (reading 'durations')` (selbst geprüft), also in einer englischen Meldung. Laut Ziel sollen ab F014 (Formular, Server-Action) alle ungültigen Eingaben eine feste deutsche Meldung liefern. AC-6 verlangt nur den fehlenden Aufruf-Parameter und ist erfüllt. | In `resolveConfig` `config ?? {}` verwenden oder `null`/Nicht-Objekt bewusst ablehnen, alternativ als Folgepunkt für F014a festhalten. | offen |
| 2 | NIT | src/lib/baking-engine/schedule.ts:175-177 | Unterobjekte mit `null` (`sleepWindow: null`, `stretchAndFold: null`, `durations: null`) nehmen still den Standard (`!overrides`). Felder mit `null` werden dagegen abgelehnt (AC-2), und bei der Zeitzone nimmt nur `undefined` den Standard (AC-1). Damit ist das Verhalten inkonsistent, aber kein AC verletzt. | Bei Gelegenheit vereinheitlichen (nur `undefined` = Standard) oder die Abweichung im JSDoc von `ScheduleConfig` dokumentieren. | offen |
| 3 | NIT | src/lib/baking-engine/schedule.ts:313 | Sehr große, aber endliche Dauern (z. B. `levain: 1e12`) erzeugen ungültige `Date`-Werte, `formatToParts` wirft dann `RangeError: Invalid time value` (selbst geprüft). Laut Ticket sind Obergrenzen für Dauern ausdrücklich nicht im Scope. | Als Folgeticket ins Backlog aufnehmen (Obergrenze für Dauern oder Prüfung des berechneten Zeitraums). | offen |
| 4 | NIT | BACKLOG.md | Die unversionierte Datei `BACKLOG.md` erscheint in `wf.mjs diff`. Sie stammt vom 04.10. 00:56, also von vor F013, und gehört nicht zum Ticket. | Nicht im F013-Commit mitnehmen, sondern getrennt committen oder ignorieren. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders (nicht anwendbar: reines TS-Modul ohne React)
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast (nicht anwendbar: keine UI)
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

## Fazit
Die Umsetzung folgt dem Plan genau. Sie bleibt klein und auf `schedule.ts` begrenzt, und die Prüfreihenfolge in `validate` entspricht AC-4 Punkt für Punkt. Die neuen Tests prüfen echtes Verhalten (exakte Meldungen, kein Ergebnis bei Fehlern, konkrete Zeitpunkte und Warnungen) und sind auch mit `TZ=UTC` grün. Typprüfung und Linter melden nichts, die F012-Tests sind unverändert. Offen sind nur ein MINOR (`config: null` liefert weiter einen englischen `TypeError`) und drei NITs, die vor F014 als Folgepunkte sinnvoll sind, aber keine AC verletzen.

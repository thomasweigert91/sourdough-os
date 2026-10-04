# Plan F013: F012b: Planer-Engine härten (Zeitzone, Schlaf-Fenster, Obergrenze, frühester Beginn)

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Alle Änderungen bleiben im reinen TS-Modul `src/lib/baking-engine/schedule.ts`. Die bestehende interne Funktion `validate` bekommt drei weitere Prüfungen in der Reihenfolge aus AC-4: Obergrenze (nach „Anzahl und Abstand gültig“, vor „passen in die Stockgare“), danach Schlaf-Fenster und zuletzt die Zeitzone. Die Zeitzone wird geprüft, indem der schon vorhandene, gecachte `timeFormatter(timeZone)` einmal im `try/catch` erzeugt wird. Ein `RangeError` von `Intl` wird in die deutsche Meldung übersetzt, ein Formatter für eine ungültige Zone landet nicht im Cache. Damit gilt als gültig, was die Laufzeit akzeptiert (Offene Frage 3), ohne eigene Liste. `resolveConfig` nimmt den Standard für die Zeitzone nur noch bei `undefined` (statt `??`), damit `null` geprüft und abgelehnt wird. `mergeDefined` überspringt schon heute nur `undefined`, `null` und Text im Schlaf-Fenster kommen also bei der Prüfung an. Der Startzeitpunkt wird als Minimum aller Phasen-Beginne berechnet (Startwert `target`), der zweite Parameter bekommt den Default `= {}`.

Vorab mit Node v24.18.0 geprüft: `Intl.DateTimeFormat` wirft für „Mars/Olympus“, „“ und „Europe/Berln“ einen `RangeError` und akzeptiert „Europe/Berlin“, „America/New_York“ und „UTC“. Die Zeiten aus AC-7 sind nachgerechnet (Ziel So 15:45 → Formgebung Sa 22:30, sonst keine Warnung. Ziel So 10:45 → Levain Sa 07:00, Vorheizen So 07:00, keine Warnung).

Verworfene Alternativen:
- **Eigene Zeitzonen-Liste bzw. `Intl.supportedValuesOf("timeZone")`**: lehnt Aliase wie „UTC“ oder „CET“ je nach Laufzeit ab, Offene Frage 3 verlangt die Laufzeit-Regel.
- **Prüfungen in `resolveConfig` verteilen**: dann wäre die Reihenfolge aus AC-4 über zwei Funktionen verstreut. Alles bleibt in `validate`.
- **Neue F013-Tests in `schedule.test.ts` anhängen**: AC-8 verlangt die F012-Tests ohne Änderung. Eine eigene Testdatei lässt `schedule.test.ts` unberührt, `git diff` beweist das.
- **Startzeitpunkt über Sortieren der Phasen**: die feste Reihenfolge in `phases` (F012/AC-1) muss bleiben, nur `start` ändert sich.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/lib/baking-engine/schedule.ts | ändern | Neue Konstanten und Meldungen, Prüfungen für Obergrenze, Schlaf-Fenster und Zeitzone, frühester Beginn als `start`, optionale Konfiguration, JSDoc |
| src/lib/baking-engine/schedule.hardening.test.ts | neu | Vitest-Unit-Tests F013/AC-1 bis AC-8 (`// @vitest-environment node`) |

`src/lib/baking-engine/schedule.test.ts` (F012) bleibt unverändert. Keine neuen Abhängigkeiten, keine UI, kein Schema, keine Änderung an `vitest.config.mts` oder `package.json`.

## Komponenten & Datenfluss
Keine Komponenten, kein State, keine API-Aufrufe, keine Lade- oder Fehlerzustände. Datenfluss unverändert: `targetDate` + `config` (jetzt optional) → `resolveConfig` → `validate` (wirft `Error` mit fester deutscher Meldung) → Hauptkette rückwärts → Vorheizen → Durchgänge → Schlaf-Warnungen → `ScheduleTimeline`.

### Neue bzw. geänderte öffentliche API in `src/lib/baking-engine/schedule.ts`
Gegen genau diese Namen und Werte schreibt der Test-Writer. Alle übrigen Exporte aus F012 bleiben gleich.
```ts
/** Höchstzahl der Dehnen-&-Falten-Durchgänge. */
export const MAX_STRETCH_AND_FOLD_COUNT = 20;

export const TOO_MANY_STRETCH_AND_FOLDS_MESSAGE =
  "Es sind höchstens 20 Dehnen-und-Falten-Durchgänge möglich.";
export const INVALID_SLEEP_WINDOW_MESSAGE =
  "Das Schlaf-Fenster muss aus ganzen Minuten zwischen 0 und 1439 bestehen.";
export const INVALID_TIME_ZONE_MESSAGE = "Die Zeitzone ist ungültig.";

export interface ScheduleTimeline {
  target: Date;
  bakeStart: Date;
  /** Frühester Beginn aller Phasen in `phases` (auch des Vorheizens); ohne Phasen = target. */
  start: Date;
  phases: SchedulePhase[];
}

/** Konfiguration optional; ohne zweites Argument gilt dasselbe wie mit `{}`. */
export function generateBackwardSchedule(
  targetDate: Date,
  config: ScheduleConfig = {},
): ScheduleTimeline;
```
Die Typen `ScheduleConfig`, `SleepWindow` und `StretchAndFoldConfig` bleiben unverändert (`timeZone?: string`, Minuten als `number`). Tests übergeben `null` bzw. Text per `as unknown as …`-Cast, wie in F012 beim Zielzeitpunkt. JSDoc an `SleepWindow` ergänzen: ganze Minuten 0–1439. JSDoc an `timeZone`: jede Zeitzone, die die Laufzeit (`Intl`) akzeptiert. JSDoc an `StretchAndFoldConfig.count`: höchstens `MAX_STRETCH_AND_FOLD_COUNT`.

### Ablauf (Änderungen)
1. **`resolveConfig`**: `timeZone: config.timeZone === undefined ? DEFAULT_TIME_ZONE : config.timeZone`. Alles andere bleibt (`mergeDefined` überspringt nur `undefined`).
2. **`validate(targetDate, resolved)`** in dieser Reihenfolge, jede Prüfung wirft sofort:
   1. Zielzeitpunkt (unverändert) → `INVALID_TARGET_DATE_MESSAGE`
   2. Dauern (unverändert) → `INVALID_PHASE_DURATION_MESSAGE`
   3. Anzahl und Abstand gültig (unverändert) → `INVALID_STRETCH_AND_FOLD_MESSAGE`
   4. **neu** `count > MAX_STRETCH_AND_FOLD_COUNT` → `TOO_MANY_STRETCH_AND_FOLDS_MESSAGE`
   5. Durchgänge passen (unverändert) → `STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE`
   6. **neu** für `startMinute` und `endMinute`: gültig nur bei `Number.isInteger(v) && v >= 0 && v <= 1439` (lehnt -1, 1440, 90.5, NaN, Infinity, Text und `null` ab) → `INVALID_SLEEP_WINDOW_MESSAGE`. Interner Helfer `isValidMinuteOfDay(value: unknown): boolean`.
   7. **neu** `typeof timeZone !== "string"` → `INVALID_TIME_ZONE_MESSAGE`. Danach `try { timeFormatter(timeZone); } catch { throw new Error(INVALID_TIME_ZONE_MESSAGE); }`. Der gültige Formatter liegt danach im Cache und wird für die Schlaf-Warnung wiederverwendet.
   Da `validate` vor jeder Berechnung läuft, entsteht bei 1e9 Durchgängen keine Schleife (AC-3).
3. **Startzeitpunkt**: `start = new Date(phases.reduce((min, p) => Math.min(min, p.start.getTime()), targetMs))`. Alle Phasen beginnen spätestens beim Ziel, ohne Phasen bleibt `targetMs`.
4. **Modul-JSDoc**: Satz ergänzen, dass alle Eingaben vor der Berechnung in fester Reihenfolge geprüft werden und `start` der früheste Beginn ist.

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Tests vorab (Test-Writer): `src/lib/baking-engine/schedule.hardening.test.ts` mit `// @vitest-environment node` anlegen. Helfer `at`, `phase`, `warnedSteps`, `expectThrowMessage` aus `schedule.test.ts` in die neue Datei kopieren (dort nicht exportiert, Datei bleibt unberührt). Konstanten `REFERENCE_TARGET = at("2026-10-11T12:00:00+02:00")` und `MANUAL_ZERO_CONFIG = { durations: { levain: 0, mixAutolyse: 0, shaping: 0, preheat: 0, bake: 0 }, stretchAndFold: { count: 0 } }` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
2. Tests vorab: `describe`-Blöcke `F013/AC-1` bis `F013/AC-8` mit den Fällen aus der Teststrategie, plus Literaltext-Prüfung der vier neuen Konstanten (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
3. `schedule.ts`: `MAX_STRETCH_AND_FOLD_COUNT`, `TOO_MANY_STRETCH_AND_FOLDS_MESSAGE`, `INVALID_SLEEP_WINDOW_MESSAGE`, `INVALID_TIME_ZONE_MESSAGE` exportieren (AC-1, AC-2, AC-3)
4. `schedule.ts`: Obergrenze in `validate` zwischen „gültig“ und „passen“ einfügen (AC-3, AC-4)
5. `schedule.ts`: Helfer `isValidMinuteOfDay` und Schlaf-Fenster-Prüfung nach „passen“ (AC-2, AC-4, AC-7)
6. `schedule.ts`: `resolveConfig` nimmt den Zeitzonen-Standard nur bei `undefined`. Zeitzonen-Prüfung (Typ, dann `timeFormatter` im `try/catch`) als letzte Prüfung in `validate` (AC-1, AC-4)
7. `schedule.ts`: `start` als Minimum aller Phasen-Beginne, JSDoc von `ScheduleTimeline.start` auf „frühester Beginn aller Phasen“ ändern (AC-5)
8. `schedule.ts`: Default-Parameter `config: ScheduleConfig = {}` (AC-6)
9. `schedule.ts`: JSDoc an Modulkopf, `SleepWindow`, `timeZone` und `count` nachziehen (AC-1, AC-2, AC-3, AC-5)
10. Prüfen: `npx vitest run src/lib/baking-engine` grün (F012-Tests unverändert grün), in Git Bash `TZ=UTC npx vitest run src/lib/baking-engine/schedule.hardening.test.ts` grün, `npx tsc --noEmit` ohne Fehler, `npx eslint src/lib/baking-engine` ohne Meldungen, `git diff --stat src/lib/baking-engine/schedule.test.ts` leer, volle Suite `npx vitest run` grün (AC-7, AC-8)

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle Tests liegen in `src/lib/baking-engine/schedule.hardening.test.ts` (Vitest, `// @vitest-environment node`), importieren aus `@/lib/baking-engine/schedule` und beginnen mit `F013/AC-n …`. Zeitpunkte nur über ISO-Strings mit festem Offset (`+02:00`), Vergleiche über `toISOString()`, damit die Tests auch mit `TZ=UTC` grün sind. Fehler werden mit `expectThrowMessage` exakt verglichen (Aufruf darf kein Ergebnis liefern). Ungültige Typen werden per `as unknown as string` bzw. `as unknown as number` übergeben. Meldungen werden in den Tests zusätzlich als Literal-Konstanten geführt (wie `MSG_*` in F012).

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/baking-engine/schedule.hardening.test.ts | `INVALID_TIME_ZONE_MESSAGE` = „Die Zeitzone ist ungültig.“. `it.each` über „Mars/Olympus“, „“, „Europe/Berln“ × {Referenz-Konfiguration `{}`, `MANUAL_ZERO_CONFIG`} (6 Fälle) → genau diese Meldung, kein Ergebnis. „Europe/Berlin“, „America/New_York“, „UTC“ × beide Konfigurationen → wirft nicht, liefert einen Plan. `timeZone: null` (Cast) → gleiche Meldung. `timeZone: undefined` → Plan `toEqual` dem Plan mit `timeZone: "Europe/Berlin"`. |
| AC-2 | Unit | src/lib/baking-engine/schedule.hardening.test.ts | `INVALID_SLEEP_WINDOW_MESSAGE` hat den Ticket-Wortlaut. `it.each` über -1, 1440, 90.5, NaN, Infinity × {`startMinute`, `endMinute`} (10 Fälle, anderer Wert Standard) → genau diese Meldung. Text „600“ und `null` jeweils als Beginn und als Ende (4 Fälle, Cast) → gleiche Meldung. Beginn 0, Beginn 1439, Ende 0, Ende 1439 → wirft nicht. `{ startMinute: 600, endMinute: 600 }` mit Ziel So 08:30 (`+02:00`) → wirft nicht, `warnedSteps` = `[]`. `{ startMinute: undefined }` → Plan `toEqual` dem Plan mit `{}`. |
| AC-3 | Unit | src/lib/baking-engine/schedule.hardening.test.ts | `MAX_STRETCH_AND_FOLD_COUNT` = 20, `TOO_MANY_STRETCH_AND_FOLDS_MESSAGE` hat den Ticket-Wortlaut. `{ count: 20, intervalMinutes: 10 }` → Stockgare hat genau 20 Durchgänge, `index` 1–20. `{ count: 21, intervalMinutes: 10 }` und `{ count: 21 }` (Abstand Standard 30) → neue Meldung. `{ count: 1e9, intervalMinutes: 1e-7 }` → neue Meldung, Dauer per `performance.now()` gemessen < 100 ms. |
| AC-4 | Unit | src/lib/baking-engine/schedule.hardening.test.ts | Die drei Beispiele aus dem Ticket: 21 Durchgänge + „Mars/Olympus“ → Obergrenze. `{ count: 10, intervalMinutes: 30 }` + `sleepWindow: { startMinute: 1440 }` → „passen nicht“. `startMinute: 1440` + „Mars/Olympus“ → Schlaf-Fenster. Zusätzlich die Kette: alle sieben Fehler zugleich (ungültiges Datum, Dauer -1, count 1.5, …) → Zielzeitpunkt-Meldung. Ohne Datumsfehler → Dauer-Meldung. Ohne Dauerfehler mit `count: NaN` + Schlaf-Fenster 1440 + „Mars/Olympus“ → `INVALID_STRETCH_AND_FOLD_MESSAGE`. |
| AC-5 | Unit | src/lib/baking-engine/schedule.hardening.test.ts | Ziel So 11.10.2026 12:00, Dauern levain/mixAutolyse/bulkFermentation/coldProof 0, shaping 30, preheat 60, bake 45, cool 120, `count: 0` → `start` = `2026-10-11T08:15:00+02:00` (gleich `phase("preheat").start`), nicht 08:45. Referenz-Konfiguration → `start` = `2026-10-10T08:15:00+02:00`. Alle Dauern 0, `count: 0` → `phases` leer, `start` gleich `target`. Die JSDoc-Änderung prüft der Reviewer im Diff (Arbeitsschritt 7). |
| AC-6 | Unit | src/lib/baking-engine/schedule.hardening.test.ts | `generateBackwardSchedule(REFERENCE_TARGET)` ohne zweites Argument wirft nicht und ist `toEqual` zu `generateBackwardSchedule(REFERENCE_TARGET, {})`. Kompiliert ohne Cast (prüft der Default-Parameter, tsc in Schritt 10). |
| AC-7 | Unit | src/lib/baking-engine/schedule.hardening.test.ts | `{ durations: { bulkFermentation: 0 }, stretchAndFold: { count: 0 } }` → wirft nicht, keine Phase `bulkFermentation`. `sleepWindow: { startMinute: 1320 }`, Ziel `2026-10-11T15:45:00+02:00` → `phase("shaping").start` = `2026-10-10T22:30:00+02:00`, `warnedSteps` = `["shaping"]`. Gleiches Fenster, Ziel `2026-10-11T10:45:00+02:00` → Levain `2026-10-10T07:00:00+02:00`, Vorheizen `2026-10-11T07:00:00+02:00`, `warnedSteps` = `[]` (Ende = Standard 07:00, ausschließlich). |
| AC-8 | Unit + Werkzeuge | src/lib/baking-engine/schedule.test.ts, src/lib/baking-engine/schedule.hardening.test.ts | F012-Datei unverändert (`git diff` leer) und grün. Neue Datei grün, auch mit `TZ=UTC npx vitest run src/lib/baking-engine/schedule.hardening.test.ts`. `npx tsc --noEmit` und `npx eslint src/lib/baking-engine` ohne Befund (Arbeitsschritt 10). |

## Risiken & Rollback
- **Verhaltensänderung `start`**: Nur wenn Levain bis Kaltgare entfallen und das Vorheizen dadurch vor der Formgebung beginnt, ändert sich `start`. Kein F012-Test deckt diesen Fall ab, der Test „`start` = `phases[0].start`“ in F012/AC-2 nutzt die Referenz-Konfiguration und bleibt grün. Es gibt noch keine Aufrufer außerhalb der Tests.
- **Strengere Eingaben**: `timeZone: null` und `null`/Text im Schlaf-Fenster wurden bisher still auf den Standard gesetzt bzw. ignoriert und werfen jetzt. Gewollt (Offene Fragen 1 und 2), heute ohne Aufrufer.
- **Zeitzonen-Prüfung hängt an der Laufzeit (ICU)**: Was gültig ist, entscheidet `Intl`. Auf Laufzeiten mit „small-icu“ wären „America/New_York“ ungültig. Für Node 24 und aktuelle Browser nicht relevant, vorab geprüft.
- **Formatter-Cache**: Jede gültige Schreibweise (z. B. „europe/berlin“) bekommt einen eigenen Cache-Eintrag. Ungültige Zonen werden nicht gecacht. Bei den erwarteten Eingaben (Formular ab F014) vernachlässigbar.
- **Laufzeitgrenze 100 ms (AC-3)**: Die Obergrenze greift vor jeder Schleife, der Test misst nur die Prüfung. Auf einem stark ausgelasteten Rechner wäre der Messwert trotzdem weit unter 100 ms.
- **Rollback**: Nur `schedule.ts` geändert und eine neue Testdatei. F013-Commit reverten bzw. `schedule.hardening.test.ts` löschen und `schedule.ts` auf den Stand von F012 (`f9a1d36`) zurücksetzen.

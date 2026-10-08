# Plan F014: Live-Rekalibrierung bei Planabweichungen und Verzögerungen

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Neues reines TS-Modul `src/lib/baking-engine/recalibrate.ts` neben `schedule.ts`, ohne UI, Speicherung oder neue Abhängigkeiten (Offene Frage 1). Es nimmt einen Plan aus `generateBackwardSchedule` (oder einen schon rekalibrierten Plan), kopiert ihn tief und legt alle Phasen nach dem erledigten Schritt per **Vorwärtskette ab dem Abschlusszeitpunkt** neu: Folgephasen bis zur Kaltgare mit ihrer bisherigen Dauer, dann die Kaltgare mit einer nach Strategie berechneten Dauer, danach Backen und Auskühlen mit bisheriger Dauer, das Vorheizen endet wie in F012 beim Backbeginn. Damit gilt „Nie vor jetzt“ für die Hauptkette automatisch. Drei öffentliche Funktionen: `recalibrateSchedule` (Schritt erledigt, Strategie „Kompensation“ als Standard oder „Verschiebung“), `parkDoughInFridge` (Kühlschrank-Notbremse, nur während der Stockgare) und `applySuggestion` (Lösungsvorschlag „Kaltgare bis morgen früh verlängern“ übernehmen). Alle drei enden im selben internen Schritt: Schlaf-Warnungen neu bestimmen, Konfliktwarnungen für Backen/Vorheizen mit optionalem Lösungsvorschlag, `start`/`bakeStart`/`target` neu setzen, angewandte Strategie aus dem Ergebnis ableiten (Kaltgare geändert? Zielzeitpunkt verschoben?). Fehler werfen wie in `schedule.ts` ein `Error` mit fester deutscher Meldung, der Eingabeplan wird nie verändert.

Für die Ortszeit-Logik (Schlaf-Fenster, Zeitzone) werden die bestehenden internen Helfer aus `schedule.ts` exportiert und wiederverwendet statt kopiert.

Vorab nachgerechnet (alle Zeiten Europe/Berlin, Oktober 2026 = +02:00 bis 25.10.): AC-1 Kaltgare 840 − 60 = 780 Min. AC-2 840 − 420 < 480 → 480, Rest +60. AC-4 (18:45 − 16:30) = 135 Min. − 240 × 0,1 = 111 Min. → 22:21, Kaltgare 22:51–09:15 = 624 Min. AC-6 min(870, 855) = 855, Rest −15. AC-8 max(18:45, 18:30 + 30) = 19:00, Kaltgare 825 Min. AC-9 nächstes 07:00 nach Backbeginn So 23:15 = Mo 07:00, + 60 Min. Vorheizen = Backen 08:00, Kaltgare 22:45–08:00 = 555 Min., Ziel 08:00 + 45 + 120 = 10:45. AC-11 555 > 540 → kein Vorschlag.

Verworfene Alternativen:
- **Plan mit `generateBackwardSchedule` vom neuen Ziel neu erzeugen**: kann keine erledigten Schritte, keine geänderte Kaltgare und keine einzeln verschobenen Durchgänge abbilden.
- **`ScheduleTimeline` in `schedule.ts` um Status-Felder erweitern**: würde F012/F013-Typen und `toEqual`-Tests berühren. Stattdessen ein erweiterter Typ `RecalibratedTimeline` im neuen Modul, der Eingabetyp akzeptiert beide.
- **Parken als dritte Strategie in `recalibrateSchedule`**: braucht zwei Zeitpunkte (Parken, Herausnehmen) und betrifft keinen erledigten Schritt. Eigene Funktion ist klarer.
- **Alles in `schedule.ts`**: Datei hat schon 366 Zeilen, Rekalibrierung ist ein eigenes Thema.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/lib/baking-engine/recalibrate.ts | neu | `recalibrateSchedule`, `parkDoughInFridge`, `applySuggestion`, Typen, Konstanten, Meldungen |
| src/lib/baking-engine/recalibrate.test.ts | neu | Vitest-Unit-Tests F014/AC-1 bis AC-14 (`// @vitest-environment node`) |
| src/lib/baking-engine/schedule.ts | ändern | Nur `export` vor `MS_PER_MINUTE`, `MANUAL_PHASES`, `mergeDefined`, `isValidMinuteOfDay`, `timeFormatter`, `localMinuteOfDay`, `isInSleepWindow` (JSDoc „intern, für recalibrate.ts“). Keine Verhaltensänderung |

`schedule.test.ts` und `schedule.hardening.test.ts` bleiben unverändert. Keine neuen Abhängigkeiten, keine UI, kein Schema.

## Komponenten & Datenfluss
Keine Komponenten, kein State, keine API-Aufrufe, keine Lade- oder Fehlerzustände (reine Funktionen). Datenfluss:
`ScheduleTimeline | RecalibratedTimeline` + Eingaben + `RecalibrationOptions` → Optionen auflösen → Prüfen (wirft) → tiefe Kopie (`normalize`) → Schritt markieren / Durchgänge / Parken → Vorwärtskette mit Strategie → `finalize` (Schlaf-Warnungen, Konflikte, Vorschlag, `start`/`bakeStart`/`target`, angewandte Strategie) → `RecalibrationResult`.

### Öffentliche API in `src/lib/baking-engine/recalibrate.ts`
Gegen genau diese Namen und Werte schreibt der Test-Writer.
```ts
import type { PhaseId, ScheduleConfig, SchedulePhase, ScheduleTimeline, StretchAndFold } from "./schedule";

export const DEFAULT_MIN_COLD_PROOF_MINUTES = 480;
export const DEFAULT_MAX_COLD_PROOF_MINUTES = 2880;
/** Fester Gärungsfaktor der Kühlschrank-Notbremse (Offene Frage 5). */
export const FRIDGE_FERMENTATION_FACTOR = 0.1;

export const RECALIBRATION_STRATEGIES = ["compensate", "shift"] as const;
export type RecalibrationStrategy = (typeof RECALIBRATION_STRATEGIES)[number];
export const DEFAULT_RECALIBRATION_STRATEGY: RecalibrationStrategy = "compensate";

export type AppliedStrategy = "none" | "compensation" | "compensationAndShift" | "shift";
export const APPLIED_STRATEGY_LABELS = {
  none: "Keine",
  compensation: "Kompensation",
  compensationAndShift: "Kompensation + Verschiebung",
  shift: "Verschiebung",
} as const satisfies Record<AppliedStrategy, string>;

export const FRIDGE_PARKING_LABEL = "Teig im Kühlschrank geparkt";
export const EXTEND_COLD_PROOF_SUGGESTION_LABEL = "Kaltgare bis morgen früh verlängern";

// Alle Fehlertexte sind exportierte Konstanten; Code wirft nur `new Error(<KONSTANTE>)`, keine Inline-Texte.
// Meldungen aus dem Ticket (AC-13)
export const STEP_NOT_FOUND_MESSAGE = "Der Schritt ist im Plan nicht vorhanden.";
export const INVALID_COMPLETED_AT_MESSAGE = "Der Abschlusszeitpunkt muss ein gültiges Datum sein.";
export const STEP_ALREADY_COMPLETED_MESSAGE = "Der Schritt ist bereits erledigt.";
export const COLD_PROOF_LIMITS_ORDER_MESSAGE =
  "Die Mindest-Kaltgare darf nicht länger als die Max-Kaltgare sein.";
// Nicht im Ticket vorgegeben (siehe Risiken)
export const INVALID_COLD_PROOF_LIMIT_MESSAGE = "Mindest- und Max-Kaltgare müssen Zahlen ab 0 sein.";
export const INVALID_PARKING_TIME_MESSAGE =
  "Parken und Herausnehmen müssen gültige Zeitpunkte sein, Herausnehmen nach dem Parken.";
export const PARKING_ONLY_DURING_BULK_MESSAGE = "Der Teig kann nur während der Stockgare geparkt werden.";
export const SUGGESTION_NOT_APPLICABLE_MESSAGE = "Der Lösungsvorschlag passt nicht zum Plan.";

/** Schritt-ID eines Durchgangs, z. B. "stretchAndFold#3" (1-basiert). Phasen nutzen ihre PhaseId. */
export function stretchAndFoldStepId(index: number): string;

/** Planer-Konfiguration plus Rekalibrierung. durations/stretchAndFold werden ignoriert. */
export interface RecalibrationOptions extends ScheduleConfig {
  strategy?: RecalibrationStrategy;          // Standard "compensate"
  minColdProofMinutes?: number;              // Standard 480
  maxColdProofMinutes?: number;              // Standard 2880
}

export interface RecalibratedStretchAndFold extends StretchAndFold { completed: boolean; }
export interface RecalibratedPhase extends Omit<SchedulePhase, "stretchAndFolds"> {
  completed: boolean;
  /**
   * „Sofort starten“: nur beim offenen Vorheizen true, wenn sein Beginn vor dem Bezugszeitpunkt
   * der Neuberechnung liegt (recalibrateSchedule: completedAt, parkDoughInFridge: resumedAt).
   * Alle anderen Phasen und applySuggestion (kein „jetzt“) immer false.
   */
  startImmediately: boolean;
  stretchAndFolds: RecalibratedStretchAndFold[];
}
export interface FridgeParking {
  label: typeof FRIDGE_PARKING_LABEL;
  start: Date;                       // Parken
  end: Date;                         // Herausnehmen
  creditedBulkMinutes: number;       // (end − start) × 0,1, AC-4: 24
  remainingBulkMinutes: number;      // AC-4: 111
}
export interface ColdProofExtensionSuggestion {
  label: typeof EXTEND_COLD_PROOF_SUGGESTION_LABEL;
  coldProofMinutes: number;          // AC-9: 555
  bakeStart: Date;                   // AC-9: Mo 08:00
  target: Date;                      // AC-9: Mo 10:45
}
export interface ConflictWarning {
  stepId: "preheat" | "bake";
  label: string;                     // PHASE_LABELS[stepId]
  start: Date;
  message: string;                   // `${label} beginnt im Schlaf-Fenster.`
  suggestion: ColdProofExtensionSuggestion | null;
}
export interface RecalibratedTimeline extends Omit<ScheduleTimeline, "phases"> {
  phases: RecalibratedPhase[];
  fridgeParkings: FridgeParking[];
  conflicts: ConflictWarning[];
  /** Abstand der Durchgänge; bei einem frischen Plan = erster Durchgang − Beginn Stockgare, ohne Durchgänge null. */
  stretchAndFoldIntervalMinutes: number | null;
}
export interface RecalibrationResult {
  timeline: RecalibratedTimeline;
  appliedStrategy: AppliedStrategy;
  /** Neuer minus alter Zielzeitpunkt in Minuten (AC-2: 60, AC-6: −15). */
  targetShiftMinutes: number;
  /** Abweichung Δt des erledigten Schritts in Minuten (bei Parken/Vorschlag 0). */
  deviationMinutes: number;
  /** Kurzform: true, wenn die Phase „preheat“ im neuen Plan `startImmediately` trägt. */
  preheatStartImmediately: boolean;
}

export function recalibrateSchedule(
  timeline: ScheduleTimeline | RecalibratedTimeline,
  stepId: string,
  completedAt: Date,
  options?: RecalibrationOptions,
): RecalibrationResult;

export function parkDoughInFridge(
  timeline: ScheduleTimeline | RecalibratedTimeline,
  parkedAt: Date,
  resumedAt: Date,
  options?: RecalibrationOptions,
): RecalibrationResult;

export function applySuggestion(
  timeline: RecalibratedTimeline,
  suggestion: ColdProofExtensionSuggestion,
  options?: RecalibrationOptions,
): RecalibrationResult;
```

### Ablauf `recalibrateSchedule`
1. **Optionen auflösen** (`mergeDefined` wiederverwenden): Strategie, Min/Max-Kaltgare, Schlaf-Fenster, Zeitzone mit Standardwerten.
2. **Prüfen** in dieser Reihenfolge (Ticket-Reihenfolge AC-13), jede wirft sofort: Schritt nicht im Plan (Phase-ID einer vorhandenen Phase oder `stretchAndFold#n` eines vorhandenen Durchgangs) → `STEP_NOT_FOUND_MESSAGE`. `completedAt` kein gültiges `Date` → `INVALID_COMPLETED_AT_MESSAGE`. Schritt `completed === true` → `STEP_ALREADY_COMPLETED_MESSAGE`. Min/Max keine endlichen Zahlen ≥ 0 → `INVALID_COLD_PROOF_LIMIT_MESSAGE`. Min > Max → `COLD_PROOF_LIMITS_ORDER_MESSAGE`. Schlaf-Fenster/Zeitzone wie in `schedule.ts` → `INVALID_SLEEP_WINDOW_MESSAGE` / `INVALID_TIME_ZONE_MESSAGE` (wiederverwendet).
3. **`normalize`**: tiefe Kopie mit neuen `Date`-Instanzen, fehlendes `completed` = false, `fridgeParkings` = [], `conflicts` = [], Abstand ableiten falls nicht vorhanden.
4. **Δt** = `completedAt` − geplantes Ende (Phase: `end`, Durchgang: `at`).
5. **Phase erledigt**: `end = completedAt`, `completed = true`, `durationMinutes = (end − start)` in Minuten. Frühere Schritte unverändert. Dann Vorwärtskette ab `completedAt` für die folgenden Phasen der Hauptkette (Reihenfolge `levain, mixAutolyse, bulkFermentation, shaping, coldProof, bake, cool`):
   - Phasen vor der Kaltgare: bisherige Dauer. Offene Durchgänge der Stockgare verschieben sich mit dem Beginn der Stockgare (gleicher Versatz).
   - Kaltgare (Dauer `C`, Abweichung am Kaltgare-Beginn `d` = neuer minus alter Beginn): Strategie `shift` → `C`. Strategie `compensate`: `d > 0` → `C < min ? C : max(C − d, min)`. `d < 0` → `C > max ? C : min(C − d, max)`. Kaltgare endet bei `start + neue Dauer`.
   - Backen, Auskühlen: bisherige Dauer. Vorheizen: endet beim Backbeginn, bisherige Dauer.
   - Ist der erledigte Schritt die Kaltgare selbst oder liegt danach (Vorheizen, Backen, Auskühlen) oder fehlt die Kaltgare: nur Verschiebung. Sonderfall Vorheizen erledigt: bei Δt > 0 starten Backen/Auskühlen ab `completedAt` (offene Kaltgare endet dann ebenfalls dort), bei Δt ≤ 0 ändert sich sonst nichts.
6. **Durchgang `k` erledigt**: `at = completedAt`, `completed = true`. Offene Durchgänge `j > k`: `at = completedAt + (j − k) × Abstand` (AC-7). Neues Ende der Stockgare = `max(bisheriges Ende, letzter Durchgang + Abstand)` (AC-8). Ändert sich das Ende, läuft die Vorwärtskette ab dem neuen Ende wie in Schritt 5 (Stockgare bleibt offen).
7. **`finalize(tl, input, resolved)`**:
   - `sleepWarning` für alle manuellen Phasen (Beginn) und alle Durchgänge neu (Schlaf-Prüfung).
   - `startImmediately`: für alle Phasen false, außer offenes Vorheizen mit `start < jetzt` (Bezugszeitpunkt wird an `finalize` übergeben, bei `applySuggestion` keiner). `preheatStartImmediately` im Ergebnis spiegelt das.
   - `conflicts`: je eine Warnung für `preheat` und `bake`, wenn deren Beginn im Schlaf-Fenster liegt, in dieser Reihenfolge.
   - Vorschlag (für alle Warnungen derselbe): nur wenn eine offene Kaltgare existiert. `E` = erster Zeitpunkt ≥ frühester Konflikt-Beginn mit Ortszeit = `sleepWindow.endMinute` (Minuten bis dahin über `localMinuteOfDay` rechnen, danach mit `localMinuteOfDay` gegenprüfen und bei Zeitumstellung um ±60 Min. korrigieren). Neuer Backbeginn = `E + Vorheiz-Dauer` (0 ohne Vorheizen). Neue Kaltgare = Backbeginn − Kaltgare-Beginn. Vorschlag nur wenn ≤ Max-Kaltgare (AC-11), sonst `null`.
   - `bakeStart` = Beginn Backen (bzw. Ende der Kaltgare/letzten Phase vor Backen, wie F012), `target` = Ende der letzten Phase der Hauptkette, `start` = frühester Phasen-Beginn.
   - `targetShiftMinutes` = neues − altes Ziel. `appliedStrategy`: Kaltgare-Dauer geändert und Verschiebung 0 → `compensation`; beides → `compensationAndShift`; nur Verschiebung → `shift`; nichts → `none`.

### Ablauf `parkDoughInFridge` (AC-4)
Prüfen: Min/Max wie oben, `parkedAt`/`resumedAt` gültig und `resumedAt > parkedAt` → `INVALID_PARKING_TIME_MESSAGE`. Stockgare vorhanden, nicht erledigt und `start ≤ parkedAt < end` → sonst `PARKING_ONLY_DURING_BULK_MESSAGE`. Berechnung: Gutschrift = (resumedAt − parkedAt) × 0,1, Rest = max(0, (Ende − parkedAt) − Gutschrift), neues Ende = `resumedAt + Rest`. Offene Durchgänge nach `parkedAt` verschieben sich um (neues − altes Ende), mindestens aber auf ≥ `resumedAt`. `FridgeParking` an `fridgeParkings` anhängen, Stockgare bleibt offen. Danach Vorwärtskette ab dem neuen Ende mit der gewählten Strategie und `finalize`. `deviationMinutes` = 0. Keine Rundung, alles in Millisekunden.

### Ablauf `applySuggestion` (AC-10)
Prüfen: Kaltgare vorhanden und offen, `suggestion.coldProofMinutes` endliche Zahl > 0 → sonst `SUGGESTION_NOT_APPLICABLE_MESSAGE`. Kaltgare-Dauer = `coldProofMinutes`, Backen/Auskühlen/Vorheizen danach wie in Schritt 5, dann `finalize` (Schlaf-Prüfung, Konflikte neu).

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Tests vorab (Test-Writer): `src/lib/baking-engine/recalibrate.test.ts` mit `// @vitest-environment node`, Helfer `at`, `phase`, `warnedSteps`, `expectThrowMessage` aus `schedule.test.ts` kopieren, Fixtures `referencePlan()` = `generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"))` und `eveningPlan()` = `generateBackwardSchedule(at("2026-10-11T22:00:00+02:00"), { durations: { coldProof: 30 } })` (AC-1 bis AC-14)
2. Tests vorab: `describe`-Blöcke `F014/AC-1` bis `F014/AC-14` gemäß Teststrategie, plus Literaltext-Prüfung aller Ticket-Meldungen und Strategie-Labels (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14)
3. `schedule.ts`: interne Helfer exportieren, JSDoc „intern, für recalibrate.ts“, keine Logikänderung (AC-2, AC-9, AC-10)
4. `recalibrate.ts`: Konstanten, Meldungen, Typen, `stretchAndFoldStepId`, Optionen auflösen (AC-3, AC-6, AC-11, AC-13)
5. `recalibrate.ts`: Prüfkette in Ticket-Reihenfolge, Eingabe wird nie verändert (AC-13)
6. `recalibrate.ts`: `normalize` (tiefe Kopie, `completed`, Abstand ableiten) und Schritt als erledigt markieren (AC-1, AC-12)
7. `recalibrate.ts`: Vorwärtskette mit Strategie `shift` inkl. Durchgänge der Stockgare und Vorheizen am Backbeginn (AC-3, AC-9)
8. `recalibrate.ts`: Kaltgare-Kompensation mit Min/Max-Grenzen und Rest als Verschiebung (AC-1, AC-2, AC-5, AC-6)
9. `recalibrate.ts`: Durchgänge einzeln erledigen, Folge-Durchgänge verschieben, Stockgare-Ende ≥ letzter Durchgang + Abstand (AC-7, AC-8)
10. `recalibrate.ts`: `finalize` mit Schlaf-Prüfung, `start`/`bakeStart`/`target`, `targetShiftMinutes`, `appliedStrategy`, `startImmediately`/`preheatStartImmediately` fürs Vorheizen, „jetzt“ = Abschlusszeitpunkt bzw. Herausnehmen (AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-12, AC-14)
11. `recalibrate.ts`: Konfliktwarnungen Vorheizen/Backen und Vorschlag „Kaltgare bis morgen früh verlängern“ mit Max-Grenze (AC-9, AC-11)
12. `recalibrate.ts`: `applySuggestion` (AC-10)
13. `recalibrate.ts`: `parkDoughInFridge` mit Gärungsfaktor 0,1 und anschließender Kompensation (AC-4)
14. Prüfen: `npx vitest run src/lib/baking-engine` grün (F012/F013 unverändert grün), in Git Bash `TZ=UTC npx vitest run src/lib/baking-engine/recalibrate.test.ts` und `TZ=Europe/Berlin npx vitest run src/lib/baking-engine/recalibrate.test.ts` grün (inkl. Zeitumstellungs-Fälle), `npx tsc --noEmit` und `npx eslint src/lib/baking-engine` ohne Befund, `git diff --stat src/lib/baking-engine/schedule.test.ts src/lib/baking-engine/schedule.hardening.test.ts` leer (AC-1 bis AC-14)

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle Tests in `src/lib/baking-engine/recalibrate.test.ts` (Vitest, `// @vitest-environment node`), Import aus `@/lib/baking-engine/recalibrate` und `@/lib/baking-engine/schedule`, Testnamen `F014/AC-n …`. Zeitpunkte nur als ISO mit festem Offset (`+02:00`, nach der Umstellung `+01:00`), Vergleiche über `toISOString()`. Die Datei läuft sowohl mit `TZ=UTC` als auch mit `TZ=Europe/Berlin` grün (Arbeitsschritt 14). Fehlertexte werden über die exportierten Konstanten verglichen und deren Wortlaut zusätzlich als Literal geprüft. Jeder Erfolgsfall prüft zusätzlich: Eingabeplan nach dem Aufruf `toEqual` einer vorher gezogenen `structuredClone`-Kopie, `phase(id).completed` des erledigten Schritts `true`, unveränderte Phasen davor identisch, Hauptkette lückenlos.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/baking-engine/recalibrate.test.ts | Referenzplan, `recalibrateSchedule(plan, "bulkFermentation", Sa 19:45)`: Stockgare 14:15–19:45 erledigt, Formgebung 19:45–20:15, Kaltgare Sa 20:15–So 09:15 (`durationMinutes` 780), Vorheizen 08:15–09:15, Backen 09:15–10:00, Auskühlen 10:00–12:00, Levain/Mischen unverändert, `appliedStrategy` "compensation", `targetShiftMinutes` 0, `deviationMinutes` 60, `preheatStartImmediately` false. **Zeitumstellung**: Plan mit Ziel `2026-10-25T12:00:00+01:00` (Stockgare endet `2026-10-24T19:45:00+02:00`), Stockgare erledigt `2026-10-24T20:45:00+02:00`: Formgebung 20:45–21:15 (+02:00), Kaltgare `2026-10-24T21:15:00+02:00` bis `2026-10-25T09:15:00+01:00`, `durationMinutes` 780 (echte Minuten), Vorheizen 08:15–09:15 (+01:00), `target` unverändert, "compensation", 0 |
| AC-2 | Unit | src/lib/baking-engine/recalibrate.test.ts | Stockgare erledigt So 01:45: Formgebung 01:45–02:15, Kaltgare 02:15–10:15 (480), Vorheizen 09:15–10:15, Backen 10:15–11:00, Auskühlen 11:00–13:00, `target` So 13:00, "compensationAndShift", +60, `warnedSteps` enthält "shaping", `conflicts` leer |
| AC-3 | Unit | src/lib/baking-engine/recalibrate.test.ts | `{ strategy: "shift" }`, "mixAutolyse" erledigt Sa 14:45: Stockgare 14:45–19:15 mit Durchgängen 15:15/15:45/16:15/16:45, Formgebung 19:15–19:45, Kaltgare 19:45–09:45 (840), Vorheizen 08:45–09:45, Backen 09:45–10:30, Auskühlen 10:30–12:30, "shift", +30 |
| AC-4 | Unit | src/lib/baking-engine/recalibrate.test.ts | Durchgänge 1–4 nacheinander pünktlich erledigt, dann `parkDoughInFridge(plan, Sa 16:30, Sa 20:30)`: `fridgeParkings` = genau ein Eintrag mit Label „Teig im Kühlschrank geparkt“, 16:30–20:30, `creditedBulkMinutes` 24, `remainingBulkMinutes` 111. Stockgare endet 22:21 und ist offen, Formgebung 22:21–22:51, Kaltgare 22:51–09:15 (624), Vorheizen 08:15–09:15, Backen 09:15–10:00, Auskühlen 10:00–12:00, "compensation", 0. Parken um Sa 13:00 (vor Stockgare), Sa 19:00 (danach) und bei erledigter Stockgare → `PARKING_ONLY_DURING_BULK_MESSAGE`, `resumedAt ≤ parkedAt` → `INVALID_PARKING_TIME_MESSAGE` |
| AC-5 | Unit | src/lib/baking-engine/recalibrate.test.ts | Stockgare erledigt Sa 18:15: Formgebung 18:15–18:45, Kaltgare 18:45–09:15 (870), Vorheizen/Backen/Auskühlen wie Referenz, kein offener Schritt der Hauptkette und kein offener Durchgang beginnt vor 18:15, "compensation", 0 |
| AC-6 | Unit | src/lib/baking-engine/recalibrate.test.ts | `{ maxColdProofMinutes: 855 }`, Stockgare erledigt Sa 18:15: Formgebung 18:15–18:45, Kaltgare 18:45–09:00 (855), Vorheizen 08:00–09:00, Backen 09:00–09:45, Auskühlen 09:45–11:45, "compensationAndShift", −15 |
| AC-7 | Unit | src/lib/baking-engine/recalibrate.test.ts | `stretchAndFoldStepId(3)` = "stretchAndFold#3" erledigt Sa 16:00: Durchgang 3 `at` 16:00 erledigt, Durchgang 4 16:30 offen, Durchgänge 1–2 unverändert, alle Phasen inkl. Stockgare-Ende 18:45 und `target` unverändert, "none", 0 |
| AC-8 | Unit | src/lib/baking-engine/recalibrate.test.ts | "stretchAndFold#4" erledigt Sa 18:30: Stockgare endet 19:00 (offen), Formgebung 19:00–19:30, Kaltgare 19:30–09:15 (825), Rest wie Referenz, "compensation", 0 |
| AC-9 | Unit | src/lib/baking-engine/recalibrate.test.ts | Abendplan, `{ strategy: "shift" }`, "mixAutolyse" erledigt So 17:45: Stockgare 17:45–22:15, Formgebung 22:15–22:45, Kaltgare 22:45–23:15, Vorheizen 22:15–23:15, Backen So 23:15–Mo 00:00, Auskühlen Mo 00:00–02:00. `conflicts` Länge 1, `stepId` "bake", `start` 23:15, `suggestion.label` „Kaltgare bis morgen früh verlängern“, `coldProofMinutes` 555, `bakeStart` `2026-10-12T08:00:00+02:00`, `target` `2026-10-12T10:45:00+02:00`. **Zeitumstellung**: gleicher Ablauf mit Abendplan-Konfiguration und Ziel `2026-10-24T22:00:00+02:00`, "mixAutolyse" erledigt `2026-10-24T17:45:00+02:00`: Konflikt "bake" um 23:15 (+02:00), Vorschlag `bakeStart` `2026-10-25T08:00:00+01:00` (Vorheizen ab 07:00 MEZ), `coldProofMinutes` 615 (eine Stunde mehr durch die Umstellung), `target` `2026-10-25T10:45:00+01:00` |
| AC-10 | Unit | src/lib/baking-engine/recalibrate.test.ts | `applySuggestion(ac9.timeline, ac9.timeline.conflicts[0].suggestion!)`: Kaltgare So 22:45–Mo 08:00 (555), Vorheizen Mo 07:00–08:00, Backen 08:00–08:45, Auskühlen 08:45–10:45, `target` Mo 10:45, `conflicts` leer, `warnedSteps` leer. Ungültiger Vorschlag (Plan ohne Kaltgare) → `SUGGESTION_NOT_APPLICABLE_MESSAGE` |
| AC-11 | Unit | src/lib/baking-engine/recalibrate.test.ts | Abendplan, `{ strategy: "shift", maxColdProofMinutes: 540 }`, gleicher Aufruf wie AC-9: Phasen wie AC-9, genau eine Konfliktwarnung für "bake", `suggestion` `null` |
| AC-12 | Unit | src/lib/baking-engine/recalibrate.test.ts | Stockgare erledigt genau Sa 18:45: alle Phasen-Zeiten, Durchgänge, `target`, `bakeStart`, `start` gleich Referenzplan, nur `completed` der Stockgare `true`, "none", 0, `conflicts` leer |
| AC-14 | Unit | src/lib/baking-engine/recalibrate.test.ts | Abendplan, Standardstrategie, "shaping" erledigt genau So 18:45 → alle Zeiten identisch mit dem Abendplan, "none", `targetShiftMinutes` 0, `phase("preheat").start` 18:15 mit `startImmediately` true, `preheatStartImmediately` true, alle anderen Phasen `startImmediately` false. Gegenprobe Referenzplan wie AC-12 (Stockgare pünktlich Sa 18:45, Vorheizen So 08:15) → keine Kennzeichnung, `preheatStartImmediately` false. Parken wie AC-4 („jetzt“ = Herausnehmen Sa 20:30, Vorheizen So 08:15) → `preheatStartImmediately` false |
| AC-13 | Unit | src/lib/baking-engine/recalibrate.test.ts | Literaltexte der vier Ticket-Meldungen. `expectThrowMessage` für: "unknownStep" und "stretchAndFold#5" → nicht vorhanden; `new Date("x")` und `"2026-10-10" as unknown as Date` → Datum; Stockgare zweimal erledigen (zweiter Aufruf auf dem Ergebnis) → bereits erledigt; `{ minColdProofMinutes: 600, maxColdProofMinutes: 500 }` → Min/Max. Eingabeplan nach jedem Fehler `toEqual` seiner Kopie. **Zwei gleichzeitige Eingabefehler** (Prüfreihenfolge Schritt → Datum → erledigt → Min/Max): "unknownStep" + `new Date("x")` → `STEP_NOT_FOUND_MESSAGE`; bereits erledigte Stockgare + `{ minColdProofMinutes: 600, maxColdProofMinutes: 500 }` → `STEP_ALREADY_COMPLETED_MESSAGE`. Eingabe jeweils unverändert |

## Risiken & Rollback
- **Nie vor jetzt und Vorheizen (AC-14)**: „Nie vor jetzt“ gilt laut Ticket nur für die Hauptkette. Das Vorheizen bleibt wie in F012 an den Backbeginn gekoppelt und kann vor „jetzt“ beginnen (Kaltgare kürzer als Vorheizen oder Kaltgare selbst erledigt). Es wird dann mit `startImmediately` („sofort starten“) gekennzeichnet, die Gesamtmeldung ist `preheatStartImmediately`, die Zeiten bleiben.
- **Zeitumstellungs-Tests**: Die Fälle am 24./25.10.2026 sind Ergänzungen des Nutzers ohne eigene AC und hängen an AC-1 (Kaltgare über die Umstellung) bzw. AC-9 (Vorschlag sucht 07:00 MEZ, ±60-Korrektur).
- **Meldungen nicht im Ticket**: `INVALID_COLD_PROOF_LIMIT_MESSAGE`, `INVALID_PARKING_TIME_MESSAGE`, `PARKING_ONLY_DURING_BULK_MESSAGE`, `SUGGESTION_NOT_APPLICABLE_MESSAGE` sind Vorschläge des Plans (wie F012 `INVALID_STRETCH_AND_FOLD_MESSAGE`). Wortlaut vom Nutzer bestätigen lassen.
- **Prüfreihenfolge AC-13**: Ticket nennt keine Reihenfolge; Plan folgt der Aufzählungsreihenfolge im Ticket (Schritt, Datum, erledigt, Min/Max).
- **Nicht spezifizierte Randfälle** (keine AC, minimal gelöst): Durchgänge zu früh erledigt verschieben die folgenden ebenfalls nach vorn, die Stockgare wird dadurch nicht kürzer. Vorheizen erledigt mit Δt ≤ 0 ändert nichts. Bei Strategie „Verschiebung“ und erledigter Kaltgare/Backen gilt nur Verschiebung. Offene Durchgänge einer erledigten Stockgare bleiben unverändert stehen. `appliedStrategy` von `applySuggestion` ist „Kompensation + Verschiebung“ (Kaltgare und Ziel ändern sich).
- **Zeitumstellung**: Der Vorschlag sucht die nächste Ortszeit 07:00 mit Gegenprüfung (±60 Min.). Abgesichert durch die Zusatzfälle in AC-1/AC-9 und den Lauf mit `TZ=Europe/Berlin`.
- **Plan ohne gespeicherten Status**: Ein frischer `ScheduleTimeline` hat kein `completed`; es wird als `false` gelesen. Der Abstand der Durchgänge wird aus dem ersten Durchgang abgeleitet und danach in `stretchAndFoldIntervalMinutes` mitgeführt, damit ein später verschobener erster Durchgang ihn nicht verfälscht.
- **Exporte in `schedule.ts`**: nur zusätzliche `export`, keine Verhaltensänderung, F012/F013-Tests bleiben unberührt.
- **Rollback**: `recalibrate.ts` und `recalibrate.test.ts` löschen, `schedule.ts` auf Stand `3d911d6` zurücksetzen. Es gibt noch keine Aufrufer.

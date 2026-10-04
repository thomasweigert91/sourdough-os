# Plan F012: Engine für den adaptiven Rückwärts-Planer

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Neues reines TS-Modul `src/lib/baking-engine/schedule.ts` neben `ddt.ts`, `hydration.ts` und `flour-types.ts`. Es folgt deren Konventionen: synchron, ohne Seiteneffekte, keine Imports aus `@/db`, deutsche Fehlermeldungen als exportierte `*_MESSAGE`-Konstanten, lokaler `assertFinite`-Stil, keine Barrel-Datei. Die einzige öffentliche Funktion `generateBackwardSchedule(targetDate, config)` führt Konfiguration und Standardwerte zusammen und prüft die Eingaben. Danach rechnet sie die Hauptkette in Millisekunden rückwärts vom Zielzeitpunkt (`end = cursor`, `start = cursor − dauer`). Das Vorheizen wird separat an den Backbeginn gehängt. Dauern sind echte verstrichene Zeit (`getTime() − minuten × 60 000`), eine Zeitumstellung (AC-8) ist dadurch automatisch richtig. Nur für die Schlaf-Warnung wird die Ortszeit (Minute des Tages) über `Intl.DateTimeFormat` mit `timeZone` und `hourCycle: "h23"` ermittelt. Node 24 bringt volles ICU mit, `America/New_York` ist verfügbar (vorab geprüft). Der Algorithmus wurde vorab in einem Wegwerf-Skript gegen alle Uhrzeiten aus AC-1 bis AC-8 nachgerechnet, alle Werte stimmen.

Verworfene Alternativen:
- **date-fns / date-fns-tz / Luxon / Temporal-Polyfill**: neue Abhängigkeit nur für eine Abfrage „Stunde und Minute in Zeitzone X“. Das liefert `Intl.DateTimeFormat` ohne Zusatzpaket. Temporal ist in Node 24 nicht standardmäßig aktiv.
- **Rechnen in Ortszeit (Stunden auf der Uhr addieren)**: falsch über die Zeitumstellung, AC-8 verlangt echte Zeit.
- **Phasen nach Beginn sortieren**: AC-1 verlangt die feste Reihenfolge, das Vorheizen steht an Position 6, obwohl es vor dem Ende der Kaltgare beginnt.
- **Dehnen & Falten als eigene Phasen im Array `phases`**: dann wäre die Hauptkette nicht mehr über Nachbarelemente prüfbar, und AC-3 verlangt Beginn und Ende der Stockgare unverändert. Die Durchgänge hängen deshalb als Liste an der Phase Stockgare.
- **Schlaf-Fenster als Text „23:00“**: bräuchte Parser und weitere Fehlermeldungen. Minuten seit Mitternacht (`23 * 60`) genügen für die Engine, die spätere UI kann umrechnen.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/lib/baking-engine/schedule.ts | neu | Typen, Standardwerte, Phasenbezeichnungen, Meldungskonstanten und `generateBackwardSchedule` |
| src/lib/baking-engine/schedule.test.ts | neu | Vitest-Unit-Tests für AC-1 bis AC-9 (`// @vitest-environment node`) |

Sonst bleiben alle Dateien unverändert. Keine neuen Abhängigkeiten, kein Schema, keine UI, keine Änderung an `vitest.config.mts`.

## Komponenten & Datenfluss
Keine Komponenten, kein State, keine API-Aufrufe, keine Lade- oder Fehlerzustände in der UI. Datenfluss: `targetDate` + `ScheduleConfig` → Standardwerte einsetzen → Validierung (wirft `Error`) → Hauptkette rückwärts → Vorheizen am Backbeginn → Dehnen & Falten ab Beginn der Stockgare → Schlaf-Warnungen für manuelle Schritte → `ScheduleTimeline`. Alle Dauern in Minuten, alle Zeitpunkte als neue `Date`-Objekte (absolute Zeitpunkte, keine Ortszeit-Strings). Die Eingabe `targetDate` wird nicht verändert und nicht als Referenz zurückgegeben.

### Öffentliche API von `src/lib/baking-engine/schedule.ts`
Gegen genau diese Namen und Werte schreibt der Test-Writer.
```ts
/** Phasen in fester Reihenfolge (so erscheinen sie im Plan). */
export const PHASE_IDS = [
  "levain",
  "mixAutolyse",
  "bulkFermentation",
  "shaping",
  "coldProof",
  "preheat",
  "bake",
  "cool",
] as const;
export type PhaseId = (typeof PHASE_IDS)[number];

/** Anzeigenamen. */
export const PHASE_LABELS = {
  levain: "Levain ansetzen",
  mixAutolyse: "Hauptteig mischen & Autolyse",
  bulkFermentation: "Stockgare",
  shaping: "Formgebung & Bench Rest",
  coldProof: "Stückgare / Kaltgare im Kühlschrank",
  preheat: "Ofen vorheizen",
  bake: "Backen",
  cool: "Auskühlen",
} as const satisfies Record<PhaseId, string>;

/** Dauern in Minuten. */
export type PhaseDurations = Record<PhaseId, number>;

export const DEFAULT_PHASE_DURATIONS = {
  levain: 300,
  mixAutolyse: 60,
  bulkFermentation: 270,
  shaping: 30,
  coldProof: 840,
  preheat: 60,
  bake: 45,
  cool: 120,
} as const satisfies PhaseDurations;

export interface StretchAndFoldConfig {
  /** Anzahl der Durchgänge, ganze Zahl ab 0. */
  count: number;
  /** Abstand in Minuten, > 0. Erster Durchgang ein Abstand nach Beginn der Stockgare. */
  intervalMinutes: number;
}
export const DEFAULT_STRETCH_AND_FOLD = { count: 4, intervalMinutes: 30 } as const satisfies StretchAndFoldConfig;

/**
 * Schlaf-Fenster in Minuten seit Mitternacht (Ortszeit der Zeitzone), Beginn einschließlich,
 * Ende ausschließlich. startMinute > endMinute = über Mitternacht; startMinute === endMinute = leer.
 */
export interface SleepWindow {
  startMinute: number;
  endMinute: number;
}
export const DEFAULT_SLEEP_WINDOW = { startMinute: 23 * 60, endMinute: 7 * 60 } as const satisfies SleepWindow;

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** Alles optional; was fehlt, nimmt den Standardwert (auch einzelne Felder der Unterobjekte). */
export interface ScheduleConfig {
  durations?: Partial<PhaseDurations>;
  stretchAndFold?: Partial<StretchAndFoldConfig>;
  sleepWindow?: Partial<SleepWindow>;
  /** IANA-Zeitzone, z. B. "America/New_York". */
  timeZone?: string;
}

export interface StretchAndFold {
  /** 1-basiert. */
  index: number;
  at: Date;
  manual: true;
  sleepWarning: boolean;
}

export interface SchedulePhase {
  id: PhaseId;
  label: string; // PHASE_LABELS[id]
  start: Date;
  end: Date;
  durationMinutes: number;
  /** true bei levain, mixAutolyse, shaping, preheat, bake. */
  manual: boolean;
  /** Nur bei manuellen Phasen möglich: Beginn liegt im Schlaf-Fenster. Passive Phasen immer false. */
  sleepWarning: boolean;
  /** Nur bei bulkFermentation befüllt, sonst []. */
  stretchAndFolds: StretchAndFold[];
}

export interface ScheduleTimeline {
  /** Zielzeitpunkt (Ende des Auskühlens), neue Date-Instanz. */
  target: Date;
  /** Beginn der Phase Backen (= target − cool − bake, auch wenn bake 0 ist). */
  bakeStart: Date;
  /** Beginn der ersten Phase in `phases`; ohne Phasen = target. */
  start: Date;
  /** Phasen mit Dauer > 0 in der Reihenfolge von PHASE_IDS. */
  phases: SchedulePhase[];
}

export const INVALID_TARGET_DATE_MESSAGE = "Der Zielzeitpunkt muss ein gültiges Datum sein.";
export const INVALID_PHASE_DURATION_MESSAGE = "Die Dauer einer Phase muss eine Zahl ab 0 sein.";
export const STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE =
  "Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.";
/** Nicht im Ticket vorgegeben, siehe Risiken. */
export const INVALID_STRETCH_AND_FOLD_MESSAGE =
  "Anzahl und Abstand der Dehnen-und-Falten-Durchgänge müssen gültige Zahlen sein.";

export function generateBackwardSchedule(targetDate: Date, config: ScheduleConfig): ScheduleTimeline;
```

### Ablauf in `generateBackwardSchedule`
1. **Zusammenführen**: `durations = { ...DEFAULT_PHASE_DURATIONS, ...config.durations }`, analog `stretchAndFold`, `sleepWindow`, `timeZone = config.timeZone ?? DEFAULT_TIME_ZONE`. Ein explizit übergebenes `undefined` in `durations` soll den Standardwert nehmen (beim Zusammenführen `undefined`-Werte überspringen, nicht den Spread blind übernehmen).
2. **Validierung** in fester Reihenfolge:
   - `!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())` → `INVALID_TARGET_DATE_MESSAGE`.
   - Je Phase in `PHASE_IDS`-Reihenfolge: `typeof d !== "number" || !Number.isFinite(d) || d < 0` → `INVALID_PHASE_DURATION_MESSAGE`. 0 ist gültig, Nachkommastellen auch.
   - `count` keine ganze Zahl ≥ 0 (`!Number.isInteger(count) || count < 0`) oder `intervalMinutes` nicht endlich bzw. ≤ 0 → `INVALID_STRETCH_AND_FOLD_MESSAGE`.
   - `count > 0 && count * intervalMinutes >= durations.bulkFermentation` → `STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE`. Der letzte Durchgang muss also echt vor dem Ende der Stockgare liegen. Bei `count === 0` gibt es keine Prüfung, auch nicht bei Stockgare 0.
   - `sleepWindow` und `timeZone` werden nicht geprüft (siehe Risiken).
3. **Hauptkette rückwärts**: `cursor = targetDate.getTime()`; für `cool, bake, coldProof, shaping, bulkFermentation, mixAutolyse, levain`: `end = cursor`, `start = cursor − d × 60_000`, `cursor = start`. Phasen mit Dauer 0 bekommen dabei `start === end` und schieben den Cursor nicht, die Kette schließt sich darüber.
4. **Backbeginn** = Start von `bake` aus Schritt 3. **Vorheizen**: `end = bakeStart`, `start = bakeStart − preheat × 60_000`. Keine Prüfung auf Überschneidung, keine Warnung dafür.
5. **Dehnen & Falten** (nur wenn `bulkFermentation > 0`): `at_i = bulkStart + i × intervalMinutes × 60_000` für `i = 1 … count`.
6. **Schlaf-Warnung**: interner Helfer `localMinuteOfDay(date, timeZone)` mit `Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts`, Formatter je Zeitzone in einer `Map` gecacht (Muster aus `src/lib/calculator/format.ts`). Helfer `isInSleepWindow(minute, window)`: bei `start < end` gilt `start <= m < end`, bei `start > end` gilt `m >= start || m < end`, bei Gleichheit `false`. Manuelle Phasen und jeder Durchgang prüfen ihren Beginn, passive Phasen (`bulkFermentation`, `coldProof`, `cool`) bekommen immer `false`.
7. **Zusammenbau** in `PHASE_IDS`-Reihenfolge, Phasen mit Dauer 0 weglassen. `start = phases[0]?.start ?? target`. Alle `Date`-Werte neu erzeugt.

Interne Helfer (nicht exportiert): `MS_PER_MINUTE`, `MANUAL_PHASES` (Set), `resolveConfig`, `localMinuteOfDay`, `isInSleepWindow`. JSDoc am Modulkopf: Zielzeitpunkt = essfertig, Dauern in Minuten echter Zeit, Ortszeit nur für das Schlaf-Fenster.

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Tests vorab (Test-Writer): `src/lib/baking-engine/schedule.test.ts` mit `// @vitest-environment node` und Helfern anlegen: `at(iso: string): Date` (ISO mit festem Offset, z. B. `"2026-10-11T12:00:00+02:00"`), `phase(timeline, id)`, `mainChain(timeline)` (alle Phasen außer `preheat`), `warnedSteps(timeline)` (Liste aus Phasen-IDs und `"stretchAndFold#n"` mit `sleepWarning === true`), `expectThrowMessage(fn, message)` (Muster aus `ddt.test.ts`) (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9)
2. Tests vorab: `describe`-Blöcke `F012/AC-1` bis `F012/AC-9` mit den Fällen aus der Teststrategie, plus Literaltext-Prüfung der drei Ticket-Meldungen und Prüfung von `DEFAULT_PHASE_DURATIONS`, `DEFAULT_STRETCH_AND_FOLD`, `DEFAULT_SLEEP_WINDOW`, `DEFAULT_TIME_ZONE` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9)
3. `schedule.ts`: Typen, `PHASE_IDS`, `PHASE_LABELS`, alle `DEFAULT_*`-Konstanten und Meldungskonstanten exportieren (AC-1, AC-9)
4. `schedule.ts`: `resolveConfig` (Standardwerte, `undefined` überspringen) und Validierung in fester Reihenfolge (AC-1, AC-9)
5. `schedule.ts`: Hauptkette rückwärts, Phasen mit Dauer 0 auslassen, Backbeginn und Startzeitpunkt (AC-1, AC-2, AC-4)
6. `schedule.ts`: Vorheizen am Backbeginn, unabhängig von der Kaltgare (AC-1, AC-4)
7. `schedule.ts`: Dehnen-&-Falten-Durchgänge an der Stockgare (AC-3)
8. `schedule.ts`: `localMinuteOfDay` mit gecachtem `Intl.DateTimeFormat` und `isInSleepWindow` inkl. Fenster über Mitternacht, Warnung nur für manuelle Schritte (AC-5, AC-6, AC-7, AC-8)
9. Prüfen: `npx vitest run src/lib/baking-engine` grün (inkl. unveränderter F007 bis F011-Tests), `npx tsc --noEmit` ohne Fehler, `npx eslint src/lib/baking-engine` ohne Meldungen, volle Suite `npx vitest run` grün, `git status` zeigt nur die zwei neuen Dateien (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9)

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle Tests liegen in `src/lib/baking-engine/schedule.test.ts` (Vitest, `// @vitest-environment node`) und importieren aus `@/lib/baking-engine/schedule`. Testnamen beginnen mit `F012/AC-n …`. Zeitpunkte werden **nur** über ISO-Strings mit festem Offset gebaut (`+02:00` für Oktober bis zum 24.10., `+01:00` ab der Umstellung am 25.10. 03:00 Uhr), nie über `new Date(jahr, monat, …)`. Damit ist das Ergebnis unabhängig von der Zeitzone des Rechners. Vergleiche über `toISOString()` bzw. `getTime()`, Phasenreihenfolge über `phases.map(p => p.id)`. „Genau diese Schritte warnen“ wird über `warnedSteps(timeline)` mit `toEqual([...])` geprüft, damit auch Durchgänge erfasst werden. Fehler werden über `expectThrowMessage` exakt verglichen.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel So 11.10.2026 12:00 (`+02:00`) mit `{}`: `phases.map(id)` = `PHASE_IDS` (8 Phasen, feste Reihenfolge), Beginn/Ende jeder Phase wie im Ticket (Levain Sa 08:15–13:15 … Auskühlen So 10:00–12:00, Vorheizen So 08:15–09:15). Hauptkette lückenlos: `mainChain[i].end === mainChain[i+1].start`, letzte endet bei `target`. `warnedSteps` = `[]`. `label` je Phase = `PHASE_LABELS[id]`, `durationMinutes` = Standarddauer. Aufruf mit `{ durations: {} }` und mit allen Standarddauern explizit ergibt `toEqual` dasselbe Ergebnis. `target` ist eine neue Instanz (`not.toBe(input)`), der Eingabewert ist unverändert. `DEFAULT_PHASE_DURATIONS` hat die Werte 300/60/270/30/840/60/45/120. |
| AC-2 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel 12:00 → `bakeStart` So 09:15, `start` Sa 08:15. Ziel So 08:30 → `bakeStart` So 05:45, `start` Sa 04:45. Jeweils `bakeStart` gleich `phase("bake").start` und `start` gleich `phases[0].start`. |
| AC-3 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel 12:00: `phase("bulkFermentation").stretchAndFolds` hat 4 Einträge, `index` 1–4, `at` Sa 14:45/15:15/15:45/16:15, jeweils `manual: true`, `sleepWarning: false`. Alle anderen Phasen haben `stretchAndFolds: []`. Mit `stretchAndFold: { count: 3, intervalMinutes: 45 }`: Durchgänge 15:00/15:45/16:30, Beginn und Ende aller Phasen identisch zum Standardplan. Nur `count: 2` überschrieben → Abstand bleibt 30 (14:45, 15:15). `DEFAULT_STRETCH_AND_FOLD` = `{ count: 4, intervalMinutes: 30 }`. |
| AC-4 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel So 22:00, `durations: { coldProof: 30 }`: alle 8 Phasen mit den Zeiten aus dem Ticket (Levain So 07:45–12:45 … Kaltgare 18:45–19:15, Vorheizen 18:15–19:15). `durations: { coldProof: 0 }`: `phases.map(id)` ohne `coldProof` (7 Phasen), Zeiten wie im Ticket (Levain 08:15–13:15, Formgebung 18:45–19:15, Vorheizen 18:15–19:15). In beiden Fällen `bakeStart` So 19:15, Hauptkette lückenlos (Formgebung endet beim Backbeginn im 0-Min.-Fall), `warnedSteps` = `[]`. |
| AC-5 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel So 08:30: alle Phasen und Durchgänge (11:15, 11:45, 12:15, 12:45) wie im Ticket. `warnedSteps` = `["levain", "preheat", "bake"]`. `phase("coldProof").sleepWarning` und `phase("cool").sleepWarning` sind `false`, `manual` bei beiden `false`. `manual` ist `true` genau bei levain, mixAutolyse, shaping, preheat, bake. |
| AC-6 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel 16:15 → `phase("shaping").start` Sa 23:00, `warnedSteps` = `["shaping"]`. 16:14 → Sa 22:59, `[]`. 10:45 → Levain Sa 07:00, Vorheizen So 07:00, `[]`. 10:44 → beide 06:59, `["levain", "preheat"]`. `DEFAULT_SLEEP_WINDOW` = `{ startMinute: 1380, endMinute: 420 }`. |
| AC-7 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel `2026-10-11T10:00:00Z`. Mit `sleepWindow: { startMinute: 0, endMinute: 540 }`: alle Zeitpunkte identisch zu AC-1 (`toISOString`-Vergleich je Phase), `warnedSteps` = `["levain", "preheat"]`. Mit `timeZone: "America/New_York"`: Zeitpunkte identisch zu AC-1, `warnedSteps` = `["levain", "preheat", "bake"]` (Sa 02:15, So 02:15, So 03:15 New Yorker Zeit). `DEFAULT_TIME_ZONE` = `"Europe/Berlin"`. |
| AC-8 | Unit | src/lib/baking-engine/schedule.test.ts | Ziel `2026-10-25T12:00:00+01:00`: Levain `2026-10-24T09:15:00+02:00`–14:15, Mischen 14:15–15:15, Stockgare 15:15–19:45 (Durchgänge 15:45/16:15/16:45/17:15 `+02:00`), Formgebung 19:45–20:15, Kaltgare `2026-10-24T20:15:00+02:00` bis `2026-10-25T09:15:00+01:00` (Differenz `getTime()` = 14 × 3 600 000), Vorheizen 08:15–09:15 `+01:00`, Backen 09:15–10:00, Auskühlen 10:00–12:00. `start` Sa 09:15 `+02:00`, `warnedSteps` = `[]`. Ziel 10:45 `+01:00` → Vorheizen `2026-10-25T07:00:00+01:00`, `[]`. Ziel 10:44 → 06:59 `+01:00`, `["preheat"]`. |
| AC-9 | Unit | src/lib/baking-engine/schedule.test.ts | `new Date("kein Datum")`, `new Date(NaN)` und `"2026-10-11" as unknown as Date` → „Der Zielzeitpunkt muss ein gültiges Datum sein.“. `it.each` über alle 8 `PHASE_IDS` × `[-1, -0.5, NaN, Infinity, -Infinity]` → „Die Dauer einer Phase muss eine Zahl ab 0 sein.“. `stretchAndFold: { count: 10, intervalMinutes: 30 }` und `{ count: 9, intervalMinutes: 30 }` (letzter Durchgang genau am Ende) → „Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.“; `{ count: 8 }` wirft nicht. `count: 1` bei `durations: { bulkFermentation: 0 }` → gleiche Meldung. `count` −1, 1,5, NaN bzw. `intervalMinutes` 0, −30, NaN → `INVALID_STRETCH_AND_FOLD_MESSAGE` (Literaltext aus dem Plan). Jeder dieser Aufrufe liefert kein Ergebnis (`expectThrowMessage`). Literaltexte der drei Ticket-Meldungskonstanten werden exakt geprüft. |

## Risiken & Rollback
- **Erfundene Meldung für ungültige Anzahl/Abstand der Durchgänge**: Das Ticket nennt nur drei Meldungen. Ohne Prüfung würden `count: 1.5` oder `intervalMinutes: NaN` stillschweigend ungültige `Date`-Werte liefern. Der Plan ergänzt deshalb `INVALID_STRETCH_AND_FOLD_MESSAGE` (Muster aus F009, dort ebenfalls ergänzte Texte). Wird dem Hauptagenten gemeldet. Soll stattdessen die „passen nicht“-Meldung gelten, ändern sich eine Konstante und die zugehörigen Testfälle.
- **Auslegung „enden nicht vor dem Ende der Stockgare“**: Ein Durchgang genau am Ende der Stockgare (9 × 30 Min. bei 270 Min.) gilt als Fehler (`>=`). Das ist die wörtliche Lesart, wird aber gemeldet.
- **Schlaf-Fenster und Zeitzone ungeprüft**: AC-9 verlangt keine Prüfung. Eine unbekannte Zeitzone führt zu einem `RangeError` von `Intl` mit englischer Meldung. Unsinnige Minutenwerte im Schlaf-Fenster (z. B. NaN) führen zu „keine Warnung“. Eine spätere UI liefert nur gültige Werte. Bei Bedarf als Folgeticket.
- **Abhängigkeit von ICU-Zeitzonendaten**: Node 24 und alle aktuellen Browser haben volles ICU. Auf einer Laufzeit mit „small-icu“ wäre `America/New_York` nicht verfügbar und AC-7 würde scheitern. Für dieses Projekt nicht relevant, vorab mit Node v24.18.0 geprüft.
- **Feste Bezeichner werden öffentliche API**: `PhaseId`-Werte und Feldnamen (`stretchAndFolds`, `sleepWarning`, `bakeStart`, `start`) wird das Schema-Folgeticket speichern. Eine spätere Umbenennung wäre dann eine Datenmigration.
- **`start` bei entfallenen frühen Phasen**: Entfallen Levain bis Kaltgare, ist `phases[0]` das Vorheizen. Das ist dann auch der früheste Beginn, die Definition bleibt also stimmig. Durch keine AC abgedeckt, nur dokumentiert.
- **Keine Breaking Changes**: zwei neue Dateien, bestehender Code unberührt. Rollback: F012-Commit reverten bzw. `src/lib/baking-engine/schedule.ts` und `schedule.test.ts` löschen.

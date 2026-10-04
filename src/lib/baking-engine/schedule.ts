/**
 * Rechen-Engine für den adaptiven Rückwärts-Planer.
 *
 * Der Zielzeitpunkt ist das Ende des Auskühlens (das Brot ist essfertig). Von dort aus wird die
 * Hauptkette (alle Phasen außer dem Vorheizen) lückenlos rückwärts gerechnet. Das Vorheizen endet
 * genau beim Backbeginn und läuft parallel zur Kaltgare.
 *
 * Alle Dauern sind Minuten echter verstrichener Zeit, auch über eine Zeitumstellung hinweg.
 * Die Ortszeit (über die übergebene Zeitzone) wird nur für die Schlaf-Warnung ausgewertet:
 * Ein manueller Schritt warnt, wenn sein Beginn im Schlaf-Fenster liegt.
 *
 * Alle Eingaben werden vor jeder Berechnung in fester Reihenfolge geprüft (Zielzeitpunkt, Dauern,
 * Anzahl und Abstand der Durchgänge, Obergrenze, Durchgänge passen in die Stockgare,
 * Schlaf-Fenster, Zeitzone); die erste ungültige Angabe wirft eine feste deutsche Meldung.
 * Der Startzeitpunkt des Plans ist der früheste Beginn aller Phasen.
 */

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
  /** Anzahl der Durchgänge, ganze Zahl ab 0, höchstens MAX_STRETCH_AND_FOLD_COUNT. */
  count: number;
  /** Abstand in Minuten, > 0. Erster Durchgang ein Abstand nach Beginn der Stockgare. */
  intervalMinutes: number;
}
export const DEFAULT_STRETCH_AND_FOLD = {
  count: 4,
  intervalMinutes: 30,
} as const satisfies StretchAndFoldConfig;

/** Höchstzahl der Dehnen-&-Falten-Durchgänge. */
export const MAX_STRETCH_AND_FOLD_COUNT = 20;

/**
 * Schlaf-Fenster in Minuten seit Mitternacht (Ortszeit der Zeitzone), Beginn einschließlich,
 * Ende ausschließlich. startMinute > endMinute = über Mitternacht; startMinute === endMinute = leer.
 * Beide Werte sind ganze Minuten von 0 bis 1439.
 */
export interface SleepWindow {
  startMinute: number;
  endMinute: number;
}
export const DEFAULT_SLEEP_WINDOW = {
  startMinute: 23 * 60,
  endMinute: 7 * 60,
} as const satisfies SleepWindow;

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** Alles optional; was fehlt, nimmt den Standardwert (auch einzelne Felder der Unterobjekte). */
export interface ScheduleConfig {
  durations?: Partial<PhaseDurations>;
  stretchAndFold?: Partial<StretchAndFoldConfig>;
  sleepWindow?: Partial<SleepWindow>;
  /**
   * Zeitzone, z. B. "America/New_York". Gültig ist jede Zeitzone, die die Laufzeit (`Intl`)
   * akzeptiert; nur `undefined` nimmt den Standard DEFAULT_TIME_ZONE.
   */
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
  /** PHASE_LABELS[id] */
  label: string;
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
  /** Frühester Beginn aller Phasen in `phases` (auch des Vorheizens); ohne Phasen = target. */
  start: Date;
  /** Phasen mit Dauer > 0 in der Reihenfolge von PHASE_IDS. */
  phases: SchedulePhase[];
}

export const INVALID_TARGET_DATE_MESSAGE = "Der Zielzeitpunkt muss ein gültiges Datum sein.";
export const INVALID_PHASE_DURATION_MESSAGE = "Die Dauer einer Phase muss eine Zahl ab 0 sein.";
export const STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE =
  "Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.";
/** Nicht im Ticket vorgegeben: ungültige Anzahl oder ungültiger Abstand der Durchgänge. */
export const INVALID_STRETCH_AND_FOLD_MESSAGE =
  "Anzahl und Abstand der Dehnen-und-Falten-Durchgänge müssen gültige Zahlen sein.";
export const TOO_MANY_STRETCH_AND_FOLDS_MESSAGE =
  "Es sind höchstens 20 Dehnen-und-Falten-Durchgänge möglich.";
export const INVALID_SLEEP_WINDOW_MESSAGE =
  "Das Schlaf-Fenster muss aus ganzen Minuten zwischen 0 und 1439 bestehen.";
export const INVALID_TIME_ZONE_MESSAGE = "Die Zeitzone ist ungültig.";

const MS_PER_MINUTE = 60_000;

const MANUAL_PHASES: ReadonlySet<PhaseId> = new Set<PhaseId>([
  "levain",
  "mixAutolyse",
  "shaping",
  "preheat",
  "bake",
]);

/** Hauptkette vom Zielzeitpunkt aus rückwärts (ohne Vorheizen). */
const MAIN_CHAIN_BACKWARDS = [
  "cool",
  "bake",
  "coldProof",
  "shaping",
  "bulkFermentation",
  "mixAutolyse",
  "levain",
] as const satisfies readonly Exclude<PhaseId, "preheat">[];

interface ResolvedConfig {
  durations: PhaseDurations;
  stretchAndFold: StretchAndFoldConfig;
  sleepWindow: SleepWindow;
  timeZone: string;
}

/** Überschreibt `defaults` mit allen Werten aus `overrides`, die nicht `undefined` sind. */
function mergeDefined<T extends object>(defaults: T, overrides: Partial<T> | undefined): T {
  const result: T = { ...defaults };
  if (!overrides) return result;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = overrides[key];
    if (value !== undefined) {
      result[key] = value as T[keyof T];
    }
  }
  return result;
}

function resolveConfig(config: ScheduleConfig): ResolvedConfig {
  return {
    durations: mergeDefined<PhaseDurations>(DEFAULT_PHASE_DURATIONS, config.durations),
    stretchAndFold: mergeDefined<StretchAndFoldConfig>(
      DEFAULT_STRETCH_AND_FOLD,
      config.stretchAndFold,
    ),
    sleepWindow: mergeDefined<SleepWindow>(DEFAULT_SLEEP_WINDOW, config.sleepWindow),
    timeZone: config.timeZone === undefined ? DEFAULT_TIME_ZONE : config.timeZone,
  };
}

/** Prüft die Eingaben in fester Reihenfolge und wirft bei der ersten ungültigen Angabe. */
function validate(targetDate: Date, resolved: ResolvedConfig): void {
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
    throw new Error(INVALID_TARGET_DATE_MESSAGE);
  }

  for (const id of PHASE_IDS) {
    const duration = resolved.durations[id];
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
      throw new Error(INVALID_PHASE_DURATION_MESSAGE);
    }
  }

  const { count, intervalMinutes } = resolved.stretchAndFold;
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    typeof intervalMinutes !== "number" ||
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes <= 0
  ) {
    throw new Error(INVALID_STRETCH_AND_FOLD_MESSAGE);
  }

  if (count > MAX_STRETCH_AND_FOLD_COUNT) {
    throw new Error(TOO_MANY_STRETCH_AND_FOLDS_MESSAGE);
  }

  // Der letzte Durchgang muss echt vor dem Ende der Stockgare liegen.
  if (count > 0 && count * intervalMinutes >= resolved.durations.bulkFermentation) {
    throw new Error(STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE);
  }

  const { startMinute, endMinute } = resolved.sleepWindow;
  if (!isValidMinuteOfDay(startMinute) || !isValidMinuteOfDay(endMinute)) {
    throw new Error(INVALID_SLEEP_WINDOW_MESSAGE);
  }

  const { timeZone } = resolved;
  if (typeof timeZone !== "string") {
    throw new Error(INVALID_TIME_ZONE_MESSAGE);
  }
  try {
    // Erzeugt (und cacht) den Formatter; Intl wirft bei unbekannter Zeitzone einen RangeError.
    timeFormatter(timeZone);
  } catch {
    throw new Error(INVALID_TIME_ZONE_MESSAGE);
  }
}

/** Ganze Minute des Tages von 0 bis 1439. */
function isValidMinuteOfDay(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1439;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let cached = timeFormatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    timeFormatters.set(timeZone, cached);
  }
  return cached;
}

/** Minute des Tages (0–1439) in der Ortszeit von `timeZone`. */
function localMinuteOfDay(date: Date, timeZone: string): number {
  let hour = 0;
  let minute = 0;
  for (const part of timeFormatter(timeZone).formatToParts(date)) {
    if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "minute") minute = Number(part.value);
  }
  return hour * 60 + minute;
}

/** Beginn einschließlich, Ende ausschließlich; Fenster über Mitternacht möglich; gleich = leer. */
function isInSleepWindow(minute: number, window: SleepWindow): boolean {
  const { startMinute, endMinute } = window;
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
  if (startMinute > endMinute) return minute >= startMinute || minute < endMinute;
  return false;
}

interface PhaseInterval {
  start: number;
  end: number;
}

/**
 * Erzeugt einen Ablaufplan rückwärts vom Zielzeitpunkt (Ende des Auskühlens).
 * Die Hauptkette ist lückenlos, Phasen mit Dauer 0 entfallen. Manuelle Schritte, deren Beginn
 * im Schlaf-Fenster liegt, tragen eine Schlaf-Warnung. Wirft bei ungültigen Eingaben.
 * Konfiguration optional; ohne zweites Argument gilt dasselbe wie mit `{}`.
 */
export function generateBackwardSchedule(
  targetDate: Date,
  config: ScheduleConfig = {},
): ScheduleTimeline {
  const resolved = resolveConfig(config);
  validate(targetDate, resolved);

  const { durations, stretchAndFold, sleepWindow, timeZone } = resolved;
  const targetMs = targetDate.getTime();

  const intervals = {} as Record<PhaseId, PhaseInterval>;
  let cursor = targetMs;
  for (const id of MAIN_CHAIN_BACKWARDS) {
    const start = cursor - durations[id] * MS_PER_MINUTE;
    intervals[id] = { start, end: cursor };
    cursor = start;
  }

  const bakeStartMs = intervals.bake.start;
  intervals.preheat = {
    start: bakeStartMs - durations.preheat * MS_PER_MINUTE,
    end: bakeStartMs,
  };

  const warns = (ms: number): boolean =>
    isInSleepWindow(localMinuteOfDay(new Date(ms), timeZone), sleepWindow);

  const phases: SchedulePhase[] = [];
  for (const id of PHASE_IDS) {
    const duration = durations[id];
    if (duration === 0) continue;

    const { start, end } = intervals[id];
    const manual = MANUAL_PHASES.has(id);

    const stretchAndFolds: StretchAndFold[] = [];
    if (id === "bulkFermentation") {
      for (let index = 1; index <= stretchAndFold.count; index++) {
        const atMs = start + index * stretchAndFold.intervalMinutes * MS_PER_MINUTE;
        stretchAndFolds.push({
          index,
          at: new Date(atMs),
          manual: true,
          sleepWarning: warns(atMs),
        });
      }
    }

    phases.push({
      id,
      label: PHASE_LABELS[id],
      start: new Date(start),
      end: new Date(end),
      durationMinutes: duration,
      manual,
      sleepWarning: manual && warns(start),
      stretchAndFolds,
    });
  }

  return {
    target: new Date(targetMs),
    bakeStart: new Date(bakeStartMs),
    start: new Date(phases.reduce((min, p) => Math.min(min, p.start.getTime()), targetMs)),
    phases,
  };
}

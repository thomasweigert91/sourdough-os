/**
 * Live-Rekalibrierung eines Ablaufplans aus `generateBackwardSchedule`.
 *
 * Wird ein Schritt früher oder später erledigt als geplant, werden alle Phasen danach per
 * Vorwärtskette ab dem Abschlusszeitpunkt neu gelegt: Phasen vor der Kaltgare mit ihrer bisherigen
 * Dauer, die Kaltgare nach Strategie (Kompensation innerhalb der Mindest-/Max-Kaltgare oder
 * einfache Verschiebung), danach Backen und Auskühlen mit bisheriger Dauer. Das Vorheizen endet wie
 * im Planer beim Backbeginn. Nach jeder Neuberechnung werden Schlaf- und Konfliktwarnungen neu
 * bestimmt.
 *
 * Alle Funktionen sind rein: Der Eingabeplan wird nie verändert, ungültige Eingaben werfen einen
 * `Error` mit fester deutscher Meldung. Alle Zeiten werden in Millisekunden echter Zeit gerechnet.
 */

import {
  DEFAULT_SLEEP_WINDOW,
  DEFAULT_TIME_ZONE,
  INVALID_SLEEP_WINDOW_MESSAGE,
  INVALID_TIME_ZONE_MESSAGE,
  isInSleepWindow,
  isValidMinuteOfDay,
  localMinuteOfDay,
  MANUAL_PHASES,
  mergeDefined,
  MS_PER_MINUTE,
  PHASE_LABELS,
  timeFormatter,
  type PhaseId,
  type ScheduleConfig,
  type SchedulePhase,
  type ScheduleTimeline,
  type SleepWindow,
  type StretchAndFold,
} from "./schedule";

export const DEFAULT_MIN_COLD_PROOF_MINUTES = 480;
export const DEFAULT_MAX_COLD_PROOF_MINUTES = 2880;
/** Fester Gärungsfaktor der Kühlschrank-Notbremse. */
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

export const STEP_NOT_FOUND_MESSAGE = "Der Schritt ist im Plan nicht vorhanden.";
export const INVALID_COMPLETED_AT_MESSAGE = "Der Abschlusszeitpunkt muss ein gültiges Datum sein.";
export const STEP_ALREADY_COMPLETED_MESSAGE = "Der Schritt ist bereits erledigt.";
export const COLD_PROOF_LIMITS_ORDER_MESSAGE =
  "Die Mindest-Kaltgare darf nicht länger als die Max-Kaltgare sein.";
/** Nicht im Ticket vorgegeben. */
export const INVALID_COLD_PROOF_LIMIT_MESSAGE = "Mindest- und Max-Kaltgare müssen Zahlen ab 0 sein.";
/** Nicht im Ticket vorgegeben. */
export const INVALID_PARKING_TIME_MESSAGE =
  "Parken und Herausnehmen müssen gültige Zeitpunkte sein, Herausnehmen nach dem Parken.";
/** Nicht im Ticket vorgegeben. */
export const PARKING_ONLY_DURING_BULK_MESSAGE =
  "Der Teig kann nur während der Stockgare geparkt werden.";
/** Nicht im Ticket vorgegeben. */
export const SUGGESTION_NOT_APPLICABLE_MESSAGE = "Der Lösungsvorschlag passt nicht zum Plan.";
/** Nicht im Ticket vorgegeben (Review F014 Runde 1, Befund 6). */
export const INVALID_STRATEGY_MESSAGE = "Die Strategie ist nicht bekannt.";
/** Nicht im Ticket vorgegeben (Review F014 Runde 1, Befund 3). */
export const COMPLETED_BEFORE_STEP_START_MESSAGE =
  "Der Abschlusszeitpunkt darf nicht vor dem Beginn des Schritts liegen.";

const STRETCH_AND_FOLD_STEP_PREFIX = "stretchAndFold#";
const STRETCH_AND_FOLD_STEP_PATTERN = /^stretchAndFold#([1-9]\d*)$/;

/** Schritt-ID eines Durchgangs, z. B. "stretchAndFold#3" (1-basiert). Phasen nutzen ihre PhaseId. */
export function stretchAndFoldStepId(index: number): string {
  return `${STRETCH_AND_FOLD_STEP_PREFIX}${index}`;
}

/** Planer-Konfiguration plus Rekalibrierung. `durations`/`stretchAndFold` werden ignoriert. */
export interface RecalibrationOptions extends ScheduleConfig {
  /** Standard "compensate". */
  strategy?: RecalibrationStrategy;
  /** Standard 480. */
  minColdProofMinutes?: number;
  /** Standard 2880. */
  maxColdProofMinutes?: number;
}

export interface RecalibratedStretchAndFold extends StretchAndFold {
  completed: boolean;
}

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
  /** Parken. */
  start: Date;
  /** Herausnehmen. */
  end: Date;
  /** (end − start) × FRIDGE_FERMENTATION_FACTOR in Minuten. */
  creditedBulkMinutes: number;
  /** Restliche Stockgare nach dem Herausnehmen in Minuten. */
  remainingBulkMinutes: number;
}

export interface ColdProofExtensionSuggestion {
  label: typeof EXTEND_COLD_PROOF_SUGGESTION_LABEL;
  coldProofMinutes: number;
  bakeStart: Date;
  target: Date;
}

export interface ConflictWarning {
  stepId: "preheat" | "bake";
  /** PHASE_LABELS[stepId] */
  label: string;
  start: Date;
  /** `${label} beginnt im Schlaf-Fenster.` */
  message: string;
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
  /** Neuer minus alter Zielzeitpunkt in Minuten. */
  targetShiftMinutes: number;
  /** Abweichung Δt des erledigten Schritts in Minuten (bei Parken/Vorschlag 0). */
  deviationMinutes: number;
  /** true, wenn die Phase „preheat“ im neuen Plan `startImmediately` trägt. */
  preheatStartImmediately: boolean;
}

// ---------------------------------------------------------------------------
// Interne Typen und Helfer
// ---------------------------------------------------------------------------

type MainChainPhaseId = Exclude<PhaseId, "preheat">;

/** Hauptkette (ohne Vorheizen) in zeitlicher Reihenfolge. */
const MAIN_CHAIN = [
  "levain",
  "mixAutolyse",
  "bulkFermentation",
  "shaping",
  "coldProof",
  "bake",
  "cool",
] as const satisfies readonly MainChainPhaseId[];

interface ResolvedOptions {
  strategy: RecalibrationStrategy;
  minColdProofMs: number;
  maxColdProofMs: number;
  sleepWindow: SleepWindow;
  timeZone: string;
}

interface RawOptions {
  strategy: RecalibrationStrategy;
  minColdProofMinutes: number;
  maxColdProofMinutes: number;
  sleepWindow: SleepWindow;
  timeZone: string;
}

function resolveOptions(options: RecalibrationOptions): RawOptions {
  return {
    strategy: options.strategy === undefined ? DEFAULT_RECALIBRATION_STRATEGY : options.strategy,
    minColdProofMinutes:
      options.minColdProofMinutes === undefined
        ? DEFAULT_MIN_COLD_PROOF_MINUTES
        : options.minColdProofMinutes,
    maxColdProofMinutes:
      options.maxColdProofMinutes === undefined
        ? DEFAULT_MAX_COLD_PROOF_MINUTES
        : options.maxColdProofMinutes,
    sleepWindow: mergeDefined<SleepWindow>(DEFAULT_SLEEP_WINDOW, options.sleepWindow),
    timeZone: options.timeZone === undefined ? DEFAULT_TIME_ZONE : options.timeZone,
  };
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Prüft Mindest- und Max-Kaltgare (Zahlen ab 0, Mindest ≤ Max). */
function validateColdProofLimits(raw: RawOptions): void {
  const { minColdProofMinutes, maxColdProofMinutes } = raw;
  if (!isNonNegativeNumber(minColdProofMinutes) || !isNonNegativeNumber(maxColdProofMinutes)) {
    throw new Error(INVALID_COLD_PROOF_LIMIT_MESSAGE);
  }
  if (minColdProofMinutes > maxColdProofMinutes) {
    throw new Error(COLD_PROOF_LIMITS_ORDER_MESSAGE);
  }
}

function isRecalibrationStrategy(value: unknown): value is RecalibrationStrategy {
  return RECALIBRATION_STRATEGIES.some((strategy) => strategy === value);
}

/** Prüft Min/Max-Kaltgare, Strategie, Schlaf-Fenster und Zeitzone in dieser Reihenfolge. */
function validateOptions(raw: RawOptions): ResolvedOptions {
  validateColdProofLimits(raw);
  if (!isRecalibrationStrategy(raw.strategy)) {
    throw new Error(INVALID_STRATEGY_MESSAGE);
  }
  return {
    strategy: raw.strategy,
    minColdProofMs: raw.minColdProofMinutes * MS_PER_MINUTE,
    maxColdProofMs: raw.maxColdProofMinutes * MS_PER_MINUTE,
    ...validateSleepAndTimeZone(raw.sleepWindow, raw.timeZone),
  };
}

function validateSleepAndTimeZone(
  sleepWindow: SleepWindow,
  timeZone: string,
): { sleepWindow: SleepWindow; timeZone: string } {
  if (!isValidMinuteOfDay(sleepWindow.startMinute) || !isValidMinuteOfDay(sleepWindow.endMinute)) {
    throw new Error(INVALID_SLEEP_WINDOW_MESSAGE);
  }
  if (typeof timeZone !== "string") {
    throw new Error(INVALID_TIME_ZONE_MESSAGE);
  }
  try {
    timeFormatter(timeZone);
  } catch {
    throw new Error(INVALID_TIME_ZONE_MESSAGE);
  }
  return { sleepWindow, timeZone };
}

type AnyTimeline = ScheduleTimeline | RecalibratedTimeline;
type AnyPhase = AnyTimeline["phases"][number];

function isPhaseCompleted(phase: AnyPhase): boolean {
  return "completed" in phase ? phase.completed : false;
}

/** Tiefe Kopie mit neuen Date-Instanzen; fehlender Status wird ergänzt. */
function normalize(timeline: AnyTimeline): RecalibratedTimeline {
  const phases: RecalibratedPhase[] = timeline.phases.map((p) => ({
    id: p.id,
    label: p.label,
    start: new Date(p.start.getTime()),
    end: new Date(p.end.getTime()),
    durationMinutes: p.durationMinutes,
    manual: p.manual,
    sleepWarning: p.sleepWarning,
    completed: isPhaseCompleted(p),
    startImmediately: false,
    stretchAndFolds: p.stretchAndFolds.map((sf) => ({
      index: sf.index,
      at: new Date(sf.at.getTime()),
      manual: sf.manual,
      sleepWarning: sf.sleepWarning,
      completed: "completed" in sf && sf.completed === true,
    })),
  }));

  let interval: number | null;
  if ("stretchAndFoldIntervalMinutes" in timeline) {
    interval = timeline.stretchAndFoldIntervalMinutes;
  } else {
    const bulk = phases.find((p) => p.id === "bulkFermentation");
    const first = bulk?.stretchAndFolds[0];
    interval =
      bulk && first ? (first.at.getTime() - bulk.start.getTime()) / MS_PER_MINUTE : null;
  }

  const recalibrated = "fridgeParkings" in timeline ? timeline : null;
  return {
    target: new Date(timeline.target.getTime()),
    bakeStart: new Date(timeline.bakeStart.getTime()),
    start: new Date(timeline.start.getTime()),
    phases,
    fridgeParkings: (recalibrated?.fridgeParkings ?? []).map((fp) => ({
      label: fp.label,
      start: new Date(fp.start.getTime()),
      end: new Date(fp.end.getTime()),
      creditedBulkMinutes: fp.creditedBulkMinutes,
      remainingBulkMinutes: fp.remainingBulkMinutes,
    })),
    conflicts: [],
    stretchAndFoldIntervalMinutes: interval,
  };
}

function findPhase(tl: RecalibratedTimeline, id: PhaseId): RecalibratedPhase | undefined {
  return tl.phases.find((p) => p.id === id);
}

function setEnd(phase: RecalibratedPhase, endMs: number): void {
  phase.end = new Date(endMs);
  phase.durationMinutes = (endMs - phase.start.getTime()) / MS_PER_MINUTE;
}

function moveTo(phase: RecalibratedPhase, startMs: number, durationMs: number): void {
  const offset = startMs - phase.start.getTime();
  phase.start = new Date(startMs);
  phase.end = new Date(startMs + durationMs);
  phase.durationMinutes = durationMs / MS_PER_MINUTE;
  if (offset !== 0) {
    for (const sf of phase.stretchAndFolds) {
      if (!sf.completed) sf.at = new Date(sf.at.getTime() + offset);
    }
  }
}

/** Neue Kaltgare-Dauer nach Strategie; `deviationMs` = neuer minus alter Kaltgare-Beginn. */
function coldProofDurationMs(
  currentMs: number,
  deviationMs: number,
  resolved: ResolvedOptions,
): number {
  if (resolved.strategy === "shift") return currentMs;
  const { minColdProofMs, maxColdProofMs } = resolved;
  if (deviationMs > 0) {
    return currentMs < minColdProofMs ? currentMs : Math.max(currentMs - deviationMs, minColdProofMs);
  }
  if (deviationMs < 0) {
    return currentMs > maxColdProofMs ? currentMs : Math.min(currentMs - deviationMs, maxColdProofMs);
  }
  return currentMs;
}

/** true, wenn eine Phase der Hauptkette nach `id` bereits erledigt ist. */
function hasCompletedAfter(tl: RecalibratedTimeline, id: MainChainPhaseId): boolean {
  return MAIN_CHAIN.slice(MAIN_CHAIN.indexOf(id) + 1).some(
    (laterId) => findPhase(tl, laterId)?.completed === true,
  );
}

/**
 * Legt alle vorhandenen Phasen der Hauptkette nach `afterId` ab `cursorMs` lückenlos neu
 * (Kaltgare nach Strategie) und koppelt danach das offene Vorheizen an den Backbeginn.
 * Erledigte Phasen werden nie verschoben: Ist nach `afterId` schon eine Phase erledigt, beginnt
 * die Neuberechnung erst nach der letzten erledigten Phase an deren festgehaltenem Ende.
 * Gibt zurück, ob die Strategie die Dauer der Kaltgare geändert hat.
 */
function reflowAfter(
  tl: RecalibratedTimeline,
  afterId: MainChainPhaseId,
  cursorMs: number,
  resolved: ResolvedOptions,
): boolean {
  let fromIndex = MAIN_CHAIN.indexOf(afterId) + 1;
  let cursor = cursorMs;
  for (let i = MAIN_CHAIN.length - 1; i >= fromIndex; i--) {
    const completed = findPhase(tl, MAIN_CHAIN[i]);
    if (completed?.completed) {
      fromIndex = i + 1;
      cursor = completed.end.getTime();
      break;
    }
  }

  let coldProofCompensated = false;
  for (const id of MAIN_CHAIN.slice(fromIndex)) {
    const phase = findPhase(tl, id);
    if (!phase) continue;
    const currentMs = phase.end.getTime() - phase.start.getTime();
    const durationMs =
      id === "coldProof"
        ? coldProofDurationMs(currentMs, cursor - phase.start.getTime(), resolved)
        : currentMs;
    if (id === "coldProof" && durationMs !== currentMs) coldProofCompensated = true;
    moveTo(phase, cursor, durationMs);
    cursor = phase.end.getTime();
  }
  relinkPreheat(tl);
  return coldProofCompensated;
}

/** Beginn Backen bzw. Ende der letzten Phase der Hauptkette davor (wie im Planer). */
function computeBakeStartMs(tl: RecalibratedTimeline, fallbackMs: number): number {
  const bake = findPhase(tl, "bake");
  if (bake) return bake.start.getTime();
  const cool = findPhase(tl, "cool");
  if (cool) return cool.start.getTime();
  return computeTargetMs(tl, fallbackMs);
}

function computeTargetMs(tl: RecalibratedTimeline, fallbackMs: number): number {
  const chain = tl.phases.filter((p) => p.id !== "preheat");
  return chain.length > 0 ? chain[chain.length - 1].end.getTime() : fallbackMs;
}

/** Offenes Vorheizen endet beim Backbeginn und behält seine Dauer. */
function relinkPreheat(tl: RecalibratedTimeline): void {
  const preheat = findPhase(tl, "preheat");
  if (!preheat || preheat.completed) return;
  const durationMs = preheat.end.getTime() - preheat.start.getTime();
  const bakeStartMs = computeBakeStartMs(tl, tl.target.getTime());
  moveTo(preheat, bakeStartMs - durationMs, durationMs);
}

/** Nächster Zeitpunkt ≥ `fromMs`, dessen Ortszeit genau `minuteOfDay` ist. */
function nextLocalMinute(fromMs: number, minuteOfDay: number, timeZone: string): number {
  const minuteStart = fromMs - (((fromMs % MS_PER_MINUTE) + MS_PER_MINUTE) % MS_PER_MINUTE);
  const current = localMinuteOfDay(new Date(minuteStart), timeZone);
  let candidate = minuteStart + ((minuteOfDay - current + 1440) % 1440) * MS_PER_MINUTE;
  // Zeitumstellung dazwischen: Ortszeit gegenprüfen und korrigieren.
  const check = localMinuteOfDay(new Date(candidate), timeZone);
  if (check !== minuteOfDay) {
    let diff = minuteOfDay - check;
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    candidate += diff * MS_PER_MINUTE;
  }
  return candidate;
}

function buildConflicts(tl: RecalibratedTimeline, resolved: ResolvedOptions): ConflictWarning[] {
  const { sleepWindow, timeZone } = resolved;
  const conflicting: RecalibratedPhase[] = [];
  for (const id of ["preheat", "bake"] as const) {
    const phase = findPhase(tl, id);
    if (
      phase &&
      !phase.completed &&
      isInSleepWindow(localMinuteOfDay(phase.start, timeZone), sleepWindow)
    ) {
      conflicting.push(phase);
    }
  }
  if (conflicting.length === 0) return [];

  const suggestion = buildSuggestion(tl, conflicting, resolved);
  return conflicting.map((phase) => {
    const stepId = phase.id as "preheat" | "bake";
    const label = PHASE_LABELS[stepId];
    return {
      stepId,
      label,
      start: new Date(phase.start.getTime()),
      message: `${label} beginnt im Schlaf-Fenster.`,
      suggestion: suggestion && {
        ...suggestion,
        bakeStart: new Date(suggestion.bakeStart.getTime()),
        target: new Date(suggestion.target.getTime()),
      },
    };
  });
}

function buildSuggestion(
  tl: RecalibratedTimeline,
  conflicting: RecalibratedPhase[],
  resolved: ResolvedOptions,
): ColdProofExtensionSuggestion | null {
  const coldProof = findPhase(tl, "coldProof");
  if (!coldProof || coldProof.completed) return null;

  const earliestMs = Math.min(...conflicting.map((p) => p.start.getTime()));
  const wakeMs = nextLocalMinute(earliestMs, resolved.sleepWindow.endMinute, resolved.timeZone);
  const preheat = findPhase(tl, "preheat");
  const preheatMs = preheat ? preheat.end.getTime() - preheat.start.getTime() : 0;
  const bakeStartMs = wakeMs + preheatMs;
  const coldProofMs = bakeStartMs - coldProof.start.getTime();
  if (coldProofMs <= 0 || coldProofMs > resolved.maxColdProofMs) return null;

  let tailMs = 0;
  for (const id of ["bake", "cool"] as const) {
    const phase = findPhase(tl, id);
    if (phase) tailMs += phase.end.getTime() - phase.start.getTime();
  }
  return {
    label: EXTEND_COLD_PROOF_SUGGESTION_LABEL,
    coldProofMinutes: coldProofMs / MS_PER_MINUTE,
    bakeStart: new Date(bakeStartMs),
    target: new Date(bakeStartMs + tailMs),
  };
}

/**
 * Schlaf-Warnungen, „sofort starten“, Konflikte, start/bakeStart/target und angewandte Strategie.
 * `before` ist der normalisierte Eingabeplan, `nowMs` der Bezugszeitpunkt („jetzt“) oder null.
 * `coldProofCompensated` meldet, ob die Kaltgare-Dauer gezielt angepasst wurde (Strategie-
 * Kompensation oder übernommener Vorschlag); nur dann gilt „Kompensation“.
 */
function finalize(
  tl: RecalibratedTimeline,
  before: RecalibratedTimeline,
  resolved: ResolvedOptions,
  nowMs: number | null,
  deviationMs: number,
  coldProofCompensated: boolean,
): RecalibrationResult {
  const { sleepWindow, timeZone } = resolved;
  const warns = (date: Date): boolean =>
    isInSleepWindow(localMinuteOfDay(date, timeZone), sleepWindow);

  for (const phase of tl.phases) {
    phase.sleepWarning = MANUAL_PHASES.has(phase.id) && warns(phase.start);
    phase.startImmediately =
      phase.id === "preheat" &&
      !phase.completed &&
      nowMs !== null &&
      phase.start.getTime() < nowMs;
    for (const sf of phase.stretchAndFolds) {
      sf.sleepWarning = warns(sf.at);
    }
  }

  const previousTargetMs = before.target.getTime();
  const targetMs = computeTargetMs(tl, previousTargetMs);
  tl.target = new Date(targetMs);
  tl.bakeStart = new Date(computeBakeStartMs(tl, targetMs));
  tl.start = new Date(tl.phases.reduce((min, p) => Math.min(min, p.start.getTime()), targetMs));
  tl.conflicts = buildConflicts(tl, resolved);

  const targetShiftMs = targetMs - previousTargetMs;

  let appliedStrategy: AppliedStrategy;
  if (coldProofCompensated) {
    appliedStrategy = targetShiftMs === 0 ? "compensation" : "compensationAndShift";
  } else {
    appliedStrategy = targetShiftMs === 0 ? "none" : "shift";
  }

  return {
    timeline: tl,
    appliedStrategy,
    targetShiftMinutes: targetShiftMs / MS_PER_MINUTE,
    deviationMinutes: deviationMs / MS_PER_MINUTE,
    preheatStartImmediately: findPhase(tl, "preheat")?.startImmediately ?? false,
  };
}

type StepRef =
  | { kind: "phase"; phase: AnyPhase }
  | { kind: "fold"; bulk: AnyPhase; position: number; completed: boolean };

function findStep(timeline: AnyTimeline, stepId: string): StepRef | null {
  const match = STRETCH_AND_FOLD_STEP_PATTERN.exec(stepId);
  if (match) {
    const index = Number(match[1]);
    const bulk = timeline.phases.find((p) => p.id === "bulkFermentation");
    if (!bulk) return null;
    const position = bulk.stretchAndFolds.findIndex((sf) => sf.index === index);
    if (position < 0) return null;
    const sf = bulk.stretchAndFolds[position];
    return { kind: "fold", bulk, position, completed: "completed" in sf && sf.completed === true };
  }
  const phase = timeline.phases.find((p) => p.id === stepId);
  return phase ? { kind: "phase", phase } : null;
}

// ---------------------------------------------------------------------------
// Öffentliche Funktionen
// ---------------------------------------------------------------------------

/**
 * Markiert einen Schritt (Phase oder Durchgang „stretchAndFold#n“) zum Zeitpunkt `completedAt`
 * als erledigt und legt alle Folgeschritte neu. Wirft bei ungültigen Eingaben.
 */
export function recalibrateSchedule(
  timeline: AnyTimeline,
  stepId: string,
  completedAt: Date,
  options: RecalibrationOptions = {},
): RecalibrationResult {
  const step = findStep(timeline, stepId);
  if (!step) throw new Error(STEP_NOT_FOUND_MESSAGE);
  if (!isValidDate(completedAt)) throw new Error(INVALID_COMPLETED_AT_MESSAGE);
  const alreadyCompleted = step.kind === "phase" ? isPhaseCompleted(step.phase) : step.completed;
  if (alreadyCompleted) throw new Error(STEP_ALREADY_COMPLETED_MESSAGE);
  const resolved = validateOptions(resolveOptions(options));
  const nowMs = completedAt.getTime();
  if (step.kind === "phase" && step.phase.id !== "preheat" && nowMs < step.phase.start.getTime()) {
    // Offene Vorgänger würden sonst mit dem erledigten Schritt überlappen.
    throw new Error(COMPLETED_BEFORE_STEP_START_MESSAGE);
  }

  const before = normalize(timeline);
  const tl = normalize(timeline);

  if (step.kind === "fold") {
    return completeStretchAndFold(tl, before, step.position, nowMs, resolved);
  }

  const phase = findPhase(tl, step.phase.id);
  if (!phase) throw new Error(STEP_NOT_FOUND_MESSAGE);
  const deviationMs = nowMs - phase.end.getTime();
  phase.completed = true;

  // Ist ein späterer Schritt der Hauptkette schon erledigt (Haken nachträglich gesetzt), bleiben
  // alle festgehaltenen Zeiten stehen: Nur der Status ändert sich.
  const laterStepCompleted =
    phase.id === "preheat"
      ? hasCompletedAfter(tl, "coldProof")
      : hasCompletedAfter(tl, phase.id);
  if (laterStepCompleted) {
    return finalize(tl, before, resolved, nowMs, deviationMs, false);
  }

  if (phase.start.getTime() > nowMs) phase.start = new Date(nowMs);
  setEnd(phase, nowMs);

  let coldProofCompensated = false;
  if (phase.id === "preheat") {
    if (deviationMs > 0) {
      // Backen und Auskühlen starten erst nach dem Vorheizen; die offene Phase davor wird bis
      // dahin verlängert. Das ist keine Kompensation, sondern eine reine Verschiebung.
      const bakeIndex = MAIN_CHAIN.indexOf("bake");
      const previous = MAIN_CHAIN.slice(0, bakeIndex)
        .map((id) => findPhase(tl, id))
        .filter((p): p is RecalibratedPhase => p !== undefined)
        .at(-1);
      if (previous && !previous.completed) setEnd(previous, nowMs);
      reflowAfter(tl, previous ? (previous.id as MainChainPhaseId) : "coldProof", nowMs, resolved);
    }
  } else {
    coldProofCompensated = reflowAfter(tl, phase.id, nowMs, resolved);
  }

  return finalize(tl, before, resolved, nowMs, deviationMs, coldProofCompensated);
}

function completeStretchAndFold(
  tl: RecalibratedTimeline,
  before: RecalibratedTimeline,
  position: number,
  nowMs: number,
  resolved: ResolvedOptions,
): RecalibrationResult {
  const bulk = findPhase(tl, "bulkFermentation");
  if (!bulk) throw new Error(STEP_NOT_FOUND_MESSAGE);
  const folds = bulk.stretchAndFolds;
  const fold = folds[position];
  const deviationMs = nowMs - fold.at.getTime();
  const intervalMs = (tl.stretchAndFoldIntervalMinutes ?? 0) * MS_PER_MINUTE;

  fold.completed = true;
  // Bei erledigter Stockgare oder erledigtem Folgeschritt nur den Status setzen: festgehaltene
  // Zeiten werden nicht verschoben.
  if (bulk.completed || hasCompletedAfter(tl, "bulkFermentation")) {
    return finalize(tl, before, resolved, nowMs, deviationMs, false);
  }

  fold.at = new Date(nowMs);
  for (let j = position + 1; j < folds.length; j++) {
    if (!folds[j].completed) folds[j].at = new Date(nowMs + (j - position) * intervalMs);
  }

  let coldProofCompensated = false;
  const lastMs = folds[folds.length - 1].at.getTime();
  const newEndMs = Math.max(bulk.end.getTime(), lastMs + intervalMs);
  if (newEndMs !== bulk.end.getTime()) {
    setEnd(bulk, newEndMs);
    coldProofCompensated = reflowAfter(tl, "bulkFermentation", newEndMs, resolved);
  }

  return finalize(tl, before, resolved, nowMs, deviationMs, coldProofCompensated);
}

/**
 * Kühlschrank-Notbremse: Der Teig wird während der offenen Stockgare um `parkedAt` geparkt und um
 * `resumedAt` wieder herausgenommen. Die Kühlschrankzeit zählt mit FRIDGE_FERMENTATION_FACTOR als
 * Stockgare. Danach Vorwärtskette mit der gewählten Strategie. Wirft bei ungültigen Eingaben.
 */
export function parkDoughInFridge(
  timeline: AnyTimeline,
  parkedAt: Date,
  resumedAt: Date,
  options: RecalibrationOptions = {},
): RecalibrationResult {
  const raw = resolveOptions(options);
  validateColdProofLimits(raw);
  if (
    !isValidDate(parkedAt) ||
    !isValidDate(resumedAt) ||
    resumedAt.getTime() <= parkedAt.getTime()
  ) {
    throw new Error(INVALID_PARKING_TIME_MESSAGE);
  }
  const inputBulk = timeline.phases.find((p) => p.id === "bulkFermentation");
  const parkedMs = parkedAt.getTime();
  if (
    !inputBulk ||
    isPhaseCompleted(inputBulk) ||
    parkedMs < inputBulk.start.getTime() ||
    parkedMs >= inputBulk.end.getTime()
  ) {
    throw new Error(PARKING_ONLY_DURING_BULK_MESSAGE);
  }
  const resolved = validateOptions(raw);

  const before = normalize(timeline);
  const tl = normalize(timeline);
  const bulk = findPhase(tl, "bulkFermentation");
  if (!bulk) throw new Error(PARKING_ONLY_DURING_BULK_MESSAGE);

  const resumedMs = resumedAt.getTime();
  const oldEndMs = bulk.end.getTime();
  const creditedMs = (resumedMs - parkedMs) * FRIDGE_FERMENTATION_FACTOR;
  const remainingMs = Math.max(0, oldEndMs - parkedMs - creditedMs);
  const newEndMs = resumedMs + remainingMs;
  const shiftMs = newEndMs - oldEndMs;

  for (const sf of bulk.stretchAndFolds) {
    if (!sf.completed && sf.at.getTime() > parkedMs) {
      sf.at = new Date(Math.max(sf.at.getTime() + shiftMs, resumedMs));
    }
  }
  setEnd(bulk, newEndMs);
  tl.fridgeParkings.push({
    label: FRIDGE_PARKING_LABEL,
    start: new Date(parkedMs),
    end: new Date(resumedMs),
    creditedBulkMinutes: creditedMs / MS_PER_MINUTE,
    remainingBulkMinutes: remainingMs / MS_PER_MINUTE,
  });
  const coldProofCompensated = reflowAfter(tl, "bulkFermentation", newEndMs, resolved);

  return finalize(tl, before, resolved, resumedMs, 0, coldProofCompensated);
}

/**
 * Übernimmt den Lösungsvorschlag „Kaltgare bis morgen früh verlängern“: Die offene Kaltgare
 * erhält die vorgeschlagene Dauer, Backen, Auskühlen und Vorheizen folgen. Wirft, wenn der
 * Vorschlag nicht zum Plan passt.
 */
export function applySuggestion(
  timeline: RecalibratedTimeline,
  suggestion: ColdProofExtensionSuggestion,
  options: RecalibrationOptions = {},
): RecalibrationResult {
  const inputColdProof = timeline.phases.find((p) => p.id === "coldProof");
  const minutes = suggestion.coldProofMinutes;
  if (
    !inputColdProof ||
    inputColdProof.completed ||
    typeof minutes !== "number" ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    throw new Error(SUGGESTION_NOT_APPLICABLE_MESSAGE);
  }
  const resolved = validateOptions(resolveOptions(options));
  const durationMs = minutes * MS_PER_MINUTE;
  if (durationMs > resolved.maxColdProofMs || hasCompletedAfterInput(timeline)) {
    throw new Error(SUGGESTION_NOT_APPLICABLE_MESSAGE);
  }

  const before = normalize(timeline);
  const tl = normalize(timeline);
  const coldProof = findPhase(tl, "coldProof");
  if (!coldProof) throw new Error(SUGGESTION_NOT_APPLICABLE_MESSAGE);

  const previousMs = coldProof.end.getTime() - coldProof.start.getTime();
  const endMs = coldProof.start.getTime() + durationMs;
  setEnd(coldProof, endMs);
  reflowAfter(tl, "coldProof", endMs, resolved);

  return finalize(tl, before, resolved, null, 0, durationMs !== previousMs);
}

/** true, wenn Backen oder Auskühlen im Eingabeplan schon erledigt sind. */
function hasCompletedAfterInput(timeline: RecalibratedTimeline): boolean {
  return timeline.phases.some((p) => (p.id === "bake" || p.id === "cool") && p.completed);
}

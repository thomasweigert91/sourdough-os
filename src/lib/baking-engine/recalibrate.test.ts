// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  APPLIED_STRATEGY_LABELS,
  applySuggestion,
  COLD_PROOF_LIMITS_ORDER_MESSAGE,
  DEFAULT_MAX_COLD_PROOF_MINUTES,
  DEFAULT_MIN_COLD_PROOF_MINUTES,
  DEFAULT_RECALIBRATION_STRATEGY,
  EXTEND_COLD_PROOF_SUGGESTION_LABEL,
  FRIDGE_FERMENTATION_FACTOR,
  FRIDGE_PARKING_LABEL,
  INVALID_COMPLETED_AT_MESSAGE,
  INVALID_PARKING_TIME_MESSAGE,
  parkDoughInFridge,
  PARKING_ONLY_DURING_BULK_MESSAGE,
  recalibrateSchedule,
  STEP_ALREADY_COMPLETED_MESSAGE,
  STEP_NOT_FOUND_MESSAGE,
  stretchAndFoldStepId,
  SUGGESTION_NOT_APPLICABLE_MESSAGE,
  type RecalibratedPhase,
  type RecalibratedTimeline,
  type RecalibrationResult,
} from "@/lib/baking-engine/recalibrate";
import {
  generateBackwardSchedule,
  PHASE_LABELS,
  type PhaseId,
  type ScheduleTimeline,
} from "@/lib/baking-engine/schedule";

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

type AnyTimeline = ScheduleTimeline | RecalibratedTimeline;
type AnyPhase = AnyTimeline["phases"][number];

/** Zeitpunkt aus ISO-String mit festem Offset (unabhängig von der Rechner-Zeitzone). */
function at(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Ungültiger Test-Zeitpunkt: ${iso}`);
  return date;
}

const iso = (value: string): string => at(value).toISOString();

function phase(timeline: RecalibratedTimeline, id: PhaseId): RecalibratedPhase;
function phase(timeline: AnyTimeline, id: PhaseId): AnyPhase;
function phase(timeline: AnyTimeline, id: PhaseId): AnyPhase {
  const found = timeline.phases.find((p) => p.id === id);
  expect(found, `Phase „${id}“ fehlt im Plan`).toBeDefined();
  return found as AnyPhase;
}

/** Schritte mit Schlaf-Warnung: Phasen-IDs und „stretchAndFold#n“. */
function warnedSteps(timeline: AnyTimeline): string[] {
  const result: string[] = [];
  for (const p of timeline.phases) {
    if (p.sleepWarning) result.push(p.id);
    for (const sf of p.stretchAndFolds) {
      if (sf.sleepWarning) result.push(`stretchAndFold#${sf.index}`);
    }
  }
  return result;
}

/** Exakter Vergleich der Fehlermeldung; der Aufruf darf kein Ergebnis liefern. */
function expectThrowMessage(fn: () => unknown, message: string): void {
  let caught: unknown;
  let returned = false;
  let result: unknown;
  try {
    result = fn();
    returned = true;
  } catch (error) {
    caught = error;
  }
  expect(returned, `erwartet: Fehler „${message}“, aber der Aufruf hat ein Ergebnis geliefert`).toBe(
    false,
  );
  expect(result).toBeUndefined();
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toBe(message);
}

type ExpectedPhase = [id: PhaseId, start: string, end: string];

/** Prüft Beginn und Ende der genannten Phasen (Vergleich über ISO in UTC). */
function expectPhaseTimes(timeline: AnyTimeline, expected: ExpectedPhase[]): void {
  for (const [id, start, end] of expected) {
    const p = phase(timeline, id);
    expect(p.start.toISOString(), `Beginn ${id}`).toBe(iso(start));
    expect(p.end.toISOString(), `Ende ${id}`).toBe(iso(end));
  }
}

/** Hauptkette (ohne Vorheizen) lückenlos, letzte Phase endet beim Zielzeitpunkt. */
function expectSeamlessMainChain(timeline: AnyTimeline): void {
  const chain = timeline.phases.filter((p) => p.id !== "preheat");
  expect(chain.length).toBeGreaterThan(0);
  for (let i = 0; i < chain.length - 1; i++) {
    expect(chain[i].end.getTime(), `${chain[i].id} → ${chain[i + 1].id}`).toBe(
      chain[i + 1].start.getTime(),
    );
  }
  expect(chain[chain.length - 1].end.getTime()).toBe(timeline.target.getTime());
}

function isoTimes(timeline: AnyTimeline): Array<[string, string, string]> {
  return timeline.phases.map((p) => [p.id, p.start.toISOString(), p.end.toISOString()]);
}

function stretchAndFoldTimes(timeline: AnyTimeline): string[] {
  return phase(timeline, "bulkFermentation").stretchAndFolds.map((sf) => sf.at.toISOString());
}

/** Ruft `fn` mit dem Plan auf und prüft, dass der Eingabeplan danach unverändert ist. */
function withUnchangedInput<T>(timeline: AnyTimeline, fn: (tl: AnyTimeline) => T): T {
  const before = structuredClone(timeline);
  const result = fn(timeline);
  expect(timeline, "Eingabeplan wurde verändert").toEqual(before);
  return result;
}

/** Referenzplan: F012 AC-1, Ziel So 11.10.2026 12:00 Uhr. */
function referencePlan(): ScheduleTimeline {
  return generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"));
}

/** Abendplan: F012 AC-4, Kaltgare 30 Min., Ziel So 11.10.2026 22:00 Uhr. */
function eveningPlan(): ScheduleTimeline {
  return generateBackwardSchedule(at("2026-10-11T22:00:00+02:00"), {
    durations: { coldProof: 30 },
  });
}

const REF_LEVAIN: ExpectedPhase = ["levain", "2026-10-10T08:15:00+02:00", "2026-10-10T13:15:00+02:00"];
const REF_MIX: ExpectedPhase = [
  "mixAutolyse",
  "2026-10-10T13:15:00+02:00",
  "2026-10-10T14:15:00+02:00",
];
const REF_TAIL: ExpectedPhase[] = [
  ["preheat", "2026-10-11T08:15:00+02:00", "2026-10-11T09:15:00+02:00"],
  ["bake", "2026-10-11T09:15:00+02:00", "2026-10-11T10:00:00+02:00"],
  ["cool", "2026-10-11T10:00:00+02:00", "2026-10-11T12:00:00+02:00"],
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("F014 Live-Rekalibrierung", () => {
  describe("F014/AC-1 Kaltgare fängt eine verspätete Stockgare auf", () => {
    it("F014/AC-1 Stockgare 60 Min. verspätet: Kaltgare 13 Std., Ziel unverändert, „Kompensation“", () => {
      const plan = referencePlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T19:45:00+02:00")),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        REF_LEVAIN,
        REF_MIX,
        ["bulkFermentation", "2026-10-10T14:15:00+02:00", "2026-10-10T19:45:00+02:00"],
        ["shaping", "2026-10-10T19:45:00+02:00", "2026-10-10T20:15:00+02:00"],
        ["coldProof", "2026-10-10T20:15:00+02:00", "2026-10-11T09:15:00+02:00"],
        ...REF_TAIL,
      ]);
      expect(phase(tl, "bulkFermentation").completed).toBe(true);
      expect(phase(tl, "levain").completed).toBe(false);
      expect(phase(tl, "shaping").completed).toBe(false);
      expect(phase(tl, "coldProof").durationMinutes).toBe(780);
      expect(tl.target.toISOString()).toBe(iso("2026-10-11T12:00:00+02:00"));
      expectSeamlessMainChain(tl);

      // Levain und Mischen identisch mit dem Referenzplan
      expect(isoTimes(tl).slice(0, 2)).toEqual(isoTimes(plan).slice(0, 2));

      expect(result.appliedStrategy).toBe("compensation");
      expect(result.targetShiftMinutes).toBe(0);
      expect(result.deviationMinutes).toBe(60);
      expect(result.preheatStartImmediately).toBe(false);
    });

    it("F014/AC-1 Standardstrategie ist „compensate“, Labels und Grenzen haben den festgelegten Wortlaut", () => {
      expect(DEFAULT_RECALIBRATION_STRATEGY).toBe("compensate");
      expect(DEFAULT_MIN_COLD_PROOF_MINUTES).toBe(480);
      expect(DEFAULT_MAX_COLD_PROOF_MINUTES).toBe(2880);
      expect(APPLIED_STRATEGY_LABELS).toEqual({
        none: "Keine",
        compensation: "Kompensation",
        compensationAndShift: "Kompensation + Verschiebung",
        shift: "Verschiebung",
      });
    });

    it("F014/AC-1 Zeitumstellung 25.10.2026: Kaltgare über die Umstellung zählt echte Minuten (780)", () => {
      const plan = generateBackwardSchedule(at("2026-10-25T12:00:00+01:00"));
      expect(phase(plan, "bulkFermentation").end.toISOString()).toBe(
        iso("2026-10-24T19:45:00+02:00"),
      );

      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "bulkFermentation", at("2026-10-24T20:45:00+02:00")),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        ["shaping", "2026-10-24T20:45:00+02:00", "2026-10-24T21:15:00+02:00"],
        ["coldProof", "2026-10-24T21:15:00+02:00", "2026-10-25T09:15:00+01:00"],
        ["preheat", "2026-10-25T08:15:00+01:00", "2026-10-25T09:15:00+01:00"],
        ["bake", "2026-10-25T09:15:00+01:00", "2026-10-25T10:00:00+01:00"],
        ["cool", "2026-10-25T10:00:00+01:00", "2026-10-25T12:00:00+01:00"],
      ]);
      expect(phase(tl, "coldProof").durationMinutes).toBe(780);
      expect(tl.target.toISOString()).toBe(iso("2026-10-25T12:00:00+01:00"));
      expectSeamlessMainChain(tl);
      expect(result.appliedStrategy).toBe("compensation");
      expect(result.targetShiftMinutes).toBe(0);
    });
  });

  describe("F014/AC-2 Kompensation bis zur Mindest-Kaltgare, Rest wird verschoben", () => {
    it("F014/AC-2 Stockgare 7 Std. verspätet: Kaltgare genau 8 Std., Ziel +60 Min., Schlaf-Warnung Formgebung", () => {
      const plan = referencePlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "bulkFermentation", at("2026-10-11T01:45:00+02:00")),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        REF_LEVAIN,
        REF_MIX,
        ["bulkFermentation", "2026-10-10T14:15:00+02:00", "2026-10-11T01:45:00+02:00"],
        ["shaping", "2026-10-11T01:45:00+02:00", "2026-10-11T02:15:00+02:00"],
        ["coldProof", "2026-10-11T02:15:00+02:00", "2026-10-11T10:15:00+02:00"],
        ["preheat", "2026-10-11T09:15:00+02:00", "2026-10-11T10:15:00+02:00"],
        ["bake", "2026-10-11T10:15:00+02:00", "2026-10-11T11:00:00+02:00"],
        ["cool", "2026-10-11T11:00:00+02:00", "2026-10-11T13:00:00+02:00"],
      ]);
      expect(phase(tl, "bulkFermentation").completed).toBe(true);
      expect(phase(tl, "coldProof").durationMinutes).toBe(480);
      expect(tl.target.toISOString()).toBe(iso("2026-10-11T13:00:00+02:00"));
      expect(tl.bakeStart.toISOString()).toBe(iso("2026-10-11T10:15:00+02:00"));
      expectSeamlessMainChain(tl);

      expect(result.appliedStrategy).toBe("compensationAndShift");
      expect(APPLIED_STRATEGY_LABELS[result.appliedStrategy]).toBe("Kompensation + Verschiebung");
      expect(result.targetShiftMinutes).toBe(60);
      expect(result.deviationMinutes).toBe(420);

      expect(warnedSteps(tl)).toEqual(["shaping"]);
      expect(tl.conflicts).toEqual([]);
    });
  });

  describe("F014/AC-3 Einfaches Verschieben als gewählte Strategie", () => {
    it("F014/AC-3 Mischen 30 Min. verspätet: alles +30 Min., Kaltgare weiter 14 Std., „Verschiebung“", () => {
      const plan = referencePlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "mixAutolyse", at("2026-10-10T14:45:00+02:00"), {
          strategy: "shift",
        }),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        REF_LEVAIN,
        ["mixAutolyse", "2026-10-10T13:15:00+02:00", "2026-10-10T14:45:00+02:00"],
        ["bulkFermentation", "2026-10-10T14:45:00+02:00", "2026-10-10T19:15:00+02:00"],
        ["shaping", "2026-10-10T19:15:00+02:00", "2026-10-10T19:45:00+02:00"],
        ["coldProof", "2026-10-10T19:45:00+02:00", "2026-10-11T09:45:00+02:00"],
        ["preheat", "2026-10-11T08:45:00+02:00", "2026-10-11T09:45:00+02:00"],
        ["bake", "2026-10-11T09:45:00+02:00", "2026-10-11T10:30:00+02:00"],
        ["cool", "2026-10-11T10:30:00+02:00", "2026-10-11T12:30:00+02:00"],
      ]);
      expect(stretchAndFoldTimes(tl)).toEqual([
        iso("2026-10-10T15:15:00+02:00"),
        iso("2026-10-10T15:45:00+02:00"),
        iso("2026-10-10T16:15:00+02:00"),
        iso("2026-10-10T16:45:00+02:00"),
      ]);
      expect(phase(tl, "mixAutolyse").completed).toBe(true);
      expect(phase(tl, "coldProof").durationMinutes).toBe(840);
      expect(tl.target.toISOString()).toBe(iso("2026-10-11T12:30:00+02:00"));
      expectSeamlessMainChain(tl);

      expect(result.appliedStrategy).toBe("shift");
      expect(APPLIED_STRATEGY_LABELS[result.appliedStrategy]).toBe("Verschiebung");
      expect(result.targetShiftMinutes).toBe(30);
      expect(result.deviationMinutes).toBe(30);
    });
  });

  describe("F014/AC-4 Kühlschrank-Notbremse in der Stockgare", () => {
    /** Referenzplan mit allen vier Durchgängen pünktlich erledigt. */
    function planWithAllFoldsDone(): RecalibratedTimeline {
      let tl: AnyTimeline = referencePlan();
      const times = ["14:45", "15:15", "15:45", "16:15"];
      times.forEach((time, i) => {
        const r: RecalibrationResult = recalibrateSchedule(
          tl,
          stretchAndFoldStepId(i + 1),
          at(`2026-10-10T${time}:00+02:00`),
        );
        expect(r.appliedStrategy).toBe("none");
        tl = r.timeline;
      });
      return tl as RecalibratedTimeline;
    }

    it("F014/AC-4 parkt 16:30–20:30: Gutschrift 24 Min., Rest 111 Min., Stockgare bis 22:21, Kaltgare 10 Std. 24 Min.", () => {
      const plan = planWithAllFoldsDone();
      expect(phase(plan, "bulkFermentation").stretchAndFolds.every((sf) => sf.completed)).toBe(
        true,
      );

      const result = withUnchangedInput(plan, (tl) =>
        parkDoughInFridge(tl, at("2026-10-10T16:30:00+02:00"), at("2026-10-10T20:30:00+02:00")),
      );
      const tl = result.timeline;

      expect(FRIDGE_FERMENTATION_FACTOR).toBe(0.1);
      expect(FRIDGE_PARKING_LABEL).toBe("Teig im Kühlschrank geparkt");
      expect(tl.fridgeParkings).toHaveLength(1);
      const parking = tl.fridgeParkings[0];
      expect(parking.label).toBe("Teig im Kühlschrank geparkt");
      expect(parking.start.toISOString()).toBe(iso("2026-10-10T16:30:00+02:00"));
      expect(parking.end.toISOString()).toBe(iso("2026-10-10T20:30:00+02:00"));
      expect(parking.creditedBulkMinutes).toBe(24);
      expect(parking.remainingBulkMinutes).toBe(111);

      expectPhaseTimes(tl, [
        REF_LEVAIN,
        REF_MIX,
        ["bulkFermentation", "2026-10-10T14:15:00+02:00", "2026-10-10T22:21:00+02:00"],
        ["shaping", "2026-10-10T22:21:00+02:00", "2026-10-10T22:51:00+02:00"],
        ["coldProof", "2026-10-10T22:51:00+02:00", "2026-10-11T09:15:00+02:00"],
        ...REF_TAIL,
      ]);
      expect(phase(tl, "bulkFermentation").completed).toBe(false);
      expect(phase(tl, "coldProof").durationMinutes).toBe(624);
      expect(tl.target.toISOString()).toBe(iso("2026-10-11T12:00:00+02:00"));
      expectSeamlessMainChain(tl);

      expect(result.appliedStrategy).toBe("compensation");
      expect(result.targetShiftMinutes).toBe(0);
      expect(result.deviationMinutes).toBe(0);
    });

    it("F014/AC-4 Parken ist nur während der offenen Stockgare möglich", () => {
      const plan = referencePlan();

      withUnchangedInput(plan, (tl) =>
        expectThrowMessage(
          () =>
            parkDoughInFridge(
              tl,
              at("2026-10-10T13:00:00+02:00"),
              at("2026-10-10T14:00:00+02:00"),
            ),
          PARKING_ONLY_DURING_BULK_MESSAGE,
        ),
      );
      withUnchangedInput(plan, (tl) =>
        expectThrowMessage(
          () =>
            parkDoughInFridge(
              tl,
              at("2026-10-10T19:00:00+02:00"),
              at("2026-10-10T20:00:00+02:00"),
            ),
          PARKING_ONLY_DURING_BULK_MESSAGE,
        ),
      );

      const done = recalibrateSchedule(plan, "bulkFermentation", at("2026-10-10T18:45:00+02:00"))
        .timeline;
      withUnchangedInput(done, (tl) =>
        expectThrowMessage(
          () =>
            parkDoughInFridge(
              tl,
              at("2026-10-10T16:30:00+02:00"),
              at("2026-10-10T20:30:00+02:00"),
            ),
          PARKING_ONLY_DURING_BULK_MESSAGE,
        ),
      );
      expect(PARKING_ONLY_DURING_BULK_MESSAGE).toBe(
        "Der Teig kann nur während der Stockgare geparkt werden.",
      );
    });

    it("F014/AC-4 Herausnehmen nicht nach dem Parken wird abgelehnt", () => {
      const plan = referencePlan();
      for (const resumed of ["2026-10-10T16:30:00+02:00", "2026-10-10T16:00:00+02:00"]) {
        withUnchangedInput(plan, (tl) =>
          expectThrowMessage(
            () => parkDoughInFridge(tl, at("2026-10-10T16:30:00+02:00"), at(resumed)),
            INVALID_PARKING_TIME_MESSAGE,
          ),
        );
      }
      expect(INVALID_PARKING_TIME_MESSAGE).toBe(
        "Parken und Herausnehmen müssen gültige Zeitpunkte sein, Herausnehmen nach dem Parken.",
      );
    });
  });

  describe("F014/AC-5 Zu früh erledigt, Kaltgare wird verlängert", () => {
    it("F014/AC-5 Stockgare 30 Min. zu früh: Kaltgare 14 Std. 30 Min., Ziel unverändert, nichts beginnt vor jetzt", () => {
      const plan = referencePlan();
      const now = at("2026-10-10T18:15:00+02:00");
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "bulkFermentation", now),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        REF_LEVAIN,
        REF_MIX,
        ["bulkFermentation", "2026-10-10T14:15:00+02:00", "2026-10-10T18:15:00+02:00"],
        ["shaping", "2026-10-10T18:15:00+02:00", "2026-10-10T18:45:00+02:00"],
        ["coldProof", "2026-10-10T18:45:00+02:00", "2026-10-11T09:15:00+02:00"],
        ...REF_TAIL,
      ]);
      expect(phase(tl, "bulkFermentation").completed).toBe(true);
      expect(phase(tl, "coldProof").durationMinutes).toBe(870);
      expectSeamlessMainChain(tl);

      // Offene Phasen der Hauptkette nach dem erledigten Schritt (Levain/Mischen liegen davor).
      const bulkIndex = tl.phases.findIndex((p) => p.id === "bulkFermentation");
      const openMain = tl.phases
        .slice(bulkIndex + 1)
        .filter((p) => p.id !== "preheat" && !p.completed);
      expect(openMain.map((p) => p.id)).toEqual(["shaping", "coldProof", "bake", "cool"]);
      for (const p of openMain) {
        expect(p.start.getTime(), `${p.id} beginnt vor jetzt`).toBeGreaterThanOrEqual(
          now.getTime(),
        );
        for (const sf of p.stretchAndFolds.filter((s) => !s.completed)) {
          expect(sf.at.getTime()).toBeGreaterThanOrEqual(now.getTime());
        }
      }

      expect(result.appliedStrategy).toBe("compensation");
      expect(result.targetShiftMinutes).toBe(0);
      expect(result.deviationMinutes).toBe(-30);
    });
  });

  describe("F014/AC-6 Zu früh erledigt, Verlängerung nur bis zur Max-Kaltgare", () => {
    it("F014/AC-6 Max-Kaltgare 14 Std. 15 Min.: Kaltgare genau 855 Min., Ziel −15 Min.", () => {
      const plan = referencePlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T18:15:00+02:00"), {
          maxColdProofMinutes: 855,
        }),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        ["shaping", "2026-10-10T18:15:00+02:00", "2026-10-10T18:45:00+02:00"],
        ["coldProof", "2026-10-10T18:45:00+02:00", "2026-10-11T09:00:00+02:00"],
        ["preheat", "2026-10-11T08:00:00+02:00", "2026-10-11T09:00:00+02:00"],
        ["bake", "2026-10-11T09:00:00+02:00", "2026-10-11T09:45:00+02:00"],
        ["cool", "2026-10-11T09:45:00+02:00", "2026-10-11T11:45:00+02:00"],
      ]);
      expect(phase(tl, "coldProof").durationMinutes).toBe(855);
      expect(tl.target.toISOString()).toBe(iso("2026-10-11T11:45:00+02:00"));
      expectSeamlessMainChain(tl);

      expect(result.appliedStrategy).toBe("compensationAndShift");
      expect(result.targetShiftMinutes).toBe(-15);
    });
  });

  describe("F014/AC-7 Verspäteter Durchgang verschiebt nur die folgenden Durchgänge", () => {
    it("F014/AC-7 dritter Durchgang um 16:00: vierter um 16:30, Rest unverändert, „Keine“", () => {
      expect(stretchAndFoldStepId(3)).toBe("stretchAndFold#3");

      const plan = referencePlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, stretchAndFoldStepId(3), at("2026-10-10T16:00:00+02:00")),
      );
      const tl = result.timeline;

      const folds = phase(tl, "bulkFermentation").stretchAndFolds;
      expect(folds.map((sf) => sf.at.toISOString())).toEqual([
        iso("2026-10-10T14:45:00+02:00"),
        iso("2026-10-10T15:15:00+02:00"),
        iso("2026-10-10T16:00:00+02:00"),
        iso("2026-10-10T16:30:00+02:00"),
      ]);
      expect(folds.map((sf) => sf.completed)).toEqual([false, false, true, false]);

      expect(isoTimes(tl)).toEqual(isoTimes(plan));
      expect(phase(tl, "bulkFermentation").end.toISOString()).toBe(
        iso("2026-10-10T18:45:00+02:00"),
      );
      expect(phase(tl, "bulkFermentation").completed).toBe(false);
      expect(tl.target.toISOString()).toBe(plan.target.toISOString());

      expect(result.appliedStrategy).toBe("none");
      expect(APPLIED_STRATEGY_LABELS[result.appliedStrategy]).toBe("Keine");
      expect(result.targetShiftMinutes).toBe(0);
      expect(result.deviationMinutes).toBe(15);
    });
  });

  describe("F014/AC-8 Stockgare endet frühestens 30 Min. nach dem letzten Durchgang", () => {
    it("F014/AC-8 vierter Durchgang um 18:30: Stockgare bis 19:00, Kaltgare 825 Min., Ziel unverändert", () => {
      const plan = referencePlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "stretchAndFold#4", at("2026-10-10T18:30:00+02:00")),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        REF_LEVAIN,
        REF_MIX,
        ["bulkFermentation", "2026-10-10T14:15:00+02:00", "2026-10-10T19:00:00+02:00"],
        ["shaping", "2026-10-10T19:00:00+02:00", "2026-10-10T19:30:00+02:00"],
        ["coldProof", "2026-10-10T19:30:00+02:00", "2026-10-11T09:15:00+02:00"],
        ...REF_TAIL,
      ]);
      expect(phase(tl, "bulkFermentation").completed).toBe(false);
      const fourth = phase(tl, "bulkFermentation").stretchAndFolds[3];
      expect(fourth.completed).toBe(true);
      expect(fourth.at.toISOString()).toBe(iso("2026-10-10T18:30:00+02:00"));
      expect(phase(tl, "coldProof").durationMinutes).toBe(825);
      expectSeamlessMainChain(tl);

      expect(result.appliedStrategy).toBe("compensation");
      expect(result.targetShiftMinutes).toBe(0);
    });
  });

  /** AC-9-Szenario: Abendplan, „Verschiebung“, Mischen um So 17:45 erledigt. */
  function ac9(options: { maxColdProofMinutes?: number } = {}): RecalibrationResult {
    return recalibrateSchedule(eveningPlan(), "mixAutolyse", at("2026-10-11T17:45:00+02:00"), {
      strategy: "shift",
      ...options,
    });
  }

  const AC9_PHASES: ExpectedPhase[] = [
    ["bulkFermentation", "2026-10-11T17:45:00+02:00", "2026-10-11T22:15:00+02:00"],
    ["shaping", "2026-10-11T22:15:00+02:00", "2026-10-11T22:45:00+02:00"],
    ["coldProof", "2026-10-11T22:45:00+02:00", "2026-10-11T23:15:00+02:00"],
    ["preheat", "2026-10-11T22:15:00+02:00", "2026-10-11T23:15:00+02:00"],
    ["bake", "2026-10-11T23:15:00+02:00", "2026-10-12T00:00:00+02:00"],
    ["cool", "2026-10-12T00:00:00+02:00", "2026-10-12T02:00:00+02:00"],
  ];

  describe("F014/AC-9 Konfliktwarnung mit Lösungsvorschlag", () => {
    it("F014/AC-9 Backen um 23:15 löst genau eine Konfliktwarnung mit Vorschlag aus", () => {
      const plan = eveningPlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "mixAutolyse", at("2026-10-11T17:45:00+02:00"), {
          strategy: "shift",
        }),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, AC9_PHASES);
      expect(phase(tl, "mixAutolyse").completed).toBe(true);
      expectSeamlessMainChain(tl);

      expect(tl.conflicts).toHaveLength(1);
      const conflict = tl.conflicts[0];
      expect(conflict.stepId).toBe("bake");
      expect(conflict.label).toBe(PHASE_LABELS.bake);
      expect(conflict.start.toISOString()).toBe(iso("2026-10-11T23:15:00+02:00"));
      expect(conflict.message).toBe("Backen beginnt im Schlaf-Fenster.");

      expect(EXTEND_COLD_PROOF_SUGGESTION_LABEL).toBe("Kaltgare bis morgen früh verlängern");
      expect(conflict.suggestion).not.toBeNull();
      const suggestion = conflict.suggestion!;
      expect(suggestion.label).toBe("Kaltgare bis morgen früh verlängern");
      expect(suggestion.coldProofMinutes).toBe(555);
      expect(suggestion.bakeStart.toISOString()).toBe(iso("2026-10-12T08:00:00+02:00"));
      expect(suggestion.target.toISOString()).toBe(iso("2026-10-12T10:45:00+02:00"));
    });

    it("F014/AC-9 Zeitumstellung 25.10.2026: Vorschlag sucht 07:00 MEZ, Kaltgare 615 Min.", () => {
      const plan = generateBackwardSchedule(at("2026-10-24T22:00:00+02:00"), {
        durations: { coldProof: 30 },
      });
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "mixAutolyse", at("2026-10-24T17:45:00+02:00"), {
          strategy: "shift",
        }),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        ["coldProof", "2026-10-24T22:45:00+02:00", "2026-10-24T23:15:00+02:00"],
        ["bake", "2026-10-24T23:15:00+02:00", "2026-10-25T00:00:00+02:00"],
      ]);
      expect(tl.conflicts).toHaveLength(1);
      const conflict = tl.conflicts[0];
      expect(conflict.stepId).toBe("bake");
      expect(conflict.start.toISOString()).toBe(iso("2026-10-24T23:15:00+02:00"));
      const suggestion = conflict.suggestion!;
      expect(suggestion).not.toBeNull();
      expect(suggestion.bakeStart.toISOString()).toBe(iso("2026-10-25T08:00:00+01:00"));
      expect(suggestion.coldProofMinutes).toBe(615);
      expect(suggestion.target.toISOString()).toBe(iso("2026-10-25T10:45:00+01:00"));
    });
  });

  describe("F014/AC-10 Lösungsvorschlag übernehmen", () => {
    it("F014/AC-10 Vorschlag übernommen: Kaltgare bis Mo 08:00, keine Konflikt- und Schlaf-Warnung, Ziel Mo 10:45", () => {
      const before = ac9().timeline;
      const suggestion = before.conflicts[0].suggestion!;
      expect(suggestion).not.toBeNull();

      const result = withUnchangedInput(before, (tl) =>
        applySuggestion(tl as RecalibratedTimeline, suggestion),
      );
      const tl = result.timeline;

      expectPhaseTimes(tl, [
        ["coldProof", "2026-10-11T22:45:00+02:00", "2026-10-12T08:00:00+02:00"],
        ["preheat", "2026-10-12T07:00:00+02:00", "2026-10-12T08:00:00+02:00"],
        ["bake", "2026-10-12T08:00:00+02:00", "2026-10-12T08:45:00+02:00"],
        ["cool", "2026-10-12T08:45:00+02:00", "2026-10-12T10:45:00+02:00"],
      ]);
      expect(phase(tl, "coldProof").durationMinutes).toBe(555);
      expect(tl.target.toISOString()).toBe(iso("2026-10-12T10:45:00+02:00"));
      expect(tl.bakeStart.toISOString()).toBe(iso("2026-10-12T08:00:00+02:00"));
      expectSeamlessMainChain(tl);
      expect(tl.conflicts).toEqual([]);
      expect(warnedSteps(tl)).toEqual([]);
    });

    it("F014/AC-10 Vorschlag auf einen Plan ohne Kaltgare wird abgelehnt", () => {
      const suggestion = ac9().timeline.conflicts[0].suggestion!;
      expect(suggestion).not.toBeNull();

      const noColdProof = generateBackwardSchedule(at("2026-10-11T22:00:00+02:00"), {
        durations: { coldProof: 0 },
      });
      const mixEnd = phase(noColdProof, "mixAutolyse").end;
      const recalibrated = recalibrateSchedule(noColdProof, "mixAutolyse", mixEnd).timeline;
      expect(recalibrated.phases.some((p) => p.id === "coldProof")).toBe(false);

      withUnchangedInput(recalibrated, (tl) =>
        expectThrowMessage(
          () => applySuggestion(tl as RecalibratedTimeline, suggestion),
          SUGGESTION_NOT_APPLICABLE_MESSAGE,
        ),
      );
      expect(SUGGESTION_NOT_APPLICABLE_MESSAGE).toBe("Der Lösungsvorschlag passt nicht zum Plan.");
    });
  });

  describe("F014/AC-11 Konfliktwarnung ohne Lösungsvorschlag über der Max-Kaltgare", () => {
    it("F014/AC-11 Max-Kaltgare 9 Std.: gleicher Plan wie AC-9, Warnung für Backen ohne Vorschlag", () => {
      const result = ac9({ maxColdProofMinutes: 540 });
      const tl = result.timeline;

      expectPhaseTimes(tl, AC9_PHASES);
      expect(isoTimes(tl)).toEqual(isoTimes(ac9().timeline));
      expect(tl.conflicts).toHaveLength(1);
      expect(tl.conflicts[0].stepId).toBe("bake");
      expect(tl.conflicts[0].start.toISOString()).toBe(iso("2026-10-11T23:15:00+02:00"));
      expect(tl.conflicts[0].suggestion).toBeNull();
    });
  });

  describe("F014/AC-12 Pünktlich erledigt ändert nichts außer dem Status", () => {
    it("F014/AC-12 Stockgare genau 18:45: alle Zeiten wie im Referenzplan, „Keine“, keine Konflikte", () => {
      const plan = referencePlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T18:45:00+02:00")),
      );
      const tl = result.timeline;

      expect(isoTimes(tl)).toEqual(isoTimes(plan));
      expect(stretchAndFoldTimes(tl)).toEqual(stretchAndFoldTimes(plan));
      expect(tl.target.toISOString()).toBe(plan.target.toISOString());
      expect(tl.bakeStart.toISOString()).toBe(plan.bakeStart.toISOString());
      expect(tl.start.toISOString()).toBe(plan.start.toISOString());
      expect(tl.phases.map((p) => p.durationMinutes)).toEqual(
        plan.phases.map((p) => p.durationMinutes),
      );

      expect(tl.phases.filter((p) => p.completed).map((p) => p.id)).toEqual(["bulkFermentation"]);
      expect(result.appliedStrategy).toBe("none");
      expect(result.targetShiftMinutes).toBe(0);
      expect(result.deviationMinutes).toBe(0);
      expect(tl.conflicts).toEqual([]);
    });
  });

  describe("F014/AC-13 Ungültige Eingaben", () => {
    it("F014/AC-13 Meldungen haben den Wortlaut aus dem Ticket", () => {
      expect(STEP_NOT_FOUND_MESSAGE).toBe("Der Schritt ist im Plan nicht vorhanden.");
      expect(INVALID_COMPLETED_AT_MESSAGE).toBe(
        "Der Abschlusszeitpunkt muss ein gültiges Datum sein.",
      );
      expect(STEP_ALREADY_COMPLETED_MESSAGE).toBe("Der Schritt ist bereits erledigt.");
      expect(COLD_PROOF_LIMITS_ORDER_MESSAGE).toBe(
        "Die Mindest-Kaltgare darf nicht länger als die Max-Kaltgare sein.",
      );
    });

    it("F014/AC-13 unbekannter Schritt meldet „Der Schritt ist im Plan nicht vorhanden.“", () => {
      const plan = referencePlan();
      for (const stepId of ["unknownStep", "stretchAndFold#5"]) {
        withUnchangedInput(plan, (tl) =>
          expectThrowMessage(
            () => recalibrateSchedule(tl, stepId, at("2026-10-10T19:00:00+02:00")),
            STEP_NOT_FOUND_MESSAGE,
          ),
        );
      }
    });

    it("F014/AC-13 ungültiger Abschlusszeitpunkt meldet „Der Abschlusszeitpunkt muss ein gültiges Datum sein.“", () => {
      const plan = referencePlan();
      for (const completedAt of [new Date("x"), "2026-10-10" as unknown as Date]) {
        withUnchangedInput(plan, (tl) =>
          expectThrowMessage(
            () => recalibrateSchedule(tl, "bulkFermentation", completedAt),
            INVALID_COMPLETED_AT_MESSAGE,
          ),
        );
      }
    });

    it("F014/AC-13 bereits erledigter Schritt meldet „Der Schritt ist bereits erledigt.“", () => {
      const done = recalibrateSchedule(
        referencePlan(),
        "bulkFermentation",
        at("2026-10-10T18:45:00+02:00"),
      ).timeline;
      withUnchangedInput(done, (tl) =>
        expectThrowMessage(
          () => recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T19:00:00+02:00")),
          STEP_ALREADY_COMPLETED_MESSAGE,
        ),
      );
    });

    it("F014/AC-13 Mindest-Kaltgare länger als Max-Kaltgare wird abgelehnt", () => {
      const plan = referencePlan();
      withUnchangedInput(plan, (tl) =>
        expectThrowMessage(
          () =>
            recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T19:45:00+02:00"), {
              minColdProofMinutes: 600,
              maxColdProofMinutes: 500,
            }),
          COLD_PROOF_LIMITS_ORDER_MESSAGE,
        ),
      );
    });

    it("F014/AC-13 zwei gleichzeitige Eingabefehler: Prüfreihenfolge Schritt → Datum → erledigt → Min/Max", () => {
      const plan = referencePlan();
      withUnchangedInput(plan, (tl) =>
        expectThrowMessage(
          () => recalibrateSchedule(tl, "unknownStep", new Date("x")),
          STEP_NOT_FOUND_MESSAGE,
        ),
      );

      const done = recalibrateSchedule(plan, "bulkFermentation", at("2026-10-10T18:45:00+02:00"))
        .timeline;
      withUnchangedInput(done, (tl) =>
        expectThrowMessage(
          () =>
            recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T19:00:00+02:00"), {
              minColdProofMinutes: 600,
              maxColdProofMinutes: 500,
            }),
          STEP_ALREADY_COMPLETED_MESSAGE,
        ),
      );
    });
  });

  describe("F014/AC-14 Vorheizen mit Beginn vor jetzt wird als „sofort starten“ gekennzeichnet", () => {
    it("F014/AC-14 Abendplan, Formgebung genau 18:45: Zeiten unverändert, Vorheizen „sofort starten“", () => {
      const plan = eveningPlan();
      const result = withUnchangedInput(plan, (tl) =>
        recalibrateSchedule(tl, "shaping", at("2026-10-11T18:45:00+02:00")),
      );
      const tl = result.timeline;

      expect(isoTimes(tl)).toEqual(isoTimes(plan));
      expect(tl.target.toISOString()).toBe(plan.target.toISOString());
      expect(phase(tl, "shaping").completed).toBe(true);
      expect(result.appliedStrategy).toBe("none");
      expect(result.targetShiftMinutes).toBe(0);

      const preheat = phase(tl, "preheat");
      expect(preheat.start.toISOString()).toBe(iso("2026-10-11T18:15:00+02:00"));
      expect(preheat.completed).toBe(false);
      expect(preheat.startImmediately).toBe(true);
      expect(result.preheatStartImmediately).toBe(true);
      expect(
        tl.phases.filter((p) => p.id !== "preheat").every((p) => p.startImmediately === false),
      ).toBe(true);
    });

    it("F014/AC-14 Gegenprobe Referenzplan: Vorheizen erst So 08:15, keine Kennzeichnung", () => {
      const result = recalibrateSchedule(
        referencePlan(),
        "bulkFermentation",
        at("2026-10-10T18:45:00+02:00"),
      );
      expect(phase(result.timeline, "preheat").start.toISOString()).toBe(
        iso("2026-10-11T08:15:00+02:00"),
      );
      expect(result.timeline.phases.every((p) => p.startImmediately === false)).toBe(true);
      expect(result.preheatStartImmediately).toBe(false);
    });

    it("F014/AC-14 Gegenprobe Parken: „jetzt“ ist das Herausnehmen um 20:30, keine Kennzeichnung", () => {
      const result = parkDoughInFridge(
        referencePlan(),
        at("2026-10-10T16:30:00+02:00"),
        at("2026-10-10T20:30:00+02:00"),
      );
      expect(phase(result.timeline, "preheat").start.toISOString()).toBe(
        iso("2026-10-11T08:15:00+02:00"),
      );
      expect(phase(result.timeline, "preheat").startImmediately).toBe(false);
      expect(result.preheatStartImmediately).toBe(false);
    });
  });
});

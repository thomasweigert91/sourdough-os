// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  COMPLETED_BEFORE_STEP_START_MESSAGE,
  INVALID_STRATEGY_MESSAGE,
  recalibrateSchedule,
  stretchAndFoldStepId,
  SUGGESTION_NOT_APPLICABLE_MESSAGE,
  type RecalibratedPhase,
  type RecalibratedTimeline,
  type RecalibrationStrategy,
} from "@/lib/baking-engine/recalibrate";
import {
  generateBackwardSchedule,
  type PhaseId,
  type ScheduleTimeline,
} from "@/lib/baking-engine/schedule";

// Härtung F014 nach Review-Runde 1 (Befunde 1, 2, 3, 4, 6, 7).

type AnyTimeline = ScheduleTimeline | RecalibratedTimeline;

function at(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Ungültiger Test-Zeitpunkt: ${iso}`);
  return date;
}

const iso = (value: string): string => at(value).toISOString();

function phase(timeline: RecalibratedTimeline, id: PhaseId): RecalibratedPhase {
  const found = timeline.phases.find((p) => p.id === id);
  if (!found) throw new Error(`Phase „${id}“ fehlt im Plan`);
  return found;
}

function expectPhaseTimes(
  timeline: RecalibratedTimeline,
  expected: Array<[id: PhaseId, start: string, end: string]>,
): void {
  for (const [id, start, end] of expected) {
    const p = phase(timeline, id);
    expect(p.start.toISOString(), `Beginn ${id}`).toBe(iso(start));
    expect(p.end.toISOString(), `Ende ${id}`).toBe(iso(end));
  }
}

function times(timeline: AnyTimeline): string[][] {
  return timeline.phases.map((p) => [
    p.id,
    p.start.toISOString(),
    p.end.toISOString(),
    ...p.stretchAndFolds.map((sf) => sf.at.toISOString()),
  ]);
}

function expectThrowMessage(fn: () => unknown, message: string): void {
  expect(fn).toThrowError(new Error(message));
}

function expectUnchanged<T>(timeline: AnyTimeline, fn: (tl: AnyTimeline) => T): T {
  const before = structuredClone(timeline);
  const result = fn(timeline);
  expect(timeline).toEqual(before);
  return result;
}

function referencePlan(): ScheduleTimeline {
  return generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"));
}

function eveningPlan(): ScheduleTimeline {
  return generateBackwardSchedule(at("2026-10-11T22:00:00+02:00"), {
    durations: { coldProof: 30 },
  });
}

function ac9() {
  return recalibrateSchedule(eveningPlan(), "mixAutolyse", at("2026-10-11T17:45:00+02:00"), {
    strategy: "shift",
  });
}

const REF_TAIL: Array<[PhaseId, string, string]> = [
  ["preheat", "2026-10-11T08:15:00+02:00", "2026-10-11T09:15:00+02:00"],
  ["bake", "2026-10-11T09:15:00+02:00", "2026-10-11T10:00:00+02:00"],
  ["cool", "2026-10-11T10:00:00+02:00", "2026-10-11T12:00:00+02:00"],
];

describe("F014 Härtung: erledigte Schritte werden nie verschoben (Befund 1)", () => {
  it("Levain nach der Stockgare erledigt: alle Zeiten bleiben, nur der Status ändert sich", () => {
    const afterBulk = recalibrateSchedule(
      referencePlan(),
      "bulkFermentation",
      at("2026-10-10T18:45:00+02:00"),
    ).timeline;

    const result = expectUnchanged(afterBulk, (tl) =>
      recalibrateSchedule(tl, "levain", at("2026-10-10T19:00:00+02:00")),
    );

    expect(times(result.timeline)).toEqual(times(afterBulk));
    expect(phase(result.timeline, "levain").completed).toBe(true);
    expect(phase(result.timeline, "bulkFermentation").completed).toBe(true);
    expectPhaseTimes(result.timeline, [
      ["bulkFermentation", "2026-10-10T14:15:00+02:00", "2026-10-10T18:45:00+02:00"],
    ]);
    expect(result.appliedStrategy).toBe("none");
    expect(result.targetShiftMinutes).toBe(0);
  });

  it("verspätete Stockgare bleibt beim nachträglichen Levain-Haken auf ihren festgehaltenen Zeiten", () => {
    const afterBulk = recalibrateSchedule(
      referencePlan(),
      "bulkFermentation",
      at("2026-10-10T19:45:00+02:00"),
    ).timeline;

    const result = recalibrateSchedule(afterBulk, "levain", at("2026-10-10T20:00:00+02:00"));

    expect(times(result.timeline)).toEqual(times(afterBulk));
    expect(result.appliedStrategy).toBe("none");
    expect(result.targetShiftMinutes).toBe(0);
  });

  it("Mischen nach der Formgebung erledigt: Formgebung und Rest bleiben stehen", () => {
    const afterShaping = recalibrateSchedule(
      referencePlan(),
      "shaping",
      at("2026-10-10T19:15:00+02:00"),
    ).timeline;

    const result = recalibrateSchedule(afterShaping, "mixAutolyse", at("2026-10-10T14:45:00+02:00"));

    expect(times(result.timeline)).toEqual(times(afterShaping));
    expect(phase(result.timeline, "mixAutolyse").completed).toBe(true);
    expect(phase(result.timeline, "shaping").completed).toBe(true);
    expect(result.appliedStrategy).toBe("none");
  });

  it("Durchgang einer erledigten Stockgare: Zeiten bleiben, nur der Status ändert sich", () => {
    const afterBulk = recalibrateSchedule(
      referencePlan(),
      "bulkFermentation",
      at("2026-10-10T18:45:00+02:00"),
    ).timeline;

    const result = recalibrateSchedule(
      afterBulk,
      stretchAndFoldStepId(2),
      at("2026-10-10T19:00:00+02:00"),
    );

    expect(times(result.timeline)).toEqual(times(afterBulk));
    expect(phase(result.timeline, "bulkFermentation").stretchAndFolds[1].completed).toBe(true);
    expect(result.appliedStrategy).toBe("none");
  });
});

describe("F014 Härtung: verspätetes Vorheizen ist reine Verschiebung (Befund 2)", () => {
  it("Vorheizen 30 Min. verspätet: Backen und Auskühlen +30 Min., „Verschiebung“", () => {
    const result = expectUnchanged(referencePlan(), (tl) =>
      recalibrateSchedule(tl, "preheat", at("2026-10-11T09:45:00+02:00")),
    );

    expectPhaseTimes(result.timeline, [
      ["coldProof", "2026-10-10T19:15:00+02:00", "2026-10-11T09:45:00+02:00"],
      ["preheat", "2026-10-11T08:15:00+02:00", "2026-10-11T09:45:00+02:00"],
      ["bake", "2026-10-11T09:45:00+02:00", "2026-10-11T10:30:00+02:00"],
      ["cool", "2026-10-11T10:30:00+02:00", "2026-10-11T12:30:00+02:00"],
    ]);
    expect(result.appliedStrategy).toBe("shift");
    expect(result.targetShiftMinutes).toBe(30);
    expect(result.deviationMinutes).toBe(30);
  });
});

describe("F014 Härtung: Abschluss vor Beginn des Schritts (Befund 3)", () => {
  it("Stockgare um 12:00 erledigt (Beginn 14:15) wird abgelehnt, Eingabe unverändert", () => {
    expectUnchanged(referencePlan(), (tl) =>
      expectThrowMessage(
        () => recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T12:00:00+02:00")),
        COMPLETED_BEFORE_STEP_START_MESSAGE,
      ),
    );
    expect(COMPLETED_BEFORE_STEP_START_MESSAGE).toBe(
      "Der Abschlusszeitpunkt darf nicht vor dem Beginn des Schritts liegen.",
    );
  });

  it("Abschluss genau zum Beginn ist erlaubt", () => {
    const result = recalibrateSchedule(
      referencePlan(),
      "shaping",
      at("2026-10-10T18:45:00+02:00"),
    );
    expect(phase(result.timeline, "shaping").durationMinutes).toBe(0);
  });
});

describe("F014 Härtung: Kompensation auch für andere Schritte vor der Kaltgare (Befund 4)", () => {
  it("Formgebung 60 Min. verspätet, Standardstrategie: Kaltgare 13 Std., Ziel unverändert", () => {
    const result = recalibrateSchedule(referencePlan(), "shaping", at("2026-10-10T20:15:00+02:00"));

    expectPhaseTimes(result.timeline, [
      ["shaping", "2026-10-10T18:45:00+02:00", "2026-10-10T20:15:00+02:00"],
      ["coldProof", "2026-10-10T20:15:00+02:00", "2026-10-11T09:15:00+02:00"],
      ...REF_TAIL,
    ]);
    expect(phase(result.timeline, "coldProof").durationMinutes).toBe(780);
    expect(result.appliedStrategy).toBe("compensation");
    expect(result.targetShiftMinutes).toBe(0);
  });

  it("Mischen 30 Min. verspätet, Standardstrategie: Kaltgare 13 Std. 30 Min., Ziel unverändert", () => {
    const result = recalibrateSchedule(
      referencePlan(),
      "mixAutolyse",
      at("2026-10-10T14:45:00+02:00"),
    );

    expectPhaseTimes(result.timeline, [
      ["bulkFermentation", "2026-10-10T14:45:00+02:00", "2026-10-10T19:15:00+02:00"],
      ["shaping", "2026-10-10T19:15:00+02:00", "2026-10-10T19:45:00+02:00"],
      ["coldProof", "2026-10-10T19:45:00+02:00", "2026-10-11T09:15:00+02:00"],
      ...REF_TAIL,
    ]);
    expect(phase(result.timeline, "coldProof").durationMinutes).toBe(810);
    expect(result.appliedStrategy).toBe("compensation");
    expect(result.targetShiftMinutes).toBe(0);
  });

  it("übernommener Vorschlag aus AC-9 meldet „Kompensation + Verschiebung“ und +525 Min.", () => {
    const { timeline } = ac9();
    const suggestion = timeline.conflicts[0].suggestion;
    expect(suggestion).not.toBeNull();
    if (!suggestion) return;

    const result = applySuggestion(timeline, suggestion);

    expect(result.appliedStrategy).toBe("compensationAndShift");
    expect(result.targetShiftMinutes).toBe(525);
    expect(result.deviationMinutes).toBe(0);
    expect(result.preheatStartImmediately).toBe(false);
  });
});

describe("F014 Härtung: Optionen und Vorschlag werden geprüft (Befunde 6, 7)", () => {
  it("unbekannte Strategie wird mit fester Meldung abgelehnt", () => {
    expectUnchanged(referencePlan(), (tl) =>
      expectThrowMessage(
        () =>
          recalibrateSchedule(tl, "bulkFermentation", at("2026-10-10T19:45:00+02:00"), {
            strategy: "park" as unknown as RecalibrationStrategy,
          }),
        INVALID_STRATEGY_MESSAGE,
      ),
    );
    expect(INVALID_STRATEGY_MESSAGE).toBe("Die Strategie ist nicht bekannt.");
  });

  it("Vorschlag über der Max-Kaltgare wird abgelehnt", () => {
    const { timeline } = ac9();
    const suggestion = timeline.conflicts[0].suggestion;
    expect(suggestion).not.toBeNull();
    if (!suggestion) return;

    expectUnchanged(timeline, (tl) =>
      expectThrowMessage(
        () => applySuggestion(tl as RecalibratedTimeline, suggestion, { maxColdProofMinutes: 540 }),
        SUGGESTION_NOT_APPLICABLE_MESSAGE,
      ),
    );
  });
});

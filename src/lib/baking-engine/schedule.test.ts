// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHASE_DURATIONS,
  DEFAULT_SLEEP_WINDOW,
  DEFAULT_STRETCH_AND_FOLD,
  DEFAULT_TIME_ZONE,
  generateBackwardSchedule,
  INVALID_PHASE_DURATION_MESSAGE,
  INVALID_STRETCH_AND_FOLD_MESSAGE,
  INVALID_TARGET_DATE_MESSAGE,
  PHASE_IDS,
  PHASE_LABELS,
  STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE,
  type PhaseId,
  type ScheduleConfig,
  type SchedulePhase,
  type ScheduleTimeline,
} from "@/lib/baking-engine/schedule";

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

/** Zeitpunkt aus ISO-String mit festem Offset (unabhängig von der Rechner-Zeitzone). */
function at(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Ungültiger Test-Zeitpunkt: ${iso}`);
  return date;
}

function phase(timeline: ScheduleTimeline, id: PhaseId): SchedulePhase {
  const found = timeline.phases.find((p) => p.id === id);
  expect(found, `Phase „${id}“ fehlt im Plan`).toBeDefined();
  return found as SchedulePhase;
}

/** Alle Phasen außer dem Vorheizen. */
function mainChain(timeline: ScheduleTimeline): SchedulePhase[] {
  return timeline.phases.filter((p) => p.id !== "preheat");
}

/** Schritte mit Schlaf-Warnung: Phasen-IDs und „stretchAndFold#n“. */
function warnedSteps(timeline: ScheduleTimeline): string[] {
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

/** Prüft Reihenfolge sowie Beginn und Ende jeder Phase (Vergleich über ISO in UTC). */
function expectPhases(timeline: ScheduleTimeline, expected: ExpectedPhase[]): void {
  expect(timeline.phases.map((p) => p.id)).toEqual(expected.map(([id]) => id));
  for (const [id, start, end] of expected) {
    const p = phase(timeline, id);
    expect(p.start.toISOString(), `Beginn ${id}`).toBe(at(start).toISOString());
    expect(p.end.toISOString(), `Ende ${id}`).toBe(at(end).toISOString());
  }
}

/** Hauptkette lückenlos, letzte Phase endet genau beim Zielzeitpunkt. */
function expectSeamlessMainChain(timeline: ScheduleTimeline, target: Date): void {
  const chain = mainChain(timeline);
  expect(chain.length).toBeGreaterThan(0);
  for (let i = 0; i < chain.length - 1; i++) {
    expect(chain[i].end.getTime(), `${chain[i].id} → ${chain[i + 1].id}`).toBe(
      chain[i + 1].start.getTime(),
    );
  }
  expect(chain[chain.length - 1].end.getTime()).toBe(target.getTime());
}

function isoTimes(timeline: ScheduleTimeline): Array<[string, string, string]> {
  return timeline.phases.map((p) => [p.id, p.start.toISOString(), p.end.toISOString()]);
}

function stretchAndFoldTimes(timeline: ScheduleTimeline): string[] {
  return phase(timeline, "bulkFermentation").stretchAndFolds.map((sf) => sf.at.toISOString());
}

const isoList = (values: string[]): string[] => values.map((v) => at(v).toISOString());

// Wortlaut aus Ticket bzw. Plan
const MSG_TARGET = "Der Zielzeitpunkt muss ein gültiges Datum sein.";
const MSG_DURATION = "Die Dauer einer Phase muss eine Zahl ab 0 sein.";
const MSG_SF_FIT = "Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.";
const MSG_SF_INVALID = "Anzahl und Abstand der Dehnen-und-Falten-Durchgänge müssen gültige Zahlen sein.";

/** Referenzplan So 11.10.2026 12:00 Uhr (Berlin, Sommerzeit). */
const AC1_EXPECTED: ExpectedPhase[] = [
  ["levain", "2026-10-10T08:15:00+02:00", "2026-10-10T13:15:00+02:00"],
  ["mixAutolyse", "2026-10-10T13:15:00+02:00", "2026-10-10T14:15:00+02:00"],
  ["bulkFermentation", "2026-10-10T14:15:00+02:00", "2026-10-10T18:45:00+02:00"],
  ["shaping", "2026-10-10T18:45:00+02:00", "2026-10-10T19:15:00+02:00"],
  ["coldProof", "2026-10-10T19:15:00+02:00", "2026-10-11T09:15:00+02:00"],
  ["preheat", "2026-10-11T08:15:00+02:00", "2026-10-11T09:15:00+02:00"],
  ["bake", "2026-10-11T09:15:00+02:00", "2026-10-11T10:00:00+02:00"],
  ["cool", "2026-10-11T10:00:00+02:00", "2026-10-11T12:00:00+02:00"],
];

// ---------------------------------------------------------------------------

describe("F012 Rückwärts-Planer (src/lib/baking-engine/schedule.ts)", () => {
  describe("F012/AC-1 Lückenloser Plan rückwärts vom Zielzeitpunkt", () => {
    it("F012/AC-1 erzeugt für So 11.10.2026 12:00 die acht Phasen in fester Reihenfolge mit den Zeiten aus dem Ticket", () => {
      const target = at("2026-10-11T12:00:00+02:00");
      const timeline = generateBackwardSchedule(target, {});

      expect(timeline.phases.map((p) => p.id)).toEqual([...PHASE_IDS]);
      expect(timeline.phases).toHaveLength(8);
      expectPhases(timeline, AC1_EXPECTED);
    });

    it("F012/AC-1 Hauptkette ist lückenlos und endet beim Zielzeitpunkt, kein Schritt warnt", () => {
      const target = at("2026-10-11T12:00:00+02:00");
      const timeline = generateBackwardSchedule(target, {});

      expectSeamlessMainChain(timeline, target);
      expect(mainChain(timeline).map((p) => p.id)).toEqual([
        "levain",
        "mixAutolyse",
        "bulkFermentation",
        "shaping",
        "coldProof",
        "bake",
        "cool",
      ]);
      expect(warnedSteps(timeline)).toEqual([]);
    });

    it("F012/AC-1 setzt Bezeichnung und Standarddauer je Phase", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {});

      for (const p of timeline.phases) {
        expect(p.label).toBe(PHASE_LABELS[p.id]);
        expect(p.durationMinutes).toBe(DEFAULT_PHASE_DURATIONS[p.id]);
        expect(p.end.getTime() - p.start.getTime()).toBe(p.durationMinutes * 60_000);
      }
      expect(PHASE_LABELS).toEqual({
        levain: "Levain ansetzen",
        mixAutolyse: "Hauptteig mischen & Autolyse",
        bulkFermentation: "Stockgare",
        shaping: "Formgebung & Bench Rest",
        coldProof: "Stückgare / Kaltgare im Kühlschrank",
        preheat: "Ofen vorheizen",
        bake: "Backen",
        cool: "Auskühlen",
      });
    });

    it("F012/AC-1 Standarddauern sind 300/60/270/30/840/60/45/120 Minuten", () => {
      expect(DEFAULT_PHASE_DURATIONS).toEqual({
        levain: 300,
        mixAutolyse: 60,
        bulkFermentation: 270,
        shaping: 30,
        coldProof: 840,
        preheat: 60,
        bake: 45,
        cool: 120,
      });
    });

    it("F012/AC-1 ohne Dauern, mit leerem durations-Objekt, mit undefined-Werten und mit expliziten Standarddauern entsteht derselbe Plan", () => {
      const target = at("2026-10-11T12:00:00+02:00");
      const withoutDurations = generateBackwardSchedule(target, {});
      const emptyDurations = generateBackwardSchedule(target, { durations: {} });
      const explicitDefaults = generateBackwardSchedule(target, {
        durations: {
          levain: 300,
          mixAutolyse: 60,
          bulkFermentation: 270,
          shaping: 30,
          coldProof: 840,
          preheat: 60,
          bake: 45,
          cool: 120,
        },
      });
      const undefinedValues = generateBackwardSchedule(target, {
        durations: { coldProof: undefined, levain: undefined },
      } as ScheduleConfig);

      expectPhases(withoutDurations, AC1_EXPECTED);
      expect(emptyDurations).toEqual(withoutDurations);
      expect(explicitDefaults).toEqual(withoutDurations);
      expect(undefinedValues).toEqual(withoutDurations);
    });

    it("F012/AC-1 gibt den Zielzeitpunkt als neue Instanz zurück und verändert die Eingabe nicht", () => {
      const target = at("2026-10-11T12:00:00+02:00");
      const before = target.getTime();
      const timeline = generateBackwardSchedule(target, {});

      expect(timeline.target).not.toBe(target);
      expect(timeline.target.getTime()).toBe(before);
      expect(target.getTime()).toBe(before);
      expect(phase(timeline, "cool").end).not.toBe(target);
    });
  });

  describe("F012/AC-2 Backbeginn und Startzeitpunkt als eigene Werte", () => {
    it("F012/AC-2 liefert für Ziel So 12:00 Backbeginn So 09:15 und Start Sa 08:15", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {});

      expect(timeline.bakeStart.toISOString()).toBe(at("2026-10-11T09:15:00+02:00").toISOString());
      expect(timeline.start.toISOString()).toBe(at("2026-10-10T08:15:00+02:00").toISOString());
      expect(timeline.bakeStart.getTime()).toBe(phase(timeline, "bake").start.getTime());
      expect(timeline.start.getTime()).toBe(timeline.phases[0].start.getTime());
    });

    it("F012/AC-2 liefert für Ziel So 08:30 Backbeginn So 05:45 und Start Sa 04:45", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T08:30:00+02:00"), {});

      expect(timeline.bakeStart.toISOString()).toBe(at("2026-10-11T05:45:00+02:00").toISOString());
      expect(timeline.start.toISOString()).toBe(at("2026-10-10T04:45:00+02:00").toISOString());
      expect(timeline.bakeStart.getTime()).toBe(phase(timeline, "bake").start.getTime());
      expect(timeline.start.getTime()).toBe(timeline.phases[0].start.getTime());
    });
  });

  describe("F012/AC-3 Dehnen-&-Falten-Durchgänge innerhalb der Stockgare", () => {
    it("F012/AC-3 legt 4 Durchgänge um Sa 14:45, 15:15, 15:45 und 16:15 als manuelle Schritte an", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {});
      const folds = phase(timeline, "bulkFermentation").stretchAndFolds;

      expect(folds).toHaveLength(4);
      expect(folds.map((sf) => sf.index)).toEqual([1, 2, 3, 4]);
      expect(stretchAndFoldTimes(timeline)).toEqual(
        isoList([
          "2026-10-10T14:45:00+02:00",
          "2026-10-10T15:15:00+02:00",
          "2026-10-10T15:45:00+02:00",
          "2026-10-10T16:15:00+02:00",
        ]),
      );
      for (const sf of folds) {
        expect(sf.manual).toBe(true);
        expect(sf.sleepWarning).toBe(false);
      }
    });

    it("F012/AC-3 nur die Stockgare trägt Durchgänge, alle anderen Phasen haben eine leere Liste", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {});

      for (const p of timeline.phases) {
        if (p.id === "bulkFermentation") continue;
        expect(p.stretchAndFolds, p.id).toEqual([]);
      }
    });

    it("F012/AC-3 mit 3 Durchgängen im Abstand von 45 Min. liegen sie um 15:00, 15:45 und 16:30, alle Phasen unverändert", () => {
      const target = at("2026-10-11T12:00:00+02:00");
      const standard = generateBackwardSchedule(target, {});
      const custom = generateBackwardSchedule(target, {
        stretchAndFold: { count: 3, intervalMinutes: 45 },
      });

      expect(stretchAndFoldTimes(custom)).toEqual(
        isoList([
          "2026-10-10T15:00:00+02:00",
          "2026-10-10T15:45:00+02:00",
          "2026-10-10T16:30:00+02:00",
        ]),
      );
      expect(phase(custom, "bulkFermentation").stretchAndFolds.map((sf) => sf.index)).toEqual([1, 2, 3]);
      expect(isoTimes(custom)).toEqual(isoTimes(standard));
      expectPhases(custom, AC1_EXPECTED);
    });

    it("F012/AC-3 nur die Anzahl überschrieben: Abstand bleibt 30 Min.", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {
        stretchAndFold: { count: 2 },
      });

      expect(stretchAndFoldTimes(timeline)).toEqual(
        isoList(["2026-10-10T14:45:00+02:00", "2026-10-10T15:15:00+02:00"]),
      );
    });

    it("F012/AC-3 Standard ist 4 Durchgänge im Abstand von 30 Min.", () => {
      expect(DEFAULT_STRETCH_AND_FOLD).toEqual({ count: 4, intervalMinutes: 30 });
    });
  });

  describe("F012/AC-4 Vorheizen bei kurzer oder fehlender Kaltgare", () => {
    const target = at("2026-10-11T22:00:00+02:00");

    it("F012/AC-4 bei 30 Min. Kaltgare überschneidet sich das Vorheizen mit der Formgebung, ohne Warnung", () => {
      const timeline = generateBackwardSchedule(target, { durations: { coldProof: 30 } });

      expectPhases(timeline, [
        ["levain", "2026-10-11T07:45:00+02:00", "2026-10-11T12:45:00+02:00"],
        ["mixAutolyse", "2026-10-11T12:45:00+02:00", "2026-10-11T13:45:00+02:00"],
        ["bulkFermentation", "2026-10-11T13:45:00+02:00", "2026-10-11T18:15:00+02:00"],
        ["shaping", "2026-10-11T18:15:00+02:00", "2026-10-11T18:45:00+02:00"],
        ["coldProof", "2026-10-11T18:45:00+02:00", "2026-10-11T19:15:00+02:00"],
        ["preheat", "2026-10-11T18:15:00+02:00", "2026-10-11T19:15:00+02:00"],
        ["bake", "2026-10-11T19:15:00+02:00", "2026-10-11T20:00:00+02:00"],
        ["cool", "2026-10-11T20:00:00+02:00", "2026-10-11T22:00:00+02:00"],
      ]);
      expect(timeline.bakeStart.toISOString()).toBe(at("2026-10-11T19:15:00+02:00").toISOString());
      expectSeamlessMainChain(timeline, target);
      expect(warnedSteps(timeline)).toEqual([]);
    });

    it("F012/AC-4 bei 0 Min. Kaltgare fehlt die Phase Kaltgare, die Kette schließt sich, keine Warnung", () => {
      const timeline = generateBackwardSchedule(target, { durations: { coldProof: 0 } });

      expectPhases(timeline, [
        ["levain", "2026-10-11T08:15:00+02:00", "2026-10-11T13:15:00+02:00"],
        ["mixAutolyse", "2026-10-11T13:15:00+02:00", "2026-10-11T14:15:00+02:00"],
        ["bulkFermentation", "2026-10-11T14:15:00+02:00", "2026-10-11T18:45:00+02:00"],
        ["shaping", "2026-10-11T18:45:00+02:00", "2026-10-11T19:15:00+02:00"],
        ["preheat", "2026-10-11T18:15:00+02:00", "2026-10-11T19:15:00+02:00"],
        ["bake", "2026-10-11T19:15:00+02:00", "2026-10-11T20:00:00+02:00"],
        ["cool", "2026-10-11T20:00:00+02:00", "2026-10-11T22:00:00+02:00"],
      ]);
      expect(timeline.phases).toHaveLength(7);
      expect(timeline.phases.some((p) => p.id === "coldProof")).toBe(false);
      expect(timeline.bakeStart.toISOString()).toBe(at("2026-10-11T19:15:00+02:00").toISOString());
      expect(phase(timeline, "shaping").end.getTime()).toBe(timeline.bakeStart.getTime());
      expectSeamlessMainChain(timeline, target);
      expect(warnedSteps(timeline)).toEqual([]);
    });
  });

  describe("F012/AC-5 Schlaf-Warnung beim Szenario Sonntagmorgen", () => {
    const target = at("2026-10-11T08:30:00+02:00");

    it("F012/AC-5 erzeugt für So 08:30 alle Phasen und Durchgänge wie im Ticket", () => {
      const timeline = generateBackwardSchedule(target, {});

      expectPhases(timeline, [
        ["levain", "2026-10-10T04:45:00+02:00", "2026-10-10T09:45:00+02:00"],
        ["mixAutolyse", "2026-10-10T09:45:00+02:00", "2026-10-10T10:45:00+02:00"],
        ["bulkFermentation", "2026-10-10T10:45:00+02:00", "2026-10-10T15:15:00+02:00"],
        ["shaping", "2026-10-10T15:15:00+02:00", "2026-10-10T15:45:00+02:00"],
        ["coldProof", "2026-10-10T15:45:00+02:00", "2026-10-11T05:45:00+02:00"],
        ["preheat", "2026-10-11T04:45:00+02:00", "2026-10-11T05:45:00+02:00"],
        ["bake", "2026-10-11T05:45:00+02:00", "2026-10-11T06:30:00+02:00"],
        ["cool", "2026-10-11T06:30:00+02:00", "2026-10-11T08:30:00+02:00"],
      ]);
      expect(stretchAndFoldTimes(timeline)).toEqual(
        isoList([
          "2026-10-10T11:15:00+02:00",
          "2026-10-10T11:45:00+02:00",
          "2026-10-10T12:15:00+02:00",
          "2026-10-10T12:45:00+02:00",
        ]),
      );
      expectSeamlessMainChain(timeline, target);
    });

    it("F012/AC-5 genau Levain ansetzen, Ofen vorheizen und Backen tragen eine Schlaf-Warnung", () => {
      const timeline = generateBackwardSchedule(target, {});

      expect(warnedSteps(timeline)).toEqual(["levain", "preheat", "bake"]);
    });

    it("F012/AC-5 passive Phasen Kaltgare und Auskühlen warnen nie, obwohl sie im Schlaf-Fenster liegen", () => {
      const timeline = generateBackwardSchedule(target, {});

      expect(phase(timeline, "coldProof").sleepWarning).toBe(false);
      expect(phase(timeline, "coldProof").manual).toBe(false);
      expect(phase(timeline, "cool").sleepWarning).toBe(false);
      expect(phase(timeline, "cool").manual).toBe(false);
    });

    it("F012/AC-5 manuell sind genau Levain, Mischen, Formgebung, Vorheizen und Backen", () => {
      const timeline = generateBackwardSchedule(target, {});

      expect(timeline.phases.filter((p) => p.manual).map((p) => p.id)).toEqual([
        "levain",
        "mixAutolyse",
        "shaping",
        "preheat",
        "bake",
      ]);
    });
  });

  describe("F012/AC-6 Grenzen des Schlaf-Fensters", () => {
    it("F012/AC-6 Ziel 16:15: Formgebung beginnt Sa 23:00 und warnt als einziger Schritt", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T16:15:00+02:00"), {});

      expect(phase(timeline, "shaping").start.toISOString()).toBe(
        at("2026-10-10T23:00:00+02:00").toISOString(),
      );
      expect(phase(timeline, "shaping").sleepWarning).toBe(true);
      expect(warnedSteps(timeline)).toEqual(["shaping"]);
    });

    it("F012/AC-6 Ziel 16:14: Formgebung beginnt Sa 22:59 ohne Warnung", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T16:14:00+02:00"), {});

      expect(phase(timeline, "shaping").start.toISOString()).toBe(
        at("2026-10-10T22:59:00+02:00").toISOString(),
      );
      expect(phase(timeline, "shaping").sleepWarning).toBe(false);
      expect(warnedSteps(timeline)).toEqual([]);
    });

    it("F012/AC-6 Ziel 10:45: Levain Sa 07:00 und Vorheizen So 07:00 ohne Warnung", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T10:45:00+02:00"), {});

      expect(phase(timeline, "levain").start.toISOString()).toBe(
        at("2026-10-10T07:00:00+02:00").toISOString(),
      );
      expect(phase(timeline, "preheat").start.toISOString()).toBe(
        at("2026-10-11T07:00:00+02:00").toISOString(),
      );
      expect(warnedSteps(timeline)).toEqual([]);
    });

    it("F012/AC-6 Ziel 10:44: Levain und Vorheizen um 06:59 tragen je eine Warnung, sonst keiner", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T10:44:00+02:00"), {});

      expect(phase(timeline, "levain").start.toISOString()).toBe(
        at("2026-10-10T06:59:00+02:00").toISOString(),
      );
      expect(phase(timeline, "preheat").start.toISOString()).toBe(
        at("2026-10-11T06:59:00+02:00").toISOString(),
      );
      expect(warnedSteps(timeline)).toEqual(["levain", "preheat"]);
    });

    it("F012/AC-6 Standard-Schlaf-Fenster ist 23:00 bis 07:00 (Minuten seit Mitternacht)", () => {
      expect(DEFAULT_SLEEP_WINDOW).toEqual({ startMinute: 1380, endMinute: 420 });
    });
  });

  describe("F012/AC-7 Eigenes Schlaf-Fenster und eigene Zeitzone", () => {
    const target = at("2026-10-11T10:00:00Z");

    it("F012/AC-7 Schlaf-Fenster 00:00 bis 09:00: Zeiten wie AC-1, genau Levain und Vorheizen warnen", () => {
      const timeline = generateBackwardSchedule(target, {
        sleepWindow: { startMinute: 0, endMinute: 540 },
      });

      expectPhases(timeline, AC1_EXPECTED);
      expect(isoTimes(timeline)).toEqual(isoTimes(generateBackwardSchedule(target, {})));
      expect(warnedSteps(timeline)).toEqual(["levain", "preheat"]);
      expect(phase(timeline, "bake").sleepWarning).toBe(false);
    });

    it("F012/AC-7 Zeitzone America/New_York: Zeiten wie AC-1, Levain, Vorheizen und Backen warnen", () => {
      const timeline = generateBackwardSchedule(target, { timeZone: "America/New_York" });

      expectPhases(timeline, AC1_EXPECTED);
      // Sa 02:15, So 02:15, So 03:15 New Yorker Zeit
      expect(phase(timeline, "levain").start.toISOString()).toBe(
        at("2026-10-10T02:15:00-04:00").toISOString(),
      );
      expect(phase(timeline, "preheat").start.toISOString()).toBe(
        at("2026-10-11T02:15:00-04:00").toISOString(),
      );
      expect(phase(timeline, "bake").start.toISOString()).toBe(
        at("2026-10-11T03:15:00-04:00").toISOString(),
      );
      expect(warnedSteps(timeline)).toEqual(["levain", "preheat", "bake"]);
    });

    it("F012/AC-7 Standard-Zeitzone ist Europe/Berlin", () => {
      expect(DEFAULT_TIME_ZONE).toBe("Europe/Berlin");
      const implicit = generateBackwardSchedule(target, {});
      const explicit = generateBackwardSchedule(target, { timeZone: "Europe/Berlin" });
      expect(explicit).toEqual(implicit);
      expect(warnedSteps(implicit)).toEqual([]);
    });
  });

  describe("F012/AC-8 Rechnen über die Zeitumstellung", () => {
    it("F012/AC-8 Ziel So 25.10.2026 12:00: Kaltgare 14 Std. echte Zeit, Start Sa 09:15, keine Warnung", () => {
      const target = at("2026-10-25T12:00:00+01:00");
      const timeline = generateBackwardSchedule(target, {});

      expectPhases(timeline, [
        ["levain", "2026-10-24T09:15:00+02:00", "2026-10-24T14:15:00+02:00"],
        ["mixAutolyse", "2026-10-24T14:15:00+02:00", "2026-10-24T15:15:00+02:00"],
        ["bulkFermentation", "2026-10-24T15:15:00+02:00", "2026-10-24T19:45:00+02:00"],
        ["shaping", "2026-10-24T19:45:00+02:00", "2026-10-24T20:15:00+02:00"],
        ["coldProof", "2026-10-24T20:15:00+02:00", "2026-10-25T09:15:00+01:00"],
        ["preheat", "2026-10-25T08:15:00+01:00", "2026-10-25T09:15:00+01:00"],
        ["bake", "2026-10-25T09:15:00+01:00", "2026-10-25T10:00:00+01:00"],
        ["cool", "2026-10-25T10:00:00+01:00", "2026-10-25T12:00:00+01:00"],
      ]);
      const cold = phase(timeline, "coldProof");
      expect(cold.end.getTime() - cold.start.getTime()).toBe(14 * 3_600_000);
      expect(stretchAndFoldTimes(timeline)).toEqual(
        isoList([
          "2026-10-24T15:45:00+02:00",
          "2026-10-24T16:15:00+02:00",
          "2026-10-24T16:45:00+02:00",
          "2026-10-24T17:15:00+02:00",
        ]),
      );
      expect(timeline.start.toISOString()).toBe(at("2026-10-24T09:15:00+02:00").toISOString());
      expectSeamlessMainChain(timeline, target);
      expect(warnedSteps(timeline)).toEqual([]);
    });

    it("F012/AC-8 Ziel 10:45: Vorheizen beginnt So 07:00 Winterzeit ohne Warnung", () => {
      const timeline = generateBackwardSchedule(at("2026-10-25T10:45:00+01:00"), {});

      expect(phase(timeline, "preheat").start.toISOString()).toBe(
        at("2026-10-25T07:00:00+01:00").toISOString(),
      );
      expect(warnedSteps(timeline)).toEqual([]);
    });

    it("F012/AC-8 Ziel 10:44: Vorheizen beginnt 06:59 Winterzeit und warnt als einziger Schritt", () => {
      const timeline = generateBackwardSchedule(at("2026-10-25T10:44:00+01:00"), {});

      expect(phase(timeline, "preheat").start.toISOString()).toBe(
        at("2026-10-25T06:59:00+01:00").toISOString(),
      );
      expect(warnedSteps(timeline)).toEqual(["preheat"]);
    });
  });

  describe("F012/AC-9 Ungültige Eingaben werfen Fehler", () => {
    it("F012/AC-9 Meldungskonstanten haben exakt den Wortlaut aus Ticket und Plan", () => {
      expect(INVALID_TARGET_DATE_MESSAGE).toBe(MSG_TARGET);
      expect(INVALID_PHASE_DURATION_MESSAGE).toBe(MSG_DURATION);
      expect(STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE).toBe(MSG_SF_FIT);
      expect(INVALID_STRETCH_AND_FOLD_MESSAGE).toBe(MSG_SF_INVALID);
    });

    it.each([
      ["new Date(\"kein Datum\")", () => new Date("kein Datum")],
      ["new Date(NaN)", () => new Date(NaN)],
      ["String statt Date", () => "2026-10-11" as unknown as Date],
    ] as const)("F012/AC-9 wirft bei ungültigem Zielzeitpunkt (%s) „Der Zielzeitpunkt muss ein gültiges Datum sein.“", (_label, make) => {
      expectThrowMessage(() => generateBackwardSchedule(make(), {}), MSG_TARGET);
    });

    const INVALID_DURATIONS = [-1, -0.5, NaN, Infinity, -Infinity] as const;
    const durationCases = PHASE_IDS.flatMap((id) =>
      INVALID_DURATIONS.map((value) => [id, value] as [PhaseId, number]),
    );

    it.each(durationCases)(
      "F012/AC-9 wirft bei Dauer %s = %s „Die Dauer einer Phase muss eine Zahl ab 0 sein.“",
      (id, value) => {
        expectThrowMessage(
          () =>
            generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {
              durations: { [id]: value },
            }),
          MSG_DURATION,
        );
      },
    );

    it.each([
      [10, 30],
      [9, 30],
    ])(
      "F012/AC-9 wirft bei %s Durchgängen im Abstand von %s Min. „Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.“",
      (count, intervalMinutes) => {
        expectThrowMessage(
          () =>
            generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {
              stretchAndFold: { count, intervalMinutes },
            }),
          MSG_SF_FIT,
        );
      },
    );

    it("F012/AC-9 wirft bei einem Durchgang und Stockgare 0 Min. die Passt-nicht-Meldung", () => {
      expectThrowMessage(
        () =>
          generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {
            durations: { bulkFermentation: 0 },
            stretchAndFold: { count: 1 },
          }),
        MSG_SF_FIT,
      );
    });

    it("F012/AC-9 8 Durchgänge à 30 Min. passen in 4 Std. 30 Min. Stockgare", () => {
      const timeline = generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), {
        stretchAndFold: { count: 8 },
      });
      const folds = phase(timeline, "bulkFermentation").stretchAndFolds;
      expect(folds).toHaveLength(8);
      expect(folds[7].at.toISOString()).toBe(at("2026-10-10T18:15:00+02:00").toISOString());
    });

    it.each([
      ["count −1", { count: -1 }],
      ["count 1,5", { count: 1.5 }],
      ["count NaN", { count: NaN }],
      ["intervalMinutes 0", { intervalMinutes: 0 }],
      ["intervalMinutes −30", { intervalMinutes: -30 }],
      ["intervalMinutes NaN", { intervalMinutes: NaN }],
    ] as const)("F012/AC-9 wirft bei ungültigen Durchgangsangaben (%s) die Meldung aus dem Plan", (_label, stretchAndFold) => {
      expectThrowMessage(
        () => generateBackwardSchedule(at("2026-10-11T12:00:00+02:00"), { stretchAndFold }),
        MSG_SF_INVALID,
      );
    });
  });
});

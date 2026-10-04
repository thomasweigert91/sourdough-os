// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  generateBackwardSchedule,
  INVALID_PHASE_DURATION_MESSAGE,
  INVALID_SLEEP_WINDOW_MESSAGE,
  INVALID_STRETCH_AND_FOLD_MESSAGE,
  INVALID_TARGET_DATE_MESSAGE,
  INVALID_TIME_ZONE_MESSAGE,
  MAX_STRETCH_AND_FOLD_COUNT,
  PHASE_IDS,
  STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE,
  TOO_MANY_STRETCH_AND_FOLDS_MESSAGE,
  type PhaseId,
  type ScheduleConfig,
  type SchedulePhase,
  type ScheduleTimeline,
  type SleepWindow,
} from "@/lib/baking-engine/schedule";

// ---------------------------------------------------------------------------
// Helfer (aus schedule.test.ts kopiert, dort nicht exportiert; F012-Datei bleibt unberührt)
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

/** Plan erzeugen, der nicht werfen darf; liefert den Plan. */
function expectSchedule(target: Date, config: ScheduleConfig): ScheduleTimeline {
  let timeline: ScheduleTimeline | undefined;
  expect(() => {
    timeline = generateBackwardSchedule(target, config);
  }).not.toThrow();
  expect(timeline).toBeDefined();
  return timeline as ScheduleTimeline;
}

const iso = (value: string): string => at(value).toISOString();

const REFERENCE_TARGET = at("2026-10-11T12:00:00+02:00");

/** Alle manuellen Dauern 0 und keine Durchgänge: Kein Schritt wird auf das Schlaf-Fenster geprüft. */
const MANUAL_ZERO_CONFIG = {
  durations: { levain: 0, mixAutolyse: 0, shaping: 0, preheat: 0, bake: 0 },
  stretchAndFold: { count: 0 },
} as const satisfies ScheduleConfig;

/** Alle Dauern 0, keine Durchgänge: Plan ohne Phasen. */
const ALL_ZERO_CONFIG: ScheduleConfig = {
  durations: Object.fromEntries(PHASE_IDS.map((id) => [id, 0])),
  stretchAndFold: { count: 0 },
};

const CONFIGS = [
  ["Referenz-Konfiguration", {}],
  ["alle manuellen Dauern 0, 0 Durchgänge", MANUAL_ZERO_CONFIG],
] as const satisfies ReadonlyArray<readonly [string, ScheduleConfig]>;

// Wortlaut aus Ticket bzw. Plan
const MSG_TARGET = "Der Zielzeitpunkt muss ein gültiges Datum sein.";
const MSG_DURATION = "Die Dauer einer Phase muss eine Zahl ab 0 sein.";
const MSG_SF_INVALID = "Anzahl und Abstand der Dehnen-und-Falten-Durchgänge müssen gültige Zahlen sein.";
const MSG_SF_FIT = "Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.";
const MSG_SF_TOO_MANY = "Es sind höchstens 20 Dehnen-und-Falten-Durchgänge möglich.";
const MSG_SLEEP_WINDOW = "Das Schlaf-Fenster muss aus ganzen Minuten zwischen 0 und 1439 bestehen.";
const MSG_TIME_ZONE = "Die Zeitzone ist ungültig.";

// ---------------------------------------------------------------------------

describe("F013 Planer-Engine härten (src/lib/baking-engine/schedule.ts)", () => {
  describe("F013/AC-1 Ungültige Zeitzone wird immer abgelehnt", () => {
    it("F013/AC-1 INVALID_TIME_ZONE_MESSAGE hat exakt den Wortlaut aus dem Ticket", () => {
      expect(INVALID_TIME_ZONE_MESSAGE).toBe(MSG_TIME_ZONE);
    });

    const invalidZoneCases = ["Mars/Olympus", "", "Europe/Berln"].flatMap((timeZone) =>
      CONFIGS.map(([label, config]) => [timeZone, label, config] as const),
    );

    it.each(invalidZoneCases)(
      "F013/AC-1 Zeitzone „%s“ (%s) wirft „Die Zeitzone ist ungültig.“ und liefert keinen Plan",
      (timeZone, _label, config) => {
        expectThrowMessage(
          () => generateBackwardSchedule(REFERENCE_TARGET, { ...config, timeZone }),
          MSG_TIME_ZONE,
        );
      },
    );

    const validZoneCases = ["Europe/Berlin", "America/New_York", "UTC"].flatMap((timeZone) =>
      CONFIGS.map(([label, config]) => [timeZone, label, config] as const),
    );

    it.each(validZoneCases)(
      "F013/AC-1 Zeitzone „%s“ (%s) wirft nicht und liefert einen Plan",
      (timeZone, _label, config) => {
        const timeline = expectSchedule(REFERENCE_TARGET, { ...config, timeZone });
        expect(timeline.target.toISOString()).toBe(REFERENCE_TARGET.toISOString());
      },
    );

    it.each(CONFIGS)(
      "F013/AC-1 Zeitzone null (%s) wirft ebenfalls „Die Zeitzone ist ungültig.“",
      (_label, config) => {
        expectThrowMessage(
          () =>
            generateBackwardSchedule(REFERENCE_TARGET, {
              ...config,
              timeZone: null as unknown as string,
            }),
          MSG_TIME_ZONE,
        );
      },
    );

    it.each([
      ["Zahl 42", 42],
      ["Objekt", { name: "Europe/Berlin" }],
    ] as const)("F013/AC-1 Zeitzone, die keine Zeichenkette ist (%s), wirft die Zeitzonen-Meldung", (_label, value) => {
      expectThrowMessage(
        () => generateBackwardSchedule(REFERENCE_TARGET, { timeZone: value as unknown as string }),
        MSG_TIME_ZONE,
      );
    });

    it("F013/AC-1 nur eine fehlende Zeitzone (undefined) nimmt den Standard Europe/Berlin", () => {
      const target = at("2026-10-11T08:30:00+02:00");
      const implicit = expectSchedule(target, { timeZone: undefined });
      const explicit = expectSchedule(target, { timeZone: "Europe/Berlin" });

      expect(implicit).toEqual(explicit);
      // Berliner Ortszeit: Levain, Vorheizen und Backen warnen (wie F012/AC-5)
      expect(warnedSteps(implicit)).toEqual(["levain", "preheat", "bake"]);
    });
  });

  describe("F013/AC-2 Ungültiges Schlaf-Fenster wird abgelehnt", () => {
    it("F013/AC-2 INVALID_SLEEP_WINDOW_MESSAGE hat exakt den Wortlaut aus dem Ticket", () => {
      expect(INVALID_SLEEP_WINDOW_MESSAGE).toBe(MSG_SLEEP_WINDOW);
    });

    const fields = ["startMinute", "endMinute"] as const satisfies ReadonlyArray<keyof SleepWindow>;

    const invalidNumberCases = [-1, 1440, 90.5, NaN, Infinity].flatMap((value) =>
      fields.map((field) => [field, value] as const),
    );

    it.each(invalidNumberCases)(
      "F013/AC-2 Schlaf-Fenster %s = %s wirft „Das Schlaf-Fenster muss aus ganzen Minuten zwischen 0 und 1439 bestehen.“",
      (field, value) => {
        expectThrowMessage(
          () => generateBackwardSchedule(REFERENCE_TARGET, { sleepWindow: { [field]: value } }),
          MSG_SLEEP_WINDOW,
        );
      },
    );

    const nonNumberCases = [
      ["Text „600“", "600"],
      ["null", null],
    ].flatMap(([label, value]) => fields.map((field) => [field, label, value] as const));

    it.each(nonNumberCases)(
      "F013/AC-2 Schlaf-Fenster %s als %s (keine Zahl) wirft die Schlaf-Fenster-Meldung",
      (field, _label, value) => {
        expectThrowMessage(
          () =>
            generateBackwardSchedule(REFERENCE_TARGET, {
              sleepWindow: { [field]: value as unknown as number },
            }),
          MSG_SLEEP_WINDOW,
        );
      },
    );

    it.each([
      ["startMinute", 0],
      ["startMinute", 1439],
      ["endMinute", 0],
      ["endMinute", 1439],
    ] as const)("F013/AC-2 Schlaf-Fenster %s = %s ist gültig und wirft nicht", (field, value) => {
      const timeline = expectSchedule(REFERENCE_TARGET, { sleepWindow: { [field]: value } });
      expect(timeline.phases.length).toBeGreaterThan(0);
    });

    it("F013/AC-2 Beginn gleich Ende (600/600) ist ein leeres Fenster: wirft nicht, kein Schritt warnt", () => {
      // Mit dem Standard-Fenster warnen bei Ziel So 08:30 Levain, Vorheizen und Backen (F012/AC-5).
      const timeline = expectSchedule(at("2026-10-11T08:30:00+02:00"), {
        sleepWindow: { startMinute: 600, endMinute: 600 },
      });
      expect(warnedSteps(timeline)).toEqual([]);
    });

    it("F013/AC-2 nur ein fehlender Wert (undefined) nimmt den Standard", () => {
      const target = at("2026-10-11T08:30:00+02:00");
      const withUndefined = expectSchedule(target, {
        sleepWindow: { startMinute: undefined, endMinute: undefined },
      });
      const withoutWindow = expectSchedule(target, {});

      expect(withUndefined).toEqual(withoutWindow);
      expect(warnedSteps(withUndefined)).toEqual(["levain", "preheat", "bake"]);
    });
  });

  describe("F013/AC-3 Obergrenze von 20 Dehnen-&-Falten-Durchgängen", () => {
    it("F013/AC-3 MAX_STRETCH_AND_FOLD_COUNT ist 20 und die Meldung hat exakt den Wortlaut aus dem Ticket", () => {
      expect(MAX_STRETCH_AND_FOLD_COUNT).toBe(20);
      expect(TOO_MANY_STRETCH_AND_FOLDS_MESSAGE).toBe(MSG_SF_TOO_MANY);
    });

    it("F013/AC-3 20 Durchgänge im Abstand von 10 Min. ergeben genau 20 Durchgänge in der Stockgare", () => {
      const timeline = expectSchedule(REFERENCE_TARGET, {
        stretchAndFold: { count: 20, intervalMinutes: 10 },
      });
      const bulk = phase(timeline, "bulkFermentation");

      expect(bulk.durationMinutes).toBe(270);
      expect(bulk.stretchAndFolds).toHaveLength(20);
      expect(bulk.stretchAndFolds.map((sf) => sf.index)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
      expect(bulk.stretchAndFolds[19].at.toISOString()).toBe(iso("2026-10-10T17:35:00+02:00"));
    });

    it.each([
      ["21 Durchgänge im Abstand von 10 Min.", { count: 21, intervalMinutes: 10 }],
      ["21 Durchgänge mit Standardabstand 30 Min.", { count: 21 }],
    ] as const)("F013/AC-3 %s werfen die Obergrenzen-Meldung", (_label, stretchAndFold) => {
      expectThrowMessage(
        () => generateBackwardSchedule(REFERENCE_TARGET, { stretchAndFold }),
        MSG_SF_TOO_MANY,
      );
    });

    it("F013/AC-3 1e9 Durchgänge im Abstand von 1e-7 Min. werfen die Obergrenzen-Meldung, ohne Durchgänge zu erzeugen, in unter 100 ms", () => {
      // Vorbedingung: Ohne Obergrenze würde der Aufruf 1e9 Durchgänge erzeugen und den Testlauf
      // blockieren (synchrone Schleife, kein Timeout greift). Darum erst prüfen, dass es die
      // Obergrenze überhaupt gibt.
      expect(MAX_STRETCH_AND_FOLD_COUNT).toBe(20);

      const startedAt = performance.now();
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            stretchAndFold: { count: 1e9, intervalMinutes: 1e-7 },
          }),
        MSG_SF_TOO_MANY,
      );
      const elapsed = performance.now() - startedAt;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("F013/AC-4 Feste Reihenfolge der Prüfungen", () => {
    it("F013/AC-4 21 Durchgänge zusammen mit Zeitzone „Mars/Olympus“ werfen die Obergrenzen-Meldung", () => {
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            stretchAndFold: { count: 21 },
            timeZone: "Mars/Olympus",
          }),
        MSG_SF_TOO_MANY,
      );
    });

    it("F013/AC-4 21 Durchgänge à 10 Min. (passen in die Stockgare) zusammen mit Schlaf-Fenster 1440 und „Mars/Olympus“ werfen die Obergrenzen-Meldung", () => {
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            stretchAndFold: { count: 21, intervalMinutes: 10 },
            sleepWindow: { startMinute: 1440 },
            timeZone: "Mars/Olympus",
          }),
        MSG_SF_TOO_MANY,
      );
    });

    it("F013/AC-4 10 Durchgänge à 30 Min. bei 270 Min. Stockgare zusammen mit Schlaf-Fenster-Beginn 1440 werfen „passen nicht in die Stockgare“", () => {
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            stretchAndFold: { count: 10, intervalMinutes: 30 },
            sleepWindow: { startMinute: 1440 },
          }),
        MSG_SF_FIT,
      );
    });

    it("F013/AC-4 Schlaf-Fenster-Beginn 1440 zusammen mit Zeitzone „Mars/Olympus“ wirft die Schlaf-Fenster-Meldung", () => {
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            sleepWindow: { startMinute: 1440 },
            timeZone: "Mars/Olympus",
          }),
        MSG_SLEEP_WINDOW,
      );
    });

    it("F013/AC-4 Schlaf-Fenster-Ende null zusammen mit Zeitzone null wirft die Schlaf-Fenster-Meldung", () => {
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            sleepWindow: { endMinute: null as unknown as number },
            timeZone: null as unknown as string,
          }),
        MSG_SLEEP_WINDOW,
      );
    });

    it("F013/AC-4 Kette: jede Prüfung meldet nur dann, wenn alle früheren bestehen", () => {
      const allInvalid: ScheduleConfig = {
        durations: { levain: -1 },
        stretchAndFold: { count: 1.5 },
        sleepWindow: { startMinute: 1440 },
        timeZone: "Mars/Olympus",
      };

      // 1. Zielzeitpunkt
      expectThrowMessage(() => generateBackwardSchedule(new Date(NaN), allInvalid), MSG_TARGET);
      // 2. Dauern
      expectThrowMessage(() => generateBackwardSchedule(REFERENCE_TARGET, allInvalid), MSG_DURATION);
      // 3. Anzahl und Abstand gültig
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            stretchAndFold: { count: NaN },
            sleepWindow: { startMinute: 1440 },
            timeZone: "Mars/Olympus",
          }),
        MSG_SF_INVALID,
      );
      // 4. Obergrenze
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            stretchAndFold: { count: 21 },
            sleepWindow: { startMinute: 1440 },
            timeZone: "Mars/Olympus",
          }),
        MSG_SF_TOO_MANY,
      );
      // 5. Durchgänge passen in die Stockgare
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            stretchAndFold: { count: 9 },
            sleepWindow: { startMinute: 1440 },
            timeZone: "Mars/Olympus",
          }),
        MSG_SF_FIT,
      );
      // 6. Schlaf-Fenster
      expectThrowMessage(
        () =>
          generateBackwardSchedule(REFERENCE_TARGET, {
            sleepWindow: { startMinute: 1440 },
            timeZone: "Mars/Olympus",
          }),
        MSG_SLEEP_WINDOW,
      );
      // 7. Zeitzone
      expectThrowMessage(
        () => generateBackwardSchedule(REFERENCE_TARGET, { timeZone: "Mars/Olympus" }),
        MSG_TIME_ZONE,
      );
    });

    it("F013/AC-4 die Meldungskonstanten der Kette sind unverändert", () => {
      expect(INVALID_TARGET_DATE_MESSAGE).toBe(MSG_TARGET);
      expect(INVALID_PHASE_DURATION_MESSAGE).toBe(MSG_DURATION);
      expect(INVALID_STRETCH_AND_FOLD_MESSAGE).toBe(MSG_SF_INVALID);
      expect(TOO_MANY_STRETCH_AND_FOLDS_MESSAGE).toBe(MSG_SF_TOO_MANY);
      expect(STRETCH_AND_FOLD_DOES_NOT_FIT_MESSAGE).toBe(MSG_SF_FIT);
      expect(INVALID_SLEEP_WINDOW_MESSAGE).toBe(MSG_SLEEP_WINDOW);
      expect(INVALID_TIME_ZONE_MESSAGE).toBe(MSG_TIME_ZONE);
    });
  });

  describe("F013/AC-5 Startzeitpunkt ist der früheste Beginn", () => {
    it("F013/AC-5 ohne Levain, Mischen, Stockgare und Kaltgare beginnt der Plan So 08:15 mit dem Vorheizen, nicht 08:45 mit der Formgebung", () => {
      const timeline = expectSchedule(REFERENCE_TARGET, {
        durations: {
          levain: 0,
          mixAutolyse: 0,
          bulkFermentation: 0,
          coldProof: 0,
          shaping: 30,
          preheat: 60,
          bake: 45,
          cool: 120,
        },
        stretchAndFold: { count: 0 },
      });

      // Reihenfolge der Phasen bleibt fest (F012/AC-1), nur der Startzeitpunkt ändert sich.
      expect(timeline.phases.map((p) => p.id)).toEqual(["shaping", "preheat", "bake", "cool"]);
      expect(phase(timeline, "shaping").start.toISOString()).toBe(iso("2026-10-11T08:45:00+02:00"));
      expect(phase(timeline, "preheat").start.toISOString()).toBe(iso("2026-10-11T08:15:00+02:00"));

      expect(timeline.start.toISOString()).toBe(iso("2026-10-11T08:15:00+02:00"));
      expect(timeline.start.getTime()).toBe(phase(timeline, "preheat").start.getTime());
      expect(timeline.start.toISOString()).not.toBe(iso("2026-10-11T08:45:00+02:00"));
    });

    it("F013/AC-5 Startzeitpunkt ist nie später als der Beginn irgendeiner Phase", () => {
      const timeline = expectSchedule(REFERENCE_TARGET, {
        durations: { levain: 0, mixAutolyse: 0, bulkFermentation: 0, coldProof: 0 },
        stretchAndFold: { count: 0 },
      });
      const earliest = Math.min(...timeline.phases.map((p) => p.start.getTime()));

      expect(timeline.start.getTime()).toBe(earliest);
    });

    it("F013/AC-5 mit der Referenz-Konfiguration beginnt der Plan weiter Sa 10.10.2026 08:15", () => {
      const timeline = expectSchedule(REFERENCE_TARGET, {});

      expect(timeline.start.toISOString()).toBe(iso("2026-10-10T08:15:00+02:00"));
      expect(timeline.start.getTime()).toBe(phase(timeline, "levain").start.getTime());
    });

    it("F013/AC-5 ohne Phasen (alle Dauern 0) bleibt der Startzeitpunkt gleich dem Zielzeitpunkt", () => {
      const timeline = expectSchedule(REFERENCE_TARGET, ALL_ZERO_CONFIG);

      expect(timeline.phases).toEqual([]);
      expect(timeline.start.toISOString()).toBe(REFERENCE_TARGET.toISOString());
      expect(timeline.start.getTime()).toBe(timeline.target.getTime());
    });
  });

  describe("F013/AC-6 Konfiguration darf fehlen", () => {
    it("F013/AC-6 ohne zweites Argument wirft die Funktion nicht", () => {
      expect(() => generateBackwardSchedule(REFERENCE_TARGET)).not.toThrow();
    });

    it("F013/AC-6 ohne zweites Argument entsteht derselbe Plan wie mit leerer Konfiguration {}", () => {
      let withoutConfig: ScheduleTimeline | undefined;
      expect(() => {
        withoutConfig = generateBackwardSchedule(REFERENCE_TARGET);
      }).not.toThrow();
      const withEmptyConfig = generateBackwardSchedule(REFERENCE_TARGET, {});

      expect(withoutConfig).toEqual(withEmptyConfig);
      expect(withoutConfig?.start.toISOString()).toBe(iso("2026-10-10T08:15:00+02:00"));
      expect(withoutConfig?.phases.map((p) => p.id)).toEqual([...PHASE_IDS]);
    });
  });

  describe("F013/AC-7 Bisher ungetestete Randfälle", () => {
    it("F013/AC-7 Stockgare 0 Min. mit 0 Durchgängen wirft nicht, der Plan enthält keine Phase Stockgare", () => {
      const timeline = expectSchedule(REFERENCE_TARGET, {
        durations: { bulkFermentation: 0 },
        stretchAndFold: { count: 0 },
      });

      expect(timeline.phases.some((p) => p.id === "bulkFermentation")).toBe(false);
      expect(timeline.phases.map((p) => p.id)).toEqual([
        "levain",
        "mixAutolyse",
        "shaping",
        "coldProof",
        "preheat",
        "bake",
        "cool",
      ]);
      for (const p of timeline.phases) {
        expect(p.stretchAndFolds, p.id).toEqual([]);
      }
      // Mischen schließt lückenlos an die Formgebung an.
      expect(phase(timeline, "mixAutolyse").end.getTime()).toBe(
        phase(timeline, "shaping").start.getTime(),
      );
    });

    it("F013/AC-7 Schlaf-Fenster nur mit Beginn 22:00, Ziel So 15:45: Formgebung beginnt Sa 22:30 und warnt als einziger Schritt", () => {
      const timeline = expectSchedule(at("2026-10-11T15:45:00+02:00"), {
        sleepWindow: { startMinute: 1320 },
      });

      expect(phase(timeline, "shaping").start.toISOString()).toBe(iso("2026-10-10T22:30:00+02:00"));
      expect(phase(timeline, "shaping").sleepWarning).toBe(true);
      expect(warnedSteps(timeline)).toEqual(["shaping"]);
    });

    it("F013/AC-7 Schlaf-Fenster nur mit Beginn 22:00, Ziel So 10:45: Ende ist Standard 07:00, Levain Sa 07:00 und Vorheizen So 07:00 ohne Warnung", () => {
      const timeline = expectSchedule(at("2026-10-11T10:45:00+02:00"), {
        sleepWindow: { startMinute: 1320 },
      });

      expect(phase(timeline, "levain").start.toISOString()).toBe(iso("2026-10-10T07:00:00+02:00"));
      expect(phase(timeline, "preheat").start.toISOString()).toBe(iso("2026-10-11T07:00:00+02:00"));
      expect(phase(timeline, "levain").sleepWarning).toBe(false);
      expect(phase(timeline, "preheat").sleepWarning).toBe(false);
      expect(warnedSteps(timeline)).toEqual([]);
    });
  });

  describe("F013/AC-8 Bestehendes Verhalten bleibt erhalten, unabhängig von der Systemzeitzone", () => {
    /** Führt `fn` mit gesetzter Prozess-Zeitzone aus und stellt sie danach wieder her. */
    function withSystemTimeZone<T>(tz: string, fn: () => T): T {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        return fn();
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    }

    const SYSTEM_TIME_ZONES = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"] as const;

    it.each(SYSTEM_TIME_ZONES)(
      "F013/AC-8 mit Systemzeitzone %s bleibt der Referenzplan wie in F012 (Start Sa 08:15, Backbeginn So 09:15, keine Warnung)",
      (tz) => {
        const timeline = withSystemTimeZone(tz, () => generateBackwardSchedule(REFERENCE_TARGET, {}));

        expect(timeline.phases.map((p) => p.id)).toEqual([...PHASE_IDS]);
        expect(timeline.start.toISOString()).toBe(iso("2026-10-10T08:15:00+02:00"));
        expect(timeline.bakeStart.toISOString()).toBe(iso("2026-10-11T09:15:00+02:00"));
        expect(warnedSteps(timeline)).toEqual([]);
      },
    );

    it.each(SYSTEM_TIME_ZONES)(
      "F013/AC-8 mit Systemzeitzone %s gelten die neuen F013-Regeln (frühester Beginn, Schlaf-Fenster, Zeitzone) unverändert",
      (tz) => {
        withSystemTimeZone(tz, () => {
          const earliest = generateBackwardSchedule(REFERENCE_TARGET, {
            durations: { levain: 0, mixAutolyse: 0, bulkFermentation: 0, coldProof: 0 },
            stretchAndFold: { count: 0 },
          });
          expect(earliest.start.toISOString()).toBe(iso("2026-10-11T08:15:00+02:00"));

          const partialWindow = generateBackwardSchedule(at("2026-10-11T15:45:00+02:00"), {
            sleepWindow: { startMinute: 1320 },
          });
          expect(warnedSteps(partialWindow)).toEqual(["shaping"]);

          expectThrowMessage(
            () => generateBackwardSchedule(REFERENCE_TARGET, { timeZone: "Europe/Berln" }),
            MSG_TIME_ZONE,
          );
          expectThrowMessage(
            () => generateBackwardSchedule(REFERENCE_TARGET, { sleepWindow: { endMinute: 1440 } }),
            MSG_SLEEP_WINDOW,
          );
        });
      },
    );
  });
});

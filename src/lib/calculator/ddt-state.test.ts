import { describe, expect, it } from "vitest";
import {
  COLD_WARNING_MESSAGE,
  FRICTION_PRESETS,
  HEAT_WARNING_MESSAGE,
  NEGATIVE_FRICTION_MESSAGE,
  NON_FINITE_DOUGH_TEMPERATURE_MESSAGE,
  NON_FINITE_FLOUR_TEMPERATURE_MESSAGE,
  NON_FINITE_FRICTION_MESSAGE,
  NON_FINITE_ROOM_TEMPERATURE_MESSAGE,
  NON_FINITE_STARTER_TEMPERATURE_MESSAGE,
  type KneadingMethod,
} from "@/lib/baking-engine/ddt";
import {
  AMBIENT_SLIDER_RANGE,
  DDT_SLIDER_RANGE,
  DEFAULT_DDT_STATE,
  KNEADING_METHOD_OPTIONS,
  evaluateDdt,
  type DdtState,
} from "@/lib/calculator/ddt-state";

function state(
  desiredDoughTemperature: number,
  roomTemperature: number,
  flourTemperature: number,
  starterTemperature: number,
  kneadingMethod: KneadingMethod,
  customFriction = 0,
): DdtState {
  return {
    desiredDoughTemperature,
    roomTemperature,
    flourTemperature,
    starterTemperature,
    kneadingMethod,
    customFriction,
  };
}

describe("F010 DDT-Zustand: Wassertemperatur", () => {
  it("F010/AC-6 startet mit DDT 25 °C, 22/22/22 °C und Handknetung, das ergibt 33 °C", () => {
    expect(DEFAULT_DDT_STATE).toEqual({
      desiredDoughTemperature: 25,
      roomTemperature: 22,
      flourTemperature: 22,
      starterTemperature: 22,
      kneadingMethod: "hand",
      customFriction: 0,
    });

    const evaluation = evaluateDdt(DEFAULT_DDT_STATE);
    expect(evaluation.errors).toEqual({});
    expect(evaluation.result?.waterTemperature).toBeCloseTo(33, 6);
    expect(evaluation.result?.status).toBe("ok");
  });

  it.each([
    ["hand", 0, 37],
    ["stand_mixer", 0, 33],
    ["spiral", 0, 29],
    ["custom", 3, 35],
  ] as const)(
    "F010/AC-6 berechnet bei 26/22/20/24 °C mit Knetmethode %s die Wassertemperatur",
    (method, friction, expected) => {
      const evaluation = evaluateDdt(state(26, 22, 20, 24, method, friction));

      expect(evaluation.errors).toEqual({});
      expect(evaluation.result?.waterTemperature).toBeCloseTo(expected, 6);
    },
  );

  it("F010/AC-6 bietet die Knetmethoden mit Reibungswerten aus FRICTION_PRESETS an", () => {
    expect(KNEADING_METHOD_OPTIONS.map((option) => option.value)).toEqual([
      "hand",
      "stand_mixer",
      "spiral",
      "custom",
    ]);
    expect(KNEADING_METHOD_OPTIONS.map((option) => option.label)).toEqual([
      `Handknetung (+${FRICTION_PRESETS.hand} °C)`,
      `Küchenmaschine (+${FRICTION_PRESETS.stand_mixer} °C)`,
      `Spiralkneter (+${FRICTION_PRESETS.spiral} °C)`,
      "Eigener Wert",
    ]);
    expect(KNEADING_METHOD_OPTIONS.map((option) => option.label)).toEqual([
      "Handknetung (+1 °C)",
      "Küchenmaschine (+5 °C)",
      "Spiralkneter (+9 °C)",
      "Eigener Wert",
    ]);
  });

  it("F010/AC-6 legt die Slider-Bereiche fest (DDT 18–32 °C, sonst −10 bis 40 °C, Schritt 0,5)", () => {
    expect(DDT_SLIDER_RANGE).toEqual({ min: 18, max: 32, step: 0.5 });
    expect(AMBIENT_SLIDER_RANGE).toEqual({ min: -10, max: 40, step: 0.5 });
  });

  it("F010/AC-6 ordnet eine negative eigene Knetreibung dem Feld Knetreibung zu, ohne Ergebnis", () => {
    const evaluation = evaluateDdt(state(26, 22, 20, 24, "custom", -1));

    expect(evaluation.result).toBeNull();
    expect(evaluation.errors).toEqual({ customFriction: NEGATIVE_FRICTION_MESSAGE });
    expect(evaluation.errors.customFriction).toBe("Die Knetreibung darf nicht negativ sein.");
  });

  it("F010/AC-6 ignoriert die eigene Knetreibung bei einem Preset", () => {
    const evaluation = evaluateDdt(state(26, 22, 20, 24, "spiral", -1));

    expect(evaluation.errors).toEqual({});
    expect(evaluation.result?.waterTemperature).toBeCloseTo(29, 6);
  });

  it("F010/AC-6 ordnet ungültige Temperaturen dem jeweiligen Feld zu", () => {
    const base = state(26, 22, 20, 24, "hand");

    expect(evaluateDdt({ ...base, roomTemperature: Number.NaN })).toEqual({
      errors: { roomTemperature: NON_FINITE_ROOM_TEMPERATURE_MESSAGE },
      result: null,
    });
    expect(evaluateDdt({ ...base, desiredDoughTemperature: Number.NaN }).errors).toEqual({
      desiredDoughTemperature: NON_FINITE_DOUGH_TEMPERATURE_MESSAGE,
    });
    expect(evaluateDdt({ ...base, flourTemperature: Number.NaN }).errors).toEqual({
      flourTemperature: NON_FINITE_FLOUR_TEMPERATURE_MESSAGE,
    });
    expect(evaluateDdt({ ...base, starterTemperature: Number.NaN }).errors).toEqual({
      starterTemperature: NON_FINITE_STARTER_TEMPERATURE_MESSAGE,
    });
    expect(
      evaluateDdt({ ...base, kneadingMethod: "custom", customFriction: Number.NaN }).errors,
    ).toEqual({ customFriction: NON_FINITE_FRICTION_MESSAGE });
  });
});

describe("F010 DDT-Zustand: Warnstatus", () => {
  it("F010/AC-7 meldet bei 3 °C Wassertemperatur „Eiswasser erforderlich“", () => {
    const evaluation = evaluateDdt(state(24, 30, 26, 28, "spiral"));

    expect(evaluation.result?.waterTemperature).toBeCloseTo(3, 6);
    expect(evaluation.result?.status).toBe("cold_warning");
    expect(evaluation.result?.message).toBe(COLD_WARNING_MESSAGE);
    expect(evaluation.result?.message).toBe("Eiswasser erforderlich");
  });

  it("F010/AC-7 meldet bei 57 °C Wassertemperatur „Kritische Temperatur für Starter-Mikroben!“", () => {
    const evaluation = evaluateDdt(state(27, 17, 15, 18, "hand"));

    expect(evaluation.result?.waterTemperature).toBeCloseTo(57, 6);
    expect(evaluation.result?.status).toBe("heat_warning");
    expect(evaluation.result?.message).toBe(HEAT_WARNING_MESSAGE);
    expect(evaluation.result?.message).toBe("Kritische Temperatur für Starter-Mikroben!");
  });

  it("F010/AC-7 warnt bei genau 4 °C und 45 °C nicht", () => {
    const cold = evaluateDdt(state(26, 32, 30, 29, "spiral"));
    const hot = evaluateDdt(state(26, 20, 18, 20, "hand"));

    expect(cold.result?.waterTemperature).toBeCloseTo(4, 6);
    expect(cold.result?.status).toBe("ok");
    expect(cold.result?.message).toBeNull();
    expect(hot.result?.waterTemperature).toBeCloseTo(45, 6);
    expect(hot.result?.status).toBe("ok");
    expect(hot.result?.message).toBeNull();
  });
});

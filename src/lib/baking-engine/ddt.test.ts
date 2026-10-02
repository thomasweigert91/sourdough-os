// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  calculateWaterTemperature,
  COLD_WARNING_MESSAGE,
  COLD_WATER_THRESHOLD,
  FRICTION_PRESETS,
  HEAT_WARNING_MESSAGE,
  HOT_WATER_THRESHOLD,
  MISSING_CUSTOM_FRICTION_MESSAGE,
  NEGATIVE_FRICTION_MESSAGE,
  NON_FINITE_DOUGH_TEMPERATURE_MESSAGE,
  NON_FINITE_FLOUR_TEMPERATURE_MESSAGE,
  NON_FINITE_FRICTION_MESSAGE,
  NON_FINITE_ROOM_TEMPERATURE_MESSAGE,
  NON_FINITE_STARTER_TEMPERATURE_MESSAGE,
  unknownKneadingMethodMessage,
  type DdtParams,
  type DdtResult,
  type KneadingMethod,
} from "@/lib/baking-engine/ddt";

/** Referenzbedingungen laut Ticket: DDT 26, Mehl 20, Raum 22, Starter 24, Handknetung. */
function referenceParams(overrides: Partial<DdtParams> = {}): DdtParams {
  return {
    desiredDoughTemperature: 26,
    flourTemperature: 20,
    roomTemperature: 22,
    starterTemperature: 24,
    kneadingMethod: "hand",
    ...overrides,
  };
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

const NON_FINITE_VALUES = [NaN, Infinity, -Infinity] as const;

// Wortlaut aus Ticket bzw. Plan
const MSG_COLD = "Eiswasser erforderlich";
const MSG_HEAT = "Kritische Temperatur für Starter-Mikroben!";
const MSG_DOUGH = "Die Teigtemperatur muss eine gültige Zahl sein.";
const MSG_FLOUR = "Die Mehltemperatur muss eine gültige Zahl sein.";
const MSG_ROOM = "Die Raumtemperatur muss eine gültige Zahl sein.";
const MSG_STARTER = "Die Startertemperatur muss eine gültige Zahl sein.";
const MSG_FRICTION_NON_FINITE = "Die Knetreibung muss eine gültige Zahl sein.";
const MSG_FRICTION_NEGATIVE = "Die Knetreibung darf nicht negativ sein.";
const MSG_FRICTION_MISSING = "Für eigene Knetreibung muss ein Wert angegeben werden.";

describe("F009 DDT-Wassertemperatur-Rechner (src/lib/baking-engine/ddt.ts)", () => {
  describe("F009/AC-1 Wassertemperatur mit Reibungs-Preset", () => {
    it.each([
      ["hand", 37, 1],
      ["stand_mixer", 33, 5],
      ["spiral", 29, 9],
    ] as const)(
      "F009/AC-1 berechnet bei Preset %s unter Referenzbedingungen %d °C mit Reibung %d °C und Status ok",
      (method, water, friction) => {
        const result = calculateWaterTemperature(referenceParams({ kneadingMethod: method }));

        expect(result.waterTemperature).toBe(water);
        expect(result.frictionFactor).toBe(friction);
        expect(result.status).toBe("ok");
        expect(result.message).toBeNull();
      },
    );

    it("F009/AC-1 stellt die Reibungs-Presets Hand 1, Küchenmaschine 5, Spiralkneter 9 bereit", () => {
      expect(FRICTION_PRESETS).toEqual({ hand: 1, stand_mixer: 5, spiral: 9 });
    });

    it("F009/AC-1 ignoriert einen Custom-Reibungswert bei gewähltem Preset", () => {
      const result = calculateWaterTemperature(
        referenceParams({ kneadingMethod: "stand_mixer", customFriction: 3 }),
      );

      expect(result.waterTemperature).toBe(33);
      expect(result.frictionFactor).toBe(5);
      expect(result.status).toBe("ok");
      expect(result.message).toBeNull();
    });

    it.each([-1, NaN])(
      "F009/AC-1 validiert einen Custom-Reibungswert %s bei Preset hand nicht und liefert 37 °C",
      (custom) => {
        let result: DdtResult | undefined;
        expect(() => {
          result = calculateWaterTemperature(referenceParams({ kneadingMethod: "hand", customFriction: custom }));
        }).not.toThrow();

        expect(result?.waterTemperature).toBe(37);
        expect(result?.frictionFactor).toBe(1);
        expect(result?.status).toBe("ok");
        expect(result?.message).toBeNull();
      },
    );
  });

  describe("F009/AC-2 Wassertemperatur mit eigenem Reibungswert", () => {
    it.each([
      [3, 35],
      [0, 38],
    ])("F009/AC-2 berechnet bei Custom-Reibung %d °C %d °C mit Status ok", (friction, water) => {
      const result = calculateWaterTemperature(
        referenceParams({ kneadingMethod: "custom", customFriction: friction }),
      );

      expect(result.waterTemperature).toBe(water);
      expect(result.frictionFactor).toBe(friction);
      expect(result.status).toBe("ok");
      expect(result.message).toBeNull();
    });

    it("F009/AC-2 verrechnet Custom-Reibung 2,5 °C ungerundet zu 35,5 °C", () => {
      const result = calculateWaterTemperature(
        referenceParams({ kneadingMethod: "custom", customFriction: 2.5 }),
      );

      expect(result.waterTemperature).toBeCloseTo(35.5, 9);
      expect(result.frictionFactor).toBe(2.5);
      expect(result.status).toBe("ok");
      expect(result.message).toBeNull();
    });
  });

  describe("F009/AC-3 Kaltwarnung bei Wasser unter 4 °C", () => {
    const hotKitchen = {
      desiredDoughTemperature: 24,
      flourTemperature: 26,
      roomTemperature: 30,
      starterTemperature: 28,
    };

    it("F009/AC-3 meldet bei 3 °C cold_warning mit „Eiswasser erforderlich“", () => {
      const result = calculateWaterTemperature({ ...hotKitchen, kneadingMethod: "spiral" });

      expect(result.waterTemperature).toBe(3);
      expect(result.frictionFactor).toBe(9);
      expect(result.status).toBe("cold_warning");
      expect(result.message).toBe(MSG_COLD);
    });

    it("F009/AC-3 gibt ein negatives Ergebnis (−2 °C) unverändert mit cold_warning zurück", () => {
      const result = calculateWaterTemperature({
        ...hotKitchen,
        kneadingMethod: "custom",
        customFriction: 14,
      });

      expect(result.waterTemperature).toBe(-2);
      expect(result.status).toBe("cold_warning");
      expect(result.message).toBe(MSG_COLD);
    });
  });

  describe("F009/AC-4 Hitzewarnung bei Wasser über 45 °C", () => {
    it("F009/AC-4 meldet bei 57 °C heat_warning mit „Kritische Temperatur für Starter-Mikroben!“", () => {
      const result = calculateWaterTemperature({
        desiredDoughTemperature: 27,
        flourTemperature: 15,
        roomTemperature: 17,
        starterTemperature: 18,
        kneadingMethod: "hand",
      });

      expect(result.waterTemperature).toBe(57);
      expect(result.frictionFactor).toBe(1);
      expect(result.status).toBe("heat_warning");
      expect(result.message).toBe(MSG_HEAT);
    });
  });

  describe("F009/AC-5 Grenzwerte 4 °C und 45 °C gehören zu ok", () => {
    const coldEdge: DdtParams = {
      desiredDoughTemperature: 26,
      flourTemperature: 30,
      roomTemperature: 32,
      starterTemperature: 29,
      kneadingMethod: "spiral",
    };
    const hotEdge: DdtParams = {
      desiredDoughTemperature: 26,
      flourTemperature: 18,
      roomTemperature: 20,
      starterTemperature: 20,
      kneadingMethod: "hand",
    };

    it("F009/AC-5 stuft genau 4 °C als ok ohne Meldung ein", () => {
      const result = calculateWaterTemperature(coldEdge);

      expect(result.waterTemperature).toBe(4);
      expect(result.status).toBe("ok");
      expect(result.message).toBeNull();
    });

    it("F009/AC-5 stuft genau 45 °C als ok ohne Meldung ein", () => {
      const result = calculateWaterTemperature(hotEdge);

      expect(result.waterTemperature).toBe(45);
      expect(result.status).toBe("ok");
      expect(result.message).toBeNull();
    });

    it("F009/AC-5 stuft 3,9 °C als cold_warning ein", () => {
      const result = calculateWaterTemperature({ ...coldEdge, flourTemperature: 30.1 });

      expect(result.waterTemperature).toBeCloseTo(3.9, 9);
      expect(result.status).toBe("cold_warning");
      expect(result.message).toBe(MSG_COLD);
    });

    it("F009/AC-5 stuft 45,1 °C als heat_warning ein", () => {
      const result = calculateWaterTemperature({ ...hotEdge, roomTemperature: 19.9 });

      expect(result.waterTemperature).toBeCloseTo(45.1, 9);
      expect(result.status).toBe("heat_warning");
      expect(result.message).toBe(MSG_HEAT);
    });

    it("F009/AC-5 stuft fachlich genau 4 °C mit Gleitkomma-Rest (3.999999999999993) als ok ein", () => {
      const result = calculateWaterTemperature({
        desiredDoughTemperature: 16.4,
        flourTemperature: 6.6,
        roomTemperature: 22,
        starterTemperature: 24,
        kneadingMethod: "spiral",
      });

      expect(result.waterTemperature).toBeCloseTo(4, 9);
      expect(result.status).toBe("ok");
      expect(result.message).toBeNull();
    });

    it("F009/AC-5 stuft fachlich genau 45 °C mit Gleitkomma-Rest (45.00000000000001) als ok ein", () => {
      const result = calculateWaterTemperature({
        desiredDoughTemperature: 21.6,
        flourTemperature: -4.6,
        roomTemperature: 22,
        starterTemperature: 24,
        kneadingMethod: "custom",
        customFriction: 0,
      });

      expect(result.waterTemperature).toBeCloseTo(45, 9);
      expect(result.status).toBe("ok");
      expect(result.message).toBeNull();
    });

    it("F009/AC-5 legt die Grenzwerte auf 4 °C und 45 °C fest", () => {
      expect(COLD_WATER_THRESHOLD).toBe(4);
      expect(HOT_WATER_THRESHOLD).toBe(45);
    });
  });

  describe("F009/AC-6 Ungültige Eingaben werfen Fehler", () => {
    const temperatureFields = [
      ["desiredDoughTemperature", MSG_DOUGH],
      ["flourTemperature", MSG_FLOUR],
      ["roomTemperature", MSG_ROOM],
      ["starterTemperature", MSG_STARTER],
    ] as const;

    for (const [field, message] of temperatureFields) {
      it.each(NON_FINITE_VALUES)(`F009/AC-6 wirft bei ${field} %s „${message}“`, (value) => {
        expectThrowMessage(
          () => calculateWaterTemperature(referenceParams({ [field]: value })),
          message,
        );
      });
    }

    it.each(NON_FINITE_VALUES)(
      "F009/AC-6 wirft bei Custom-Reibung %s „Die Knetreibung muss eine gültige Zahl sein.“",
      (value) => {
        expectThrowMessage(
          () => calculateWaterTemperature(referenceParams({ kneadingMethod: "custom", customFriction: value })),
          MSG_FRICTION_NON_FINITE,
        );
      },
    );

    it("F009/AC-6 wirft bei Custom ohne Reibungswert „Für eigene Knetreibung muss ein Wert angegeben werden.“", () => {
      expectThrowMessage(
        () => calculateWaterTemperature(referenceParams({ kneadingMethod: "custom" })),
        MSG_FRICTION_MISSING,
      );
    });

    it.each([-1, -0.1])(
      "F009/AC-6 wirft bei negativer Custom-Reibung %s „Die Knetreibung darf nicht negativ sein.“",
      (value) => {
        expectThrowMessage(
          () => calculateWaterTemperature(referenceParams({ kneadingMethod: "custom", customFriction: value })),
          MSG_FRICTION_NEGATIVE,
        );
      },
    );

    it("F009/AC-6 weist kein Ergebnis zu, wenn die Engine wirft", () => {
      let result: DdtResult | undefined;
      try {
        result = calculateWaterTemperature(referenceParams({ desiredDoughTemperature: NaN }));
      } catch {
        // erwartet
      }
      expect(result).toBeUndefined();
    });

    it("F009/AC-6 verrechnet Mehl −18 °C normal (75 °C, heat_warning, kein Fehler)", () => {
      const result = calculateWaterTemperature(referenceParams({ flourTemperature: -18 }));

      expect(result.waterTemperature).toBe(75);
      expect(result.status).toBe("heat_warning");
      expect(result.message).toBe(MSG_HEAT);
    });

    it.each([
      ["roomTemperature", -5, 64],
      ["starterTemperature", -2, 63],
    ] as const)("F009/AC-6 verrechnet %s %d °C normal zu %d °C", (field, value, water) => {
      const result = calculateWaterTemperature(referenceParams({ [field]: value }));

      expect(result.waterTemperature).toBe(water);
      expect(result.frictionFactor).toBe(1);
    });

    it("F009/AC-6 kennt keine Plausibilitätsobergrenze (DDT 100 °C ergibt 333 °C)", () => {
      const result = calculateWaterTemperature(referenceParams({ desiredDoughTemperature: 100 }));

      expect(result.waterTemperature).toBe(333);
      expect(result.status).toBe("heat_warning");
    });

    it("F009/AC-6 wirft bei unbekannter Knetart „Unbekannte Knetart: kitchen.“ statt NaN zu liefern", () => {
      expectThrowMessage(
        () =>
          calculateWaterTemperature(
            referenceParams({ kneadingMethod: "kitchen" as unknown as KneadingMethod }),
          ),
        "Unbekannte Knetart: kitchen.",
      );
      expect(unknownKneadingMethodMessage("kitchen")).toBe("Unbekannte Knetart: kitchen.");
    });
  });

  it("F009/AC-3 F009/AC-4 F009/AC-6 exportiert alle Meldungskonstanten im vorgegebenen Wortlaut", () => {
    expect(COLD_WARNING_MESSAGE).toBe(MSG_COLD);
    expect(HEAT_WARNING_MESSAGE).toBe(MSG_HEAT);
    expect(NON_FINITE_DOUGH_TEMPERATURE_MESSAGE).toBe(MSG_DOUGH);
    expect(NON_FINITE_FLOUR_TEMPERATURE_MESSAGE).toBe(MSG_FLOUR);
    expect(NON_FINITE_ROOM_TEMPERATURE_MESSAGE).toBe(MSG_ROOM);
    expect(NON_FINITE_STARTER_TEMPERATURE_MESSAGE).toBe(MSG_STARTER);
    expect(NON_FINITE_FRICTION_MESSAGE).toBe(MSG_FRICTION_NON_FINITE);
    expect(NEGATIVE_FRICTION_MESSAGE).toBe(MSG_FRICTION_NEGATIVE);
    expect(MISSING_CUSTOM_FRICTION_MESSAGE).toBe(MSG_FRICTION_MISSING);
  });
});

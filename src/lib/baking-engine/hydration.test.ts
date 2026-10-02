// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  calculateBakersPercentages,
  calculateNetHydration,
  calculateRecipeFromFlourBasis,
  calculateRecipeFromTotalWeight,
  FLOUR_PERCENT_SUM_MESSAGE,
  INVALID_FLOUR_BASIS_MESSAGE,
  INVALID_TOTAL_WEIGHT_MESSAGE,
  NEGATIVE_BAKERS_PERCENT_MESSAGE,
  NEGATIVE_GRAMS_MESSAGE,
  NEGATIVE_STARTER_HYDRATION_MESSAGE,
  NO_FLOUR_MESSAGE,
  NON_FINITE_BAKERS_PERCENT_MESSAGE,
  NON_FINITE_FLOUR_BASIS_MESSAGE,
  NON_FINITE_GRAMS_MESSAGE,
  NON_FINITE_STARTER_HYDRATION_MESSAGE,
  NON_FINITE_TOTAL_WEIGHT_MESSAGE,
  unknownIngredientTypeMessage,
  type GramIngredient,
  type PercentIngredient,
} from "@/lib/baking-engine/hydration";
import type { IngredientType } from "@/db/schema/recipes";

/** Referenzrezept laut Ticket: 80 / 20 / 70 / 20 / 2 (Summe 192 %). */
function referenceRecipe(): PercentIngredient[] {
  return [
    { name: "Weizenmehl 550", type: "flour", bakersPercent: 80 },
    { name: "Roggenmehl 1150", type: "flour", bakersPercent: 20 },
    { name: "Wasser", type: "water", bakersPercent: 70 },
    { name: "Starter", type: "starter", bakersPercent: 20 },
    { name: "Salz", type: "salt", bakersPercent: 2 },
  ];
}

/** Rezept aus AC-4 / AC-5 / AC-7 in Gramm. */
function gramRecipe(starterHydration?: number): GramIngredient[] {
  const starter: GramIngredient = { name: "Starter", type: "starter", amountGrams: 200 };
  if (starterHydration !== undefined) starter.starterHydration = starterHydration;
  return [
    { name: "Weizenmehl 550", type: "flour", amountGrams: 800 },
    { name: "Roggenmehl 1150", type: "flour", amountGrams: 200 },
    { name: "Wasser", type: "water", amountGrams: 700 },
    starter,
    { name: "Salz", type: "salt", amountGrams: 20 },
  ];
}

function sumGrams(ingredients: readonly { amountGrams: number }[]): number {
  return ingredients.reduce((sum, ing) => sum + ing.amountGrams, 0);
}

function expectGrams(actual: readonly { amountGrams: number }[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((grams, i) => {
    expect(actual[i].amountGrams).toBeCloseTo(grams, 2);
  });
}

describe("F007 Bäckerprozent- und Netto-Hydratations-Engine (src/lib/baking-engine/hydration.ts)", () => {
  it("F007/AC-1 berechnet die Grammangaben aus 1000 g Mehlbasis und erhält Name, Typ und Reihenfolge", () => {
    const input = referenceRecipe();
    const snapshot = structuredClone(input);

    const result = calculateRecipeFromFlourBasis(input, 1000);

    expect(result.flourBasis).toBeCloseTo(1000, 2);
    expectGrams(result.ingredients, [800, 200, 700, 200, 20]);
    expect(result.totalWeight).toBeCloseTo(1920, 2);
    expect(sumGrams(result.ingredients)).toBeCloseTo(1920, 2);
    expect(result.ingredients.map((i) => [i.name, i.type])).toEqual([
      ["Weizenmehl 550", "flour"],
      ["Roggenmehl 1150", "flour"],
      ["Wasser", "water"],
      ["Starter", "starter"],
      ["Salz", "salt"],
    ]);
    expect(result.ingredients.map((i) => i.bakersPercent)).toEqual([80, 20, 70, 20, 2]);
    // Eingabe wird nicht mutiert
    expect(input).toEqual(snapshot);
  });

  it("F007/AC-1 übernimmt die Starter-Hydratation unverändert in die Ausgabe", () => {
    const input: PercentIngredient[] = [
      { name: "Weizenmehl 550", type: "flour", bakersPercent: 100 },
      { name: "Lievito Madre", type: "starter", bakersPercent: 20, starterHydration: 50 },
    ];

    const result = calculateRecipeFromFlourBasis(input, 500);

    expect(result.ingredients[1]).toMatchObject({
      name: "Lievito Madre",
      type: "starter",
      starterHydration: 50,
    });
    expect(result.ingredients[1].amountGrams).toBeCloseTo(100, 2);
  });

  it("F007/AC-2 berechnet aus 960 g Ziel-Teiggewicht eine Mehlbasis von 500 g und die Grammangaben", () => {
    const result = calculateRecipeFromTotalWeight(referenceRecipe(), 960);

    expect(result.flourBasis).toBeCloseTo(500, 2);
    expectGrams(result.ingredients, [400, 100, 350, 100, 10]);
    expect(sumGrams(result.ingredients)).toBeCloseTo(960, 2);
    expect(result.totalWeight).toBeCloseTo(960, 2);
    expect(result.ingredients.map((i) => i.name)).toEqual([
      "Weizenmehl 550",
      "Roggenmehl 1150",
      "Wasser",
      "Starter",
      "Salz",
    ]);
  });

  it("F007/AC-3 skaliert auf 1000 g Teiggewicht ungerundet (Summe exakt 1000 g)", () => {
    const result = calculateRecipeFromTotalWeight(referenceRecipe(), 1000);

    expect(result.flourBasis).toBeCloseTo(520.83, 2);
    expectGrams(result.ingredients, [416.67, 104.17, 364.58, 104.17, 10.42]);
    // ungerundete Summe: bei vorgerundeten Werten (z. B. auf 0,01 g) wäre sie 1000,01
    expect(sumGrams(result.ingredients)).toBeCloseTo(1000, 9);
    expect(result.totalWeight).toBeCloseTo(1000, 9);
    // Werte sind nicht auf zwei Nachkommastellen vorgerundet
    expect(result.ingredients[0].amountGrams).not.toBe(416.67);
    expect(result.flourBasis).not.toBe(520.83);
  });

  it("F007/AC-4 berechnet die Netto-Hydratation mit Starter bei 100 % (72,73 %) statt der Brutto-Hydratation", () => {
    const result = calculateNetHydration(gramRecipe(100));

    expect(typeof result).toBe("number");
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(72.73, 2);
    expect(result).toBeCloseTo((800 / 1100) * 100, 9);
    expect(result).not.toBeCloseTo(70, 2);
  });

  it("F007/AC-4 verwendet ohne Angabe die Standard-Starter-Hydratation von 100 %", () => {
    const result = calculateNetHydration(gramRecipe());

    expect(typeof result).toBe("number");
    expect(result).toBeCloseTo(72.73, 2);
  });

  it("F007/AC-5 berechnet die Netto-Hydratation mit Lievito Madre (50 %) als 67,65 %", () => {
    const result = calculateNetHydration(gramRecipe(50));

    // Starter: 133,33 g Mehl / 66,67 g Wasser -> 766,67 g Wasser / 1133,33 g Mehl
    expect(result).toBeCloseTo(67.65, 2);
    expect(result).toBeCloseTo(((700 + 200 - 200 / 1.5) / (1000 + 200 / 1.5)) * 100, 9);
  });

  it("F007/AC-6 berechnet die Netto-Hydratation ohne Starter als 65 %", () => {
    const result = calculateNetHydration([
      { name: "Weizenmehl 550", type: "flour", amountGrams: 1000 },
      { name: "Wasser", type: "water", amountGrams: 650 },
      { name: "Salz", type: "salt", amountGrams: 20 },
    ]);

    expect(result).toBeCloseTo(65, 2);
  });

  it("F007/AC-6 zählt Salz und Sonstiges weder als Mehl noch als Wasser", () => {
    const result = calculateNetHydration([
      { name: "Weizenmehl 550", type: "flour", amountGrams: 1000 },
      { name: "Wasser", type: "water", amountGrams: 650 },
      { name: "Salz", type: "salt", amountGrams: 20 },
      { name: "Saaten", type: "other", amountGrams: 100 },
    ]);

    expect(result).toBeCloseTo(65, 2);
  });

  it("F007/AC-7 berechnet Bäckerprozente aus Grammangaben bezogen nur auf die Mehlbasis", () => {
    const input = gramRecipe();
    const snapshot = structuredClone(input);

    const result = calculateBakersPercentages(input);

    expect(result).toHaveLength(5);
    const expected = [80, 20, 70, 20, 2];
    expected.forEach((percent, i) => {
      expect(result[i].bakersPercent).toBeCloseTo(percent, 2);
    });
    // Starter-Mehl fließt nicht in die Basis ein (sonst 200 / 1100 = 18,18 %)
    expect(result[3].bakersPercent).not.toBeCloseTo((200 / 1100) * 100, 2);
    expect(result.map((i) => [i.name, i.type, i.amountGrams])).toEqual([
      ["Weizenmehl 550", "flour", 800],
      ["Roggenmehl 1150", "flour", 200],
      ["Wasser", "water", 700],
      ["Starter", "starter", 200],
      ["Salz", "salt", 20],
    ]);
    expect(input).toEqual(snapshot);
  });

  it("F007/AC-8 akzeptiert drei Mehle mit 33,3 + 33,3 + 33,4 % und berechnet 333 / 333 / 334 g", () => {
    const input: PercentIngredient[] = [
      { name: "Weizenmehl 550", type: "flour", bakersPercent: 33.3 },
      { name: "Dinkelmehl 630", type: "flour", bakersPercent: 33.3 },
      { name: "Roggenmehl 1150", type: "flour", bakersPercent: 33.4 },
      { name: "Wasser", type: "water", bakersPercent: 70 },
    ];

    const result = calculateRecipeFromFlourBasis(input, 1000);
    expectGrams(result.ingredients, [333, 333, 334, 700]);

    expect(() => calculateRecipeFromTotalWeight(input, 1700)).not.toThrow();
    expect(calculateRecipeFromTotalWeight(input, 1700).flourBasis).toBeCloseTo(1000, 2);
  });

  it("F007/AC-8 akzeptiert eine Abweichung von höchstens 0,01 Prozentpunkten (80 + 20,005 %)", () => {
    const input: PercentIngredient[] = [
      { name: "Weizenmehl 550", type: "flour", bakersPercent: 80 },
      { name: "Roggenmehl 1150", type: "flour", bakersPercent: 20.005 },
      { name: "Wasser", type: "water", bakersPercent: 70 },
    ];

    expect(() => calculateRecipeFromFlourBasis(input, 1000)).not.toThrow();
    expect(calculateRecipeFromFlourBasis(input, 1000).ingredients[1].amountGrams).toBeCloseTo(
      200.05,
      2,
    );
    expect(() => calculateRecipeFromTotalWeight(input, 1000)).not.toThrow();
    expect(calculateRecipeFromTotalWeight(input, 1000).totalWeight).toBeCloseTo(1000, 9);
  });

  it("F007/AC-8 wirft „Die Mehlanteile müssen zusammen 100 % ergeben.“ bei 80 + 30 %", () => {
    const input: PercentIngredient[] = [
      { name: "Weizenmehl 550", type: "flour", bakersPercent: 80 },
      { name: "Roggenmehl 1150", type: "flour", bakersPercent: 30 },
      { name: "Wasser", type: "water", bakersPercent: 70 },
    ];

    expect(FLOUR_PERCENT_SUM_MESSAGE).toBe("Die Mehlanteile müssen zusammen 100 % ergeben.");
    expect(() => calculateRecipeFromFlourBasis(input, 1000)).toThrow(
      "Die Mehlanteile müssen zusammen 100 % ergeben.",
    );
    expect(() => calculateRecipeFromTotalWeight(input, 1000)).toThrow(
      "Die Mehlanteile müssen zusammen 100 % ergeben.",
    );
  });

  it("F007/AC-8 wirft den Mehlanteil-Fehler auch knapp über der Toleranz und ohne Mehl", () => {
    const tooHigh: PercentIngredient[] = [
      { name: "Weizenmehl 550", type: "flour", bakersPercent: 80 },
      { name: "Roggenmehl 1150", type: "flour", bakersPercent: 20.02 },
    ];
    const noFlour: PercentIngredient[] = [{ name: "Wasser", type: "water", bakersPercent: 70 }];

    expect(() => calculateRecipeFromFlourBasis(tooHigh, 1000)).toThrow(FLOUR_PERCENT_SUM_MESSAGE);
    expect(() => calculateRecipeFromTotalWeight(tooHigh, 1000)).toThrow(FLOUR_PERCENT_SUM_MESSAGE);
    expect(() => calculateRecipeFromFlourBasis(noFlour, 1000)).toThrow(FLOUR_PERCENT_SUM_MESSAGE);
    expect(() => calculateRecipeFromTotalWeight(noFlour, 1000)).toThrow(FLOUR_PERCENT_SUM_MESSAGE);
  });

  // NaN/Infinity: siehe F008/AC-5 (eigene Meldung „… muss eine gültige Zahl sein.“)
  it.each([0, -1])(
    "F007/AC-9 wirft bei ungültiger Mehlbasis %s einen Fehler",
    (flourBasis) => {
      expect(INVALID_FLOUR_BASIS_MESSAGE).toEqual(expect.any(String));
      expect(() => calculateRecipeFromFlourBasis(referenceRecipe(), flourBasis)).toThrow(
        INVALID_FLOUR_BASIS_MESSAGE,
      );
    },
  );

  // NaN/Infinity: siehe F008/AC-6 (eigene Meldung „… muss eine gültige Zahl sein.“)
  it.each([0, -1])(
    "F007/AC-9 wirft bei ungültigem Ziel-Teiggewicht %s einen Fehler",
    (totalWeight) => {
      expect(INVALID_TOTAL_WEIGHT_MESSAGE).toEqual(expect.any(String));
      expect(() => calculateRecipeFromTotalWeight(referenceRecipe(), totalWeight)).toThrow(
        INVALID_TOTAL_WEIGHT_MESSAGE,
      );
    },
  );

  it("F007/AC-9 wirft bei einem negativen Bäckerprozent in beiden Skalierfunktionen", () => {
    const input = referenceRecipe();
    input[4] = { name: "Salz", type: "salt", bakersPercent: -2 };

    expect(NEGATIVE_BAKERS_PERCENT_MESSAGE).toEqual(expect.any(String));
    expect(() => calculateRecipeFromFlourBasis(input, 1000)).toThrow(
      NEGATIVE_BAKERS_PERCENT_MESSAGE,
    );
    expect(() => calculateRecipeFromTotalWeight(input, 1000)).toThrow(
      NEGATIVE_BAKERS_PERCENT_MESSAGE,
    );
  });

  it("F007/AC-9 wirft bei negativen Grammangaben in Netto-Hydratation und Bäckerprozenten", () => {
    const input = gramRecipe();
    input[2] = { name: "Wasser", type: "water", amountGrams: -700 };

    expect(NEGATIVE_GRAMS_MESSAGE).toEqual(expect.any(String));
    expect(() => calculateNetHydration(input)).toThrow(NEGATIVE_GRAMS_MESSAGE);
    expect(() => calculateBakersPercentages(input)).toThrow(NEGATIVE_GRAMS_MESSAGE);
  });

  it("F007/AC-9 wirft bei negativer Starter-Hydratation", () => {
    const percentInput: PercentIngredient[] = [
      { name: "Weizenmehl 550", type: "flour", bakersPercent: 100 },
      { name: "Starter", type: "starter", bakersPercent: 20, starterHydration: -1 },
    ];

    expect(NEGATIVE_STARTER_HYDRATION_MESSAGE).toEqual(expect.any(String));
    expect(() => calculateNetHydration(gramRecipe(-1))).toThrow(NEGATIVE_STARTER_HYDRATION_MESSAGE);
    expect(() => calculateRecipeFromFlourBasis(percentInput, 1000)).toThrow(
      NEGATIVE_STARTER_HYDRATION_MESSAGE,
    );
  });

  it("F007/AC-9 wirft bei Bäckerprozenten ohne Mehl statt 0 oder NaN zurückzugeben", () => {
    expect(NO_FLOUR_MESSAGE).toEqual(expect.any(String));
    expect(() =>
      calculateBakersPercentages([
        { name: "Wasser", type: "water", amountGrams: 500 },
        { name: "Salz", type: "salt", amountGrams: 10 },
      ]),
    ).toThrow(NO_FLOUR_MESSAGE);
  });

  it("F007/AC-10 liefert null für die Netto-Hydratation ohne Mehl und ohne Starter", () => {
    const result = calculateNetHydration([
      { name: "Wasser", type: "water", amountGrams: 500 },
      { name: "Salz", type: "salt", amountGrams: 10 },
    ]);

    expect(result).toBeNull();
  });

  it("F007/AC-10 liefert null für ein leeres Rezept", () => {
    expect(calculateNetHydration([])).toBeNull();
  });

  it("F007/AC-11 zerlegt mehrere Starter einzeln mit eigener Hydratation (70,83 %)", () => {
    const result = calculateNetHydration([
      { name: "Weizenmehl 550", type: "flour", amountGrams: 1000 },
      { name: "Wasser", type: "water", amountGrams: 700 },
      { name: "Roggensauer", type: "starter", amountGrams: 200, starterHydration: 100 },
      { name: "Lievito Madre", type: "starter", amountGrams: 150, starterHydration: 50 },
    ]);

    // 850 g Wasser / 1200 g Mehl
    expect(result).toBeCloseTo(70.83, 2);
    expect(result).toBeCloseTo((850 / 1200) * 100, 9);
  });
});

/**
 * Prüft, dass `fn` wirft und die Fehlermeldung exakt `message` ist
 * (`toThrow(string)` würde nur einen Teilstring prüfen).
 */
function expectThrowMessage(fn: () => unknown, message: string): void {
  let caught: unknown;
  let returned = false;
  try {
    fn();
    returned = true;
  } catch (error) {
    caught = error;
  }
  expect(returned, `erwartet: Fehler „${message}“, aber der Aufruf hat ein Ergebnis geliefert`).toBe(
    false,
  );
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toBe(message);
}

const NON_FINITE_VALUES = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

const MSG_NON_FINITE_FLOUR_BASIS = "Die Mehlbasis muss eine gültige Zahl sein.";
const MSG_NON_FINITE_TOTAL_WEIGHT = "Das Teiggewicht muss eine gültige Zahl sein.";
const MSG_NON_FINITE_BAKERS_PERCENT = "Bäckerprozente müssen gültige Zahlen sein.";
const MSG_NON_FINITE_GRAMS = "Grammangaben müssen gültige Zahlen sein.";
const MSG_NON_FINITE_STARTER_HYDRATION = "Die Starter-Hydratation muss eine gültige Zahl sein.";

const MSG_INVALID_FLOUR_BASIS = "Die Mehlbasis muss größer als 0 g sein.";
const MSG_INVALID_TOTAL_WEIGHT = "Das Teiggewicht muss größer als 0 g sein.";
const MSG_NEGATIVE_BAKERS_PERCENT = "Bäckerprozente dürfen nicht negativ sein.";
const MSG_NEGATIVE_GRAMS = "Grammangaben dürfen nicht negativ sein.";
const MSG_NEGATIVE_STARTER_HYDRATION = "Die Starter-Hydratation darf nicht negativ sein.";

/** Referenzrezept mit geändertem Bäckerprozent an Position `index`. */
function referenceRecipeWithPercent(index: number, bakersPercent: number): PercentIngredient[] {
  const input = referenceRecipe();
  input[index] = { ...input[index], bakersPercent };
  return input;
}

/** Referenzrezept, dessen Starter die Starter-Hydratation `starterHydration` hat. */
function referenceRecipeWithStarterHydration(starterHydration: number): PercentIngredient[] {
  const input = referenceRecipe();
  input[3] = { ...input[3], starterHydration };
  return input;
}

/** Grammrezept mit geänderter Wassermenge. */
function gramRecipeWithWater(amountGrams: number): GramIngredient[] {
  const input = gramRecipe();
  input[2] = { name: "Wasser", type: "water", amountGrams };
  return input;
}

describe("F008 Hydratations-Engine: Meldungen für ungültige Zahlen und unbekannte Zutatentypen", () => {
  // AC-2: Bäckerprozent nicht endlich
  it("F008/AC-2 exportiert die Meldung „Bäckerprozente müssen gültige Zahlen sein.“", () => {
    expect(NON_FINITE_BAKERS_PERCENT_MESSAGE).toBe(MSG_NON_FINITE_BAKERS_PERCENT);
  });

  it.each(NON_FINITE_VALUES)(
    "F008/AC-2 wirft bei Bäckerprozent %s beim Salz in beiden Skalierfunktionen die Gültige-Zahl-Meldung",
    (value) => {
      const input = referenceRecipeWithPercent(4, value);

      expectThrowMessage(() => calculateRecipeFromFlourBasis(input, 1000), MSG_NON_FINITE_BAKERS_PERCENT);
      expectThrowMessage(() => calculateRecipeFromTotalWeight(input, 1000), MSG_NON_FINITE_BAKERS_PERCENT);
    },
  );

  it.each(NON_FINITE_VALUES)(
    "F008/AC-2 wirft bei Bäckerprozent %s bei einem Mehl die Gültige-Zahl-Meldung statt der Mehlanteil-Meldung",
    (value) => {
      const input = referenceRecipeWithPercent(1, value);

      expectThrowMessage(() => calculateRecipeFromFlourBasis(input, 1000), MSG_NON_FINITE_BAKERS_PERCENT);
      expectThrowMessage(() => calculateRecipeFromTotalWeight(input, 1000), MSG_NON_FINITE_BAKERS_PERCENT);
    },
  );

  // AC-3: Grammangabe nicht endlich
  it("F008/AC-3 exportiert die Meldung „Grammangaben müssen gültige Zahlen sein.“", () => {
    expect(NON_FINITE_GRAMS_MESSAGE).toBe(MSG_NON_FINITE_GRAMS);
  });

  it.each(NON_FINITE_VALUES)(
    "F008/AC-3 wirft bei Grammangabe %s beim Wasser in Netto-Hydratation und Bäckerprozenten die Gültige-Zahl-Meldung",
    (value) => {
      const input = gramRecipeWithWater(value);

      expectThrowMessage(() => calculateNetHydration(input), MSG_NON_FINITE_GRAMS);
      expectThrowMessage(() => calculateBakersPercentages(input), MSG_NON_FINITE_GRAMS);
    },
  );

  // AC-4: Starter-Hydratation nicht endlich
  it("F008/AC-4 exportiert die Meldung „Die Starter-Hydratation muss eine gültige Zahl sein.“", () => {
    expect(NON_FINITE_STARTER_HYDRATION_MESSAGE).toBe(MSG_NON_FINITE_STARTER_HYDRATION);
  });

  it.each(NON_FINITE_VALUES)(
    "F008/AC-4 wirft bei Starter-Hydratation %s in allen vier Berechnungen die Gültige-Zahl-Meldung",
    (value) => {
      const percentInput = referenceRecipeWithStarterHydration(value);
      const gramInput = gramRecipe(value);

      expectThrowMessage(
        () => calculateRecipeFromFlourBasis(percentInput, 1000),
        MSG_NON_FINITE_STARTER_HYDRATION,
      );
      expectThrowMessage(
        () => calculateRecipeFromTotalWeight(percentInput, 1000),
        MSG_NON_FINITE_STARTER_HYDRATION,
      );
      expectThrowMessage(() => calculateNetHydration(gramInput), MSG_NON_FINITE_STARTER_HYDRATION);
      expectThrowMessage(
        () => calculateBakersPercentages(gramInput),
        MSG_NON_FINITE_STARTER_HYDRATION,
      );
    },
  );

  // AC-5: Mehlbasis nicht endlich
  it("F008/AC-5 exportiert die Meldung „Die Mehlbasis muss eine gültige Zahl sein.“", () => {
    expect(NON_FINITE_FLOUR_BASIS_MESSAGE).toBe(MSG_NON_FINITE_FLOUR_BASIS);
  });

  it.each(NON_FINITE_VALUES)(
    "F008/AC-5 wirft bei Mehlbasis %s die Gültige-Zahl-Meldung statt „größer als 0 g“",
    (flourBasis) => {
      expectThrowMessage(
        () => calculateRecipeFromFlourBasis(referenceRecipe(), flourBasis),
        MSG_NON_FINITE_FLOUR_BASIS,
      );
    },
  );

  // AC-6: Ziel-Teiggewicht nicht endlich
  it("F008/AC-6 exportiert die Meldung „Das Teiggewicht muss eine gültige Zahl sein.“", () => {
    expect(NON_FINITE_TOTAL_WEIGHT_MESSAGE).toBe(MSG_NON_FINITE_TOTAL_WEIGHT);
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY])(
    "F008/AC-6 wirft bei Ziel-Teiggewicht %s die Gültige-Zahl-Meldung statt „größer als 0 g“",
    (totalWeight) => {
      expectThrowMessage(
        () => calculateRecipeFromTotalWeight(referenceRecipe(), totalWeight),
        MSG_NON_FINITE_TOTAL_WEIGHT,
      );
    },
  );

  it("F008/AC-6 wirft bei Ziel-Teiggewicht Infinity die Gültige-Zahl-Meldung und gibt kein Rezept zurück", () => {
    let result: ReturnType<typeof calculateRecipeFromTotalWeight> | undefined;

    expectThrowMessage(() => {
      result = calculateRecipeFromTotalWeight(referenceRecipe(), Number.POSITIVE_INFINITY);
      return result;
    }, MSG_NON_FINITE_TOTAL_WEIGHT);
    expect(result).toBeUndefined();
  });

  // AC-7: endliche ungültige Werte behalten ihre F007-Meldungen
  it.each([0, -1])(
    "F008/AC-7 meldet bei Mehlbasis %s weiterhin exakt „Die Mehlbasis muss größer als 0 g sein.“",
    (flourBasis) => {
      expectThrowMessage(
        () => calculateRecipeFromFlourBasis(referenceRecipe(), flourBasis),
        MSG_INVALID_FLOUR_BASIS,
      );
    },
  );

  it.each([0, -1])(
    "F008/AC-7 meldet bei Ziel-Teiggewicht %s weiterhin exakt „Das Teiggewicht muss größer als 0 g sein.“",
    (totalWeight) => {
      expectThrowMessage(
        () => calculateRecipeFromTotalWeight(referenceRecipe(), totalWeight),
        MSG_INVALID_TOTAL_WEIGHT,
      );
    },
  );

  it("F008/AC-7 meldet bei Bäckerprozent −1 in beiden Skalierfunktionen weiterhin exakt die Negativ-Meldung", () => {
    const input = referenceRecipeWithPercent(4, -1);

    expectThrowMessage(() => calculateRecipeFromFlourBasis(input, 1000), MSG_NEGATIVE_BAKERS_PERCENT);
    expectThrowMessage(() => calculateRecipeFromTotalWeight(input, 1000), MSG_NEGATIVE_BAKERS_PERCENT);
  });

  it("F008/AC-7 meldet bei Grammangabe −1 in Netto-Hydratation und Bäckerprozenten weiterhin exakt die Negativ-Meldung", () => {
    const input = gramRecipeWithWater(-1);

    expectThrowMessage(() => calculateNetHydration(input), MSG_NEGATIVE_GRAMS);
    expectThrowMessage(() => calculateBakersPercentages(input), MSG_NEGATIVE_GRAMS);
  });

  it("F008/AC-7 meldet bei Starter-Hydratation −1 in allen vier Berechnungen weiterhin exakt die Negativ-Meldung", () => {
    const percentInput = referenceRecipeWithStarterHydration(-1);
    const gramInput = gramRecipe(-1);

    expectThrowMessage(
      () => calculateRecipeFromFlourBasis(percentInput, 1000),
      MSG_NEGATIVE_STARTER_HYDRATION,
    );
    expectThrowMessage(
      () => calculateRecipeFromTotalWeight(percentInput, 1000),
      MSG_NEGATIVE_STARTER_HYDRATION,
    );
    expectThrowMessage(() => calculateNetHydration(gramInput), MSG_NEGATIVE_STARTER_HYDRATION);
    expectThrowMessage(() => calculateBakersPercentages(gramInput), MSG_NEGATIVE_STARTER_HYDRATION);
  });

  // AC-8: −Infinity wird vor dem Vorzeichen als ungültige Zahl erkannt
  it("F008/AC-8 meldet bei Mehlbasis −Infinity „Die Mehlbasis muss eine gültige Zahl sein.“", () => {
    expectThrowMessage(
      () => calculateRecipeFromFlourBasis(referenceRecipe(), Number.NEGATIVE_INFINITY),
      MSG_NON_FINITE_FLOUR_BASIS,
    );
  });

  it("F008/AC-8 meldet bei Ziel-Teiggewicht −Infinity „Das Teiggewicht muss eine gültige Zahl sein.“", () => {
    expectThrowMessage(
      () => calculateRecipeFromTotalWeight(referenceRecipe(), Number.NEGATIVE_INFINITY),
      MSG_NON_FINITE_TOTAL_WEIGHT,
    );
  });

  it("F008/AC-8 meldet bei Bäckerprozent −Infinity „Bäckerprozente müssen gültige Zahlen sein.“", () => {
    const input = referenceRecipeWithPercent(2, Number.NEGATIVE_INFINITY);

    expectThrowMessage(() => calculateRecipeFromFlourBasis(input, 1000), MSG_NON_FINITE_BAKERS_PERCENT);
    expectThrowMessage(() => calculateRecipeFromTotalWeight(input, 1000), MSG_NON_FINITE_BAKERS_PERCENT);
  });

  it("F008/AC-8 meldet bei Grammangabe −Infinity „Grammangaben müssen gültige Zahlen sein.“", () => {
    const input = gramRecipeWithWater(Number.NEGATIVE_INFINITY);

    expectThrowMessage(() => calculateNetHydration(input), MSG_NON_FINITE_GRAMS);
    expectThrowMessage(() => calculateBakersPercentages(input), MSG_NON_FINITE_GRAMS);
  });

  it("F008/AC-8 meldet bei Starter-Hydratation −Infinity „Die Starter-Hydratation muss eine gültige Zahl sein.“", () => {
    const percentInput = referenceRecipeWithStarterHydration(Number.NEGATIVE_INFINITY);
    const gramInput = gramRecipe(Number.NEGATIVE_INFINITY);

    expectThrowMessage(
      () => calculateRecipeFromFlourBasis(percentInput, 1000),
      MSG_NON_FINITE_STARTER_HYDRATION,
    );
    expectThrowMessage(
      () => calculateRecipeFromTotalWeight(percentInput, 1000),
      MSG_NON_FINITE_STARTER_HYDRATION,
    );
    expectThrowMessage(() => calculateNetHydration(gramInput), MSG_NON_FINITE_STARTER_HYDRATION);
    expectThrowMessage(
      () => calculateBakersPercentages(gramInput),
      MSG_NON_FINITE_STARTER_HYDRATION,
    );
  });

  // AC-9: unbekannter Zutatentyp zur Laufzeit
  function gramRecipeWithMilk(): GramIngredient[] {
    return [
      ...gramRecipe(),
      { name: "Milch", type: "milk" as unknown as IngredientType, amountGrams: 100 },
    ];
  }

  it("F008/AC-9 liefert mit unknownIngredientTypeMessage(\"milk\") exakt „Unbekannter Zutatentyp: milk.“", () => {
    expect(typeof unknownIngredientTypeMessage).toBe("function");
    expect(unknownIngredientTypeMessage("milk")).toBe("Unbekannter Zutatentyp: milk.");
  });

  it("F008/AC-9 wirft in der Netto-Hydratation „Unbekannter Zutatentyp: milk.“ statt die Zutat still zu ignorieren", () => {
    expectThrowMessage(() => calculateNetHydration(gramRecipeWithMilk()), "Unbekannter Zutatentyp: milk.");
  });

  it("F008/AC-9 lässt die Bäckerprozente aus Grammangaben unberührt (Milch 100 g = 10 %)", () => {
    const input = gramRecipeWithMilk();

    expect(() => calculateBakersPercentages(input)).not.toThrow();
    const result = calculateBakersPercentages(input);

    expect(result).toHaveLength(6);
    expect(result[5]).toMatchObject({ name: "Milch", type: "milk", amountGrams: 100 });
    expect(result[5].bakersPercent).toBeCloseTo(10, 9);
    expect(result[0].bakersPercent).toBeCloseTo(80, 9);
  });
});

import { describe, expect, it } from "vitest";
import {
  addFlourRow,
  createReferenceRecipe,
  evaluateRecipe,
  ingredientDisplayName,
  setAdjustWaterOnFlourSwap,
  setBasisMode,
  setBasisValue,
  setRowFlourType,
  setRowGrams,
  setRowName,
  type RecipeRow,
  type RecipeState,
} from "@/lib/calculator/recipe-state";
import { buildSaveRecipeInput } from "@/lib/calculator/save-recipe";

// Referenzrezept (F010/F011): Weizen 550 80 %, Roggen 1150 20 %, Wasser 70 %, Starter 20 % (100 %), Salz 2 %.
const WEIZEN = "row-1";
const ROGGEN = "row-2";
const WASSER = "row-3";
const STARTER = "row-4";
const SALZ = "row-5";

/** Wasser-Bäckerprozent nach Weizen 550 → Dinkel 630: 70 × 966 / 1030. */
const SPELT_WATER_PERCENT = (70 * 966) / 1030;

function row(state: RecipeState, id: string): RecipeRow {
  const found = state.rows.find((r) => r.id === id);
  if (!found) throw new Error(`Zeile ${id} fehlt`);
  return found;
}

function expectAllClose(actual: number[], expected: number[], digits = 6) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));
}

const grams = (state: RecipeState) => state.rows.map((r) => r.grams);
const percents = (state: RecipeState) => state.rows.map((r) => r.percent);

describe("F011 Rezeptzustand: Mehltyp im Referenzrezept", () => {
  it("F011/AC-1 das Referenzrezept nutzt Weizen 550 und Roggen 1150, andere Zeilen haben keinen Mehltyp", () => {
    const state = createReferenceRecipe();

    expect(state.rows.map((r) => r.flourType)).toEqual(["wheat_550", "rye_1150", null, null, null]);
    expect(state.rows.map((r) => r.name)).toEqual(["Weizen 550", "Roggen 1150", "Wasser", "Starter", "Salz"]);
    expect(state.rows.map(ingredientDisplayName)).toEqual(["Weizen 550", "Roggen 1150", "Wasser", "Starter", "Salz"]);
    expectAllClose(grams(state), [800, 200, 700, 200, 20]);
    expectAllClose(percents(state), [80, 20, 70, 20, 2]);
  });

  it("F011/AC-1 der Anzeigename einer Mehlzeile folgt dem Mehltyp aus dem Katalog", () => {
    const base: RecipeRow = {
      id: "x",
      name: "veraltet",
      type: "flour",
      grams: 0,
      percent: 0,
      starterHydration: 100,
      flourType: "spelt_630",
    };

    expect(ingredientDisplayName(base)).toBe("Dinkel 630");
    expect(ingredientDisplayName({ ...base, flourType: "tipo_00", name: "" })).toBe("Tipo 00 (Pizzamehl)");
  });
});

describe("F011 Rezeptzustand: neue Mehlzeile", () => {
  it("F011/AC-2 „Mehl hinzufügen“ legt eine Zeile Weizen 550 mit 0 g / 0 % an, das Wasser bleibt 70 %", () => {
    const { state, rowId } = addFlourRow(createReferenceRecipe());

    expect(rowId).toBe("row-6");
    expect(state.rows[2]).toEqual({
      id: "row-6",
      name: "Weizen 550",
      type: "flour",
      grams: 0,
      percent: 0,
      starterHydration: 100,
      flourType: "wheat_550",
    });
    expect(row(state, WASSER).percent).toBe(70);
    expect(row(state, WASSER).grams).toBeCloseTo(700, 9);
    expect(evaluateRecipe(state).isValid).toBe(true);
  });
});

describe("F011 Rezeptzustand: Schalter", () => {
  it("F011/AC-3 der Schalter ist im Referenzrezept eingeschaltet", () => {
    expect(createReferenceRecipe().adjustWaterOnFlourSwap).toBe(true);
  });

  it("F011/AC-3 Umschalten ändert nur den Schalter, keine Gramm- oder Prozentwerte", () => {
    const reference = createReferenceRecipe();
    const snapshot = JSON.stringify(reference);

    const off = setAdjustWaterOnFlourSwap(reference, false);
    expect(off.adjustWaterOnFlourSwap).toBe(false);
    expect(off.rows).toEqual(reference.rows);
    expect(off.basis).toBe(reference.basis);
    expect(off.flourBasis).toBe(reference.flourBasis);
    expect(off.doughWeight).toBe(reference.doughWeight);

    const on = setAdjustWaterOnFlourSwap(off, true);
    expect(on).toEqual(reference);
    expect(JSON.stringify(reference)).toBe(snapshot);
  });
});

describe("F011 Rezeptzustand: Mehlwechsel bei Basis Gesamtmehl", () => {
  it("F011/AC-4 Weizen 550 → Dinkel 630 passt das Wasser auf 65,65 % / 656,50 g an, alles andere bleibt", () => {
    const reference = createReferenceRecipe();
    const snapshot = JSON.stringify(reference);

    const changed = setRowFlourType(reference, WEIZEN, "spelt_630");

    expect(row(changed, WEIZEN).flourType).toBe("spelt_630");
    expect(row(changed, WEIZEN).name).toBe("Dinkel 630");
    expect(ingredientDisplayName(row(changed, WEIZEN))).toBe("Dinkel 630");
    expect(row(changed, WASSER).percent).toBeCloseTo(SPELT_WATER_PERCENT, 9);
    expect(row(changed, WASSER).percent).toBeCloseTo(65.6505, 4);
    expect(row(changed, WASSER).grams).toBeCloseTo(656.504854, 5);
    expect(changed.flourBasis).toBe(1000);
    expect(changed.basis).toBe("flour");
    expectAllClose(
      [WEIZEN, ROGGEN, STARTER, SALZ].map((id) => row(changed, id).grams),
      [800, 200, 200, 20],
    );
    expectAllClose(
      [WEIZEN, ROGGEN, STARTER, SALZ].map((id) => row(changed, id).percent),
      [80, 20, 20, 2],
    );
    expect(changed.doughWeight).toBeCloseTo(1220 + 656.504854, 5);

    const evaluation = evaluateRecipe(changed);
    expect(evaluation.isValid).toBe(true);
    const expectedHydration = ((SPELT_WATER_PERCENT * 10 + 100) / 1100) * 100;
    expect(evaluation.netHydration).toBeCloseTo(expectedHydration, 9);
    expect(evaluation.netHydration).toBeCloseTo(68.77, 2);
    expect(evaluation.doughYield).toBeCloseTo(168.77, 2);
    expect(JSON.stringify(reference)).toBe(snapshot);
  });

  it("F011/AC-4 ohne echten Wechsel (gleicher Typ, keine Mehlzeile, unbekannte Zeile) bleibt der Zustand gleich", () => {
    const reference = createReferenceRecipe();

    expect(setRowFlourType(reference, WEIZEN, "wheat_550")).toEqual(reference);
    expect(setRowFlourType(reference, WASSER, "spelt_630")).toEqual(reference);
    expect(setRowFlourType(reference, STARTER, "spelt_630")).toEqual(reference);
    expect(setRowFlourType(reference, "row-99", "spelt_630")).toEqual(reference);
  });

  it("F011/AC-4 Wechsel auf denselben Faktor (Roggen 1150 → Weizen Vollkorn) lässt das Wasser bei 70 %", () => {
    const changed = setRowFlourType(createReferenceRecipe(), ROGGEN, "wheat_wholegrain");

    expect(row(changed, ROGGEN).flourType).toBe("wheat_wholegrain");
    expect(row(changed, WASSER).percent).toBeCloseTo(70, 9);
    expect(row(changed, WASSER).grams).toBeCloseTo(700, 6);
  });

  it("F011/AC-5 Rückwechsel auf Weizen 550 stellt 70 % / 700 g wieder her", () => {
    const back = setRowFlourType(setRowFlourType(createReferenceRecipe(), WEIZEN, "spelt_630"), WEIZEN, "wheat_550");

    expect(row(back, WEIZEN).name).toBe("Weizen 550");
    expect(row(back, WASSER).percent).toBeCloseTo(70, 9);
    expect(row(back, WASSER).grams).toBeCloseTo(700, 6);
    const evaluation = evaluateRecipe(back);
    expect(evaluation.netHydration).toBeCloseTo((800 / 1100) * 100, 6);
    expect(evaluation.doughYield).toBeCloseTo(100 + (800 / 1100) * 100, 6);
  });

  it("F011/AC-5 eine lange Kette von Wechseln in beiden Mehlzeilen führt ohne Rundungsdrift zurück", () => {
    let state = createReferenceRecipe();
    const steps: Array<[string, Parameters<typeof setRowFlourType>[2]]> = [
      [WEIZEN, "spelt_630"],
      [WEIZEN, "manitoba"],
      [ROGGEN, "spelt_wholegrain"],
      [WEIZEN, "tipo_00"],
      [WEIZEN, "rye_wholegrain"],
      [ROGGEN, "rye_815"],
      [WEIZEN, "wheat_1050"],
      [WEIZEN, "other_flour"],
      [ROGGEN, "rye_1150"],
      [WEIZEN, "wheat_550"],
    ];
    for (const [rowId, flourType] of steps) {
      state = setRowFlourType(state, rowId, flourType);
    }

    expect(state.rows.map((r) => r.flourType)).toEqual(["wheat_550", "rye_1150", null, null, null]);
    expect(row(state, WASSER).percent).toBeCloseTo(70, 9);
    expect(row(state, WASSER).grams).toBeCloseTo(700, 6);
    expectAllClose(grams(state), [800, 200, 700, 200, 20]);
  });
});

describe("F011 Rezeptzustand: Schalter aus", () => {
  it("F011/AC-6 bei ausgeschaltetem Schalter wechselt nur der Mehltyp, nachträgliches Einschalten ändert nichts", () => {
    const off = setAdjustWaterOnFlourSwap(createReferenceRecipe(), false);

    const swapped = setRowFlourType(off, WEIZEN, "spelt_630");
    expect(row(swapped, WEIZEN).flourType).toBe("spelt_630");
    expect(row(swapped, WEIZEN).name).toBe("Dinkel 630");
    expect(row(swapped, WASSER).percent).toBe(70);
    expect(row(swapped, WASSER).grams).toBeCloseTo(700, 9);
    expectAllClose(grams(swapped), [800, 200, 700, 200, 20]);
    expect(evaluateRecipe(swapped).netHydration).toBeCloseTo((800 / 1100) * 100, 6);

    const on = setAdjustWaterOnFlourSwap(swapped, true);
    expect(on.adjustWaterOnFlourSwap).toBe(true);
    expect(on.rows).toEqual(swapped.rows);

    // Erst der nächste Wechsel wird angepasst: Dinkel 630 → Weizen 550 = 70 × 1030 / 966.
    const next = setRowFlourType(on, WEIZEN, "wheat_550");
    expect(row(next, WASSER).percent).toBeCloseTo((70 * 1030) / 966, 9);
    expect(row(next, WASSER).percent).toBeCloseTo(74.637681, 5);
    expect(row(next, WASSER).grams).toBeCloseTo((700 * 1030) / 966, 6);
  });
});

describe("F011 Rezeptzustand: Mehlwechsel bei Basis Ziel-Teiggewicht", () => {
  it("F011/AC-7 Ziel-Teiggewicht 1920 bleibt, Wasser 65,65 % / 671,72 g, Gramm folgen aus den Prozenten", () => {
    const dough = setBasisMode(createReferenceRecipe(), "dough");
    expect(dough.doughWeight).toBeCloseTo(1920, 9);

    const changed = setRowFlourType(dough, WEIZEN, "spelt_630");

    const percentSum = 122 + SPELT_WATER_PERCENT;
    const flourBasis = (1920 * 100) / percentSum;
    expect(changed.basis).toBe("dough");
    expect(changed.doughWeight).toBeCloseTo(1920, 9);
    expect(changed.flourBasis).toBeCloseTo(flourBasis, 6);
    expect(row(changed, WASSER).percent).toBeCloseTo(SPELT_WATER_PERCENT, 9);
    expect(row(changed, WASSER).grams).toBeCloseTo((flourBasis * SPELT_WATER_PERCENT) / 100, 6);
    expect(row(changed, WASSER).grams).toBeCloseTo(671.72, 1);
    expectAllClose(
      [WEIZEN, ROGGEN, STARTER, SALZ].map((id) => row(changed, id).percent),
      [80, 20, 20, 2],
    );
    expectAllClose(
      [WEIZEN, ROGGEN, STARTER, SALZ].map((id) => row(changed, id).grams),
      [0.8, 0.2, 0.2, 0.02].map((share) => flourBasis * share),
    );
    expect(grams(changed).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1920, 6);

    const evaluation = evaluateRecipe(changed);
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.netHydration).toBeCloseTo(68.77, 2);
  });
});

describe("F011 Rezeptzustand: keine Anpassung ohne Mehlmenge", () => {
  it("F011/AC-8 bei Gesamtmehl 0 bleibt das Wasser, der neue Mehltyp wird übernommen", () => {
    const zeroBasis = setBasisValue(createReferenceRecipe(), 0);
    const waterBefore = row(zeroBasis, WASSER);

    const changed = setRowFlourType(zeroBasis, WEIZEN, "spelt_630");

    expect(row(changed, WEIZEN).flourType).toBe("spelt_630");
    expect(row(changed, WEIZEN).name).toBe("Dinkel 630");
    expect(row(changed, WASSER)).toEqual(waterBefore);
    expect(changed.flourBasis).toBe(0);
    const evaluation = evaluateRecipe(changed);
    expect(evaluation.basisError).toBe("Die Mehlbasis muss größer als 0 g sein.");
    expect(evaluation.rowErrors).toEqual({});
    expect(evaluation.flourSumError).toBeNull();
  });

  it("F011/AC-8 stehen alle Mehlzeilen auf 0 g, bleibt das Wasser unverändert", () => {
    const noFlour = setRowGrams(setRowGrams(createReferenceRecipe(), WEIZEN, 0), ROGGEN, 0);
    const waterBefore = row(noFlour, WASSER);
    const errorsBefore = evaluateRecipe(noFlour);

    const changed = setRowFlourType(noFlour, WEIZEN, "manitoba");

    expect(row(changed, WEIZEN).flourType).toBe("manitoba");
    expect(row(changed, WASSER)).toEqual(waterBefore);
    expectAllClose(grams(changed), grams(noFlour));
    expectAllClose(percents(changed), percents(noFlour));
    const errorsAfter = evaluateRecipe(changed);
    expect(errorsAfter.basisError).toBe(errorsBefore.basisError);
    expect(errorsAfter.flourSumError).toBe(errorsBefore.flourSumError);
    expect(errorsAfter.rowErrors).toEqual(errorsBefore.rowErrors);
  });
});

describe("F011 Rezeptzustand: Speichern im Konto", () => {
  it("F011/AC-9 speichert den Mehltyp als Zutatennamen, ohne Schalter oder Mehltyp-Schlüssel im Payload", () => {
    const recipe = setAdjustWaterOnFlourSwap(setRowFlourType(createReferenceRecipe(), WEIZEN, "spelt_630"), false);

    const input = buildSaveRecipeInput(recipe, "Landbrot");

    expect(input.ingredients.map((i) => i.name)).toEqual(["Dinkel 630", "Roggen 1150", "Wasser", "Starter", "Salz"]);
    expect(Object.keys(input).sort()).toEqual(["ingredients", "name", "targetDoughWeight", "targetHydration"]);
    for (const ingredient of input.ingredients) {
      expect(Object.keys(ingredient).sort()).toEqual(["amountGrams", "bakersPercent", "name", "starterHydration", "type"]);
    }
    expect(JSON.stringify(input)).not.toMatch(/adjustWater|flourType/);
    expect(input.ingredients[2]).toEqual({
      name: "Wasser",
      type: "water",
      amountGrams: 656.5,
      bakersPercent: 65.65,
      starterHydration: 100,
    });
    expect(input.targetHydration).toBe(68.8);
  });
});

describe("F011 Rezeptzustand: Sonstiges Mehl", () => {
  it("F011/AC-10 Wechsel auf „Sonstiges Mehl“ leert den Namen, Faktor 1,00 lässt das Wasser bei 70 %", () => {
    const changed = setRowFlourType(createReferenceRecipe(), WEIZEN, "other_flour");

    expect(row(changed, WEIZEN).flourType).toBe("other_flour");
    expect(row(changed, WEIZEN).name).toBe("");
    expect(ingredientDisplayName(row(changed, WEIZEN))).toBe("Sonstiges Mehl");
    expect(row(changed, WASSER).percent).toBeCloseTo(70, 9);
    expect(row(changed, WASSER).grams).toBeCloseTo(700, 6);

    // Roggen 1150 → Sonstiges Mehl: 70 × (800 + 200) / 1030
    const rye = setRowFlourType(createReferenceRecipe(), ROGGEN, "other_flour");
    expect(row(rye, WASSER).percent).toBeCloseTo((70 * 1000) / 1030, 9);
  });

  it("F011/AC-10 freier Name „Emmer“ wird angezeigt und gespeichert, leer gilt „Sonstiges Mehl“", () => {
    const other = setRowFlourType(createReferenceRecipe(), WEIZEN, "other_flour");

    const named = setRowName(other, WEIZEN, "Emmer");
    expect(ingredientDisplayName(row(named, WEIZEN))).toBe("Emmer");
    expect(ingredientDisplayName(row(setRowName(other, WEIZEN, "  Emmer "), WEIZEN))).toBe("Emmer");
    expect(ingredientDisplayName(row(setRowName(other, WEIZEN, "   "), WEIZEN))).toBe("Sonstiges Mehl");
    expect(buildSaveRecipeInput(named, "Landbrot").ingredients[0].name).toBe("Emmer");
    expect(buildSaveRecipeInput(other, "Landbrot").ingredients[0].name).toBe("Sonstiges Mehl");
  });

  it("F011/AC-10 Rückwechsel auf einen Katalog-Mehltyp setzt den Katalognamen", () => {
    const named = setRowName(setRowFlourType(createReferenceRecipe(), WEIZEN, "other_flour"), WEIZEN, "Emmer");

    const back = setRowFlourType(named, WEIZEN, "wheat_550");
    expect(row(back, WEIZEN).name).toBe("Weizen 550");
    expect(ingredientDisplayName(row(back, WEIZEN))).toBe("Weizen 550");
    expect(row(back, WASSER).percent).toBeCloseTo(70, 9);

    const spelt = setRowFlourType(named, WEIZEN, "spelt_630");
    expect(row(spelt, WEIZEN).name).toBe("Dinkel 630");
    expect(buildSaveRecipeInput(spelt, "Landbrot").ingredients[0].name).toBe("Dinkel 630");
  });
});

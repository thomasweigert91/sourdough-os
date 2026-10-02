import { describe, expect, it } from "vitest";
import {
  FLOUR_PERCENT_SUM_MESSAGE,
  INVALID_FLOUR_BASIS_MESSAGE,
  INVALID_TOTAL_WEIGHT_MESSAGE,
  NEGATIVE_GRAMS_MESSAGE,
  NEGATIVE_STARTER_HYDRATION_MESSAGE,
  NON_FINITE_FLOUR_BASIS_MESSAGE,
  NON_FINITE_TOTAL_WEIGHT_MESSAGE,
} from "@/lib/baking-engine/hydration";
import {
  addAdditiveRow,
  addFlourRow,
  canRemoveRow,
  createReferenceRecipe,
  evaluateRecipe,
  ingredientDisplayName,
  removeRow,
  setBasisMode,
  setBasisValue,
  setRowGrams,
  setRowName,
  setRowPercent,
  setRowType,
  setStarterHydration,
  type RecipeRow,
  type RecipeState,
} from "@/lib/calculator/recipe-state";

// Referenzrezept (Ticket F010): Weizenmehl 80 %, Roggenmehl 20 %, Wasser 70 %, Starter 20 % (100 %), Salz 2 %.
const WEIZEN = "row-1";
const ROGGEN = "row-2";
const WASSER = "row-3";
const STARTER = "row-4";
const SALZ = "row-5";

function row(state: RecipeState, id: string): RecipeRow {
  const found = state.rows.find((r) => r.id === id);
  if (!found) throw new Error(`Zeile ${id} fehlt`);
  return found;
}

function expectAllClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
}

const grams = (state: RecipeState) => state.rows.map((r) => r.grams);
const percents = (state: RecipeState) => state.rows.map((r) => r.percent);
const names = (state: RecipeState) => state.rows.map((r) => r.name);

describe("F010 Rezeptzustand: Referenzrezept und Live-Kennzahlen", () => {
  it("F010/AC-1 liefert das Referenzrezept mit fünf Zeilen in fester Reihenfolge auf Basis Gesamtmehl 1000 g", () => {
    const state = createReferenceRecipe();

    expect(state.basis).toBe("flour");
    expect(state.flourBasis).toBe(1000);
    expect(state.doughWeight).toBe(1920);
    expect(state.rows.map((r) => r.id)).toEqual([WEIZEN, ROGGEN, WASSER, STARTER, SALZ]);
    expect(names(state)).toEqual(["Weizenmehl", "Roggenmehl", "Wasser", "Starter", "Salz"]);
    expect(state.rows.map((r) => r.type)).toEqual(["flour", "flour", "water", "starter", "salt"]);
    expectAllClose(percents(state), [80, 20, 70, 20, 2]);
    expectAllClose(grams(state), [800, 200, 700, 200, 20]);
    expect(state.rows.every((r) => r.starterHydration === 100)).toBe(true);
  });

  it("F010/AC-1 rechnet beim Setzen von Gesamtmehl 1000 alle Gramm und die Kennzahlen neu", () => {
    const changed = setBasisValue(setBasisValue(createReferenceRecipe(), 500), 1000);

    expect(changed.flourBasis).toBe(1000);
    expectAllClose(grams(changed), [800, 200, 700, 200, 20]);
    expect(changed.doughWeight).toBeCloseTo(1920, 6);

    const evaluation = evaluateRecipe(changed);
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.basisError).toBeNull();
    expect(evaluation.flourSumError).toBeNull();
    expect(evaluation.rowErrors).toEqual({});
    expect(evaluation.netHydration).toBeCloseTo((800 / 1100) * 100, 6);
    expect(evaluation.doughYield).toBeCloseTo(100 + (800 / 1100) * 100, 6);
    expect(evaluation.totalWeight).toBeCloseTo(1920, 6);
  });

  it("F010/AC-1 berechnet bei Starter-Hydratation 50 % die Netto-Hydratation 67,6 % und TA 167,6", () => {
    const changed = setStarterHydration(createReferenceRecipe(), STARTER, 50);

    expect(row(changed, STARTER).starterHydration).toBe(50);
    expectAllClose(grams(changed), [800, 200, 700, 200, 20]);
    const evaluation = evaluateRecipe(changed);
    const expected = ((700 + 200 / 3) / (1000 + 400 / 3)) * 100;
    expect(evaluation.netHydration).toBeCloseTo(expected, 6);
    expect(evaluation.netHydration).toBeCloseTo(67.647, 2);
    expect(evaluation.doughYield).toBeCloseTo(100 + expected, 6);
  });

  it("F010/AC-1 ändert den Ausgangszustand nicht (reine Funktionen)", () => {
    const original = createReferenceRecipe();
    const snapshot = JSON.stringify(original);

    setBasisValue(original, 2000);
    setStarterHydration(original, STARTER, 50);
    setRowGrams(original, WASSER, 750);

    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe("F010 Rezeptzustand: Gramm und Prozent", () => {
  it("F010/AC-2 Wasser-Gramm 750 ergibt 75 %, Gesamtmehl bleibt 1000 und die Hydratation 77,3 %", () => {
    const changed = setRowGrams(createReferenceRecipe(), WASSER, 750);

    expect(row(changed, WASSER).grams).toBe(750);
    expect(row(changed, WASSER).percent).toBeCloseTo(75, 6);
    expect(changed.flourBasis).toBe(1000);
    expectAllClose(grams(changed), [800, 200, 750, 200, 20]);
    expectAllClose(percents(changed), [80, 20, 75, 20, 2]);
    expect(changed.doughWeight).toBeCloseTo(1970, 6);

    const evaluation = evaluateRecipe(changed);
    expect(evaluation.netHydration).toBeCloseTo((850 / 1100) * 100, 6);
    expect(evaluation.doughYield).toBeCloseTo(100 + (850 / 1100) * 100, 6);
  });

  it("F010/AC-2 Salz-Prozent 2,5 ergibt 25 g, Gesamtmehl bleibt 1000", () => {
    const changed = setRowPercent(createReferenceRecipe(), SALZ, 2.5);

    expect(row(changed, SALZ).percent).toBe(2.5);
    expect(row(changed, SALZ).grams).toBeCloseTo(25, 6);
    expect(changed.flourBasis).toBe(1000);
    expectAllClose(grams(changed), [800, 200, 700, 200, 25]);
    expect(changed.doughWeight).toBeCloseTo(1925, 6);
  });

  it("F010/AC-2 Mehl-Gramm ändern macht die neue Mehlsumme zur Basis und berechnet alle Prozente neu (Q4)", () => {
    const changed = setRowGrams(createReferenceRecipe(), WEIZEN, 900);

    expect(changed.flourBasis).toBeCloseTo(1100, 6);
    expectAllClose(grams(changed), [900, 200, 700, 200, 20]);
    expectAllClose(percents(changed), [
      (900 / 1100) * 100,
      (200 / 1100) * 100,
      (700 / 1100) * 100,
      (200 / 1100) * 100,
      (20 / 1100) * 100,
    ]);
    expect(row(changed, WEIZEN).percent).toBeCloseTo(81.818181, 5);
    expect(row(changed, WASSER).percent).toBeCloseTo(63.636363, 5);
    expect(changed.doughWeight).toBeCloseTo(2020, 6);
    expect(evaluateRecipe(changed).flourSumError).toBeNull();
  });
});

describe("F010 Rezeptzustand: Basis Ziel-Teiggewicht", () => {
  it("F010/AC-3 Umschalten auf Ziel-Teiggewicht belegt 1920 vor und lässt Gramm und Prozente unverändert", () => {
    const reference = createReferenceRecipe();
    const changed = setBasisMode(reference, "dough");

    expect(changed.basis).toBe("dough");
    expect(changed.doughWeight).toBeCloseTo(1920, 6);
    expect(changed.flourBasis).toBe(1000);
    expectAllClose(grams(changed), [800, 200, 700, 200, 20]);
    expectAllClose(percents(changed), [80, 20, 70, 20, 2]);
  });

  it("F010/AC-3 Ziel-Teiggewicht 960 halbiert alle Gramm, Prozente und Hydratation bleiben", () => {
    const changed = setBasisValue(setBasisMode(createReferenceRecipe(), "dough"), 960);

    expect(changed.doughWeight).toBe(960);
    expect(changed.flourBasis).toBeCloseTo(500, 6);
    expectAllClose(grams(changed), [400, 100, 350, 100, 10]);
    expectAllClose(percents(changed), [80, 20, 70, 20, 2]);
    const evaluation = evaluateRecipe(changed);
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.netHydration).toBeCloseTo((800 / 1100) * 100, 6);
    expect(evaluation.doughYield).toBeCloseTo(100 + (800 / 1100) * 100, 6);
  });

  it("F010/AC-3 Zurückschalten auf Gesamtmehl behält Mehlbasis, Gramm und Prozente", () => {
    const dough = setBasisValue(setBasisMode(createReferenceRecipe(), "dough"), 960);
    const flour = setBasisMode(dough, "flour");

    expect(flour.basis).toBe("flour");
    expect(flour.flourBasis).toBeCloseTo(500, 6);
    expectAllClose(grams(flour), [400, 100, 350, 100, 10]);
    expectAllClose(percents(flour), [80, 20, 70, 20, 2]);
  });

  it("F010/AC-3 Gramm ändern bei Basis Ziel-Teiggewicht berechnet das Prozent aus der Mehlbasis und summiert das Teiggewicht (Q5)", () => {
    const changed = setRowGrams(setBasisMode(createReferenceRecipe(), "dough"), WASSER, 750);

    expect(row(changed, WASSER).percent).toBeCloseTo(75, 6);
    expect(changed.flourBasis).toBe(1000);
    expect(changed.doughWeight).toBeCloseTo(1970, 6);
  });
});

describe("F010 Rezeptzustand: Zeilen hinzufügen und entfernen", () => {
  it("F010/AC-4 „Mehl hinzufügen“ fügt eine leere Mehl-Zeile direkt nach dem letzten Mehl ein", () => {
    const { state, rowId } = addFlourRow(createReferenceRecipe());

    expect(rowId).toBe("row-6");
    expect(state.rows.map((r) => r.id)).toEqual([WEIZEN, ROGGEN, "row-6", WASSER, STARTER, SALZ]);
    expect(state.rows[2]).toEqual({
      id: "row-6",
      name: "",
      type: "flour",
      grams: 0,
      percent: 0,
      starterHydration: 100,
    });
  });

  it("F010/AC-4 „Zutat hinzufügen“ hängt eine Zeile vom Typ Sonstiges ans Ende, Typ ist auf Salz umstellbar", () => {
    const { state, rowId } = addAdditiveRow(createReferenceRecipe());

    expect(rowId).toBe("row-6");
    expect(state.rows.map((r) => r.id)).toEqual([WEIZEN, ROGGEN, WASSER, STARTER, SALZ, "row-6"]);
    expect(state.rows[5]).toEqual({
      id: "row-6",
      name: "",
      type: "other",
      grams: 0,
      percent: 0,
      starterHydration: 100,
    });

    const renamed = setRowName(setRowType(state, rowId, "salt"), rowId, "Meersalz");
    expect(row(renamed, rowId).type).toBe("salt");
    expect(row(renamed, rowId).name).toBe("Meersalz");
  });

  it("F010/AC-4 Roggenmehl entfernen behält die Reihenfolge und meldet die Mehlanteile", () => {
    const changed = removeRow(createReferenceRecipe(), ROGGEN);

    expect(names(changed)).toEqual(["Weizenmehl", "Wasser", "Starter", "Salz"]);
    expectAllClose(grams(changed), [800, 700, 200, 20]);
    expectAllClose(percents(changed), [80, 70, 20, 2]);
    expect(changed.doughWeight).toBeCloseTo(1720, 6);

    const evaluation = evaluateRecipe(changed);
    expect(evaluation.flourSumError).toBe(FLOUR_PERCENT_SUM_MESSAGE);
    expect(evaluation.netHydration).toBeNull();
    expect(evaluation.doughYield).toBeNull();
    expect(evaluation.isValid).toBe(false);
  });

  it("F010/AC-4 Wasser, Starter und das letzte Mehl sind nicht entfernbar", () => {
    const reference = createReferenceRecipe();
    expect(canRemoveRow(reference, WEIZEN)).toBe(true);
    expect(canRemoveRow(reference, ROGGEN)).toBe(true);
    expect(canRemoveRow(reference, SALZ)).toBe(true);
    expect(canRemoveRow(reference, WASSER)).toBe(false);
    expect(canRemoveRow(reference, STARTER)).toBe(false);
    expect(removeRow(reference, WASSER).rows).toEqual(reference.rows);
    expect(removeRow(reference, STARTER).rows).toEqual(reference.rows);

    const oneFlour = removeRow(reference, ROGGEN);
    expect(canRemoveRow(oneFlour, WEIZEN)).toBe(false);
    expect(removeRow(oneFlour, WEIZEN).rows).toEqual(oneFlour.rows);
  });

  it("F010/AC-4 neue IDs zählen hoch und bleiben nach dem Entfernen eindeutig", () => {
    const first = addFlourRow(createReferenceRecipe());
    const second = addAdditiveRow(first.state);

    expect(second.rowId).toBe("row-7");
    const removed = removeRow(second.state, first.rowId);
    const third = addFlourRow(removed);
    expect(third.rowId).toBe("row-8");
    expect(new Set(third.state.rows.map((r) => r.id)).size).toBe(third.state.rows.length);
  });

  it("F010/AC-4 Anzeigename fällt bei leerem Namen auf den Typnamen zurück", () => {
    const base: RecipeRow = { id: "x", name: "", type: "flour", grams: 0, percent: 0, starterHydration: 100 };

    expect(ingredientDisplayName(base)).toBe("Mehl");
    expect(ingredientDisplayName({ ...base, name: "   ", type: "other" })).toBe("Sonstiges");
    expect(ingredientDisplayName({ ...base, type: "salt" })).toBe("Salz");
    expect(ingredientDisplayName({ ...base, name: " Dinkel " })).toBe("Dinkel");
    expect(ingredientDisplayName({ ...base, name: "Roggenmehl" })).toBe("Roggenmehl");
  });
});

describe("F010 Rezeptzustand: Validierung", () => {
  it("F010/AC-5 Weizenmehl 70 % meldet die Mehlanteile, Gesamtmehl bleibt 1000", () => {
    const changed = setRowPercent(createReferenceRecipe(), WEIZEN, 70);

    expect(changed.flourBasis).toBe(1000);
    expect(row(changed, WEIZEN).grams).toBeCloseTo(700, 6);
    const evaluation = evaluateRecipe(changed);
    expect(evaluation.flourSumError).toBe(FLOUR_PERCENT_SUM_MESSAGE);
    expect(evaluation.flourSumError).toBe("Die Mehlanteile müssen zusammen 100 % ergeben.");
    expect(evaluation.isValid).toBe(false);
    expect(evaluation.netHydration).toBeNull();
    expect(evaluation.doughYield).toBeNull();

    const fixed = evaluateRecipe(setRowPercent(changed, WEIZEN, 80));
    expect(fixed.flourSumError).toBeNull();
    expect(fixed.isValid).toBe(true);
    expect(fixed.netHydration).toBeCloseTo((800 / 1100) * 100, 6);
  });

  it("F010/AC-5 Wasser −5 g meldet negative Gramm an der Wasser-Zeile", () => {
    const changed = setRowGrams(createReferenceRecipe(), WASSER, -5);

    const evaluation = evaluateRecipe(changed);
    expect(evaluation.rowErrors).toEqual({ [WASSER]: NEGATIVE_GRAMS_MESSAGE });
    expect(evaluation.rowErrors[WASSER]).toBe("Grammangaben dürfen nicht negativ sein.");
    expect(evaluation.isValid).toBe(false);
    expect(evaluation.netHydration).toBeNull();
    expect(evaluation.doughYield).toBeNull();

    const fixed = evaluateRecipe(setRowGrams(changed, WASSER, 700));
    expect(fixed.rowErrors).toEqual({});
    expect(fixed.isValid).toBe(true);
    expect(fixed.netHydration).toBeCloseTo((800 / 1100) * 100, 6);
  });

  it("F010/AC-5 Gesamtmehl 0 meldet die Mehlbasis und lässt die Gramm unverändert", () => {
    const changed = setBasisValue(createReferenceRecipe(), 0);

    expect(changed.flourBasis).toBe(0);
    expectAllClose(grams(changed), [800, 200, 700, 200, 20]);
    const evaluation = evaluateRecipe(changed);
    expect(evaluation.basisError).toBe(INVALID_FLOUR_BASIS_MESSAGE);
    expect(evaluation.basisError).toBe("Die Mehlbasis muss größer als 0 g sein.");
    expect(evaluation.isValid).toBe(false);
    expect(evaluation.netHydration).toBeNull();
    expect(evaluation.doughYield).toBeNull();

    const fixed = evaluateRecipe(setBasisValue(changed, 1000));
    expect(fixed.basisError).toBeNull();
    expect(fixed.isValid).toBe(true);
  });

  it("F010/AC-5 Ziel-Teiggewicht 0 meldet das Teiggewicht", () => {
    const changed = setBasisValue(setBasisMode(createReferenceRecipe(), "dough"), 0);

    expect(changed.doughWeight).toBe(0);
    expectAllClose(grams(changed), [800, 200, 700, 200, 20]);
    const evaluation = evaluateRecipe(changed);
    expect(evaluation.basisError).toBe(INVALID_TOTAL_WEIGHT_MESSAGE);
    expect(evaluation.basisError).toBe("Das Teiggewicht muss größer als 0 g sein.");
    expect(evaluation.isValid).toBe(false);
    expect(evaluation.netHydration).toBeNull();

    const fixed = evaluateRecipe(setBasisValue(changed, 1920));
    expect(fixed.basisError).toBeNull();
    expect(fixed.isValid).toBe(true);
  });

  it("F010/AC-5 nicht endliche Basiswerte melden die Engine-Texte für ungültige Zahlen", () => {
    expect(evaluateRecipe(setBasisValue(createReferenceRecipe(), Number.NaN)).basisError).toBe(
      NON_FINITE_FLOUR_BASIS_MESSAGE,
    );
    expect(
      evaluateRecipe(setBasisValue(setBasisMode(createReferenceRecipe(), "dough"), Number.NaN)).basisError,
    ).toBe(NON_FINITE_TOTAL_WEIGHT_MESSAGE);
  });

  it("F010/AC-5 negative Starter-Hydratation meldet den Fehler an der Starter-Zeile", () => {
    const evaluation = evaluateRecipe(setStarterHydration(createReferenceRecipe(), STARTER, -1));

    expect(evaluation.rowErrors[STARTER]).toBe(NEGATIVE_STARTER_HYDRATION_MESSAGE);
    expect(evaluation.isValid).toBe(false);
    expect(evaluation.netHydration).toBeNull();
  });
});

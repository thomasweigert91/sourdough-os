// Randfälle der Basis-Umschaltung aus Review-Runde 1 (F010, Befund 1 und 2):
// ungültige Mehlbasis beim Wechsel auf Ziel-Teiggewicht und nicht angewendete Basiswerte.
import { describe, expect, it } from "vitest";
import { FLOUR_PERCENT_SUM_MESSAGE, INVALID_FLOUR_BASIS_MESSAGE } from "@/lib/baking-engine/hydration";
import {
  addAdditiveRow,
  createReferenceRecipe,
  evaluateRecipe,
  setBasisMode,
  setBasisValue,
  setRowGrams,
  setRowPercent,
  type RecipeRow,
  type RecipeState,
} from "@/lib/calculator/recipe-state";
import { buildSaveRecipeInput } from "@/lib/calculator/save-recipe";

const WEIZEN = "row-1";
const WASSER = "row-3";

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

/** Jede Zeile: Gramm = Mehlbasis × Prozent / 100. */
function expectConsistent(state: RecipeState) {
  state.rows.forEach((r) => expect(r.grams).toBeCloseTo((state.flourBasis * r.percent) / 100, 6));
}

describe("F010 Rezeptzustand: geleertes Gesamtmehl und Umschalten auf Ziel-Teiggewicht", () => {
  it("F010/AC-2 Gesamtmehl leeren, umschalten, Wasser auf 80 %: die Gramm folgen dem Prozent", () => {
    const emptied = setBasisValue(createReferenceRecipe(), 0);
    const dough = setBasisMode(emptied, "dough");

    // Basis aus den Mehl-Zeilen, Gramm, Prozente und Teiggewicht unverändert (AC-3).
    expect(dough.flourBasis).toBeCloseTo(1000, 6);
    expect(dough.doughWeight).toBeCloseTo(1920, 6);
    expectAllClose(grams(dough), [800, 200, 700, 200, 20]);
    expectAllClose(percents(dough), [80, 20, 70, 20, 2]);
    expect(evaluateRecipe(dough).isValid).toBe(true);

    const changed = setRowPercent(dough, WASSER, 80);

    expect(row(changed, WASSER).percent).toBe(80);
    expect(row(changed, WASSER).grams).toBeCloseTo(800, 6);
    expect(changed.doughWeight).toBeCloseTo(2020, 6);
    expectConsistent(changed);
    const evaluation = evaluateRecipe(changed);
    expect(evaluation.isValid).toBe(true);
    // (800 + 100) / (1000 + 100) × 100 = 81,8 %
    expect(evaluation.netHydration).toBeCloseTo((900 / 1100) * 100, 6);

    const water = buildSaveRecipeInput(changed, "Landbrot").ingredients[2];
    expect(water).toMatchObject({ amountGrams: 800, bakersPercent: 80 });
  });

  it("F010/AC-2 Gesamtmehl leeren, umschalten, Wasser auf 800 g: das Prozent folgt den Gramm", () => {
    const dough = setBasisMode(setBasisValue(createReferenceRecipe(), 0), "dough");

    const changed = setRowGrams(dough, WASSER, 800);

    expect(row(changed, WASSER).percent).toBeCloseTo(80, 6);
    expect(changed.doughWeight).toBeCloseTo(2020, 6);
    expectConsistent(changed);
    expect(evaluateRecipe(changed).isValid).toBe(true);
  });

  it("F010/AC-2 ein nicht lesbares Gesamtmehl (NaN) wird beim Umschalten ebenfalls aus den Mehl-Zeilen ersetzt", () => {
    const dough = setBasisMode(setBasisValue(createReferenceRecipe(), Number.NaN), "dough");

    expect(dough.flourBasis).toBeCloseTo(1000, 6);
    expect(evaluateRecipe(dough).basisError).toBeNull();
    expect(row(setRowPercent(dough, WASSER, 75), WASSER).grams).toBeCloseTo(750, 6);
  });

  it("F010/AC-5 lässt sich keine Mehlbasis ableiten, meldet der Modus Ziel-Teiggewicht die Mehlbasis und sperrt das Speichern", () => {
    const reference = createReferenceRecipe();
    // Mehle mit 0 g bei 80 % / 20 %: Gramm und Prozent passen ohne Mehlbasis nicht zusammen.
    const broken: RecipeState = {
      ...reference,
      basis: "dough",
      flourBasis: 0,
      doughWeight: 920,
      rows: reference.rows.map((r) => (r.type === "flour" ? { ...r, grams: 0 } : r)),
    };

    const evaluation = evaluateRecipe(broken);

    expect(evaluation.basisError).toBe(INVALID_FLOUR_BASIS_MESSAGE);
    expect(evaluation.isValid).toBe(false);
    expect(evaluation.netHydration).toBeNull();
    expect(() => buildSaveRecipeInput(broken, "Landbrot")).toThrow();

    // Neues Ziel-Teiggewicht leitet die Mehlbasis über die Engine ab.
    const fixed = setBasisValue(broken, 960);
    expect(fixed.flourBasis).toBeCloseTo(500, 6);
    expectAllClose(grams(fixed), [400, 100, 350, 100, 10]);
    expect(evaluateRecipe(fixed).isValid).toBe(true);
  });
});

describe("F010 Rezeptzustand: Basiswerte gehen bei ungültigem Zwischenstand nicht verloren", () => {
  it("F010/AC-3 Ziel-Teiggewicht 960 bei falschen Mehlanteilen wird nach der Korrektur des Prozents angewendet", () => {
    const invalid = setRowPercent(setBasisMode(createReferenceRecipe(), "dough"), WEIZEN, 70);
    expect(evaluateRecipe(invalid).flourSumError).toBe(FLOUR_PERCENT_SUM_MESSAGE);

    const pending = setBasisValue(invalid, 960);
    expect(pending.doughWeight).toBe(960);
    expectAllClose(grams(pending), grams(invalid));

    const fixed = setRowPercent(pending, WEIZEN, 80);

    expect(fixed.doughWeight).toBe(960);
    expect(fixed.flourBasis).toBeCloseTo(500, 6);
    expectAllClose(grams(fixed), [400, 100, 350, 100, 10]);
    expectAllClose(percents(fixed), [80, 20, 70, 20, 2]);
    expect(evaluateRecipe(fixed).isValid).toBe(true);
  });

  it("F010/AC-3 das noch nicht angewendete Ziel-Teiggewicht bleibt bei weiteren ungültigen Änderungen stehen", () => {
    const pending = setBasisValue(setRowPercent(setBasisMode(createReferenceRecipe(), "dough"), WEIZEN, 70), 960);

    const stillInvalid = setRowPercent(pending, WEIZEN, 75);
    expect(stillInvalid.doughWeight).toBe(960);
    expect(evaluateRecipe(stillInvalid).flourSumError).toBe(FLOUR_PERCENT_SUM_MESSAGE);

    const added = addAdditiveRow(stillInvalid).state;
    expect(added.doughWeight).toBe(960);

    const fixed = setRowPercent(added, WEIZEN, 80);
    expect(fixed.doughWeight).toBe(960);
    expect(grams(fixed).reduce((sum, g) => sum + g, 0)).toBeCloseTo(960, 6);
    expect(evaluateRecipe(fixed).isValid).toBe(true);
  });

  it("F010/AC-3 eingetippte Gramm ersetzen ein nicht angewendetes Ziel-Teiggewicht durch die neue Summe (Q5)", () => {
    const pending = setBasisValue(setRowPercent(setBasisMode(createReferenceRecipe(), "dough"), WEIZEN, 70), 960);

    const changed = setRowGrams(pending, WASSER, 750);

    expect(changed.doughWeight).toBeCloseTo(grams(changed).reduce((sum, g) => sum + g, 0), 6);
    expect(row(changed, WASSER).percent).toBeCloseTo(75, 6);
  });

  it("F010/AC-2 Wasser-Gramm bei geleertem Gesamtmehl bleiben erhalten, wenn die Basis wieder eingetippt wird", () => {
    const emptied = setBasisValue(createReferenceRecipe(), 0);

    const changed = setRowGrams(emptied, WASSER, 750);
    expect(row(changed, WASSER).percent).toBeCloseTo(75, 6);
    expect(evaluateRecipe(changed).basisError).toBe(INVALID_FLOUR_BASIS_MESSAGE);

    const restored = setBasisValue(changed, 1000);
    expectAllClose(grams(restored), [800, 200, 750, 200, 20]);
    expect(evaluateRecipe(restored).isValid).toBe(true);
  });

  it("F010/AC-2 Prozentänderungen bei geleertem Gesamtmehl halten Gramm und Prozent zusammen", () => {
    const emptied = setBasisValue(createReferenceRecipe(), 0);

    const changed = setRowPercent(setRowPercent(emptied, WEIZEN, 70), "row-2", 30);
    expectAllClose(grams(changed), [700, 300, 700, 200, 20]);

    const restored = setBasisValue(changed, 500);
    expectAllClose(grams(restored), [350, 150, 350, 100, 10]);
    expectAllClose(percents(restored), [70, 30, 70, 20, 2]);
  });
});

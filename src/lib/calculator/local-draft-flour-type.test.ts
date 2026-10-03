import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DDT_STATE } from "@/lib/calculator/ddt-state";
import {
  CALCULATOR_DRAFT_KEY,
  loadCalculatorDraft,
  migrateLegacyFlourName,
  saveCalculatorDraft,
  type CalculatorDraft,
  type CalculatorOwner,
} from "@/lib/calculator/local-draft";
import {
  addFlourRow,
  createReferenceRecipe,
  setAdjustWaterOnFlourSwap,
  setRowFlourType,
  setRowName,
} from "@/lib/calculator/recipe-state";

const GUEST: CalculatorOwner = { kind: "guest" };

type LegacyRow = {
  id: string;
  name: string;
  type: string;
  grams: number;
  percent: number;
  starterHydration: number;
};

function legacyRow(id: number, name: string, type: string, grams: number, percent: number): LegacyRow {
  return { id: `row-${id}`, name, type, grams, percent, starterHydration: 100 };
}

/** Mit F010 gemerkter Stand: Version 1, Zeilen ohne flourType, Rezept ohne Schalter. */
function writeLegacyDraft(rows: LegacyRow[], doughWeight = 1920): void {
  window.localStorage.setItem(
    CALCULATOR_DRAFT_KEY,
    JSON.stringify({
      version: 1,
      owner: { kind: "guest" },
      recipe: { basis: "flour", flourBasis: 1000, doughWeight, rows },
      ddt: { ...DEFAULT_DDT_STATE },
    }),
  );
}

function writeRaw(value: unknown): void {
  window.localStorage.setItem(CALCULATOR_DRAFT_KEY, JSON.stringify(value));
}

const FOUR_FLOUR_LEGACY_ROWS: LegacyRow[] = [
  legacyRow(1, " weizenmehl ", "flour", 400, 40),
  legacyRow(2, "ROGGENMEHL", "flour", 200, 20),
  legacyRow(3, "dinkel 630", "flour", 200, 20),
  legacyRow(4, "Ruchmehl", "flour", 200, 20),
  legacyRow(5, "Wasser", "water", 700, 70),
  legacyRow(6, "Starter", "starter", 200, 20),
  legacyRow(7, "Salz", "salt", 20, 2),
];

function flourTypeDraft(): CalculatorDraft {
  const spelt = setRowFlourType(createReferenceRecipe(), "row-1", "spelt_630");
  const added = addFlourRow(spelt);
  const other = setRowName(setRowFlourType(added.state, added.rowId, "other_flour"), added.rowId, "Emmer");
  return { recipe: setAdjustWaterOnFlourSwap(other, false), ddt: { ...DEFAULT_DDT_STATE } };
}

afterEach(() => {
  window.localStorage.clear();
});

describe("F011 Lokal merken: Mehltyp und Schalter", () => {
  it("F011/AC-9 merkt Mehltyp, freien Namen und ausgeschalteten Schalter und stellt sie wieder her", () => {
    const draft = flourTypeDraft();

    expect(saveCalculatorDraft(GUEST, draft)).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(CALCULATOR_DRAFT_KEY) ?? "null");
    expect(stored).toMatchObject({ version: 1, recipe: { adjustWaterOnFlourSwap: false } });
    expect(stored.recipe.rows.map((r: { flourType: unknown }) => r.flourType)).toEqual([
      "spelt_630",
      "rye_1150",
      "other_flour",
      null,
      null,
      null,
    ]);

    const loaded = loadCalculatorDraft(GUEST);
    expect(loaded).toEqual(draft);
    expect(loaded?.recipe.adjustWaterOnFlourSwap).toBe(false);
    expect(loaded?.recipe.rows[0]).toMatchObject({ flourType: "spelt_630", name: "Dinkel 630" });
    expect(loaded?.recipe.rows[2]).toMatchObject({ flourType: "other_flour", name: "Emmer" });
  });

  it("F011/AC-9 der eingeschaltete Schalter bleibt nach dem Merken eingeschaltet", () => {
    const draft: CalculatorDraft = { recipe: createReferenceRecipe(), ddt: { ...DEFAULT_DDT_STATE } };
    saveCalculatorDraft(GUEST, draft);

    expect(loadCalculatorDraft(GUEST)).toEqual(draft);
    expect(loadCalculatorDraft(GUEST)?.recipe.adjustWaterOnFlourSwap).toBe(true);
  });

  it("F011/AC-9 verwirft Stände mit unbekanntem Mehltyp oder nicht-booleschem Schalter", () => {
    const draft = flourTypeDraft();
    const base = { version: 1, owner: GUEST, ddt: draft.ddt };

    writeRaw({
      ...base,
      recipe: { ...draft.recipe, rows: draft.recipe.rows.map((r, i) => (i === 0 ? { ...r, flourType: "spelt_999" } : r)) },
    });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    writeRaw({
      ...base,
      recipe: { ...draft.recipe, rows: draft.recipe.rows.map((r, i) => (i === 0 ? { ...r, flourType: 630 } : r)) },
    });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    writeRaw({ ...base, recipe: { ...draft.recipe, adjustWaterOnFlourSwap: "false" } });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    writeRaw({ ...base, recipe: { ...draft.recipe, adjustWaterOnFlourSwap: 0 } });
    expect(loadCalculatorDraft(GUEST)).toBeNull();
  });

  it("F011/AC-9 Zeilen ohne Mehl tragen nach dem Laden keinen Mehltyp", () => {
    const draft = flourTypeDraft();
    writeRaw({
      version: 1,
      owner: GUEST,
      ddt: draft.ddt,
      recipe: {
        ...draft.recipe,
        rows: draft.recipe.rows.map((r) => (r.type === "water" ? { ...r, flourType: "spelt_630" } : r)),
      },
    });

    const loaded = loadCalculatorDraft(GUEST);
    expect(loaded).not.toBeNull();
    expect(loaded?.recipe.rows.find((r) => r.type === "water")?.flourType).toBeNull();
  });
});

describe("F011 Lokal merken: ältere Stände mit freien Mehlnamen", () => {
  it.each([
    [" weizenmehl ", "wheat_550", "Weizen 550"],
    ["ROGGENMEHL", "rye_1150", "Roggen 1150"],
    ["Weizenmehl", "wheat_550", "Weizen 550"],
    ["Roggenmehl", "rye_1150", "Roggen 1150"],
    ["dinkel 630", "spelt_630", "Dinkel 630"],
    ["  Weizen Vollkorn ", "wheat_wholegrain", "Weizen Vollkorn"],
    ["ROGGEN 815", "rye_815", "Roggen 815"],
    ["Ruchmehl", "other_flour", "Ruchmehl"],
    ["Weizenmehl 550", "other_flour", "Weizenmehl 550"],
    ["Dinkel  630", "other_flour", "Dinkel  630"],
    ["Sonstiges Mehl", "other_flour", ""],
    ["", "other_flour", ""],
    ["   ", "other_flour", ""],
  ])("F011/AC-11 migrateLegacyFlourName(%j) → %s / %j", (input, flourType, name) => {
    expect(migrateLegacyFlourName(input)).toEqual({ flourType, name });
  });

  it("F011/AC-11 ordnet die vier Mehlzeilen eines F010-Stands zu, Mengen, Wasser und Schalter-Standard", () => {
    writeLegacyDraft(FOUR_FLOUR_LEGACY_ROWS);

    const loaded = loadCalculatorDraft(GUEST);

    expect(loaded).not.toBeNull();
    const rows = loaded!.recipe.rows;
    expect(rows.map((r) => r.id)).toEqual(FOUR_FLOUR_LEGACY_ROWS.map((r) => r.id));
    expect(rows.map((r) => r.flourType)).toEqual([
      "wheat_550",
      "rye_1150",
      "spelt_630",
      "other_flour",
      null,
      null,
      null,
    ]);
    expect(rows.map((r) => r.name)).toEqual([
      "Weizen 550",
      "Roggen 1150",
      "Dinkel 630",
      "Ruchmehl",
      "Wasser",
      "Starter",
      "Salz",
    ]);
    expect(rows.map((r) => r.type)).toEqual(["flour", "flour", "flour", "flour", "water", "starter", "salt"]);
    expect(rows.map((r) => r.grams)).toEqual([400, 200, 200, 200, 700, 200, 20]);
    expect(rows.map((r) => r.percent)).toEqual([40, 20, 20, 20, 70, 20, 2]);
    expect(rows.every((r) => r.starterHydration === 100)).toBe(true);
    expect(loaded!.recipe).toMatchObject({ basis: "flour", flourBasis: 1000, doughWeight: 1920 });
    expect(loaded!.recipe.adjustWaterOnFlourSwap).toBe(true);
  });

  it("F011/AC-11 das unveränderte F010-Referenzrezept („Weizenmehl“, „Roggenmehl“) entspricht dem neuen Referenzrezept", () => {
    writeLegacyDraft([
      legacyRow(1, "Weizenmehl", "flour", 800, 80),
      legacyRow(2, "Roggenmehl", "flour", 200, 20),
      legacyRow(3, "Wasser", "water", 700, 70),
      legacyRow(4, "Starter", "starter", 200, 20),
      legacyRow(5, "Salz", "salt", 20, 2),
    ]);

    const loaded = loadCalculatorDraft(GUEST);

    expect(loaded).not.toBeNull();
    expect(loaded!.recipe).toEqual(createReferenceRecipe());
    expect(loaded!.ddt).toEqual(DEFAULT_DDT_STATE);
  });
});

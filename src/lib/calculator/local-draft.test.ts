import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DDT_STATE } from "@/lib/calculator/ddt-state";
import {
  CALCULATOR_DRAFT_KEY,
  clearAccountCalculatorDraft,
  loadCalculatorDraft,
  ownerKey,
  saveCalculatorDraft,
  type CalculatorDraft,
  type CalculatorOwner,
} from "@/lib/calculator/local-draft";
import {
  addFlourRow,
  createReferenceRecipe,
  setBasisMode,
  setBasisValue,
  setRowName,
  setRowType,
  addAdditiveRow,
} from "@/lib/calculator/recipe-state";
import { clearOfflineData } from "@/lib/query/clear-offline-data";
import { QUERY_CACHE_KEY } from "@/lib/query/keys";

const GUEST: CalculatorOwner = { kind: "guest" };
const U1: CalculatorOwner = { kind: "user", userId: "u1" };
const U2: CalculatorOwner = { kind: "user", userId: "u2" };

function changedDraft(): CalculatorDraft {
  const added = addFlourRow(setBasisValue(setBasisMode(createReferenceRecipe(), "dough"), 960));
  const named = setRowName(added.state, added.rowId, "Dinkel");
  const additive = addAdditiveRow(named);
  return {
    recipe: setRowType(additive.state, additive.rowId, "salt"),
    ddt: {
      desiredDoughTemperature: 26,
      roomTemperature: 21.5,
      flourTemperature: 20,
      starterTemperature: 24,
      kneadingMethod: "custom",
      customFriction: 3,
    },
  };
}

function referenceDraft(): CalculatorDraft {
  return { recipe: createReferenceRecipe(), ddt: { ...DEFAULT_DDT_STATE } };
}

function stored(): unknown {
  const raw = window.localStorage.getItem(CALCULATOR_DRAFT_KEY);
  return raw === null ? null : JSON.parse(raw);
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("F010 Lokal merken: Speicherformat und Besitzer", () => {
  it("F010/AC-10 speichert den Stand als Gast unter eigenem Schlüssel mit Besitzer-Marker", () => {
    const draft = changedDraft();

    expect(CALCULATOR_DRAFT_KEY).toBe("sourdough-os:calculator-draft");
    expect(saveCalculatorDraft(GUEST, draft)).toBe(true);
    expect(stored()).toEqual({ version: 1, owner: { kind: "guest" }, recipe: draft.recipe, ddt: draft.ddt });
  });

  it("F010/AC-10 stellt einen Gast-Stand nur für Gäste wieder her", () => {
    const draft = changedDraft();
    saveCalculatorDraft(GUEST, draft);

    expect(loadCalculatorDraft(GUEST)).toEqual(draft);
    expect(loadCalculatorDraft(U1)).toBeNull();
  });

  it("F010/AC-10 stellt einen Konto-Stand nur für dasselbe Konto wieder her", () => {
    const draft = changedDraft();
    saveCalculatorDraft(U1, draft);

    expect(stored()).toMatchObject({ version: 1, owner: { kind: "user", userId: "u1" } });
    expect(loadCalculatorDraft(U1)).toEqual(draft);
    expect(loadCalculatorDraft(U2)).toBeNull();
    expect(loadCalculatorDraft(GUEST)).toBeNull();
  });

  it("F010/AC-10 überschreibt beim erneuten Merken den vorherigen Stand", () => {
    saveCalculatorDraft(GUEST, changedDraft());
    const second = referenceDraft();

    expect(saveCalculatorDraft(GUEST, second)).toBe(true);
    expect(loadCalculatorDraft(GUEST)).toEqual(second);
  });

  it("F010/AC-10 liefert ohne Stand, bei kaputtem JSON oder falscher Version null", () => {
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    window.localStorage.setItem(CALCULATOR_DRAFT_KEY, "{kaputt");
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    const draft = changedDraft();
    window.localStorage.setItem(
      CALCULATOR_DRAFT_KEY,
      JSON.stringify({ version: 2, owner: GUEST, recipe: draft.recipe, ddt: draft.ddt }),
    );
    expect(loadCalculatorDraft(GUEST)).toBeNull();
  });

  it("F010/AC-10 verwirft Stände mit ungültiger Form", () => {
    const draft = changedDraft();
    const write = (value: unknown) =>
      window.localStorage.setItem(CALCULATOR_DRAFT_KEY, JSON.stringify(value));

    write({ version: 1, owner: GUEST, recipe: { ...draft.recipe, basis: "egal" }, ddt: draft.ddt });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    write({
      version: 1,
      owner: GUEST,
      recipe: { ...draft.recipe, rows: draft.recipe.rows.filter((r) => r.type !== "flour") },
      ddt: draft.ddt,
    });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    write({
      version: 1,
      owner: GUEST,
      recipe: { ...draft.recipe, rows: draft.recipe.rows.map((r) => ({ ...r, type: "zucker" })) },
      ddt: draft.ddt,
    });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    write({ version: 1, owner: GUEST, recipe: draft.recipe, ddt: { ...draft.ddt, kneadingMethod: "laser" } });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    write({ version: 1, owner: GUEST, recipe: draft.recipe, ddt: { ...draft.ddt, roomTemperature: "22" } });
    expect(loadCalculatorDraft(GUEST)).toBeNull();

    write({ version: 1, owner: GUEST, recipe: { ...draft.recipe, flourBasis: null }, ddt: draft.ddt });
    expect(loadCalculatorDraft(GUEST)).toBeNull();
  });

  it("F010/AC-10 meldet false, wenn localStorage beim Schreiben wirft, und null beim Lesen", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("voll", "QuotaExceededError");
    });
    expect(saveCalculatorDraft(GUEST, changedDraft())).toBe(false);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("gesperrt", "SecurityError");
    });
    expect(loadCalculatorDraft(GUEST)).toBeNull();
  });

  it("F010/AC-10 liefert stabile React-Keys je Besitzer", () => {
    expect(ownerKey(GUEST)).toBe("guest");
    expect(ownerKey(U1)).toBe("user:u1");
    expect(ownerKey(U2)).toBe("user:u2");
  });
});

describe("F010 Lokal merken: Abmelden", () => {
  it("F010/AC-10 clearAccountCalculatorDraft löscht nur einen Konto-Stand", () => {
    saveCalculatorDraft(GUEST, changedDraft());
    clearAccountCalculatorDraft();
    expect(loadCalculatorDraft(GUEST)).not.toBeNull();

    saveCalculatorDraft(U1, changedDraft());
    clearAccountCalculatorDraft();
    expect(window.localStorage.getItem(CALCULATOR_DRAFT_KEY)).toBeNull();
  });

  it("F010/AC-10 clearOfflineData beim Abmelden löscht einen Konto-Stand und behält einen Gast-Stand", () => {
    window.localStorage.setItem(QUERY_CACHE_KEY, "{}");
    saveCalculatorDraft(U1, changedDraft());

    clearOfflineData(undefined);

    expect(window.localStorage.getItem(CALCULATOR_DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(QUERY_CACHE_KEY)).toBeNull();

    const guestDraft = changedDraft();
    saveCalculatorDraft(GUEST, guestDraft);

    clearOfflineData(undefined);

    expect(loadCalculatorDraft(GUEST)).toEqual(guestDraft);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addFlourRow,
  createReferenceRecipe,
  removeRow,
  setRowGrams,
  setStarterHydration,
} from "@/lib/calculator/recipe-state";
import {
  SAVE_TIMEOUT_MS,
  buildSaveRecipeInput,
  resolveSaveRecipeId,
  withTimeout,
} from "@/lib/calculator/save-recipe";

const REFERENCE_INPUT = {
  name: "Landbrot",
  targetDoughWeight: 1920,
  targetHydration: 72.7,
  ingredients: [
    { name: "Weizenmehl", type: "flour", amountGrams: 800, bakersPercent: 80, starterHydration: 100 },
    { name: "Roggenmehl", type: "flour", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
    { name: "Wasser", type: "water", amountGrams: 700, bakersPercent: 70, starterHydration: 100 },
    { name: "Starter", type: "starter", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
    { name: "Salz", type: "salt", amountGrams: 20, bakersPercent: 2, starterHydration: 100 },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("F010 Speichern: Payload", () => {
  it("F010/AC-8 baut aus dem Referenzrezept Name, Ziel-Teiggewicht 1920, Ziel-Hydratation 72,7 und alle Zutaten in Reihenfolge", () => {
    expect(buildSaveRecipeInput(createReferenceRecipe(), "  Landbrot ")).toEqual(REFERENCE_INPUT);
  });

  it("F010/AC-8 ersetzt leere Zutatennamen durch den Typnamen", () => {
    const { state } = addFlourRow(createReferenceRecipe());

    const input = buildSaveRecipeInput(state, "Landbrot");

    expect(input.ingredients).toHaveLength(6);
    expect(input.ingredients[2]).toEqual({
      name: "Mehl",
      type: "flour",
      amountGrams: 0,
      bakersPercent: 0,
      starterHydration: 100,
    });
    expect(input.ingredients.map((i) => i.name)).toEqual([
      "Weizenmehl",
      "Roggenmehl",
      "Mehl",
      "Wasser",
      "Starter",
      "Salz",
    ]);
  });

  it("F010/AC-8 rundet Gramm, Prozent und Starter-Hydratation auf 2 Stellen, die Hydratation auf 1 Stelle", () => {
    const recipe = setStarterHydration(setRowGrams(createReferenceRecipe(), "row-1", 900), "row-4", 50);

    const input = buildSaveRecipeInput(recipe, "Landbrot");

    expect(input.targetDoughWeight).toBe(2020);
    expect(input.ingredients[0].bakersPercent).toBe(81.82);
    expect(input.ingredients[1].bakersPercent).toBe(18.18);
    expect(input.ingredients[2].bakersPercent).toBe(63.64);
    expect(input.ingredients[3].starterHydration).toBe(50);
    // (700 + 66,67) / (1100 + 133,33) × 100 = 62,16 …
    expect(input.targetHydration).toBe(62.2);
  });

  it("F010/AC-8 wirft bei einem ungültigen Rezept", () => {
    const invalid = removeRow(createReferenceRecipe(), "row-2");

    expect(() => buildSaveRecipeInput(invalid, "Landbrot")).toThrow();
  });
});

describe("F010 Speichern: Rezept-ID als Idempotenzschlüssel", () => {
  it("F010/AC-8 erzeugt beim ersten Versuch genau eine neue ID", () => {
    const payload = buildSaveRecipeInput(createReferenceRecipe(), "Landbrot");
    const createId = vi.fn(() => "11111111-1111-4111-8111-111111111111");

    const attempt = resolveSaveRecipeId(null, payload, createId);

    expect(createId).toHaveBeenCalledTimes(1);
    expect(attempt).toEqual({
      recipeId: "11111111-1111-4111-8111-111111111111",
      fingerprint: JSON.stringify(payload),
    });
  });

  it("F010/AC-8 verwendet bei unverändertem Inhalt denselben Versuch ohne neue ID", () => {
    const first = resolveSaveRecipeId(
      null,
      buildSaveRecipeInput(createReferenceRecipe(), "Landbrot"),
      () => "11111111-1111-4111-8111-111111111111",
    );
    const createId = vi.fn(() => "22222222-2222-4222-8222-222222222222");

    const again = resolveSaveRecipeId(
      first,
      buildSaveRecipeInput(createReferenceRecipe(), " Landbrot "),
      createId,
    );

    expect(again).toBe(first);
    expect(createId).not.toHaveBeenCalled();
  });

  it("F010/AC-8 erzeugt bei geändertem Namen oder geänderten Gramm eine neue ID", () => {
    const first = resolveSaveRecipeId(
      null,
      buildSaveRecipeInput(createReferenceRecipe(), "Landbrot"),
      () => "11111111-1111-4111-8111-111111111111",
    );

    const renamed = resolveSaveRecipeId(
      first,
      buildSaveRecipeInput(createReferenceRecipe(), "Roggenbrot"),
      () => "22222222-2222-4222-8222-222222222222",
    );
    const regrammed = resolveSaveRecipeId(
      first,
      buildSaveRecipeInput(setRowGrams(createReferenceRecipe(), "row-3", 750), "Landbrot"),
      () => "33333333-3333-4333-8333-333333333333",
    );

    expect(renamed.recipeId).toBe("22222222-2222-4222-8222-222222222222");
    expect(renamed.fingerprint).not.toBe(first.fingerprint);
    expect(regrammed.recipeId).toBe("33333333-3333-4333-8333-333333333333");
  });
});

describe("F010 Speichern: Timeout", () => {
  it("F010/AC-9 bricht nach 15 s ohne Antwort ab und bleibt vorher offen", async () => {
    vi.useFakeTimers();
    expect(SAVE_TIMEOUT_MS).toBe(15_000);
    let outcome: "pending" | "resolved" | "rejected" = "pending";
    const never = new Promise<never>(() => {});

    const guarded = withTimeout(never, SAVE_TIMEOUT_MS);
    const settled = guarded.then(
      () => {
        outcome = "resolved";
      },
      () => {
        outcome = "rejected";
      },
    );

    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS - 1);
    expect(outcome).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(outcome).toBe("rejected");
    await expect(guarded).rejects.toBeInstanceOf(Error);
  });

  it("F010/AC-9 gibt ein rechtzeitiges Ergebnis unverändert weiter", async () => {
    await expect(withTimeout(Promise.resolve({ ok: true }), SAVE_TIMEOUT_MS)).resolves.toEqual({ ok: true });
    await expect(withTimeout(Promise.reject(new TypeError("Failed to fetch")), SAVE_TIMEOUT_MS)).rejects.toThrow(
      "Failed to fetch",
    );
  });
});

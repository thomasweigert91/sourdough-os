// @vitest-environment node
// Obergrenzen der Server Action saveRecipe (F010, Review-Runde 1, NIT 8): zu große Eingaben werden
// (Namenslänge, Anzahl der Zutaten) vor jedem DB-Zugriff als INVALID_INPUT abgelehnt.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveRecipeRequest } from "@/lib/calculator/save-recipe";

const mocks = vi.hoisted(() => ({
  batch: vi.fn(),
  getSession: vi.fn(),
}));

// Minimaler Query-Builder: Die Action baut ihre Statements, bevor sie db.batch aufruft.
const chain = (): Record<string, unknown> =>
  new Proxy({}, { get: (_target, key) => (key === "then" ? undefined : () => chain()) });

vi.mock("@/db", () => ({
  db: { batch: mocks.batch, insert: () => chain(), select: () => chain() },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { saveRecipe } from "@/app/calculator/actions";

const INGREDIENT: SaveRecipeRequest["ingredients"][number] = {
  name: "Weizenmehl",
  type: "flour",
  amountGrams: 1000,
  bakersPercent: 100,
  starterHydration: 100,
};

function request(overrides: Partial<SaveRecipeRequest> = {}): SaveRecipeRequest {
  return {
    recipeId: "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f",
    name: "Landbrot",
    targetDoughWeight: 1000,
    targetHydration: 0,
    ingredients: [{ ...INGREDIENT }],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.batch.mockReset();
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({ user: { id: "u1" }, session: { id: "s1", userId: "u1" } });
});

describe("F010 saveRecipe: Obergrenzen der Eingabe", () => {
  it.each([
    ["Rezeptname über 200 Zeichen", request({ name: "a".repeat(201) })],
    ["Zutatenname über 200 Zeichen", request({ ingredients: [{ ...INGREDIENT, name: "b".repeat(201) }] })],
    ["mehr als 50 Zutaten", request({ ingredients: Array.from({ length: 51 }, () => ({ ...INGREDIENT })) })],
  ])("F010/AC-9 lehnt %s als INVALID_INPUT ab, ohne die Datenbank anzusprechen", async (_label, input) => {
    await expect(saveRecipe(input)).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("F010/AC-8 akzeptiert Werte genau an den Grenzen", async () => {
    mocks.batch.mockResolvedValue([[], [], [{ id: "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f" }]]);

    const result = await saveRecipe(
      request({
        name: "a".repeat(200),
        ingredients: Array.from({ length: 50 }, () => ({
          ...INGREDIENT,
          name: "b".repeat(200),
        })),
      }),
    );

    expect(result).toEqual({ ok: true, recipeId: "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f" });
    expect(mocks.batch).toHaveBeenCalledTimes(1);
  });
});

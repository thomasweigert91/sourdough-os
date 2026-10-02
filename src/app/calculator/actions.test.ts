// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { recipeIngredients, recipes, user } from "@/db/schema";
import type { SaveRecipeRequest, SaveRecipeResult } from "@/lib/calculator/save-recipe";
import { createTestDb } from "@/test/pglite-db";

// Server Action saveRecipe gegen PGlite mit den echten Migrationen. db.batch wird über
// testDb.batchDb (BEGIN/COMMIT/ROLLBACK) nachgebildet. Sitzung über einen Mock von auth.api.getSession.
// Testpersonen nur mit @example.com-Adressen.
const SETUP_TIMEOUT_MS = 60_000;
const USER_ID = "u1";
const OTHER_USER_ID = "u2";
const RECIPE_ID = "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f";
const OTHER_RECIPE_ID = "5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
type SaveRecipe = (input: SaveRecipeRequest) => Promise<SaveRecipeResult>;

const getSession = vi.fn();
const headersMock = vi.fn(async () => new Headers({ cookie: "x=1" }));
let testDb: TestDb;
let saveRecipe: SaveRecipe;

const INGREDIENTS: SaveRecipeRequest["ingredients"] = [
  { name: "Weizenmehl", type: "flour", amountGrams: 800, bakersPercent: 80, starterHydration: 100 },
  { name: "Roggenmehl", type: "flour", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
  { name: "Wasser", type: "water", amountGrams: 700, bakersPercent: 70, starterHydration: 100 },
  { name: "Starter", type: "starter", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
  { name: "Salz", type: "salt", amountGrams: 20, bakersPercent: 2, starterHydration: 100 },
];

function request(overrides: Partial<SaveRecipeRequest> = {}): SaveRecipeRequest {
  return {
    recipeId: RECIPE_ID,
    name: "Landbrot",
    targetDoughWeight: 1920,
    targetHydration: 72.7,
    ingredients: INGREDIENTS.map((i) => ({ ...i })),
    ...overrides,
  };
}

function signedInAs(id: string) {
  getSession.mockResolvedValue({
    user: { id, name: "Max Mustermann", email: `${id}@example.com` },
    session: { id: `s-${id}`, userId: id },
  });
}

async function countRows(table: "recipes" | "recipe_ingredients"): Promise<number> {
  const result = await testDb.db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`));
  return Number((result.rows[0] as { n: number }).n);
}

async function ingredientsOf(recipeId: string) {
  return testDb.db
    .select({
      name: recipeIngredients.name,
      type: recipeIngredients.type,
      amountGrams: recipeIngredients.amountGrams,
      bakersPercent: recipeIngredients.bakersPercent,
      starterHydration: recipeIngredients.starterHydration,
      position: recipeIngredients.position,
    })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipeId))
    .orderBy(asc(recipeIngredients.position));
}

beforeAll(async () => {
  testDb = await createTestDb();

  vi.resetModules();
  vi.doMock("@/db", () => ({ db: testDb.batchDb }));
  vi.doMock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
  vi.doMock("next/headers", () => ({ headers: headersMock }));

  const actions = await import("@/app/calculator/actions");
  saveRecipe = actions.saveRecipe as SaveRecipe;
}, SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await testDb.reset();
  getSession.mockReset();
  headersMock.mockClear();
  await testDb.db.insert(user).values([
    { id: USER_ID, name: "Max Mustermann", email: "max@example.com" },
    { id: OTHER_USER_ID, name: "Erika Musterfrau", email: "erika@example.com" },
  ]);
});

afterAll(async () => {
  vi.doUnmock("@/db");
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("next/headers");
  await testDb?.close();
});

describe("F010 saveRecipe: Speichern im Konto", () => {
  it("F010/AC-8 speichert Kopf und Zutaten in angezeigter Reihenfolge für die angemeldete Person", async () => {
    signedInAs(USER_ID);

    const result = await saveRecipe(request());

    expect(result).toEqual({ ok: true, recipeId: RECIPE_ID });
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getSession.mock.calls[0][0]).toMatchObject({ headers: expect.any(Headers) });

    const rows = await testDb.db.select().from(recipes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: RECIPE_ID,
      userId: USER_ID,
      name: "Landbrot",
      targetDoughWeight: 1920,
      targetHydration: 72.7,
    });

    expect(await ingredientsOf(RECIPE_ID)).toEqual(
      INGREDIENTS.map((ingredient, position) => ({ ...ingredient, position })),
    );
  });

  it("F010/AC-8 nimmt die Person immer aus der Sitzung, nie aus der Eingabe", async () => {
    signedInAs(USER_ID);

    const result = await saveRecipe({ ...request(), userId: OTHER_USER_ID } as SaveRecipeRequest);

    expect(result).toEqual({ ok: true, recipeId: RECIPE_ID });
    const [row] = await testDb.db.select().from(recipes);
    expect(row.userId).toBe(USER_ID);
  });

  it("F010/AC-8 ein zweiter Aufruf mit derselben Rezept-ID legt nichts doppelt an", async () => {
    signedInAs(USER_ID);

    const first = await saveRecipe(request());
    const second = await saveRecipe(request());

    expect(first).toEqual({ ok: true, recipeId: RECIPE_ID });
    expect(second).toEqual({ ok: true, recipeId: RECIPE_ID });
    expect(await countRows("recipes")).toBe(1);
    expect(await countRows("recipe_ingredients")).toBe(5);
  });

  it("F010/AC-8 zwei Aufrufe mit verschiedenen IDs ergeben zwei Rezepte", async () => {
    signedInAs(USER_ID);

    await saveRecipe(request());
    const second = await saveRecipe(request({ recipeId: OTHER_RECIPE_ID, name: "Roggenbrot" }));

    expect(second).toEqual({ ok: true, recipeId: OTHER_RECIPE_ID });
    expect(await countRows("recipes")).toBe(2);
    expect(await countRows("recipe_ingredients")).toBe(10);
    expect(await ingredientsOf(OTHER_RECIPE_ID)).toHaveLength(5);
  });

  it("F010/AC-8 akzeptiert eine UUID in Großbuchstaben und speichert sie kleingeschrieben", async () => {
    signedInAs(USER_ID);

    const result = await saveRecipe(request({ recipeId: RECIPE_ID.toUpperCase() }));

    expect(result.ok).toBe(true);
    const rows = await testDb.db.select({ id: recipes.id }).from(recipes);
    expect(rows).toEqual([{ id: RECIPE_ID }]);
  });

  it.each([
    ["leerer Name", { name: "" }],
    ["Name nur aus Leerzeichen", { name: "   " }],
    ["Rezept-ID ohne UUID-Format", { recipeId: "rezept-1" }],
    ["keine Zutaten", { ingredients: [] }],
    ["negative Gramm", { ingredients: [{ ...INGREDIENTS[0], amountGrams: -5 }] }],
    ["unbekannter Zutatentyp", { ingredients: [{ ...INGREDIENTS[0], type: "zucker" }] }],
    ["Zutat ohne Namen", { ingredients: [{ ...INGREDIENTS[0], name: "  " }] }],
    ["nicht ganzzahliges Teiggewicht", { targetDoughWeight: 1920.5 }],
    ["Hydratation keine Zahl", { targetHydration: Number.NaN }],
  ])("F010/AC-8 lehnt ungültige Eingaben ohne Schreibzugriff ab (%s)", async (_label, overrides) => {
    signedInAs(USER_ID);

    const result = await saveRecipe({ ...request(), ...overrides } as unknown as SaveRecipeRequest);

    expect(result).toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(await countRows("recipes")).toBe(0);
    expect(await countRows("recipe_ingredients")).toBe(0);
  });
});

describe("F010 saveRecipe: Fehlerfälle", () => {
  it("F010/AC-9 antwortet ohne Sitzung mit UNAUTHORIZED und schreibt nichts", async () => {
    getSession.mockResolvedValue(null);

    const result = await saveRecipe(request());

    expect(result).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await countRows("recipes")).toBe(0);
    expect(await countRows("recipe_ingredients")).toBe(0);
  });

  it("F010/AC-9 rollt bei einem Fehler beim Zutaten-Insert alles zurück, ein erneuter Versuch klappt", async () => {
    signedInAs(USER_ID);
    const overflow = request({
      ingredients: INGREDIENTS.map((i, index) => (index === 4 ? { ...i, bakersPercent: 100000 } : { ...i })),
    });

    const failed = await saveRecipe(overflow);

    expect(failed).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(await countRows("recipes")).toBe(0);
    expect(await countRows("recipe_ingredients")).toBe(0);

    const retried = await saveRecipe(request());

    expect(retried).toEqual({ ok: true, recipeId: RECIPE_ID });
    expect(await countRows("recipes")).toBe(1);
    expect(await countRows("recipe_ingredients")).toBe(5);
  });

  it("F010/AC-9 meldet SAVE_FAILED und lässt das Rezept einer anderen Person unverändert", async () => {
    await testDb.db
      .insert(recipes)
      .values({ id: RECIPE_ID, userId: OTHER_USER_ID, name: "Erikas Brot", targetDoughWeight: 800 });
    await testDb.db.insert(recipeIngredients).values({
      recipeId: RECIPE_ID,
      name: "Dinkelmehl",
      type: "flour",
      amountGrams: 500,
      bakersPercent: 100,
    });
    signedInAs(USER_ID);

    const result = await saveRecipe(request());

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    const rows = await testDb.db.select().from(recipes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: RECIPE_ID,
      userId: OTHER_USER_ID,
      name: "Erikas Brot",
      targetDoughWeight: 800,
    });
    expect(await ingredientsOf(RECIPE_ID)).toEqual([
      {
        name: "Dinkelmehl",
        type: "flour",
        amountGrams: 500,
        bakersPercent: 100,
        starterHydration: 100,
        position: 0,
      },
    ]);
  });

  it("F010/AC-9 meldet SAVE_FAILED statt zu werfen, wenn die Datenbank nicht erreichbar ist", async () => {
    signedInAs(USER_ID);
    const batchSpy = vi
      .spyOn(testDb.batchDb, "batch")
      .mockRejectedValueOnce(new Error("fetch failed"));

    const result = await saveRecipe(request());

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    batchSpy.mockRestore();
    expect(await countRows("recipes")).toBe(0);
  });
});

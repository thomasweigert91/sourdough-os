// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, getTableName, sql } from "drizzle-orm";
import { getTableConfig, type AnyPgTable } from "drizzle-orm/pg-core";
import { recipeIngredients, recipes, user } from "@/db/schema";
import { createTestDb } from "@/test/pglite-db";

// Rezept- und Zutaten-Schema gegen PGlite mit den echten Migrationen (keine Verbindung zu Neon).
// Testpersonen nur mit @example.com-Adressen.
const SETUP_TIMEOUT_MS = 60_000;
const USER_ID = "u1";
const OTHER_USER_ID = "u2";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POOLED_URL =
  "postgresql://user:pass@ep-test-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  await testDb?.close();
});

beforeEach(async () => {
  await testDb.reset();
  await testDb.db.insert(user).values([
    { id: USER_ID, name: "Max Mustermann", email: "max@example.com" },
    { id: OTHER_USER_ID, name: "Erika Musterfrau", email: "erika@example.com" },
  ]);
});

async function countRows(table: "recipes" | "recipe_ingredients"): Promise<number> {
  const result = await testDb.db.execute(
    sql.raw(`SELECT count(*)::int AS n FROM "${table}"`),
  );
  return Number((result.rows[0] as { n: number }).n);
}

async function createRecipe(userId: string = USER_ID, name = "Landbrot") {
  const [row] = await testDb.db.insert(recipes).values({ userId, name }).returning();
  return row;
}

function validIngredient(recipeId: string) {
  return {
    recipeId,
    name: "Weizenmehl 550",
    type: "flour" as const,
    amountGrams: 500,
    bakersPercent: 100,
  };
}

describe("F006 Rezepte (recipes)", () => {
  it("F006/AC-1 legt ein Rezept nur mit Namen an und vergibt ID, Zeitstempel und leere optionale Felder", async () => {
    const inserted = await testDb.db
      .insert(recipes)
      .values({ userId: USER_ID, name: "Landbrot" })
      .returning();

    expect(inserted).toHaveLength(1);
    const all = await testDb.db.select().from(recipes);
    expect(all).toHaveLength(1);

    const [recipe] = all;
    expect(recipe.id).toMatch(UUID_RE);
    expect(recipe.id).toBe(inserted[0].id);
    expect(recipe.userId).toBe(USER_ID);
    expect(recipe.name).toBe("Landbrot");
    expect(recipe.description).toBeNull();
    expect(recipe.targetDoughWeight).toBeNull();
    expect(recipe.targetHydration).toBeNull();
    expect(recipe.createdAt).toBeInstanceOf(Date);
    expect(recipe.updatedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(recipe.createdAt.getTime())).toBe(false);
    expect(Number.isNaN(recipe.updatedAt.getTime())).toBe(false);
  });

  it("F006/AC-1 vergibt für zwei Rezepte unterschiedliche IDs", async () => {
    const first = await createRecipe(USER_ID, "Landbrot");
    const second = await createRecipe(USER_ID, "Roggenbrot");

    expect(first.id).toMatch(UUID_RE);
    expect(second.id).toMatch(UUID_RE);
    expect(first.id).not.toBe(second.id);
  });

  const invalidRecipes: Array<[string, () => PromiseLike<unknown>]> = [
    [
      "ohne Namen",
      () =>
        testDb.db.execute(sql`INSERT INTO "recipes" ("user_id") VALUES (${USER_ID})`),
    ],
    [
      "mit leerem Namen",
      () => testDb.db.insert(recipes).values({ userId: USER_ID, name: "" }),
    ],
    [
      "mit Namen nur aus Leerzeichen",
      () => testDb.db.insert(recipes).values({ userId: USER_ID, name: "   " }),
    ],
    [
      "für eine nicht existierende Person",
      () => testDb.db.insert(recipes).values({ userId: "gibt-es-nicht", name: "Landbrot" }),
    ],
  ];

  it.each(invalidRecipes)(
    "F006/AC-2 lehnt ein Rezept %s ab und speichert nichts",
    async (_label, insert) => {
      // Vorbedingung: Die Tabelle existiert und ist leer.
      expect(await countRows("recipes")).toBe(0);

      await expect(Promise.resolve().then(() => insert())).rejects.toThrow();

      expect(await countRows("recipes")).toBe(0);
    },
  );

  it("F006/AC-2 akzeptiert einen Namen mit umgebenden Leerzeichen (Gegenprobe)", async () => {
    await testDb.db.insert(recipes).values({ userId: USER_ID, name: " Landbrot " });

    const all = await testDb.db.select().from(recipes);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe(" Landbrot ");
  });

  it("F006/AC-6 speichert die Zielhydration 75.5 ohne Rundung", async () => {
    const [recipe] = await testDb.db
      .insert(recipes)
      .values({ userId: USER_ID, name: "Landbrot", targetHydration: 75.5 })
      .returning();

    const [read] = await testDb.db.select().from(recipes).where(eq(recipes.id, recipe.id));
    expect(read.targetHydration).toBe(75.5);
    expect(typeof read.targetHydration).toBe("number");
  });

  it("F006/AC-8 übernimmt eine vom Client vergebene UUID und ein vom Client gesetztes updatedAt unverändert", async () => {
    const id = crypto.randomUUID();
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");

    await testDb.db
      .insert(recipes)
      .values({ id, userId: USER_ID, name: "Landbrot", updatedAt, targetDoughWeight: 1000 });

    const [read] = await testDb.db.select().from(recipes).where(eq(recipes.id, id));
    expect(read).toBeDefined();
    expect(read.id).toBe(id);
    expect(read.updatedAt).toEqual(updatedAt);
    expect(read.targetDoughWeight).toBe(1000);
  });

  it.each([
    ["negativem Zielteiggewicht", { targetDoughWeight: -1 }],
    ["negativer Zielhydration", { targetHydration: -0.5 }],
  ])("F006/AC-8 lehnt ein Rezept mit %s ab", async (_label, override) => {
    expect(await countRows("recipes")).toBe(0);

    await expect(
      testDb.db.insert(recipes).values({ userId: USER_ID, name: "Landbrot", ...override }),
    ).rejects.toThrow();

    expect(await countRows("recipes")).toBe(0);
  });
});

describe("F006 Zutaten (recipe_ingredients)", () => {
  it("F006/AC-3 speichert Mehl und Starter mit Typ, Menge, Bäckerprozent und Default-Starter-Hydration 100", async () => {
    const recipe = await createRecipe();

    await testDb.db.insert(recipeIngredients).values([
      { recipeId: recipe.id, name: "Weizenmehl 550", type: "flour", amountGrams: 500, bakersPercent: 100 },
      { recipeId: recipe.id, name: "Starter", type: "starter", amountGrams: 100, bakersPercent: 20 },
    ]);

    const read = await testDb.db.query.recipes.findFirst({
      where: eq(recipes.id, recipe.id),
      with: { ingredients: true },
    });

    expect(read).toBeDefined();
    expect(read!.ingredients).toHaveLength(2);
    const flour = read!.ingredients.find((ingredient) => ingredient.name === "Weizenmehl 550");
    const starter = read!.ingredients.find((ingredient) => ingredient.name === "Starter");

    expect(flour).toMatchObject({ recipeId: recipe.id, type: "flour" });
    expect(flour!.amountGrams).toBe(500);
    expect(flour!.bakersPercent).toBe(100);
    expect(flour!.starterHydration).toBe(100);
    expect(flour!.id).toMatch(UUID_RE);

    expect(starter).toMatchObject({ recipeId: recipe.id, type: "starter" });
    expect(starter!.amountGrams).toBe(100);
    expect(starter!.bakersPercent).toBe(20);
    expect(starter!.starterHydration).toBe(100);
    expect(starter!.id).toMatch(UUID_RE);

    for (const ingredient of read!.ingredients) {
      expect(typeof ingredient.amountGrams).toBe("number");
      expect(typeof ingredient.bakersPercent).toBe("number");
      expect(typeof ingredient.starterHydration).toBe("number");
    }
  });

  it.each(["flour", "water", "starter", "salt", "other"] as const)(
    "F006/AC-3 akzeptiert den Zutatentyp %s",
    async (type) => {
      const recipe = await createRecipe();

      await testDb.db
        .insert(recipeIngredients)
        .values({ ...validIngredient(recipe.id), name: `Zutat ${type}`, type });

      const [read] = await testDb.db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, recipe.id));
      expect(read.type).toBe(type);
    },
  );

  const invalidIngredients: Array<[string, (recipeId: string) => PromiseLike<unknown>]> = [
    [
      "ohne Namen",
      (recipeId) =>
        testDb.db.execute(
          sql`INSERT INTO "recipe_ingredients" ("recipe_id", "type", "amount_grams", "bakers_percent") VALUES (${recipeId}, 'flour', 500, 100)`,
        ),
    ],
    [
      "mit leerem Namen",
      (recipeId) =>
        testDb.db.insert(recipeIngredients).values({ ...validIngredient(recipeId), name: "" }),
    ],
    [
      "mit Namen nur aus Leerzeichen",
      (recipeId) =>
        testDb.db.insert(recipeIngredients).values({ ...validIngredient(recipeId), name: "   " }),
    ],
    [
      "mit unbekanntem Typ yeast",
      (recipeId) =>
        testDb.db
          .insert(recipeIngredients)
          .values({ ...validIngredient(recipeId), type: "yeast" as never }),
    ],
    [
      "ohne Grammmenge",
      (recipeId) =>
        testDb.db.execute(
          sql`INSERT INTO "recipe_ingredients" ("recipe_id", "name", "type", "bakers_percent") VALUES (${recipeId}, 'Weizenmehl 550', 'flour', 100)`,
        ),
    ],
    [
      "ohne Bäckerprozent",
      (recipeId) =>
        testDb.db.execute(
          sql`INSERT INTO "recipe_ingredients" ("recipe_id", "name", "type", "amount_grams") VALUES (${recipeId}, 'Weizenmehl 550', 'flour', 500)`,
        ),
    ],
    [
      "mit negativer Grammmenge",
      (recipeId) =>
        testDb.db.insert(recipeIngredients).values({ ...validIngredient(recipeId), amountGrams: -1 }),
    ],
    [
      "mit negativem Bäckerprozent",
      (recipeId) =>
        testDb.db
          .insert(recipeIngredients)
          .values({ ...validIngredient(recipeId), bakersPercent: -1 }),
    ],
    [
      "mit negativer Starter-Hydration",
      (recipeId) =>
        testDb.db
          .insert(recipeIngredients)
          .values({ ...validIngredient(recipeId), type: "starter", starterHydration: -1 }),
    ],
    [
      "für eine nicht existierende Rezept-ID",
      () =>
        testDb.db
          .insert(recipeIngredients)
          .values(validIngredient(crypto.randomUUID())),
    ],
  ];

  it.each(invalidIngredients)(
    "F006/AC-4 lehnt eine Zutat %s ab und speichert nichts",
    async (_label, insert) => {
      const recipe = await createRecipe();
      expect(await countRows("recipe_ingredients")).toBe(0);

      await expect(Promise.resolve().then(() => insert(recipe.id))).rejects.toThrow();

      expect(await countRows("recipe_ingredients")).toBe(0);
    },
  );

  it("F006/AC-6 speichert Menge, Bäckerprozent und Starter-Hydration mit Nachkommastellen ohne Rundung", async () => {
    const [recipe] = await testDb.db
      .insert(recipes)
      .values({ userId: USER_ID, name: "Landbrot", targetHydration: 75.5 })
      .returning();

    await testDb.db.insert(recipeIngredients).values({
      recipeId: recipe.id,
      name: "Salz",
      type: "salt",
      amountGrams: 12.5,
      bakersPercent: 2.5,
      starterHydration: 80.0,
    });

    const read = await testDb.db.query.recipes.findFirst({
      where: eq(recipes.id, recipe.id),
      with: { ingredients: true },
    });

    expect(read).toBeDefined();
    expect(read!.targetHydration).toBe(75.5);
    expect(read!.ingredients).toHaveLength(1);
    expect(read!.ingredients[0].amountGrams).toBe(12.5);
    expect(read!.ingredients[0].bakersPercent).toBe(2.5);
    expect(read!.ingredients[0].starterHydration).toBe(80);
  });

  it("F006/AC-8 liest Zutaten nach position sortiert, ohne Angabe ist position 0", async () => {
    const recipe = await createRecipe();

    await testDb.db.insert(recipeIngredients).values({
      ...validIngredient(recipe.id),
      name: "Salz",
      type: "salt",
      amountGrams: 10,
      bakersPercent: 2,
      position: 2,
    });
    await testDb.db.insert(recipeIngredients).values({
      ...validIngredient(recipe.id),
      name: "Wasser",
      type: "water",
      amountGrams: 350,
      bakersPercent: 70,
      position: 1,
    });
    await testDb.db.insert(recipeIngredients).values({
      ...validIngredient(recipe.id),
      name: "Weizenmehl 550",
    });

    const ordered = await testDb.db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipe.id))
      .orderBy(asc(recipeIngredients.position));

    expect(ordered.map((ingredient) => ingredient.position)).toEqual([0, 1, 2]);
    expect(ordered.map((ingredient) => ingredient.name)).toEqual([
      "Weizenmehl 550",
      "Wasser",
      "Salz",
    ]);
  });
});

describe("F006 Kaskadierendes Löschen", () => {
  async function recipeWithTwoIngredients(userId: string, name: string) {
    const recipe = await createRecipe(userId, name);
    await testDb.db.insert(recipeIngredients).values([
      { ...validIngredient(recipe.id), name: "Weizenmehl 550" },
      {
        recipeId: recipe.id,
        name: "Starter",
        type: "starter" as const,
        amountGrams: 100,
        bakersPercent: 20,
      },
    ]);
    return recipe;
  }

  it("F006/AC-5 löscht beim Löschen eines Rezepts auch beide Zutaten", async () => {
    const recipe = await recipeWithTwoIngredients(USER_ID, "Landbrot");
    expect(await countRows("recipe_ingredients")).toBe(2);

    await testDb.db.delete(recipes).where(eq(recipes.id, recipe.id));

    expect(await countRows("recipes")).toBe(0);
    expect(await countRows("recipe_ingredients")).toBe(0);
  });

  it("F006/AC-5 löscht beim Löschen eines Kontos dessen Rezepte und Zutaten, andere bleiben unverändert", async () => {
    const own = await recipeWithTwoIngredients(USER_ID, "Landbrot");
    const other = await recipeWithTwoIngredients(OTHER_USER_ID, "Roggenbrot");
    const otherBefore = await testDb.db.query.recipes.findFirst({
      where: eq(recipes.id, other.id),
      with: { ingredients: true },
    });
    expect(otherBefore!.ingredients).toHaveLength(2);

    await testDb.db.delete(user).where(eq(user.id, USER_ID));

    expect(await testDb.db.select().from(recipes).where(eq(recipes.id, own.id))).toHaveLength(0);
    expect(
      await testDb.db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, own.id)),
    ).toHaveLength(0);

    const otherAfter = await testDb.db.query.recipes.findFirst({
      where: eq(recipes.id, other.id),
      with: { ingredients: true },
    });
    expect(otherAfter).toEqual(otherBefore);
    expect(await countRows("recipes")).toBe(1);
    expect(await countRows("recipe_ingredients")).toBe(2);
  });
});

describe("F006 Exporte und Relationen (@/db/schema)", () => {
  function foreignKeyTo(table: AnyPgTable, column: string, target: string, targetColumn: string) {
    return getTableConfig(table).foreignKeys.filter((fk) => {
      const ref = fk.reference();
      return (
        getTableName(ref.foreignTable) === target &&
        ref.columns.map((col) => col.name).join() === column &&
        ref.foreignColumns.map((col) => col.name).join() === targetColumn
      );
    });
  }

  function indexedColumnNames(table: AnyPgTable): string[][] {
    return getTableConfig(table).indexes.map((index) =>
      index.config.columns.map((col) => ("name" in col ? String(col.name) : "")),
    );
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("F006/AC-7 exportiert Tabellen, Enum und Relationen über @/db/schema", async () => {
    const schema = await import("@/db/schema");

    expect(schema.recipes).toBeDefined();
    expect(schema.recipeIngredients).toBeDefined();
    expect(schema.ingredientTypeEnum).toBeDefined();
    expect(schema.userRelations).toBeDefined();
    expect(schema.recipesRelations).toBeDefined();
    expect(schema.recipeIngredientsRelations).toBeDefined();
    expect(schema.INGREDIENT_TYPES).toEqual(["flour", "water", "starter", "salt", "other"]);

    expect(getTableName(schema.recipes)).toBe("recipes");
    expect(getTableName(schema.recipeIngredients)).toBe("recipe_ingredients");
    expect(schema.ingredientTypeEnum.enumName).toBe("ingredient_type");
    expect(schema.ingredientTypeEnum.enumValues).toEqual([
      "flour",
      "water",
      "starter",
      "salt",
      "other",
    ]);
  });

  it("F006/AC-7 legt Indizes und Cascade-Fremdschlüssel für recipes und recipe_ingredients an", async () => {
    const schema = await import("@/db/schema");

    expect(indexedColumnNames(schema.recipes)).toContainEqual(["user_id"]);
    expect(indexedColumnNames(schema.recipeIngredients)).toContainEqual(["recipe_id"]);

    const userFk = foreignKeyTo(schema.recipes, "user_id", "user", "id");
    expect(userFk).toHaveLength(1);
    expect(userFk[0].onDelete).toBe("cascade");

    const recipeFk = foreignKeyTo(schema.recipeIngredients, "recipe_id", "recipes", "id");
    expect(recipeFk).toHaveLength(1);
    expect(recipeFk[0].onDelete).toBe("cascade");
  });

  it("F006/AC-7 db.query aus @/db kennt recipes und recipeIngredients", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", POOLED_URL);
    const { db } = await import("@/db");

    expect(db.query.recipes).toBeDefined();
    expect(db.query.recipeIngredients).toBeDefined();
    vi.resetModules();
  });

  it("F006/AC-7 lädt Person → Rezepte → Zutaten und Zutat → Rezept → Person über relationale Queries", async () => {
    const recipe = await createRecipe(USER_ID, "Landbrot");
    await testDb.db.insert(recipeIngredients).values(validIngredient(recipe.id));

    const person = await testDb.db.query.user.findFirst({
      where: eq(user.id, USER_ID),
      with: { recipes: { with: { ingredients: true } } },
    });

    expect(person).toBeDefined();
    expect(person!.recipes).toHaveLength(1);
    expect(person!.recipes[0]).toMatchObject({ id: recipe.id, name: "Landbrot" });
    expect(person!.recipes[0].ingredients).toHaveLength(1);
    expect(person!.recipes[0].ingredients[0]).toMatchObject({
      name: "Weizenmehl 550",
      type: "flour",
      amountGrams: 500,
      bakersPercent: 100,
    });

    const ingredient = await testDb.db.query.recipeIngredients.findFirst({
      where: eq(recipeIngredients.recipeId, recipe.id),
      with: { recipe: { with: { user: true } } },
    });
    expect(ingredient!.recipe.id).toBe(recipe.id);
    expect(ingredient!.recipe.user.id).toBe(USER_ID);
  });
});

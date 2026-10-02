"use server";

// Server Action „Als Rezept speichern“ (F010, AC-8, AC-9). Kopf und Zutaten werden in einem
// db.batch geschrieben (neon-http: eine nicht interaktive Postgres-Transaktion). Die vom Client
// erzeugte Rezept-ID ist der Idempotenzschlüssel: Wiederholungen schreiben nichts doppelt.
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { INGREDIENT_TYPES, recipeIngredients, recipes, type IngredientType } from "@/db/schema/recipes";
import { auth } from "@/lib/auth";
import type {
  SaveRecipeIngredientInput,
  SaveRecipeRequest,
  SaveRecipeResult,
} from "@/lib/calculator/save-recipe";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Obergrenzen der Eingabe (Payload-Größe), darüber INVALID_INPUT. Wertebereiche der numeric-Spalten
// prüft die Datenbank; ein Überlauf rollt den Batch zurück und wird als SAVE_FAILED gemeldet (AC-9).
const MAX_NAME_LENGTH = 200;
const MAX_INGREDIENTS = 50;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonBlankString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed.length > MAX_NAME_LENGTH ? null : trimmed;
}

function isIngredientType(value: unknown): value is IngredientType {
  return typeof value === "string" && (INGREDIENT_TYPES as readonly string[]).includes(value);
}

function parseIngredient(value: unknown): SaveRecipeIngredientInput | null {
  if (!isRecord(value)) return null;
  const name = nonBlankString(value.name);
  const { type, amountGrams, bakersPercent, starterHydration } = value;
  if (name === null || !isIngredientType(type)) return null;
  if (
    !isNonNegativeNumber(amountGrams) ||
    !isNonNegativeNumber(bakersPercent) ||
    !isNonNegativeNumber(starterHydration)
  ) {
    return null;
  }
  return { name, type, amountGrams, bakersPercent, starterHydration };
}

/** Prüft die Eingabe vom Client; zusätzliche Felder (z. B. userId) werden ignoriert. */
function parseSaveRecipeInput(input: unknown): SaveRecipeRequest | null {
  if (!isRecord(input)) return null;
  const { recipeId, targetDoughWeight, targetHydration, ingredients } = input;
  if (typeof recipeId !== "string" || !UUID_PATTERN.test(recipeId)) return null;
  const name = nonBlankString(input.name);
  if (name === null) return null;
  if (!isNonNegativeNumber(targetDoughWeight) || !Number.isInteger(targetDoughWeight)) return null;
  if (!isNonNegativeNumber(targetHydration)) return null;
  if (!Array.isArray(ingredients) || ingredients.length === 0 || ingredients.length > MAX_INGREDIENTS) return null;

  const parsed: SaveRecipeIngredientInput[] = [];
  for (const raw of ingredients) {
    const ingredient = parseIngredient(raw);
    if (!ingredient) return null;
    parsed.push(ingredient);
  }
  return {
    recipeId: recipeId.toLowerCase(),
    name,
    targetDoughWeight,
    targetHydration,
    ingredients: parsed,
  };
}

export async function saveRecipe(input: SaveRecipeRequest): Promise<SaveRecipeResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "UNAUTHORIZED" };

  const request = parseSaveRecipeInput(input);
  if (!request) return { ok: false, error: "INVALID_INPUT" };

  // Immer aus der Sitzung, nie vom Client.
  const userId = session.user.id;
  const { recipeId } = request;

  const values = sql.join(
    request.ingredients.map(
      (ingredient, position) =>
        sql`(${ingredient.name}::text, ${ingredient.type}::ingredient_type, ${ingredient.amountGrams}::numeric, ${ingredient.bakersPercent}::numeric, ${ingredient.starterHydration}::numeric, ${position}::integer)`,
    ),
    sql`, `,
  );

  try {
    const [, , owned] = await db.batch([
      // a) Kopf anlegen; bei einer Wiederholung (gleiche ID) passiert nichts.
      db
        .insert(recipes)
        .values({
          id: recipeId,
          userId,
          name: request.name,
          targetDoughWeight: request.targetDoughWeight,
          targetHydration: request.targetHydration,
        })
        .onConflictDoNothing({ target: recipes.id })
        .returning({ id: recipes.id }),
      // b) Zutaten nur, wenn das Rezept dieser Person gehört und noch keine Zutaten hat.
      // Spaltenreihenfolge wie in der Tabellendefinition (insert().select() füllt alle Spalten).
      db.insert(recipeIngredients).select(
        sql`select gen_random_uuid(), ${recipeId}::uuid, v.name, v.type, v.amount_grams, v.bakers_percent, v.starter_hydration, v.position from (values ${values}) as v(name, type, amount_grams, bakers_percent, starter_hydration, position) where exists (select 1 from ${recipes} where ${recipes.id} = ${recipeId}::uuid and ${recipes.userId} = ${userId}) and not exists (select 1 from ${recipeIngredients} where ${recipeIngredients.recipeId} = ${recipeId}::uuid)`,
      ),
      // c) Besitz prüfen: Erstanlage oder erkannte Wiederholung derselben Person.
      db
        .select({ id: recipes.id })
        .from(recipes)
        .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId))),
    ]);
    if (owned.length === 0) return { ok: false, error: "SAVE_FAILED" };
    return { ok: true, recipeId };
  } catch {
    // Jeder DB-Fehler rollt den ganzen Batch zurück; die UI zeigt die AC-9-Meldung.
    return { ok: false, error: "SAVE_FAILED" };
  }
}

// Payload, Idempotenzschlüssel und Timeout für „Als Rezept speichern“ (F010, AC-8, AC-9).
// Client-sicher: keine Laufzeit-Imports aus @/db.
import type { IngredientType } from "@/db/schema/recipes";
import { evaluateRecipe, ingredientDisplayName, type RecipeState } from "./recipe-state";

export interface SaveRecipeIngredientInput {
  name: string;
  type: IngredientType;
  amountGrams: number;
  bakersPercent: number;
  starterHydration: number;
}

export interface SaveRecipeInput {
  /** getrimmt */
  name: string;
  /** Math.round(Summe Gramm) */
  targetDoughWeight: number;
  /** Netto-Hydratation, auf 1 Stelle gerundet (72.7) */
  targetHydration: number;
  /** angezeigte Reihenfolge, position = Index */
  ingredients: SaveRecipeIngredientInput[];
}

/** Was an die Server Action geht: Payload plus Idempotenzschlüssel. */
export type SaveRecipeRequest = SaveRecipeInput & { recipeId: string };

export type SaveRecipeResult =
  | { ok: true; recipeId: string }
  | { ok: false; error: "UNAUTHORIZED" | "INVALID_INPUT" | "SAVE_FAILED" };

export interface SaveAttempt {
  recipeId: string;
  fingerprint: string;
}

export const SAVE_TIMEOUT_MS = 15_000;
export const SAVE_TIMEOUT_MESSAGE = "Zeitüberschreitung beim Speichern.";

function round(value: number, fractionDigits: number): number {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

/**
 * Wirft, wenn das Rezept ungültig ist (Aufrufer prüft vorher isValid). Name je Zutat =
 * ingredientDisplayName(row); Gramm/Prozent/Hydratation auf 2 Stellen (Spaltenpräzision).
 */
export function buildSaveRecipeInput(recipe: RecipeState, name: string): SaveRecipeInput {
  const evaluation = evaluateRecipe(recipe);
  if (!evaluation.isValid || evaluation.netHydration === null) {
    throw new Error("Das Rezept ist ungültig und kann nicht gespeichert werden.");
  }
  return {
    name: name.trim(),
    targetDoughWeight: Math.round(evaluation.totalWeight),
    targetHydration: round(evaluation.netHydration, 1),
    ingredients: recipe.rows.map((row) => ({
      name: ingredientDisplayName(row),
      type: row.type,
      amountGrams: round(row.grams, 2),
      bakersPercent: round(row.percent, 2),
      starterHydration: round(row.starterHydration, 2),
    })),
  };
}

/** Gleicher Fingerprint (JSON.stringify(payload)) → `previous` unverändert; sonst { recipeId: createId(), fingerprint }. */
export function resolveSaveRecipeId(
  previous: SaveAttempt | null,
  payload: SaveRecipeInput,
  createId: () => string,
): SaveAttempt {
  const fingerprint = JSON.stringify(payload);
  if (previous && previous.fingerprint === fingerprint) return previous;
  return { recipeId: createId(), fingerprint };
}

/** Lehnt nach `ms` mit Error ab, wenn `promise` bis dahin nicht erfüllt ist. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(SAVE_TIMEOUT_MESSAGE)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

import type { IngredientType } from "@/db/schema/recipes";

/**
 * Rechen-Engine für Bäckerprozente und Netto-Hydratation.
 *
 * Begriffe:
 * - `flourBasis` (Mehlbasis): Summe der Zutaten vom Typ `flour`, ohne Starter-Mehl.
 *   Bezugsgröße aller Bäckerprozente und der Skalierung.
 * - `totalFlour` / `totalWater` (Gesamtmehl / Gesamtwasser): inklusive Mehl bzw. Wasser
 *   im Starter. Nur für die Netto-Hydratation.
 *
 * Alle Werte werden ungerundet zurückgegeben; gerundet wird erst in der Anzeige.
 */

/** Zutat mit Bäckerprozent (Eingabe für die Skalierung). */
export interface PercentIngredient {
  name: string;
  type: IngredientType;
  /** Bezogen auf die Mehlbasis, >= 0. */
  bakersPercent: number;
  /** Nur bei type "starter" relevant, Standard 100, >= 0. */
  starterHydration?: number;
}

/** Zutat mit Grammangabe (Eingabe für Netto-Hydratation und Bäckerprozente). */
export interface GramIngredient {
  name: string;
  type: IngredientType;
  /** >= 0. */
  amountGrams: number;
  /** Nur bei type "starter" relevant, Standard 100, >= 0. */
  starterHydration?: number;
}

/** Ausgabe-Zutat: alle Eingabefelder unverändert plus berechnete Grammangabe. */
export type ScaledIngredient = PercentIngredient & { amountGrams: number };

/** Ausgabe-Zutat: alle Eingabefelder unverändert plus berechnetes Bäckerprozent. */
export type PercentagedIngredient = GramIngredient & { bakersPercent: number };

export interface ScaledRecipe {
  /** Mehlbasis in g, ungerundet. */
  flourBasis: number;
  /** Summe aller amountGrams, ungerundet. */
  totalWeight: number;
  /** Gleiche Reihenfolge wie die Eingabe. */
  ingredients: ScaledIngredient[];
}

export const DEFAULT_STARTER_HYDRATION = 100;
/** Erlaubte Abweichung der Mehlanteile von 100 % in Prozentpunkten. */
export const FLOUR_PERCENT_TOLERANCE = 0.01;
/** Puffer für Gleitkommafehler beim Toleranzvergleich (z. B. 80 + 20,005). */
const FLOAT_EPSILON = 1e-9;

export const FLOUR_PERCENT_SUM_MESSAGE = "Die Mehlanteile müssen zusammen 100 % ergeben.";
export const INVALID_FLOUR_BASIS_MESSAGE = "Die Mehlbasis muss größer als 0 g sein.";
export const INVALID_TOTAL_WEIGHT_MESSAGE = "Das Teiggewicht muss größer als 0 g sein.";
export const NEGATIVE_BAKERS_PERCENT_MESSAGE = "Bäckerprozente dürfen nicht negativ sein.";
export const NEGATIVE_GRAMS_MESSAGE = "Grammangaben dürfen nicht negativ sein.";
export const NEGATIVE_STARTER_HYDRATION_MESSAGE = "Die Starter-Hydratation darf nicht negativ sein.";
export const NO_FLOUR_MESSAGE = "Das Rezept enthält kein Mehl.";

export const NON_FINITE_FLOUR_BASIS_MESSAGE = "Die Mehlbasis muss eine gültige Zahl sein.";
export const NON_FINITE_TOTAL_WEIGHT_MESSAGE = "Das Teiggewicht muss eine gültige Zahl sein.";
export const NON_FINITE_BAKERS_PERCENT_MESSAGE = "Bäckerprozente müssen gültige Zahlen sein.";
export const NON_FINITE_GRAMS_MESSAGE = "Grammangaben müssen gültige Zahlen sein.";
export const NON_FINITE_STARTER_HYDRATION_MESSAGE =
  "Die Starter-Hydratation muss eine gültige Zahl sein.";

/** Meldung für einen Zutatentyp, den die Netto-Hydratation nicht kennt. */
export function unknownIngredientTypeMessage(type: string): string {
  return `Unbekannter Zutatentyp: ${type}.`;
}

/** Wirft `nonFiniteMessage` bei NaN, Infinity und -Infinity. */
function assertFinite(value: number, nonFiniteMessage: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(nonFiniteMessage);
  }
}

/** Prüft zuerst die Endlichkeit, dann `value > 0`. */
function assertPositive(value: number, nonFiniteMessage: string, message: string): void {
  assertFinite(value, nonFiniteMessage);
  if (value <= 0) {
    throw new Error(message);
  }
}

/** Prüft zuerst die Endlichkeit, dann `value >= 0`. */
function assertNonNegative(value: number, nonFiniteMessage: string, message: string): void {
  assertFinite(value, nonFiniteMessage);
  if (value < 0) {
    throw new Error(message);
  }
}

function assertValidStarterHydration(starterHydration: number | undefined): void {
  if (starterHydration !== undefined) {
    assertNonNegative(
      starterHydration,
      NON_FINITE_STARTER_HYDRATION_MESSAGE,
      NEGATIVE_STARTER_HYDRATION_MESSAGE,
    );
  }
}

function assertValidPercentIngredients(ingredients: readonly PercentIngredient[]): void {
  for (const ingredient of ingredients) {
    assertNonNegative(
      ingredient.bakersPercent,
      NON_FINITE_BAKERS_PERCENT_MESSAGE,
      NEGATIVE_BAKERS_PERCENT_MESSAGE,
    );
    assertValidStarterHydration(ingredient.starterHydration);
  }
}

function assertValidGramIngredients(ingredients: readonly GramIngredient[]): void {
  for (const ingredient of ingredients) {
    assertNonNegative(ingredient.amountGrams, NON_FINITE_GRAMS_MESSAGE, NEGATIVE_GRAMS_MESSAGE);
    assertValidStarterHydration(ingredient.starterHydration);
  }
}

function assertFlourPercentSum(ingredients: readonly PercentIngredient[]): void {
  const flourPercent = ingredients
    .filter((ingredient) => ingredient.type === "flour")
    .reduce((sum, ingredient) => sum + ingredient.bakersPercent, 0);
  if (Math.abs(flourPercent - 100) > FLOUR_PERCENT_TOLERANCE + FLOAT_EPSILON) {
    throw new Error(FLOUR_PERCENT_SUM_MESSAGE);
  }
}

function assertValidPercentRecipe(ingredients: readonly PercentIngredient[]): void {
  assertValidPercentIngredients(ingredients);
  assertFlourPercentSum(ingredients);
}

/** Berechnet die Grammangaben aller Zutaten aus der Mehlbasis (Summe der Mehl-Zutaten in g). */
export function calculateRecipeFromFlourBasis(
  ingredients: readonly PercentIngredient[],
  flourBasis: number,
): ScaledRecipe {
  assertPositive(flourBasis, NON_FINITE_FLOUR_BASIS_MESSAGE, INVALID_FLOUR_BASIS_MESSAGE);
  assertValidPercentRecipe(ingredients);

  const scaled = ingredients.map(
    (ingredient): ScaledIngredient => ({
      ...ingredient,
      amountGrams: (flourBasis * ingredient.bakersPercent) / 100,
    }),
  );
  const totalWeight = scaled.reduce((sum, ingredient) => sum + ingredient.amountGrams, 0);

  return { flourBasis, totalWeight, ingredients: scaled };
}

/** Berechnet die Grammangaben aller Zutaten aus dem gewünschten Teiggewicht in g. */
export function calculateRecipeFromTotalWeight(
  ingredients: readonly PercentIngredient[],
  totalWeight: number,
): ScaledRecipe {
  assertPositive(totalWeight, NON_FINITE_TOTAL_WEIGHT_MESSAGE, INVALID_TOTAL_WEIGHT_MESSAGE);
  assertValidPercentRecipe(ingredients);

  // Durch die Mehlanteil-Prüfung ist die Summe mindestens 99,99, also nie 0.
  const totalPercent = ingredients.reduce((sum, ingredient) => sum + ingredient.bakersPercent, 0);
  const flourBasis = (totalWeight / totalPercent) * 100;

  return calculateRecipeFromFlourBasis(ingredients, flourBasis);
}

/**
 * Berechnet die Netto-Hydratation in Prozent (Gesamtwasser / Gesamtmehl × 100),
 * jeder Starter wird mit seiner eigenen Hydratation in Mehl und Wasser zerlegt.
 * Salz und Sonstiges zählen weder als Mehl noch als Wasser.
 * Liefert `null`, wenn das Rezept kein Mehl enthält (weder Mehl-Zutaten noch Starter-Mehl).
 * Wirft bei unbekanntem Zutatentyp, statt die Zutat still zu ignorieren; ein neuer Typ im
 * Schema fällt außerdem schon bei der Typprüfung im `default`-Zweig auf.
 */
export function calculateNetHydration(ingredients: readonly GramIngredient[]): number | null {
  assertValidGramIngredients(ingredients);

  let totalFlour = 0;
  let totalWater = 0;

  for (const ingredient of ingredients) {
    switch (ingredient.type) {
      case "flour":
        totalFlour += ingredient.amountGrams;
        break;
      case "water":
        totalWater += ingredient.amountGrams;
        break;
      case "starter": {
        const hydration = ingredient.starterHydration ?? DEFAULT_STARTER_HYDRATION;
        const starterFlour = ingredient.amountGrams / (1 + hydration / 100);
        totalFlour += starterFlour;
        totalWater += ingredient.amountGrams - starterFlour;
        break;
      }
      case "salt":
      case "other":
        break;
      default: {
        const unknownType: never = ingredient.type;
        throw new Error(unknownIngredientTypeMessage(String(unknownType)));
      }
    }
  }

  if (totalFlour === 0) {
    return null;
  }
  return (totalWater / totalFlour) * 100;
}

/** Berechnet die Bäckerprozente aller Zutaten bezogen auf die Mehlbasis (ohne Starter-Mehl). */
export function calculateBakersPercentages(
  ingredients: readonly GramIngredient[],
): PercentagedIngredient[] {
  assertValidGramIngredients(ingredients);

  const flourBasis = ingredients
    .filter((ingredient) => ingredient.type === "flour")
    .reduce((sum, ingredient) => sum + ingredient.amountGrams, 0);
  if (flourBasis === 0) {
    throw new Error(NO_FLOUR_MESSAGE);
  }

  return ingredients.map(
    (ingredient): PercentagedIngredient => ({
      ...ingredient,
      bakersPercent: (ingredient.amountGrams / flourBasis) * 100,
    }),
  );
}

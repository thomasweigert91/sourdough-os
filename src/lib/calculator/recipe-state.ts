// Zustand und Auswertung des Hydratations-Rechners (F010, F011). Reine Funktionen, Zahlen ungerundet.
// Mehrzeilige Rechnungen und alle Meldungstexte kommen aus der Engine (F007/F008).
import type { IngredientType } from "@/db/schema/recipes";
import {
  FLOUR_PERCENT_SUM_MESSAGE,
  INVALID_FLOUR_BASIS_MESSAGE,
  INVALID_TOTAL_WEIGHT_MESSAGE,
  NEGATIVE_BAKERS_PERCENT_MESSAGE,
  NEGATIVE_GRAMS_MESSAGE,
  NEGATIVE_STARTER_HYDRATION_MESSAGE,
  NON_FINITE_BAKERS_PERCENT_MESSAGE,
  NON_FINITE_FLOUR_BASIS_MESSAGE,
  NON_FINITE_GRAMS_MESSAGE,
  NON_FINITE_STARTER_HYDRATION_MESSAGE,
  NON_FINITE_TOTAL_WEIGHT_MESSAGE,
  calculateBakersPercentages,
  calculateNetHydration,
  calculateRecipeFromFlourBasis,
  calculateRecipeFromTotalWeight,
  type GramIngredient,
  type PercentIngredient,
} from "@/lib/baking-engine/hydration";
import {
  DEFAULT_FLOUR_TYPE_ID,
  OTHER_FLOUR_TYPE_ID,
  calculateAdjustedWaterForFlourSwap,
  getFlourType,
  type FlourPortion,
  type FlourTypeId,
} from "@/lib/baking-engine/flour-types";
import { DEFAULT_INGREDIENT_NAMES } from "./messages";

export type BasisMode = "flour" | "dough";
export type AdditiveType = "salt" | "other";

export interface RecipeRow {
  /** Stabil, deterministisch: "row-1", "row-2", … */
  id: string;
  name: string;
  type: IngredientType;
  /** g, ungerundet; NaN bei ungültiger Eingabe. */
  grams: number;
  /** Bäckerprozent bezogen auf die Mehlbasis, ungerundet. */
  percent: number;
  /** Für alle Zeilen gespeichert (Standard 100), ausgewertet nur bei type "starter". */
  starterHydration: number;
  /** Mehlzeilen: Katalog-Schlüssel (nie null bei Zeilen aus dieser App). Alle anderen Zeilen: null. */
  flourType: FlourTypeId | null;
}

export interface RecipeState {
  basis: BasisMode;
  /** Mehlbasis F in g (Basis „Gesamtmehl“). Wird in beiden Modi mitgeführt. */
  flourBasis: number;
  /** Ziel-Teiggewicht W in g (Basis „Ziel-Teiggewicht“). */
  doughWeight: number;
  rows: RecipeRow[];
  /** Schalter „Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)“, Standard true. */
  adjustWaterOnFlourSwap: boolean;
}

export interface RecipeEvaluation {
  basisError: string | null;
  /** rowId → eine Meldung pro Zeile */
  rowErrors: Record<string, string>;
  flourSumError: string | null;
  /** null, solange eine Meldung existiert oder kein Mehl vorhanden ist */
  netHydration: number | null;
  doughYield: number | null;
  /** Summe aller Gramm, ungerundet */
  totalWeight: number;
  isValid: boolean;
}

const DEFAULT_ROW_STARTER_HYDRATION = 100;

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Bäckerprozent-Definition (F007): g = F × p / 100. */
function gramsFromPercent(flourBasis: number, percent: number): number {
  return (flourBasis * percent) / 100;
}

/** Bäckerprozent-Definition (F007): p = g / F × 100. */
function percentFromGrams(grams: number, flourBasis: number): number {
  return (grams / flourBasis) * 100;
}

function sumGrams(rows: readonly RecipeRow[]): number {
  return rows.reduce((sum, row) => sum + row.grams, 0);
}

/** Gleichheit bis auf Rundungsfehler der Gleitkommarechnung. */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Mehlbasis, auf die sich Gramm und Prozent gerade beziehen. Ist das Basisfeld ungültig (z. B. geleert),
 * tragen die Mehl-Zeilen die bisherige Basis weiter: Summe Mehl-Gramm / Summe Mehl-Prozent × 100.
 * Alle Zeilenänderungen rechnen mit dieser Basis, dadurch passen Gramm und Prozent weiter zusammen,
 * bis wieder eine gültige Basis eingegeben wird. null, wenn sich keine positive Basis ableiten lässt.
 */
function referenceFlourBasis(state: RecipeState): number | null {
  if (isPositive(state.flourBasis)) return state.flourBasis;
  const flours = state.rows.filter((row) => row.type === "flour");
  const allValid = flours.every(
    (row) => Number.isFinite(row.grams) && row.grams >= 0 && Number.isFinite(row.percent) && row.percent >= 0,
  );
  if (!allValid) return null;
  const flourGrams = flours.reduce((sum, row) => sum + row.grams, 0);
  const flourPercent = flours.reduce((sum, row) => sum + row.percent, 0);
  if (!isPositive(flourGrams) || !isPositive(flourPercent)) return null;
  const derived = (flourGrams / flourPercent) * 100;
  return isPositive(derived) ? derived : null;
}

/** Starter-Hydratation nur beim Starter an die Engine geben, sonst würde sie überall geprüft. */
function toPercentIngredients(rows: readonly RecipeRow[]): PercentIngredient[] {
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    bakersPercent: row.percent,
    ...(row.type === "starter" ? { starterHydration: row.starterHydration } : {}),
  }));
}

function toGramIngredients(rows: readonly RecipeRow[]): GramIngredient[] {
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    amountGrams: row.grams,
    ...(row.type === "starter" ? { starterHydration: row.starterHydration } : {}),
  }));
}

function withRows(state: RecipeState, rows: RecipeRow[]): RecipeState {
  return { ...state, rows, doughWeight: sumGrams(rows) };
}

/**
 * Modus Ziel-Teiggewicht: Ein eingegebenes Teiggewicht, das wegen ungültiger Prozente nicht angewendet
 * werden konnte (die Gramm summieren sich nicht darauf), bleibt das Ziel. Nach einer Änderung an den
 * Prozenten oder Zeilen wird es erneut angewendet; klappt das noch nicht, bleibt es stehen, statt durch
 * die Summe der Gramm ersetzt zu werden.
 */
function reapplyPendingDoughWeight(previous: RecipeState, next: RecipeState): RecipeState {
  if (previous.basis !== "dough" || !isPositive(previous.doughWeight)) return next;
  if (nearlyEqual(previous.doughWeight, sumGrams(previous.rows))) return next;
  return setBasisValue(next, previous.doughWeight);
}

function updateRow(
  rows: readonly RecipeRow[],
  rowId: string,
  update: (row: RecipeRow) => RecipeRow,
): RecipeRow[] {
  return rows.map((row) => (row.id === rowId ? update(row) : row));
}

function nextRowId(state: RecipeState): string {
  const max = state.rows.reduce((highest, row) => {
    const match = /^row-(\d+)$/.exec(row.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `row-${max + 1}`;
}

/**
 * Zeilenname zu einem Mehltyp: Katalogname, bei „Sonstiges Mehl“ leer (freier Name, AC-10).
 * Der Katalogname im Feld name hält gemerkte Stände auch für ältere Versionen lesbar.
 */
function flourRowName(flourType: FlourTypeId): string {
  return flourType === OTHER_FLOUR_TYPE_ID ? "" : getFlourType(flourType).name;
}

function newRow(id: string, type: IngredientType): RecipeRow {
  const flourType = type === "flour" ? DEFAULT_FLOUR_TYPE_ID : null;
  return {
    id,
    name: flourType === null ? "" : flourRowName(flourType),
    type,
    grams: 0,
    percent: 0,
    starterHydration: DEFAULT_ROW_STARTER_HYDRATION,
    flourType,
  };
}

export function createReferenceRecipe(): RecipeState {
  const row = (
    id: number,
    name: string,
    type: IngredientType,
    percent: number,
    flourType: FlourTypeId | null = null,
  ): RecipeRow => ({
    id: `row-${id}`,
    name,
    type,
    grams: gramsFromPercent(1000, percent),
    percent,
    starterHydration: DEFAULT_ROW_STARTER_HYDRATION,
    flourType,
  });
  return {
    basis: "flour",
    flourBasis: 1000,
    doughWeight: 1920,
    rows: [
      row(1, flourRowName("wheat_550"), "flour", 80, "wheat_550"),
      row(2, flourRowName("rye_1150"), "flour", 20, "rye_1150"),
      row(3, "Wasser", "water", 70),
      row(4, "Starter", "starter", 20),
      row(5, "Salz", "salt", 2),
    ],
    adjustWaterOnFlourSwap: true,
  };
}

export function setBasisMode(state: RecipeState, mode: BasisMode): RecipeState {
  if (mode === "dough") {
    // Ein geleertes oder ungültiges Gesamtmehl darf nicht still in den Modus Ziel-Teiggewicht wandern,
    // dort gibt es kein Feld dafür. Die Basis kommt dann aus den Mehl-Zeilen; Gramm und Prozente bleiben.
    const flourBasis = referenceFlourBasis(state) ?? state.flourBasis;
    return { ...state, basis: mode, flourBasis, doughWeight: sumGrams(state.rows) };
  }
  return { ...state, basis: mode };
}

export function setBasisValue(state: RecipeState, value: number): RecipeState {
  if (state.basis === "flour") {
    if (!isPositive(value)) return { ...state, flourBasis: value };
    const rows = state.rows.map((row) => ({ ...row, grams: gramsFromPercent(value, row.percent) }));
    return { ...state, flourBasis: value, rows, doughWeight: sumGrams(rows) };
  }

  if (!isPositive(value)) return { ...state, doughWeight: value };
  try {
    const scaled = calculateRecipeFromTotalWeight(toPercentIngredients(state.rows), value);
    const rows = state.rows.map((row, index) => ({
      ...row,
      grams: scaled.ingredients[index].amountGrams,
    }));
    return { ...state, doughWeight: value, flourBasis: scaled.flourBasis, rows };
  } catch {
    // Ungültige Prozente: Gramm und Mehlbasis bleiben, die Meldung liefert evaluateRecipe.
    return { ...state, doughWeight: value };
  }
}

export function setRowGrams(state: RecipeState, rowId: string, grams: number): RecipeState {
  const target = state.rows.find((row) => row.id === rowId);
  if (!target) return state;
  const rows = updateRow(state.rows, rowId, (row) => ({ ...row, grams }));

  if (target.type === "flour") {
    const allValid = rows.every((row) => Number.isFinite(row.grams) && row.grams >= 0);
    const flourSum = rows
      .filter((row) => row.type === "flour")
      .reduce((sum, row) => sum + row.grams, 0);
    if (allValid && flourSum > 0) {
      try {
        const percentaged = calculateBakersPercentages(toGramIngredients(rows));
        const recalculated = rows.map((row, index) => ({
          ...row,
          percent: percentaged[index].bakersPercent,
        }));
        return { ...withRows(state, recalculated), flourBasis: flourSum };
      } catch {
        // z. B. ungültige Starter-Hydratation: wie eine Einzelzeile behandeln.
      }
    }
  }

  // Eingetippte Gramm gelten (Q5): ein noch nicht angewendetes Ziel-Teiggewicht weicht der neuen Summe.
  const reference = referenceFlourBasis(state);
  const single =
    reference !== null
      ? updateRow(rows, rowId, (row) => ({ ...row, percent: percentFromGrams(grams, reference) }))
      : rows;
  return withRows(state, single);
}

export function setRowPercent(state: RecipeState, rowId: string, percent: number): RecipeState {
  const reference = referenceFlourBasis(state);
  const rows = updateRow(state.rows, rowId, (row) => ({
    ...row,
    percent,
    grams: reference !== null ? gramsFromPercent(reference, percent) : row.grams,
  }));
  return reapplyPendingDoughWeight(state, withRows(state, rows));
}

export function setStarterHydration(state: RecipeState, rowId: string, value: number): RecipeState {
  const next = { ...state, rows: updateRow(state.rows, rowId, (row) => ({ ...row, starterHydration: value })) };
  return reapplyPendingDoughWeight(state, next);
}

export function setRowName(state: RecipeState, rowId: string, name: string): RecipeState {
  return { ...state, rows: updateRow(state.rows, rowId, (row) => ({ ...row, name })) };
}

export function setRowType(state: RecipeState, rowId: string, type: AdditiveType): RecipeState {
  return {
    ...state,
    rows: updateRow(state.rows, rowId, (row) =>
      row.type === "salt" || row.type === "other" ? { ...row, type } : row,
    ),
  };
}

function flourPortions(rows: readonly RecipeRow[]): FlourPortion[] {
  return rows
    .filter((row) => row.type === "flour")
    .map((row) => ({ flourType: row.flourType ?? OTHER_FLOUR_TYPE_ID, amountGrams: row.grams }));
}

/**
 * Wechselt den Mehltyp einer Mehlzeile. Bei eingeschaltetem Schalter wird das Wasser-Bäckerprozent mit
 * „Absorption nachher / Absorption vorher“ angepasst (AC-4); Gramm folgen aus der gewählten Basis (AC-7).
 * Keine Anpassung bei ausgeschaltetem Schalter (AC-6) oder solange das Rezept eine Meldung zeigt (AC-8).
 */
export function setRowFlourType(state: RecipeState, rowId: string, flourType: FlourTypeId): RecipeState {
  const target = state.rows.find((row) => row.id === rowId);
  if (!target || target.type !== "flour" || target.flourType === flourType) return state;

  const swapped = updateRow(state.rows, rowId, (row) => ({ ...row, flourType, name: flourRowName(flourType) }));
  const next: RecipeState = { ...state, rows: swapped };
  if (!state.adjustWaterOnFlourSwap || !evaluateRecipe(state).isValid) return next;

  const before = flourPortions(state.rows);
  const after = flourPortions(swapped);
  const adjusted = swapped.map((row) =>
    row.type === "water"
      ? { ...row, percent: calculateAdjustedWaterForFlourSwap(before, after, row.percent) }
      : row,
  );

  if (state.basis === "flour") {
    const rows = adjusted.map((row) =>
      row.type === "water" ? { ...row, grams: gramsFromPercent(state.flourBasis, row.percent) } : row,
    );
    return withRows(state, rows);
  }
  // Ziel-Teiggewicht bleibt fest, alle Gramm und die Mehlbasis folgen aus den Prozenten.
  return setBasisValue({ ...state, rows: adjusted }, state.doughWeight);
}

/** Schaltet die automatische Wasseranpassung um, ohne Gramm oder Prozent zu ändern (AC-3, AC-6). */
export function setAdjustWaterOnFlourSwap(state: RecipeState, enabled: boolean): RecipeState {
  return { ...state, adjustWaterOnFlourSwap: enabled };
}

export function addFlourRow(state: RecipeState): { state: RecipeState; rowId: string } {
  const rowId = nextRowId(state);
  const lastFlourIndex = state.rows.findLastIndex((row) => row.type === "flour");
  const insertAt = lastFlourIndex + 1;
  const rows = [...state.rows.slice(0, insertAt), newRow(rowId, "flour"), ...state.rows.slice(insertAt)];
  return { state: reapplyPendingDoughWeight(state, withRows(state, rows)), rowId };
}

export function addAdditiveRow(state: RecipeState): { state: RecipeState; rowId: string } {
  const rowId = nextRowId(state);
  const rows = [...state.rows, newRow(rowId, "other")];
  return { state: reapplyPendingDoughWeight(state, withRows(state, rows)), rowId };
}

export function canRemoveRow(state: RecipeState, rowId: string): boolean {
  const row = state.rows.find((candidate) => candidate.id === rowId);
  if (!row || row.type === "water" || row.type === "starter") return false;
  if (row.type === "flour") {
    return state.rows.filter((candidate) => candidate.type === "flour").length > 1;
  }
  return true;
}

export function removeRow(state: RecipeState, rowId: string): RecipeState {
  if (!canRemoveRow(state, rowId)) return state;
  const rows = state.rows.filter((row) => row.id !== rowId);
  return reapplyPendingDoughWeight(state, withRows(state, rows));
}

/**
 * Mehlzeilen mit Katalog-Mehltyp: Katalogname. „Sonstiges Mehl“: freier Name getrimmt, leer → „Sonstiges Mehl“.
 * Sonst Name getrimmt, leer → Typname ("Mehl", "Wasser", "Starter", "Salz", "Sonstiges").
 */
export function ingredientDisplayName(row: RecipeRow): string {
  const trimmed = row.name.trim();
  if (row.type === "flour" && row.flourType !== null) {
    const flour = getFlourType(row.flourType);
    if (row.flourType !== OTHER_FLOUR_TYPE_ID) return flour.name;
    return trimmed === "" ? flour.name : trimmed;
  }
  return trimmed === "" ? DEFAULT_INGREDIENT_NAMES[row.type] : trimmed;
}

function nonNegativeError(value: number, nonFiniteMessage: string, negativeMessage: string): string | null {
  if (!Number.isFinite(value)) return nonFiniteMessage;
  if (value < 0) return negativeMessage;
  return null;
}

function rowError(row: RecipeRow): string | null {
  return (
    nonNegativeError(row.grams, NON_FINITE_GRAMS_MESSAGE, NEGATIVE_GRAMS_MESSAGE) ??
    nonNegativeError(row.percent, NON_FINITE_BAKERS_PERCENT_MESSAGE, NEGATIVE_BAKERS_PERCENT_MESSAGE) ??
    (row.type === "starter"
      ? nonNegativeError(
          row.starterHydration,
          NON_FINITE_STARTER_HYDRATION_MESSAGE,
          NEGATIVE_STARTER_HYDRATION_MESSAGE,
        )
      : null)
  );
}

function positiveError(value: number, nonFiniteMessage: string, invalidMessage: string): string | null {
  if (!Number.isFinite(value)) return nonFiniteMessage;
  if (value <= 0) return invalidMessage;
  return null;
}

function basisErrorOf(state: RecipeState): string | null {
  return state.basis === "flour"
    ? positiveError(state.flourBasis, NON_FINITE_FLOUR_BASIS_MESSAGE, INVALID_FLOUR_BASIS_MESSAGE)
    : positiveError(state.doughWeight, NON_FINITE_TOTAL_WEIGHT_MESSAGE, INVALID_TOTAL_WEIGHT_MESSAGE);
}

export function evaluateRecipe(state: RecipeState): RecipeEvaluation {
  let basisError = basisErrorOf(state);

  const rowErrors: Record<string, string> = {};
  for (const row of state.rows) {
    const error = rowError(row);
    if (error) rowErrors[row.id] = error;
  }

  let flourSumError: string | null = null;
  if (Object.keys(rowErrors).length === 0) {
    try {
      // Nur die Mehlanteil-Prüfung der Engine nutzen; die Toleranzregel bleibt in hydration.ts.
      calculateRecipeFromFlourBasis(toPercentIngredients(state.rows), 100);
    } catch (error) {
      if (error instanceof Error && error.message === FLOUR_PERCENT_SUM_MESSAGE) {
        flourSumError = FLOUR_PERCENT_SUM_MESSAGE;
      }
    }
  }

  // Absicherung im Modus Ziel-Teiggewicht: Ohne gültige Mehlbasis passen Gramm und Prozent nicht sicher
  // zusammen, also weder Kennzahlen noch Speichern. Erneutes Eingeben des Teiggewichts leitet sie wieder ab.
  if (state.basis === "dough" && basisError === null && flourSumError === null && Object.keys(rowErrors).length === 0) {
    basisError = positiveError(state.flourBasis, NON_FINITE_FLOUR_BASIS_MESSAGE, INVALID_FLOUR_BASIS_MESSAGE);
  }

  const totalWeight = sumGrams(state.rows);
  const hasMessage = basisError !== null || flourSumError !== null || Object.keys(rowErrors).length > 0;
  const netHydration = hasMessage ? null : calculateNetHydration(toGramIngredients(state.rows));
  const doughYield = netHydration === null ? null : 100 + netHydration;

  return {
    basisError,
    rowErrors,
    flourSumError,
    netHydration,
    doughYield,
    totalWeight,
    isValid: !hasMessage && netHydration !== null,
  };
}

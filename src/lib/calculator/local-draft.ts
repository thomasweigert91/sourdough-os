// Lokal gemerkter Stand des Rechners mit Besitzer-Marker (F010, AC-10; Mehltyp und Schalter ab F011). Eigener localStorage-Schlüssel,
// damit ein Gast-Stand das Leeren des Query-Caches beim Abmelden übersteht.
import type { IngredientType } from "@/db/schema/recipes";
import type { KneadingMethod } from "@/lib/baking-engine/ddt";
import {
  OTHER_FLOUR_TYPE_ID,
  findFlourTypeByName,
  getFlourType,
  isFlourTypeId,
  normalizeFlourName,
  type FlourTypeId,
} from "@/lib/baking-engine/flour-types";
import type { DdtState } from "./ddt-state";
import type { BasisMode, RecipeRow, RecipeState } from "./recipe-state";

export const CALCULATOR_DRAFT_KEY = "sourdough-os:calculator-draft";
const DRAFT_VERSION = 1;

export type CalculatorOwner = { kind: "guest" } | { kind: "user"; userId: string };

export interface CalculatorDraft {
  recipe: RecipeState;
  ddt: DdtState;
}

// Lokale Listen statt Laufzeit-Import aus @/db (Client-Bundle) bzw. ddt-state (kein Zyklus nötig).
const INGREDIENT_TYPE_VALUES = [
  "flour",
  "water",
  "starter",
  "salt",
  "other",
] as const satisfies readonly IngredientType[];
const KNEADING_METHOD_VALUES = [
  "hand",
  "stand_mixer",
  "spiral",
  "custom",
] as const satisfies readonly KneadingMethod[];
const BASIS_VALUES = ["flour", "dough"] as const satisfies readonly BasisMode[];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function sameOwner(a: CalculatorOwner, b: CalculatorOwner): boolean {
  if (a.kind === "guest" || b.kind === "guest") return a.kind === b.kind;
  return a.userId === b.userId;
}

function parseOwner(value: unknown): CalculatorOwner | null {
  if (!isRecord(value)) return null;
  if (value.kind === "guest") return { kind: "guest" };
  if (value.kind === "user" && typeof value.userId === "string" && value.userId !== "") {
    return { kind: "user", userId: value.userId };
  }
  return null;
}

/**
 * Mehlnamen aus dem F010-Referenzrezept (normalisiert) → Mehltyp (Ticket F011, Frage 6/7).
 * Bewusst nur hier und nicht im Katalog-Lookup, damit die Engine frei von Altlasten bleibt.
 */
const LEGACY_FLOUR_NAME_ALIASES: ReadonlyMap<string, FlourTypeId> = new Map([
  ["weizenmehl", "wheat_550"],
  ["roggenmehl", "rye_1150"],
]);

/** Zuordnung eines freien F010-Mehlnamens zu Mehltyp und Zeilenname (AC-11). */
export function migrateLegacyFlourName(name: string): { flourType: FlourTypeId; name: string } {
  const alias = LEGACY_FLOUR_NAME_ALIASES.get(normalizeFlourName(name));
  if (alias) return { flourType: alias, name: getFlourType(alias).name };
  const match = findFlourTypeByName(name);
  if (match && match.id !== OTHER_FLOUR_TYPE_ID) return { flourType: match.id, name: match.name };
  if (match || normalizeFlourName(name) === "") return { flourType: OTHER_FLOUR_TYPE_ID, name: "" };
  return { flourType: OTHER_FLOUR_TYPE_ID, name };
}

function parseRow(value: unknown): RecipeRow | null {
  if (!isRecord(value)) return null;
  const { id, name, type, grams, percent, starterHydration, flourType } = value;
  if (typeof id !== "string" || typeof name !== "string" || !isOneOf(INGREDIENT_TYPE_VALUES, type)) {
    return null;
  }
  if (!isNumber(grams) || !isNumber(percent) || !isNumber(starterHydration)) return null;
  const base = { id, type, grams, percent, starterHydration };
  if (type !== "flour") return { ...base, name, flourType: null };
  // Stand ohne Mehltyp (F010): freien Namen zuordnen, Mengen bleiben unverändert.
  if (flourType === undefined) return { ...base, ...migrateLegacyFlourName(name) };
  if (!isFlourTypeId(flourType)) return null;
  return { ...base, name, flourType };
}

function parseRecipe(value: unknown): RecipeState | null {
  if (!isRecord(value)) return null;
  const { basis, flourBasis, doughWeight, rows, adjustWaterOnFlourSwap = true } = value;
  if (!isOneOf(BASIS_VALUES, basis) || !isNumber(flourBasis) || !isNumber(doughWeight)) return null;
  if (typeof adjustWaterOnFlourSwap !== "boolean") return null;
  if (!Array.isArray(rows)) return null;
  const parsed: RecipeRow[] = [];
  for (const raw of rows) {
    const row = parseRow(raw);
    if (!row) return null;
    parsed.push(row);
  }
  if (!parsed.some((row) => row.type === "flour")) return null;
  // IDs dienen als React-key und müssen eindeutig sein.
  if (new Set(parsed.map((row) => row.id)).size !== parsed.length) return null;
  return { basis, flourBasis, doughWeight, rows: parsed, adjustWaterOnFlourSwap };
}

function parseDdt(value: unknown): DdtState | null {
  if (!isRecord(value)) return null;
  const {
    desiredDoughTemperature,
    roomTemperature,
    flourTemperature,
    starterTemperature,
    kneadingMethod,
    customFriction,
  } = value;
  if (
    !isNumber(desiredDoughTemperature) ||
    !isNumber(roomTemperature) ||
    !isNumber(flourTemperature) ||
    !isNumber(starterTemperature) ||
    !isNumber(customFriction) ||
    !isOneOf(KNEADING_METHOD_VALUES, kneadingMethod)
  ) {
    return null;
  }
  return {
    desiredDoughTemperature,
    roomTemperature,
    flourTemperature,
    starterTemperature,
    kneadingMethod,
    customFriction,
  };
}

function readStored(): UnknownRecord | null {
  try {
    const raw = window.localStorage.getItem(CALCULATOR_DRAFT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Speichert den Stand; false, wenn localStorage nicht beschreibbar ist. */
export function saveCalculatorDraft(owner: CalculatorOwner, draft: CalculatorDraft): boolean {
  const storedOwner: CalculatorOwner =
    owner.kind === "guest" ? { kind: "guest" } : { kind: "user", userId: owner.userId };
  try {
    window.localStorage.setItem(
      CALCULATOR_DRAFT_KEY,
      JSON.stringify({ version: DRAFT_VERSION, owner: storedOwner, recipe: draft.recipe, ddt: draft.ddt }),
    );
    return true;
  } catch {
    return false;
  }
}

/** null bei fehlendem, kaputtem oder fremdem Stand. */
export function loadCalculatorDraft(owner: CalculatorOwner): CalculatorDraft | null {
  const stored = readStored();
  if (!stored || stored.version !== DRAFT_VERSION) return null;
  const storedOwner = parseOwner(stored.owner);
  if (!storedOwner || !sameOwner(storedOwner, owner)) return null;
  const recipe = parseRecipe(stored.recipe);
  const ddt = parseDdt(stored.ddt);
  if (!recipe || !ddt) return null;
  return { recipe, ddt };
}

/** Beim Abmelden: entfernt einen Konto-Stand, ein Gast-Stand bleibt erhalten. */
export function clearAccountCalculatorDraft(): void {
  const stored = readStored();
  if (!stored || parseOwner(stored.owner)?.kind !== "user") return;
  try {
    window.localStorage.removeItem(CALCULATOR_DRAFT_KEY);
  } catch {
    // Speicher nicht verfügbar: es gibt nichts zu löschen.
  }
}

export function ownerKey(owner: CalculatorOwner): string {
  return owner.kind === "guest" ? "guest" : `user:${owner.userId}`;
}

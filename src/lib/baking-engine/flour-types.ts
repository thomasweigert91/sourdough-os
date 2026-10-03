// Mehltypen-Katalog und Wasseranpassung bei Mehlwechsel (F011). Reine Funktionen, Werte ungerundet.
// Der Katalog liegt bewusst nur in der App (keine DB-Tabelle), analog zu FRICTION_PRESETS in ddt.ts.

export type FlourTypeId =
  | "wheat_405"
  | "wheat_550"
  | "wheat_1050"
  | "wheat_wholegrain"
  | "spelt_630"
  | "spelt_1050"
  | "spelt_wholegrain"
  | "rye_815"
  | "rye_997"
  | "rye_1150"
  | "rye_1370"
  | "rye_wholegrain"
  | "manitoba"
  | "tipo_00"
  | "other_flour";

export type FlourGroup = "wheat" | "spelt" | "rye" | "special" | "other";

/** Drei Stufen laut Ticket: niedrig / mittel / hoch. Nur Metadaten, in F011 nicht angezeigt. */
export type KneadingTolerance = "low" | "medium" | "high";

export interface FlourType {
  id: FlourTypeId;
  /** Anzeigename und Zutatenname beim Speichern, z. B. "Dinkel 630". */
  name: string;
  group: FlourGroup;
  /** Relativ zu Weizen 550 = 1,00. */
  absorptionFactor: number;
  kneadingTolerance: KneadingTolerance;
  /** Hinweistext für spätere Warnungen, sonst null. In F011 nicht angezeigt. */
  note: string | null;
}

const SPELT_NOTE = "Dinkel überknetet schnell.";
const RYE_NOTE = "Roggenteig nur kurz mischen, nicht auskneten.";

/**
 * Reihenfolge = Anzeigereihenfolge der Auswahl „Mehltyp“.
 * Fest laut Ticket: Weizen 550 1,00, Weizen Vollkorn 1,15, Dinkel 630 0,92, Roggen 1150 1,15,
 * Manitoba 1,25, Sonstiges Mehl 1,00. Alle übrigen Werte sind mit dem Plan freigegebene Richtwerte.
 */
export const FLOUR_TYPES: readonly FlourType[] = [
  { id: "wheat_405", name: "Weizen 405", group: "wheat", absorptionFactor: 0.95, kneadingTolerance: "medium", note: null },
  { id: "wheat_550", name: "Weizen 550", group: "wheat", absorptionFactor: 1.0, kneadingTolerance: "medium", note: null },
  { id: "wheat_1050", name: "Weizen 1050", group: "wheat", absorptionFactor: 1.05, kneadingTolerance: "medium", note: null },
  {
    id: "wheat_wholegrain",
    name: "Weizen Vollkorn",
    group: "wheat",
    absorptionFactor: 1.15,
    kneadingTolerance: "low",
    note: "Kleie schwächt das Klebergerüst, kürzer kneten.",
  },
  { id: "spelt_630", name: "Dinkel 630", group: "spelt", absorptionFactor: 0.92, kneadingTolerance: "low", note: SPELT_NOTE },
  { id: "spelt_1050", name: "Dinkel 1050", group: "spelt", absorptionFactor: 0.96, kneadingTolerance: "low", note: SPELT_NOTE },
  {
    id: "spelt_wholegrain",
    name: "Dinkel Vollkorn",
    group: "spelt",
    absorptionFactor: 1.02,
    kneadingTolerance: "low",
    note: SPELT_NOTE,
  },
  { id: "rye_815", name: "Roggen 815", group: "rye", absorptionFactor: 1.08, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "rye_997", name: "Roggen 997", group: "rye", absorptionFactor: 1.11, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "rye_1150", name: "Roggen 1150", group: "rye", absorptionFactor: 1.15, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "rye_1370", name: "Roggen 1370", group: "rye", absorptionFactor: 1.19, kneadingTolerance: "low", note: RYE_NOTE },
  {
    id: "rye_wholegrain",
    name: "Roggen Vollkorn",
    group: "rye",
    absorptionFactor: 1.24,
    kneadingTolerance: "low",
    note: RYE_NOTE,
  },
  { id: "manitoba", name: "Manitoba", group: "special", absorptionFactor: 1.25, kneadingTolerance: "high", note: null },
  {
    id: "tipo_00",
    name: "Tipo 00 (Pizzamehl)",
    group: "special",
    absorptionFactor: 0.98,
    kneadingTolerance: "medium",
    note: "Der Wasserbedarf weicht je nach Packung (Kleberstärke) ab.",
  },
  { id: "other_flour", name: "Sonstiges Mehl", group: "other", absorptionFactor: 1.0, kneadingTolerance: "medium", note: null },
];

/** Mehltyp einer neuen Mehlzeile (AC-2). */
export const DEFAULT_FLOUR_TYPE_ID = "wheat_550" satisfies FlourTypeId;
/** Mehltyp mit freiem Namen (AC-10). */
export const OTHER_FLOUR_TYPE_ID = "other_flour" satisfies FlourTypeId;

const FLOUR_TYPES_BY_ID: ReadonlyMap<string, FlourType> = new Map(FLOUR_TYPES.map((flour) => [flour.id, flour]));

export function isFlourTypeId(value: unknown): value is FlourTypeId {
  return typeof value === "string" && FLOUR_TYPES_BY_ID.has(value);
}

export function getFlourType(id: FlourTypeId): FlourType {
  const flour = FLOUR_TYPES_BY_ID.get(id);
  if (!flour) throw new Error(`Unbekannter Mehltyp: ${id}.`);
  return flour;
}

/** trim() + toLowerCase(); innere Leerzeichen bleiben unverändert. */
export function normalizeFlourName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Katalogeintrag, dessen name nach normalizeFlourName gleich ist, sonst undefined (Migration AC-11).
 * Findet auch „Sonstiges Mehl“ (other_flour). Kein Teilstring- oder Unscharf-Abgleich.
 */
export function findFlourTypeByName(name: string): FlourType | undefined {
  const normalized = normalizeFlourName(name);
  if (normalized === "") return undefined;
  return FLOUR_TYPES.find((flour) => normalizeFlourName(flour.name) === normalized);
}

export interface FlourPortion {
  flourType: FlourTypeId;
  amountGrams: number;
}

/** Summe amountGrams × absorptionFactor, ungerundet. */
export function calculateFlourAbsorption(flours: readonly FlourPortion[]): number {
  return flours.reduce(
    (sum, flour) => sum + flour.amountGrams * getFlourType(flour.flourType).absorptionFactor,
    0,
  );
}

function hasValidAmounts(flours: readonly FlourPortion[]): boolean {
  return flours.every((flour) => Number.isFinite(flour.amountGrams) && flour.amountGrams >= 0);
}

/**
 * currentWater × Absorption(newFlours) / Absorption(originalFlours), ungerundet. Die Einheit von
 * currentWater bleibt erhalten (der Rechner übergibt das Wasser-Bäckerprozent). Gibt currentWater
 * unverändert zurück, wenn currentWater nicht endlich ist, eine Grammangabe nicht endlich oder negativ ist
 * oder eine der beiden Absorptionssummen nicht > 0 ist (AC-8). Wirft nie.
 */
export function calculateAdjustedWaterForFlourSwap(
  originalFlours: readonly FlourPortion[],
  newFlours: readonly FlourPortion[],
  currentWater: number,
): number {
  if (!Number.isFinite(currentWater)) return currentWater;
  if (!hasValidAmounts(originalFlours) || !hasValidAmounts(newFlours)) return currentWater;
  if (![...originalFlours, ...newFlours].every((flour) => isFlourTypeId(flour.flourType))) return currentWater;
  const before = calculateFlourAbsorption(originalFlours);
  const after = calculateFlourAbsorption(newFlours);
  if (!(Number.isFinite(before) && before > 0) || !(Number.isFinite(after) && after > 0)) return currentWater;
  return (currentWater * after) / before;
}

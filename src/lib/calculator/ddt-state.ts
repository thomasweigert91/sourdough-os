// Zustand und Auswertung des DDT-Rechners (F010). Rechnung und Meldungen kommen aus F009.
import {
  FRICTION_PRESETS,
  MISSING_CUSTOM_FRICTION_MESSAGE,
  NEGATIVE_FRICTION_MESSAGE,
  NON_FINITE_DOUGH_TEMPERATURE_MESSAGE,
  NON_FINITE_FLOUR_TEMPERATURE_MESSAGE,
  NON_FINITE_FRICTION_MESSAGE,
  NON_FINITE_ROOM_TEMPERATURE_MESSAGE,
  NON_FINITE_STARTER_TEMPERATURE_MESSAGE,
  calculateWaterTemperature,
  type DdtParams,
  type DdtResult,
  type KneadingMethod,
} from "@/lib/baking-engine/ddt";
import { formatDecimal } from "./format";
import { KNEADING_METHOD_NAMES } from "./messages";

export interface DdtState {
  desiredDoughTemperature: number;
  roomTemperature: number;
  flourTemperature: number;
  starterTemperature: number;
  kneadingMethod: KneadingMethod;
  /** Nur bei "custom" an die Engine übergeben. */
  customFriction: number;
}

export type DdtField =
  | "desiredDoughTemperature"
  | "roomTemperature"
  | "flourTemperature"
  | "starterTemperature"
  | "customFriction";

export const DEFAULT_DDT_STATE: DdtState = {
  desiredDoughTemperature: 25,
  roomTemperature: 22,
  flourTemperature: 22,
  starterTemperature: 22,
  kneadingMethod: "hand",
  customFriction: 0,
};

export const DDT_SLIDER_RANGE = { min: 18, max: 32, step: 0.5 } as const;
export const AMBIENT_SLIDER_RANGE = { min: -10, max: 40, step: 0.5 } as const;

export const KNEADING_METHODS = ["hand", "stand_mixer", "spiral", "custom"] as const satisfies readonly KneadingMethod[];

function kneadingMethodLabel(method: KneadingMethod): string {
  if (method === "custom") return KNEADING_METHOD_NAMES.custom;
  return `${KNEADING_METHOD_NAMES[method]} (+${formatDecimal(FRICTION_PRESETS[method], 0)} °C)`;
}

/** Reihenfolge hand, stand_mixer, spiral, custom; Reibungswerte aus FRICTION_PRESETS. */
export const KNEADING_METHOD_OPTIONS: ReadonlyArray<{ value: KneadingMethod; label: string }> =
  KNEADING_METHODS.map((value) => ({ value, label: kneadingMethodLabel(value) }));

export interface DdtEvaluation {
  errors: Partial<Record<DdtField, string>>;
  /** null bei Fehler */
  result: DdtResult | null;
}

const MESSAGE_FIELDS: ReadonlyMap<string, DdtField> = new Map<string, DdtField>([
  [NON_FINITE_DOUGH_TEMPERATURE_MESSAGE, "desiredDoughTemperature"],
  [NON_FINITE_ROOM_TEMPERATURE_MESSAGE, "roomTemperature"],
  [NON_FINITE_FLOUR_TEMPERATURE_MESSAGE, "flourTemperature"],
  [NON_FINITE_STARTER_TEMPERATURE_MESSAGE, "starterTemperature"],
  [NEGATIVE_FRICTION_MESSAGE, "customFriction"],
  [NON_FINITE_FRICTION_MESSAGE, "customFriction"],
  [MISSING_CUSTOM_FRICTION_MESSAGE, "customFriction"],
]);

export function evaluateDdt(state: DdtState): DdtEvaluation {
  const params: DdtParams = {
    desiredDoughTemperature: state.desiredDoughTemperature,
    roomTemperature: state.roomTemperature,
    flourTemperature: state.flourTemperature,
    starterTemperature: state.starterTemperature,
    kneadingMethod: state.kneadingMethod,
    ...(state.kneadingMethod === "custom" ? { customFriction: state.customFriction } : {}),
  };
  try {
    return { errors: {}, result: calculateWaterTemperature(params) };
  } catch (error) {
    const field = error instanceof Error ? MESSAGE_FIELDS.get(error.message) : undefined;
    if (!field || !(error instanceof Error)) throw error;
    return { errors: { [field]: error.message }, result: null };
  }
}

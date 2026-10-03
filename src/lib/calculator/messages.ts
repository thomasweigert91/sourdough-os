// Neue UI-Texte des Rechners (F010, F011). Meldungen der Rechen-Engine (F007–F009) werden nicht
// dupliziert, sondern aus `@/lib/baking-engine/*` importiert.
import type { IngredientType } from "@/db/schema/recipes";
import type { DdtStatus, KneadingMethod } from "@/lib/baking-engine/ddt";
import type { FlourGroup } from "@/lib/baking-engine/flour-types";

export const CALCULATOR_TITLE = "Rechner";
export const HYDRATION_SECTION_TITLE = "Hydratations-Rechner";
export const DDT_SECTION_TITLE = "DDT-Rechner";
export const SAVE_SECTION_TITLE = "Speichern";

export const BASIS_LEGEND = "Basis";
export const BASIS_FLOUR_LABEL = "Basis: Gesamtmehl";
export const BASIS_DOUGH_LABEL = "Basis: Ziel-Teiggewicht";
export const FLOUR_BASIS_LABEL = "Gesamtmehl (g)";
export const DOUGH_WEIGHT_LABEL = "Ziel-Teiggewicht (g)";

export const INGREDIENT_LIST_LABEL = "Zutaten";
export const NAME_LABEL = "Name";
export const TYPE_LABEL = "Typ";
export const ADDITIVE_TYPE_LABELS = { salt: "Salz", other: "Sonstiges" } as const;
export const DEFAULT_INGREDIENT_NAMES = {
  flour: "Mehl",
  water: "Wasser",
  starter: "Starter",
  salt: "Salz",
  other: "Sonstiges",
} as const satisfies Record<IngredientType, string>;
export const FLOUR_TYPE_LABEL = "Mehltyp";
export const FLOUR_GROUP_LABELS = {
  wheat: "Weizen",
  spelt: "Dinkel",
  rye: "Roggen",
  special: "Sonderfälle",
} as const satisfies Record<Exclude<FlourGroup, "other">, string>;
export const ADJUST_WATER_ON_FLOUR_SWAP_LABEL =
  "Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)";
export const GRAMS_LABEL = "Gramm (g)";
export const PERCENT_LABEL = "Prozent (%)";
export const STARTER_HYDRATION_LABEL = "Starter-Hydratation (%)";
export const ADD_FLOUR_LABEL = "Mehl hinzufügen";
export const ADD_INGREDIENT_LABEL = "Zutat hinzufügen";
export const REMOVE_LABEL = "Entfernen";

export function removeIngredientLabel(name: string): string {
  return `${name} entfernen`;
}

export const NET_HYDRATION_LABEL = "Netto-Hydratation";
export const DOUGH_YIELD_LABEL = "Teigausbeute (TA)";
/** Anzeige ohne Wert (Halbgeviertstrich U+2013). */
export const NO_VALUE = "–";

export const DDT_LABEL = "Ziel-Teigtemperatur (DDT)";
export const ROOM_TEMPERATURE_LABEL = "Raumtemperatur";
export const FLOUR_TEMPERATURE_LABEL = "Mehltemperatur";
export const STARTER_TEMPERATURE_LABEL = "Startertemperatur";
export const KNEADING_METHOD_LABEL = "Knetmethode";
export const KNEADING_METHOD_NAMES = {
  hand: "Handknetung",
  stand_mixer: "Küchenmaschine",
  spiral: "Spiralkneter",
  custom: "Eigener Wert",
} as const satisfies Record<KneadingMethod, string>;
export const CUSTOM_FRICTION_LABEL = "Knetreibung (°C)";
export const WATER_TEMPERATURE_LABEL = "Wassertemperatur";
export const WARNING_LABELS = {
  cold_warning: "Kalt",
  heat_warning: "Heiß",
} as const satisfies Record<Exclude<DdtStatus, "ok">, string>;

export const RECIPE_NAME_LABEL = "Rezeptname";
export const SAVE_RECIPE_LABEL = "Als Rezept speichern";
export const SAVING_LABEL = "Speichern …";

export function recipeSavedMessage(name: string): string {
  return `Rezept „${name}“ gespeichert.`;
}

export const RECIPE_NAME_REQUIRED_MESSAGE = "Bitte gib einen Rezeptnamen ein.";
export const SAVE_FAILED_MESSAGE =
  "Das Rezept konnte nicht gespeichert werden. Bitte versuche es erneut.";
export const SAVE_LOCAL_LABEL = "Lokal merken";
export const SAVED_LOCAL_MESSAGE = "Auf diesem Gerät gemerkt.";
export const SIGN_IN_HINT = "Melde dich an, um Rezepte in deinem Konto zu speichern.";
export const SIGN_IN_LINK_LABEL = "Anmelden";
export const CALCULATOR_LINK_LABEL = "Zum Rechner";

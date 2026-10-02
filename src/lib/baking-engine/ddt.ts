/**
 * Rechen-Engine für die Schüttwassertemperatur nach dem Vier-Faktoren-Modell.
 *
 * Formel (alle Werte in °C):
 *   Wassertemperatur = 4 × DDT − (Mehl + Raum + Starter + Knetreibung)
 *
 * DDT ist die Ziel-Teigtemperatur (Desired Dough Temperature). Die Knetreibung ergibt sich
 * aus einem Preset der Knetart oder einem eigenen Wert.
 *
 * Alle Werte werden ungerundet zurückgegeben; gerundet wird erst in der Anzeige.
 */

/** Knetarten. "custom" verlangt `customFriction`. */
export type KneadingMethod = "hand" | "stand_mixer" | "spiral" | "custom";
export type PresetKneadingMethod = Exclude<KneadingMethod, "custom">;

/** Reibungswerte der Presets in °C. */
export const FRICTION_PRESETS = {
  hand: 1,
  stand_mixer: 5,
  spiral: 9,
} as const satisfies Record<PresetKneadingMethod, number>;

/** Unter diesem Wert (°C) gilt Kaltwarnung, der Wert selbst ist "ok". */
export const COLD_WATER_THRESHOLD = 4;
/** Über diesem Wert (°C) gilt Hitzewarnung, der Wert selbst ist "ok". */
export const HOT_WATER_THRESHOLD = 45;
/** Puffer für Gleitkommafehler beim Grenzwertvergleich (z. B. 3,999999999999993). */
const FLOAT_EPSILON = 1e-9;

export type DdtStatus = "ok" | "cold_warning" | "heat_warning";

export interface DdtParams {
  /** Ziel-Teigtemperatur (DDT) in °C. */
  desiredDoughTemperature: number;
  /** Mehltemperatur in °C, darf negativ sein. */
  flourTemperature: number;
  /** Raumtemperatur in °C, darf negativ sein. */
  roomTemperature: number;
  /** Startertemperatur in °C, darf negativ sein. */
  starterTemperature: number;
  kneadingMethod: KneadingMethod;
  /** Nur bei "custom" ausgewertet (Pflicht, endlich, >= 0); bei Presets ignoriert, auch nicht validiert. */
  customFriction?: number;
}

export interface DdtResult {
  /** Benötigte Schüttwassertemperatur in °C, ungerundet, auch negativ möglich. */
  waterTemperature: number;
  /** Tatsächlich verwendeter Reibungswert in °C (Preset oder Custom). */
  frictionFactor: number;
  status: DdtStatus;
  /** Anzeigefertige Meldung bei Warnung, sonst null. */
  message: string | null;
}

export const COLD_WARNING_MESSAGE = "Eiswasser erforderlich";
export const HEAT_WARNING_MESSAGE = "Kritische Temperatur für Starter-Mikroben!";

export const NON_FINITE_DOUGH_TEMPERATURE_MESSAGE = "Die Teigtemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_FLOUR_TEMPERATURE_MESSAGE = "Die Mehltemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_ROOM_TEMPERATURE_MESSAGE = "Die Raumtemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_STARTER_TEMPERATURE_MESSAGE =
  "Die Startertemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_FRICTION_MESSAGE = "Die Knetreibung muss eine gültige Zahl sein.";
export const NEGATIVE_FRICTION_MESSAGE = "Die Knetreibung darf nicht negativ sein.";
export const MISSING_CUSTOM_FRICTION_MESSAGE =
  "Für eigene Knetreibung muss ein Wert angegeben werden.";

/** Meldung für eine Knetart, die die Engine nicht kennt. */
export function unknownKneadingMethodMessage(method: string): string {
  return `Unbekannte Knetart: ${method}.`;
}

/** Wirft `nonFiniteMessage` bei NaN, Infinity und -Infinity. */
function assertFinite(value: number, nonFiniteMessage: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(nonFiniteMessage);
  }
}

/**
 * Ermittelt den Reibungswert in °C. Bei einem Preset wird `customFriction` weder gelesen
 * noch geprüft. Wirft bei unbekannter Knetart, statt `NaN` zu liefern; eine neue Knetart
 * fällt außerdem schon bei der Typprüfung im `default`-Zweig auf.
 */
function resolveFriction(params: DdtParams): number {
  switch (params.kneadingMethod) {
    case "hand":
    case "stand_mixer":
    case "spiral":
      return FRICTION_PRESETS[params.kneadingMethod];
    case "custom": {
      const { customFriction } = params;
      if (customFriction === undefined) {
        throw new Error(MISSING_CUSTOM_FRICTION_MESSAGE);
      }
      assertFinite(customFriction, NON_FINITE_FRICTION_MESSAGE);
      if (customFriction < 0) {
        throw new Error(NEGATIVE_FRICTION_MESSAGE);
      }
      return customFriction;
    }
    default: {
      const unknownMethod: never = params.kneadingMethod;
      throw new Error(unknownKneadingMethodMessage(String(unknownMethod)));
    }
  }
}

/**
 * Berechnet die benötigte Schüttwassertemperatur in °C und ordnet einen Status zu:
 * unter 4 °C `cold_warning`, über 45 °C `heat_warning`, sonst (inkl. der Grenzwerte) `ok`.
 * Wirft bei nicht endlichen Eingaben, fehlender oder negativer eigener Knetreibung.
 */
export function calculateWaterTemperature(params: DdtParams): DdtResult {
  const { desiredDoughTemperature, flourTemperature, roomTemperature, starterTemperature } =
    params;

  assertFinite(desiredDoughTemperature, NON_FINITE_DOUGH_TEMPERATURE_MESSAGE);
  assertFinite(flourTemperature, NON_FINITE_FLOUR_TEMPERATURE_MESSAGE);
  assertFinite(roomTemperature, NON_FINITE_ROOM_TEMPERATURE_MESSAGE);
  assertFinite(starterTemperature, NON_FINITE_STARTER_TEMPERATURE_MESSAGE);

  const frictionFactor = resolveFriction(params);

  const waterTemperature =
    4 * desiredDoughTemperature -
    (flourTemperature + roomTemperature + starterTemperature + frictionFactor);

  if (waterTemperature < COLD_WATER_THRESHOLD - FLOAT_EPSILON) {
    return { waterTemperature, frictionFactor, status: "cold_warning", message: COLD_WARNING_MESSAGE };
  }
  if (waterTemperature > HOT_WATER_THRESHOLD + FLOAT_EPSILON) {
    return { waterTemperature, frictionFactor, status: "heat_warning", message: HEAT_WARNING_MESSAGE };
  }
  return { waterTemperature, frictionFactor, status: "ok", message: null };
}

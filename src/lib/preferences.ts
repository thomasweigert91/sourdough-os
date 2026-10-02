// Nutzer-Präferenzen: Typen und Eingabeprüfung. Gemeinsam für Client und Server, ohne Imports.

export const TEMPERATURE_UNITS = ["C", "F"] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export interface Preferences {
  temperatureUnit: TemperatureUnit;
}

/** Antwort von /api/preferences. updatedAt als ISO-String, null ohne gespeicherte Zeile. */
export interface PreferencesDto {
  temperatureUnit: TemperatureUnit;
  updatedAt: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = { temperatureUnit: "C" };

function isTemperatureUnit(value: unknown): value is TemperatureUnit {
  return typeof value === "string" && (TEMPERATURE_UNITS as readonly string[]).includes(value);
}

/** PUT-Body { temperatureUnit, updatedAt: ISO }. Ungültig → null. */
export function parsePreferencesInput(
  body: unknown,
): { temperatureUnit: TemperatureUnit; updatedAt: Date } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { temperatureUnit, updatedAt } = body as Record<string, unknown>;
  if (!isTemperatureUnit(temperatureUnit)) return null;
  if (typeof updatedAt !== "string") return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return { temperatureUnit, updatedAt: date };
}

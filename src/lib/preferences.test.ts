import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, parsePreferencesInput } from "@/lib/preferences";

const ISO = "2026-10-02T08:30:00.000Z";

describe("F005 parsePreferencesInput", () => {
  it.each(["C", "F"] as const)(
    "F005/AC-5 akzeptiert temperatureUnit „%s“ mit gültigem ISO-Datum",
    (unit) => {
      const parsed = parsePreferencesInput({ temperatureUnit: unit, updatedAt: ISO });

      expect(parsed).not.toBeNull();
      expect(parsed?.temperatureUnit).toBe(unit);
      expect(parsed?.updatedAt).toBeInstanceOf(Date);
      expect(parsed?.updatedAt.toISOString()).toBe(ISO);
    },
  );

  it.each([
    ["unbekannte Einheit K", { temperatureUnit: "K", updatedAt: ISO }],
    ["Kleinbuchstabe c", { temperatureUnit: "c", updatedAt: ISO }],
    ["fehlende Einheit", { updatedAt: ISO }],
    ["fehlendes updatedAt", { temperatureUnit: "F" }],
    ["updatedAt als Zahl", { temperatureUnit: "F", updatedAt: 1_700_000_000_000 }],
    ["ungültiges updatedAt", { temperatureUnit: "F", updatedAt: "kein-datum" }],
    ["null", null],
    ["String", "F"],
    ["Array", ["F", ISO]],
  ])("F005/AC-5 lehnt ungültige Eingaben ab (%s)", (_label, body) => {
    expect(parsePreferencesInput(body)).toBeNull();
  });

  it("F005/AC-4 Standard-Präferenz ist Celsius", () => {
    expect(DEFAULT_PREFERENCES).toEqual({ temperatureUnit: "C" });
  });
});

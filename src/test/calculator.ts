// Test-Helfer für die Rechner-Komponententests (F010, F011). Nur für Tests gedacht.
// Zugriff ausschließlich über Rollen und zugängliche Namen.
import { expect } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

export const REFERENCE_NAMES = ["Weizen 550", "Roggen 1150", "Wasser", "Starter", "Salz"];

export const ADJUST_WATER_SWITCH_LABEL =
  "Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)";

/**
 * Zeilengruppe (role="group", Name = Zutatenname) innerhalb von `container`.
 * <optgroup>-Elemente einer Auswahl (z. B. „Dinkel“ in der Mehltyp-Auswahl) haben
 * implizit ebenfalls role="group" und werden deshalb ausgeschlossen.
 * Wirft wie getByRole, wenn nicht genau eine Zeilengruppe passt.
 */
function rowGroup(container: HTMLElement, name: string): HTMLElement {
  const groups = within(container)
    .queryAllByRole("group", { name })
    .filter((element) => element.closest("select") === null);
  if (groups.length !== 1) {
    throw new Error(
      `Erwartet genau eine Zeilengruppe (role="group") mit Namen "${name}", gefunden: ${groups.length}`,
    );
  }
  return groups[0];
}

/** Zeile der Zutatenliste (role="group", Name = Zutatenname). */
export function ingredientGroup(name: string): HTMLElement {
  return rowGroup(screen.getByRole("list", { name: "Zutaten" }), name);
}

export function gramsField(name: string): HTMLInputElement {
  return within(ingredientGroup(name)).getByRole("textbox", { name: "Gramm (g)" }) as HTMLInputElement;
}

export function percentField(name: string): HTMLInputElement {
  return within(ingredientGroup(name)).getByRole("textbox", { name: "Prozent (%)" }) as HTMLInputElement;
}

/** Auswahl „Mehltyp“ der Mehlzeile mit diesem Namen (F011). */
export function flourTypeSelect(name: string): HTMLSelectElement {
  return within(ingredientGroup(name)).getByRole("combobox", { name: "Mehltyp" }) as HTMLSelectElement;
}

/** Schalter für die automatische Wasseranpassung bei Mehlwechsel (F011). */
export function adjustWaterSwitch(): HTMLInputElement {
  return screen.getByRole("switch", { name: ADJUST_WATER_SWITCH_LABEL }) as HTMLInputElement;
}

export function starterHydrationField(): HTMLInputElement {
  return within(ingredientGroup("Starter")).getByRole("textbox", {
    name: "Starter-Hydratation (%)",
  }) as HTMLInputElement;
}

export function textbox(name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

export function slider(name: string): HTMLInputElement {
  return screen.getByRole("slider", { name }) as HTMLInputElement;
}

/** Kennzahl aus der Definitionsliste (<dd aria-labelledby>), z. B. „Netto-Hydratation“. */
export function metric(name: string): HTMLElement {
  return screen.getByRole("definition", { name });
}

export function metricText(name: string): string {
  return (metric(name).textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Listenelemente der Zutatenliste in DOM-Reihenfolge. */
export function ingredientItems(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Zutaten" })).getAllByRole("listitem");
}

/** Prüft, dass die Zutatenliste genau diese Zeilen in dieser Reihenfolge enthält. */
export function expectIngredientOrder(names: string[]): void {
  const items = ingredientItems();
  expect(items).toHaveLength(names.length);
  names.forEach((name, index) => {
    expect(rowGroup(items[index], name)).toBeInTheDocument();
  });
}

export function expectGrams(names: string[], values: string[]): void {
  names.forEach((name, index) => expect(gramsField(name)).toHaveValue(values[index]));
}

export function expectPercents(names: string[], values: string[]): void {
  names.forEach((name, index) => expect(percentField(name)).toHaveValue(values[index]));
}

/** Slider über change setzen (jsdom kennt keine Pfeiltasten-Logik für type="range"). */
export function setSlider(name: string, value: number): void {
  fireEvent.change(slider(name), { target: { value: String(value) } });
}

/** Alle aria-live="polite"-Bereiche, die gerade im DOM stehen. */
export function politeRegions(): Set<Element> {
  return new Set(document.querySelectorAll('[aria-live="polite"]'));
}

/** Liegt das Element in einem Live-Bereich (aria-live oder implizit über role status/alert/log)? */
export function isInLiveRegion(element: Element): boolean {
  return element.closest('[aria-live], [role="status"], [role="alert"], [role="log"]') !== null;
}

// Test-Helfer für die Rechner-Komponententests (F010). Nur für Tests gedacht.
// Zugriff ausschließlich über Rollen und zugängliche Namen.
import { expect } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

export const REFERENCE_NAMES = ["Weizenmehl", "Roggenmehl", "Wasser", "Starter", "Salz"];

/** Zeile der Zutatenliste (role="group", Name = Zutatenname). */
export function ingredientGroup(name: string): HTMLElement {
  return within(screen.getByRole("list", { name: "Zutaten" })).getByRole("group", { name });
}

export function gramsField(name: string): HTMLInputElement {
  return within(ingredientGroup(name)).getByRole("textbox", { name: "Gramm (g)" }) as HTMLInputElement;
}

export function percentField(name: string): HTMLInputElement {
  return within(ingredientGroup(name)).getByRole("textbox", { name: "Prozent (%)" }) as HTMLInputElement;
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
    expect(within(items[index]).getByRole("group", { name })).toBeInTheDocument();
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

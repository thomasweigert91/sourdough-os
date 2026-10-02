import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveRecipe: vi.fn() }));

vi.mock("@/app/calculator/actions", () => ({ saveRecipe: mocks.saveRecipe }));

import { Calculator } from "@/components/calculator/calculator";
import type { CalculatorOwner } from "@/lib/calculator/local-draft";
import {
  REFERENCE_NAMES,
  expectGrams,
  expectIngredientOrder,
  expectPercents,
  gramsField,
  ingredientGroup,
  ingredientItems,
  isInLiveRegion,
  metric,
  metricText,
  percentField,
  politeRegions,
  starterHydrationField,
  textbox,
} from "@/test/calculator";

const GUEST: CalculatorOwner = { kind: "guest" };
const U1: CalculatorOwner = { kind: "user", userId: "u1" };

const FLOUR_SUM_MESSAGE = "Die Mehlanteile müssen zusammen 100 % ergeben.";
const NEGATIVE_GRAMS = "Grammangaben dürfen nicht negativ sein.";
const INVALID_FLOUR_BASIS = "Die Mehlbasis muss größer als 0 g sein.";
const INVALID_DOUGH_WEIGHT = "Das Teiggewicht muss größer als 0 g sein.";
const NO_VALUE = "–";

async function replaceValue(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, text);
}

function expectMetrics(hydration: string, doughYield: string) {
  expect(metric("Netto-Hydratation")).toHaveTextContent(hydration);
  expect(metric("Teigausbeute (TA)")).toHaveTextContent(doughYield);
}

function expectNoMetrics() {
  expect(metricText("Netto-Hydratation")).toBe(NO_VALUE);
  expect(metricText("Teigausbeute (TA)")).toBe(NO_VALUE);
}

beforeEach(() => {
  mocks.saveRecipe.mockReset();
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("F010 Hydratations-Rechner: Basis Gesamtmehl", () => {
  it("F010/AC-1 zeigt beim Öffnen das Referenzrezept mit Basis Gesamtmehl 1000 g", () => {
    render(<Calculator owner={GUEST} />);

    expect(screen.getByRole("heading", { name: "Hydratations-Rechner" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Basis: Gesamtmehl" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" })).not.toBeChecked();
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
    expectIngredientOrder(REFERENCE_NAMES);
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
    expectPercents(REFERENCE_NAMES, ["80,0", "20,0", "70,0", "20,0", "2,0"]);
    expect(starterHydrationField()).toHaveValue("100,0");
    expectMetrics("72,7 %", "172,7");
  });

  it("F010/AC-1 rechnet beim Eintippen von Gesamtmehl ohne weiteren Klick alle Gramm und Kennzahlen neu", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const flourBasis = textbox("Gesamtmehl (g)");

    await replaceValue(user, flourBasis, "500");
    expectGrams(REFERENCE_NAMES, ["400", "100", "350", "100", "10"]);

    await replaceValue(user, flourBasis, "1000");

    expect(flourBasis).toHaveValue("1000");
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
    expectMetrics("72,7 %", "172,7");
    expect(metricText("Netto-Hydratation")).toBe("72,7 %");
    expect(metricText("Teigausbeute (TA)")).toBe("172,7");
  });

  it("F010/AC-1 zeigt bei Starter-Hydratation 50 % die Netto-Hydratation 67,6 % und TA 167,6", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await replaceValue(user, starterHydrationField(), "50");

    expect(starterHydrationField()).toHaveValue("50");
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
    expect(metricText("Netto-Hydratation")).toBe("67,6 %");
    expect(metricText("Teigausbeute (TA)")).toBe("167,6");
  });

  it("F010/AC-1 ordnet die Bereiche von oben nach unten: Hydratations-Rechner, DDT-Rechner, Speichern", () => {
    render(<Calculator owner={GUEST} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Hydratations-Rechner", "DDT-Rechner", "Speichern"]);
  });

  it("F010/AC-1 Kennzahlen liegen in keinem Live-Bereich (kein Vorlesen bei jedem Zwischenschritt)", () => {
    render(<Calculator owner={GUEST} />);

    expect(isInLiveRegion(metric("Netto-Hydratation"))).toBe(false);
    expect(isInLiveRegion(metric("Teigausbeute (TA)"))).toBe(false);
  });
});

describe("F010 Hydratations-Rechner: Gramm und Prozent", () => {
  it("F010/AC-2 Wasser-Gramm 750 ergibt 75,0 %, Hydratation 77,3 % und TA 177,3, Gesamtmehl bleibt 1000", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const waterGrams = gramsField("Wasser");

    await replaceValue(user, waterGrams, "750");

    expect(waterGrams).toHaveValue("750");
    expect(waterGrams).toHaveFocus();
    expect(percentField("Wasser")).toHaveValue("75,0");
    expectMetrics("77,3 %", "177,3");
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
    expectGrams(["Weizenmehl", "Roggenmehl", "Starter", "Salz"], ["800", "200", "200", "20"]);
  });

  it("F010/AC-2 Salz-Prozent „2,5“ ergibt 25 g, das Feld behält beim Tippen den Rohtext", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const saltPercent = percentField("Salz");

    await user.clear(saltPercent);
    await user.type(saltPercent, "2,");
    expect(saltPercent).toHaveValue("2,");

    await user.type(saltPercent, "5");
    expect(saltPercent).toHaveValue("2,5");
    expect(gramsField("Salz")).toHaveValue("25");
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");

    await user.tab();
    expect(saltPercent).toHaveValue("2,5");
    expect(gramsField("Salz")).toHaveValue("25");
  });

  it("F010/AC-2 Salz-Prozent mit Punkt „2.5“ wird ebenfalls akzeptiert und deutsch angezeigt", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const saltPercent = percentField("Salz");

    await replaceValue(user, saltPercent, "2.5");

    expect(saltPercent).toHaveValue("2.5");
    expect(gramsField("Salz")).toHaveValue("25");
    await user.tab();
    expect(saltPercent).toHaveValue("2,5");
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
  });

  it("F010/AC-2 Mehl-Gramm ändern macht die Mehlsumme zur neuen Basis (Q4)", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await replaceValue(user, gramsField("Weizenmehl"), "900");
    await user.tab();

    expect(textbox("Gesamtmehl (g)")).toHaveValue("1100");
    expect(percentField("Weizenmehl")).toHaveValue("81,8");
    expect(gramsField("Wasser")).toHaveValue("700");
    expect(percentField("Wasser")).toHaveValue("63,6");
  });
});

describe("F010 Hydratations-Rechner: Basis Ziel-Teiggewicht", () => {
  it("F010/AC-3 Umschalten belegt „Ziel-Teiggewicht (g)“ mit 1920 vor, 960 halbiert die Gramm", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.click(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" }));

    expect(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" })).toBeChecked();
    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("1920");
    expect(screen.queryByRole("textbox", { name: "Gesamtmehl (g)" })).not.toBeInTheDocument();
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
    expectPercents(REFERENCE_NAMES, ["80,0", "20,0", "70,0", "20,0", "2,0"]);

    await replaceValue(user, textbox("Ziel-Teiggewicht (g)"), "960");

    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("960");
    expectGrams(REFERENCE_NAMES, ["400", "100", "350", "100", "10"]);
    expectPercents(REFERENCE_NAMES, ["80,0", "20,0", "70,0", "20,0", "2,0"]);
    expectMetrics("72,7 %", "172,7");
  });

  it("F010/AC-3 der Basis-Umschalter ist per Tab erreichbar und mit Pfeiltasten und Leertaste bedienbar", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const flourRadio = screen.getByRole("radio", { name: "Basis: Gesamtmehl" });
    const doughRadio = screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" });

    for (let i = 0; i < 10 && document.activeElement !== flourRadio; i += 1) {
      await user.tab();
    }
    expect(flourRadio).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(doughRadio).toBeChecked();
    expect(doughRadio).toHaveFocus();
    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("1920");

    await user.keyboard("{ArrowUp}");
    expect(flourRadio).toBeChecked();
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");

    act(() => doughRadio.focus());
    expect(doughRadio).not.toBeChecked();
    await user.keyboard(" ");
    expect(doughRadio).toBeChecked();
    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("1920");
  });
});

describe("F010 Hydratations-Rechner: Zeilen hinzufügen und entfernen", () => {
  it("F010/AC-4 „Mehl hinzufügen“ fügt nach den Mehlen eine leere Zeile ein und fokussiert deren Namensfeld", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.click(screen.getByRole("button", { name: "Mehl hinzufügen" }));

    const items = ingredientItems();
    expect(items).toHaveLength(6);
    const newRow = within(items[2]).getByRole("group", { name: "Mehl" });
    const nameField = within(newRow).getByRole("textbox", { name: "Name" });
    expect(nameField).toHaveValue("");
    expect(nameField).toHaveFocus();
    expect(within(newRow).getByRole("textbox", { name: "Gramm (g)" })).toHaveValue("0");
    expect(within(newRow).getByRole("textbox", { name: "Prozent (%)" })).toHaveValue("0,0");
    expectIngredientOrder(["Weizenmehl", "Roggenmehl", "Mehl", "Wasser", "Starter", "Salz"]);

    await user.keyboard("Dinkel");
    expect(ingredientGroup("Dinkel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dinkel entfernen" })).toBeEnabled();
  });

  it("F010/AC-4 „Zutat hinzufügen“ hängt eine Zeile mit Typauswahl Salz/Sonstiges und 0 % / 0 g an", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.click(screen.getByRole("button", { name: "Zutat hinzufügen" }));

    const items = ingredientItems();
    expect(items).toHaveLength(6);
    const newRow = within(items[5]).getByRole("group", { name: "Sonstiges" });
    const typeSelect = within(newRow).getByRole("combobox", { name: "Typ" });
    expect(within(typeSelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Salz",
      "Sonstiges",
    ]);
    expect(typeSelect).toHaveDisplayValue("Sonstiges");
    expect(within(newRow).getByRole("textbox", { name: "Name" })).toHaveValue("");
    expect(within(newRow).getByRole("textbox", { name: "Gramm (g)" })).toHaveValue("0");
    expect(within(newRow).getByRole("textbox", { name: "Prozent (%)" })).toHaveValue("0,0");
    expectIngredientOrder([...REFERENCE_NAMES, "Sonstiges"]);
  });

  it("F010/AC-4 „Roggenmehl entfernen“ entfernt die Zeile, zeigt die Mehlanteil-Meldung und sperrt das letzte Mehl", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    expect(screen.queryByText(FLOUR_SUM_MESSAGE)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Roggenmehl entfernen" }));

    expect(screen.queryByRole("group", { name: "Roggenmehl" })).not.toBeInTheDocument();
    expectIngredientOrder(["Weizenmehl", "Wasser", "Starter", "Salz"]);
    expectGrams(["Weizenmehl", "Wasser", "Starter", "Salz"], ["800", "700", "200", "20"]);
    expect(screen.getByText(FLOUR_SUM_MESSAGE)).toBeVisible();
    expectNoMetrics();
    expect(screen.getByRole("button", { name: "Weizenmehl entfernen" })).toBeDisabled();
  });

  it("F010/AC-4 Wasser und Starter haben keinen Entfernen-Button, die anderen tragen den Zutatennamen", () => {
    render(<Calculator owner={GUEST} />);

    expect(screen.queryByRole("button", { name: "Wasser entfernen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Starter entfernen" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weizenmehl entfernen" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Roggenmehl entfernen" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salz entfernen" })).toBeEnabled();
  });
});

describe("F010 Hydratations-Rechner: Live-Validierung", () => {
  it("F010/AC-5 Weizenmehl 70 % zeigt die Mehlanteil-Meldung unter der Liste, bis die Eingabe korrigiert ist", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const regionsBefore = politeRegions();
    const weizenPercent = percentField("Weizenmehl");

    await replaceValue(user, weizenPercent, "70");

    const message = screen.getByText(FLOUR_SUM_MESSAGE);
    expect(message).toBeVisible();
    const list = screen.getByRole("list", { name: "Zutaten" });
    expect(list.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.contains(message)).toBe(false);
    const region = message.closest('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(regionsBefore.has(region as Element)).toBe(true);
    expect(weizenPercent).toHaveAccessibleDescription(expect.stringContaining(FLOUR_SUM_MESSAGE));
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
    expectNoMetrics();
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeDisabled();

    await replaceValue(user, weizenPercent, "80");

    expect(screen.queryByText(FLOUR_SUM_MESSAGE)).not.toBeInTheDocument();
    expect(region).toBeInTheDocument();
    expectMetrics("72,7 %", "172,7");
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeEnabled();
  });

  it("F010/AC-5 Wasser −5 g zeigt die Meldung am Wasser-Feld, bis die Eingabe korrigiert ist", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const regionsBefore = politeRegions();
    const waterGrams = gramsField("Wasser");

    await replaceValue(user, waterGrams, "-5");

    expect(waterGrams).toHaveAccessibleDescription(NEGATIVE_GRAMS);
    expect(waterGrams).toBeInvalid();
    const message = screen.getByText(NEGATIVE_GRAMS);
    expect(ingredientGroup("Wasser").contains(message)).toBe(true);
    expect(regionsBefore.has(message.closest('[aria-live="polite"]') as Element)).toBe(true);
    expectNoMetrics();
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeDisabled();

    await replaceValue(user, waterGrams, "700");

    expect(screen.queryByText(NEGATIVE_GRAMS)).not.toBeInTheDocument();
    expect(waterGrams).not.toBeInvalid();
    expectMetrics("72,7 %", "172,7");
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeEnabled();
  });

  it("F010/AC-5 Gesamtmehl 0 zeigt die Meldung am Basisfeld, bis die Eingabe korrigiert ist", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const regionsBefore = politeRegions();
    const flourBasis = textbox("Gesamtmehl (g)");

    await replaceValue(user, flourBasis, "0");

    expect(flourBasis).toHaveAccessibleDescription(INVALID_FLOUR_BASIS);
    expect(regionsBefore.has(screen.getByText(INVALID_FLOUR_BASIS).closest('[aria-live="polite"]') as Element)).toBe(
      true,
    );
    expectNoMetrics();
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeDisabled();

    await replaceValue(user, flourBasis, "1000");

    expect(screen.queryByText(INVALID_FLOUR_BASIS)).not.toBeInTheDocument();
    expectMetrics("72,7 %", "172,7");
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeEnabled();
  });

  it("F010/AC-5 Ziel-Teiggewicht 0 zeigt die Meldung am Basisfeld, bis die Eingabe korrigiert ist", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    await user.click(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" }));
    const doughWeight = textbox("Ziel-Teiggewicht (g)");

    await replaceValue(user, doughWeight, "0");

    expect(doughWeight).toHaveAccessibleDescription(INVALID_DOUGH_WEIGHT);
    expectNoMetrics();
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeDisabled();

    await replaceValue(user, doughWeight, "1920");

    expect(screen.queryByText(INVALID_DOUGH_WEIGHT)).not.toBeInTheDocument();
    expectMetrics("72,7 %", "172,7");
  });

  it("F010/AC-5 deaktiviert „Als Rezept speichern“ für angemeldete Personen, solange eine Meldung sichtbar ist", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={U1} />);
    await user.type(screen.getByRole("textbox", { name: "Rezeptname" }), "Landbrot");
    expect(screen.getByRole("button", { name: "Als Rezept speichern" })).toBeEnabled();

    await replaceValue(user, percentField("Weizenmehl"), "70");

    expect(screen.getByText(FLOUR_SUM_MESSAGE)).toBeVisible();
    expect(screen.getByRole("button", { name: "Als Rezept speichern" })).toBeDisabled();

    await replaceValue(user, percentField("Weizenmehl"), "80");

    expect(screen.getByRole("button", { name: "Als Rezept speichern" })).toBeEnabled();
    expect(mocks.saveRecipe).not.toHaveBeenCalled();
  });

  it("F010/AC-5 ein leeres Grammfeld zählt als 0 und zeigt keine Meldung (Q7)", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.clear(gramsField("Wasser"));

    expect(gramsField("Wasser")).toHaveValue("");
    expect(percentField("Wasser")).toHaveValue("0,0");
    expect(gramsField("Wasser")).not.toBeInvalid();
    // Wasser 0 g: (0 + 100) / (1000 + 100) × 100 = 9,1 %
    expectMetrics("9,1 %", "109,1");
  });
});

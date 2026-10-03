import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveRecipe: vi.fn() }));

vi.mock("@/app/calculator/actions", () => ({ saveRecipe: mocks.saveRecipe }));

import { Calculator } from "@/components/calculator/calculator";
import { DEFAULT_DDT_STATE } from "@/lib/calculator/ddt-state";
import { CALCULATOR_DRAFT_KEY, type CalculatorOwner } from "@/lib/calculator/local-draft";
import {
  REFERENCE_NAMES,
  adjustWaterSwitch,
  expectGrams,
  expectIngredientOrder,
  expectPercents,
  flourTypeSelect,
  gramsField,
  ingredientGroup,
  ingredientItems,
  metric,
  percentField,
  politeRegions,
  textbox,
} from "@/test/calculator";

const GUEST: CalculatorOwner = { kind: "guest" };
const U1: CalculatorOwner = { kind: "user", userId: "u1" };
const UUID_1 = "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f";

const FLOUR_TYPE_LABEL = "Mehltyp";
const INVALID_FLOUR_BASIS = "Die Mehlbasis muss größer als 0 g sein.";
const SAVE_LABEL = "Als Rezept speichern";
const SAVED_MESSAGE = "Rezept „Landbrot“ gespeichert.";
const SAVE_LOCAL_LABEL = "Lokal merken";
const SAVED_LOCAL = "Auf diesem Gerät gemerkt.";

const CATALOG_GROUPS = [
  { label: "Weizen", options: ["Weizen 405", "Weizen 550", "Weizen 1050", "Weizen Vollkorn"] },
  { label: "Dinkel", options: ["Dinkel 630", "Dinkel 1050", "Dinkel Vollkorn"] },
  { label: "Roggen", options: ["Roggen 815", "Roggen 997", "Roggen 1150", "Roggen 1370", "Roggen Vollkorn"] },
  { label: "Sonderfälle", options: ["Manitoba", "Tipo 00 (Pizzamehl)"] },
];

type User = ReturnType<typeof userEvent.setup>;

async function replaceValue(user: User, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, text);
}

/** Auswahl „Mehltyp“ im n-ten Listeneintrag (unabhängig vom aktuellen Mehltyp-Namen). */
function flourTypeSelectAt(index: number): HTMLSelectElement {
  return within(ingredientItems()[index]).getByRole("combobox", { name: FLOUR_TYPE_LABEL }) as HTMLSelectElement;
}

async function chooseFirstFlour(user: User, flourType: string) {
  await user.selectOptions(flourTypeSelectAt(0), flourType);
}

function expectWater(percent: string, grams: string) {
  expect(percentField("Wasser")).toHaveValue(percent);
  expect(gramsField("Wasser")).toHaveValue(grams);
}

function expectMetrics(hydration: string, doughYield: string) {
  expect(metric("Netto-Hydratation")).toHaveTextContent(hydration);
  expect(metric("Teigausbeute (TA)")).toHaveTextContent(doughYield);
}

/** Texte aller gerade sichtbaren Meldungen in Live-Bereichen. */
function visibleMessages(): string[] {
  return [...politeRegions()].map((region) => (region.textContent ?? "").trim()).filter((text) => text !== "");
}

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

function mockUuid(id: `${string}-${string}-${string}-${string}-${string}`) {
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(id);
}

function recipeNameField(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Rezeptname" }) as HTMLInputElement;
}

async function saveToAccount(user: User) {
  await user.type(recipeNameField(), "Landbrot");
  await user.click(screen.getByRole("button", { name: SAVE_LABEL }));
  expect(await screen.findByText(SAVED_MESSAGE)).toBeInTheDocument();
}

function savedIngredientNames(): string[] {
  const [input] = mocks.saveRecipe.mock.calls.at(-1) as [{ ingredients: Array<{ name: string }> }];
  return input.ingredients.map((ingredient) => ingredient.name);
}

beforeEach(() => {
  mocks.saveRecipe.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  localStorage.clear();
});

describe("F011 Mehltyp-Auswahl", () => {
  it("F011/AC-1 jede Mehlzeile hat eine Auswahl „Mehltyp“ statt des Felds „Name“, Startwerte Weizen 550 und Roggen 1150", () => {
    render(<Calculator owner={GUEST} />);

    expectIngredientOrder(REFERENCE_NAMES);
    expect(flourTypeSelect("Weizen 550")).toHaveDisplayValue("Weizen 550");
    expect(flourTypeSelect("Roggen 1150")).toHaveDisplayValue("Roggen 1150");
    expect(flourTypeSelectAt(0)).toBe(flourTypeSelect("Weizen 550"));
    expect(flourTypeSelectAt(1)).toBe(flourTypeSelect("Roggen 1150"));
    for (const name of ["Weizen 550", "Roggen 1150"]) {
      expect(within(ingredientGroup(name)).queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    }
    // Salz behält Namensfeld und Typauswahl, Wasser und Starter haben keine Mehltyp-Auswahl.
    expect(within(ingredientGroup("Salz")).getByRole("textbox", { name: "Name" })).toHaveValue("Salz");
    expect(within(ingredientGroup("Salz")).getByRole("combobox", { name: "Typ" })).toBeInTheDocument();
    for (const name of ["Wasser", "Starter", "Salz"]) {
      expect(within(ingredientGroup(name)).queryByRole("combobox", { name: FLOUR_TYPE_LABEL })).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole("combobox", { name: FLOUR_TYPE_LABEL })).toHaveLength(2);
  });

  it("F011/AC-1 die Optionen sind nach Getreide gruppiert, danach folgt „Sonstiges Mehl“ ohne Gruppe", () => {
    render(<Calculator owner={GUEST} />);
    const select = flourTypeSelect("Weizen 550");

    const groups = Array.from(select.querySelectorAll("optgroup"));
    expect(groups.map((group) => group.label)).toEqual(CATALOG_GROUPS.map((group) => group.label));
    groups.forEach((group, index) => {
      expect(Array.from(group.querySelectorAll("option")).map((option) => option.textContent)).toEqual(
        CATALOG_GROUPS[index].options,
      );
    });

    const options = within(select).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      ...CATALOG_GROUPS.flatMap((group) => group.options),
      "Sonstiges Mehl",
    ]);
    const last = options[options.length - 1];
    expect(last.closest("optgroup")).toBeNull();
    expect(last.parentElement).toBe(select);
  });

  it("F011/AC-1 die Auswahl ist per Tab erreichbar und der Entfernen-Button trägt den Mehltyp im Namen", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.click(textbox("Gesamtmehl (g)"));
    await user.tab();
    expect(adjustWaterSwitch()).toHaveFocus();
    await user.tab();
    expect(flourTypeSelect("Weizen 550")).toHaveFocus();

    expect(screen.getByRole("button", { name: "Weizen 550 entfernen" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Roggen 1150 entfernen" })).toBeEnabled();

    await user.selectOptions(flourTypeSelect("Roggen 1150"), "Roggen 997");
    expect(screen.getByRole("button", { name: "Roggen 997 entfernen" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Roggen 1150 entfernen" })).not.toBeInTheDocument();
  });

  it("F011/AC-1 die Auswahl funktioniert ohne Anmeldung und ohne Internetverbindung", async () => {
    const user = userEvent.setup();
    setNavigatorOnline(false);
    onlineManager.setOnline(false);
    render(<Calculator owner={GUEST} />);

    await user.selectOptions(flourTypeSelect("Weizen 550"), "Dinkel 630");

    expect(flourTypeSelectAt(0)).toHaveDisplayValue("Dinkel 630");
    expect(ingredientGroup("Dinkel 630")).toBeInTheDocument();
    expectWater("65,7", "657");
  });
});

describe("F011 Neue Mehlzeile", () => {
  it("F011/AC-2 „Mehl hinzufügen“ legt Weizen 550 mit 0 % / 0 g an, fokussiert „Mehltyp“, Wasser bleibt", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.click(screen.getByRole("button", { name: "Mehl hinzufügen" }));

    const items = ingredientItems();
    expect(items).toHaveLength(6);
    expectIngredientOrder(["Weizen 550", "Roggen 1150", "Weizen 550", "Wasser", "Starter", "Salz"]);
    const newRow = within(items[2]).getByRole("group", { name: "Weizen 550" });
    const select = within(newRow).getByRole("combobox", { name: FLOUR_TYPE_LABEL });
    expect(select).toHaveDisplayValue("Weizen 550");
    expect(select).toHaveFocus();
    expect(within(newRow).queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    expect(within(newRow).getByRole("textbox", { name: "Gramm (g)" })).toHaveValue("0");
    expect(within(newRow).getByRole("textbox", { name: "Prozent (%)" })).toHaveValue("0,0");
    expectWater("70,0", "700");
    expectMetrics("72,7 %", "172,7");
  });
});

describe("F011 Schalter für die automatische Anpassung", () => {
  it("F011/AC-3 der Schalter steht eingeschaltet oberhalb der Zutatenliste im Hydratations-Rechner", () => {
    render(<Calculator owner={GUEST} />);

    const toggle = adjustWaterSwitch();
    expect(toggle).toBeChecked();
    expect(toggle).toBeVisible();
    const section = screen.getByRole("region", { name: "Hydratations-Rechner" });
    expect(section.contains(toggle)).toBe(true);
    const list = screen.getByRole("list", { name: "Zutaten" });
    expect(toggle.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.contains(toggle)).toBe(false);
  });

  it("F011/AC-3 per Tab nach dem Basisfeld erreichbar, mit Leertaste und Klick umschaltbar, ohne Werte zu ändern", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const toggle = adjustWaterSwitch();

    await user.click(textbox("Gesamtmehl (g)"));
    await user.tab();
    expect(toggle).toHaveFocus();

    await user.keyboard(" ");
    expect(adjustWaterSwitch()).not.toBeChecked();
    await user.keyboard(" ");
    expect(adjustWaterSwitch()).toBeChecked();

    await user.click(toggle);
    expect(adjustWaterSwitch()).not.toBeChecked();
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
    expectPercents(REFERENCE_NAMES, ["80,0", "20,0", "70,0", "20,0", "2,0"]);
    expectMetrics("72,7 %", "172,7");

    await user.click(toggle);
    expect(adjustWaterSwitch()).toBeChecked();
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
    expectPercents(REFERENCE_NAMES, ["80,0", "20,0", "70,0", "20,0", "2,0"]);
    expectMetrics("72,7 %", "172,7");
  });
});

describe("F011 Mehlwechsel mit Wasseranpassung", () => {
  it("F011/AC-4 Weizen 550 → Dinkel 630 zeigt ohne weiteren Klick Wasser 65,7 % / 657 g, 68,8 % und TA 168,8", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.selectOptions(flourTypeSelect("Weizen 550"), "Dinkel 630");

    expect(flourTypeSelectAt(0)).toHaveDisplayValue("Dinkel 630");
    expectWater("65,7", "657");
    expect(metric("Netto-Hydratation")).toHaveTextContent("68,8 %");
    expect(metric("Teigausbeute (TA)")).toHaveTextContent("168,8");
    const unchanged = ["Dinkel 630", "Roggen 1150", "Starter", "Salz"];
    expectGrams(unchanged, ["800", "200", "200", "20"]);
    expectPercents(unchanged, ["80,0", "20,0", "20,0", "2,0"]);
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
    expect(screen.getByRole("radio", { name: "Basis: Gesamtmehl" })).toBeChecked();
  });

  it("F011/AC-5 Rückwechsel auf Weizen 550 stellt 70,0 % / 700 g, 72,7 % und TA 172,7 wieder her", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    await chooseFirstFlour(user, "Dinkel 630");
    expectWater("65,7", "657");

    await chooseFirstFlour(user, "Weizen 550");

    expect(flourTypeSelectAt(0)).toHaveDisplayValue("Weizen 550");
    expectWater("70,0", "700");
    expectMetrics("72,7 %", "172,7");
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
  });

  it("F011/AC-5 viele Wechsel hintereinander führen ohne Rundungsdrift auf denselben Wert zurück", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await chooseFirstFlour(user, "Dinkel 630");
    await chooseFirstFlour(user, "Manitoba");
    // 70 × (800 × 1,25 + 200 × 1,15) / 1030 = 83,59 %
    expectWater("83,6", "836");
    await chooseFirstFlour(user, "Tipo 00 (Pizzamehl)");
    await chooseFirstFlour(user, "Roggen 815");
    await user.selectOptions(flourTypeSelectAt(1), "Dinkel Vollkorn");
    await user.selectOptions(flourTypeSelectAt(1), "Roggen 1150");
    await chooseFirstFlour(user, "Weizen 550");

    expectWater("70,0", "700");
    expectMetrics("72,7 %", "172,7");
    expectIngredientOrder(REFERENCE_NAMES);
  });
});

describe("F011 Mehlwechsel ohne Wasseranpassung", () => {
  it("F011/AC-6 bei ausgeschaltetem Schalter bleibt das Wasser, erst der nächste Wechsel nach dem Einschalten passt an", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.click(adjustWaterSwitch());
    expect(adjustWaterSwitch()).not.toBeChecked();
    await chooseFirstFlour(user, "Dinkel 630");

    expect(flourTypeSelectAt(0)).toHaveDisplayValue("Dinkel 630");
    expectWater("70,0", "700");
    expectMetrics("72,7 %", "172,7");

    await user.click(adjustWaterSwitch());
    expect(adjustWaterSwitch()).toBeChecked();
    expectWater("70,0", "700");
    expectMetrics("72,7 %", "172,7");

    // Dinkel 630 → Weizen 550: 70 × 1030 / 966 = 74,64 %
    await chooseFirstFlour(user, "Weizen 550");
    expectWater("74,6", "746");
  });
});

describe("F011 Mehlwechsel bei Basis Ziel-Teiggewicht", () => {
  it("F011/AC-7 Ziel-Teiggewicht 1920 bleibt, Wasser 65,7 % / 672 g, Prozente bleiben, Gramm folgen", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    await user.click(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" }));
    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("1920");

    await chooseFirstFlour(user, "Dinkel 630");

    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("1920");
    expectWater("65,7", "672");
    expect(metric("Netto-Hydratation")).toHaveTextContent("68,8 %");
    const names = ["Dinkel 630", "Roggen 1150", "Starter", "Salz"];
    expectPercents(names, ["80,0", "20,0", "20,0", "2,0"]);
    // Mehlbasis 1920 / 1,876505 = 1023,18 g
    expectGrams(names, ["819", "205", "205", "20"]);
  });
});

describe("F011 Keine Anpassung ohne Mehlmenge", () => {
  it("F011/AC-8 bei Gesamtmehl 0 bleibt das Wasser, keine zusätzliche Meldung, der Mehltyp wird übernommen", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    await replaceValue(user, textbox("Gesamtmehl (g)"), "0");
    expect(screen.getByText(INVALID_FLOUR_BASIS)).toBeVisible();
    const messagesBefore = visibleMessages();
    const waterGrams = gramsField("Wasser").value;
    const waterPercent = percentField("Wasser").value;

    await user.selectOptions(flourTypeSelect("Weizen 550"), "Dinkel 630");

    expect(flourTypeSelectAt(0)).toHaveDisplayValue("Dinkel 630");
    expect(gramsField("Wasser")).toHaveValue(waterGrams);
    expect(percentField("Wasser")).toHaveValue(waterPercent);
    expectWater("70,0", "700");
    expect(visibleMessages()).toEqual(messagesBefore);
    expect(visibleMessages()).toEqual([INVALID_FLOUR_BASIS]);
  });

  it("F011/AC-8 stehen alle Mehle auf 0 g, bleibt das Wasser und es kommt keine Meldung hinzu", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    await replaceValue(user, gramsField("Weizen 550"), "0");
    await replaceValue(user, gramsField("Roggen 1150"), "0");
    await user.tab();
    const messagesBefore = visibleMessages();
    const waterGrams = gramsField("Wasser").value;
    const waterPercent = percentField("Wasser").value;

    await user.selectOptions(flourTypeSelect("Weizen 550"), "Dinkel 630");

    expect(flourTypeSelectAt(0)).toHaveDisplayValue("Dinkel 630");
    expect(gramsField("Dinkel 630")).toHaveValue("0");
    expect(gramsField("Wasser")).toHaveValue(waterGrams);
    expect(percentField("Wasser")).toHaveValue(waterPercent);
    expect(visibleMessages()).toEqual(messagesBefore);
  });
});

describe("F011 Mehltyp und Schalter merken und speichern", () => {
  it("F011/AC-9 „Lokal merken“ stellt Dinkel 630 und den ausgeschalteten Schalter beim erneuten Öffnen wieder her", async () => {
    const user = userEvent.setup();
    const first = render(<Calculator owner={GUEST} />);
    await chooseFirstFlour(user, "Dinkel 630");
    await user.click(adjustWaterSwitch());
    expect(adjustWaterSwitch()).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: SAVE_LOCAL_LABEL }));
    expect(await screen.findByText(SAVED_LOCAL)).toBeInTheDocument();
    first.unmount();
    render(<Calculator owner={GUEST} />);

    expectIngredientOrder(["Dinkel 630", "Roggen 1150", "Wasser", "Starter", "Salz"]);
    expect(flourTypeSelect("Dinkel 630")).toHaveDisplayValue("Dinkel 630");
    expect(flourTypeSelect("Roggen 1150")).toHaveDisplayValue("Roggen 1150");
    expect(adjustWaterSwitch()).not.toBeChecked();
    expectWater("65,7", "657");
  });

  it("F011/AC-9 „Als Rezept speichern“ sendet den Mehltyp als Zutatennamen", async () => {
    const user = userEvent.setup();
    mockUuid(UUID_1);
    mocks.saveRecipe.mockResolvedValue({ ok: true, recipeId: UUID_1 });
    render(<Calculator owner={U1} />);

    await chooseFirstFlour(user, "Dinkel 630");
    await saveToAccount(user);

    expect(mocks.saveRecipe).toHaveBeenCalledTimes(1);
    expect(mocks.saveRecipe).toHaveBeenCalledWith({
      name: "Landbrot",
      targetDoughWeight: 1877,
      targetHydration: 68.8,
      ingredients: [
        { name: "Dinkel 630", type: "flour", amountGrams: 800, bakersPercent: 80, starterHydration: 100 },
        { name: "Roggen 1150", type: "flour", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
        { name: "Wasser", type: "water", amountGrams: 656.5, bakersPercent: 65.65, starterHydration: 100 },
        { name: "Starter", type: "starter", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
        { name: "Salz", type: "salt", amountGrams: 20, bakersPercent: 2, starterHydration: 100 },
      ],
      recipeId: UUID_1,
    });
  });
});

describe("F011 Sonstiges Mehl", () => {
  it("F011/AC-10 „Sonstiges Mehl“ zeigt ein Feld „Name“, Wasser bleibt, Entfernen-Button folgt dem Namen", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await chooseFirstFlour(user, "Sonstiges Mehl");

    expect(flourTypeSelectAt(0)).toHaveDisplayValue("Sonstiges Mehl");
    const row = ingredientGroup("Sonstiges Mehl");
    const nameField = within(row).getByRole("textbox", { name: "Name" });
    expect(nameField).toHaveValue("");
    expectWater("70,0", "700");
    expect(screen.getByRole("button", { name: "Sonstiges Mehl entfernen" })).toBeEnabled();

    await user.type(nameField, "Emmer");

    expect(ingredientGroup("Emmer")).toBeInTheDocument();
    expect(within(ingredientGroup("Emmer")).getByRole("combobox", { name: FLOUR_TYPE_LABEL })).toHaveDisplayValue(
      "Sonstiges Mehl",
    );
    expect(screen.getByRole("button", { name: "Emmer entfernen" })).toBeEnabled();
    expectWater("70,0", "700");
    // Nur „Sonstiges Mehl“ hat ein Feld „Name“.
    expect(within(ingredientGroup("Roggen 1150")).queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
  });

  it("F011/AC-10 Rückwechsel auf einen Katalog-Mehltyp entfernt das Feld „Name“", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    await chooseFirstFlour(user, "Sonstiges Mehl");
    await user.type(within(ingredientGroup("Sonstiges Mehl")).getByRole("textbox", { name: "Name" }), "Emmer");

    await user.selectOptions(flourTypeSelect("Emmer"), "Weizen 550");

    const row = ingredientGroup("Weizen 550");
    expect(within(row).queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    expect(within(row).getByRole("combobox", { name: FLOUR_TYPE_LABEL })).toHaveDisplayValue("Weizen 550");
    expect(screen.queryByRole("group", { name: "Emmer" })).not.toBeInTheDocument();
    expectWater("70,0", "700");
  });

  it("F011/AC-10 „Als Rezept speichern“ sendet den freien Namen „Emmer“", async () => {
    const user = userEvent.setup();
    mockUuid(UUID_1);
    mocks.saveRecipe.mockResolvedValue({ ok: true, recipeId: UUID_1 });
    render(<Calculator owner={U1} />);
    await chooseFirstFlour(user, "Sonstiges Mehl");
    await user.type(within(ingredientGroup("Sonstiges Mehl")).getByRole("textbox", { name: "Name" }), "Emmer");

    await saveToAccount(user);

    expect(mocks.saveRecipe).toHaveBeenCalledTimes(1);
    expect(savedIngredientNames()).toEqual(["Emmer", "Roggen 1150", "Wasser", "Starter", "Salz"]);
  });

  it("F011/AC-10 „Als Rezept speichern“ sendet bei leerem Namen „Sonstiges Mehl“", async () => {
    const user = userEvent.setup();
    mockUuid(UUID_1);
    mocks.saveRecipe.mockResolvedValue({ ok: true, recipeId: UUID_1 });
    render(<Calculator owner={U1} />);
    await chooseFirstFlour(user, "Sonstiges Mehl");

    await saveToAccount(user);

    expect(mocks.saveRecipe).toHaveBeenCalledTimes(1);
    expect(savedIngredientNames()).toEqual(["Sonstiges Mehl", "Roggen 1150", "Wasser", "Starter", "Salz"]);
  });
});

describe("F011 Ältere gemerkte Stände", () => {
  it("F011/AC-11 ordnet freie Mehlnamen eines F010-Stands Mehltypen zu, Mengen und Wasser bleiben, Schalter ein", () => {
    const row = (id: number, name: string, type: string, grams: number, percent: number) => ({
      id: `row-${id}`,
      name,
      type,
      grams,
      percent,
      starterHydration: 100,
    });
    localStorage.setItem(
      CALCULATOR_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        owner: { kind: "guest" },
        recipe: {
          basis: "flour",
          flourBasis: 1000,
          doughWeight: 1920,
          rows: [
            row(1, " weizenmehl ", "flour", 400, 40),
            row(2, "ROGGENMEHL", "flour", 200, 20),
            row(3, "dinkel 630", "flour", 200, 20),
            row(4, "Ruchmehl", "flour", 200, 20),
            row(5, "Wasser", "water", 700, 70),
            row(6, "Starter", "starter", 200, 20),
            row(7, "Salz", "salt", 20, 2),
          ],
        },
        ddt: { ...DEFAULT_DDT_STATE },
      }),
    );

    render(<Calculator owner={GUEST} />);

    const names = ["Weizen 550", "Roggen 1150", "Dinkel 630", "Ruchmehl", "Wasser", "Starter", "Salz"];
    expectIngredientOrder(names);
    expect([0, 1, 2, 3].map((index) => flourTypeSelectAt(index).selectedOptions[0]?.textContent)).toEqual([
      "Weizen 550",
      "Roggen 1150",
      "Dinkel 630",
      "Sonstiges Mehl",
    ]);
    [0, 1, 2].forEach((index) => {
      expect(within(ingredientItems()[index]).queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    });
    expect(within(ingredientItems()[3]).getByRole("textbox", { name: "Name" })).toHaveValue("Ruchmehl");
    expect(screen.getByRole("button", { name: "Ruchmehl entfernen" })).toBeEnabled();
    expectGrams(names, ["400", "200", "200", "200", "700", "200", "20"]);
    expectPercents(names, ["40,0", "20,0", "20,0", "20,0", "70,0", "20,0", "2,0"]);
    expectWater("70,0", "700");
    expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
    expect(adjustWaterSwitch()).toBeChecked();
  });
});

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveRecipe: vi.fn() }));

vi.mock("@/app/calculator/actions", () => ({ saveRecipe: mocks.saveRecipe }));

import { Calculator } from "@/components/calculator/calculator";
import { CALCULATOR_DRAFT_KEY, type CalculatorOwner } from "@/lib/calculator/local-draft";
import {
  REFERENCE_NAMES,
  expectGrams,
  expectIngredientOrder,
  expectPercents,
  gramsField,
  ingredientGroup,
  metricText,
  percentField,
  setSlider,
  starterHydrationField,
  textbox,
} from "@/test/calculator";

const GUEST: CalculatorOwner = { kind: "guest" };
const U1: CalculatorOwner = { kind: "user", userId: "u1" };
const U2: CalculatorOwner = { kind: "user", userId: "u2" };

const UUID_1 = "0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f";
const UUID_2 = "5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b";

const SAVE_LABEL = "Als Rezept speichern";
const SAVING_LABEL = "Speichern …";
const SAVED_MESSAGE = "Rezept „Landbrot“ gespeichert.";
const NAME_REQUIRED = "Bitte gib einen Rezeptnamen ein.";
const SAVE_FAILED = "Das Rezept konnte nicht gespeichert werden. Bitte versuche es erneut.";
const SAVE_LOCAL_LABEL = "Lokal merken";
const SAVED_LOCAL = "Auf diesem Gerät gemerkt.";
const SIGN_IN_HINT = "Melde dich an, um Rezepte in deinem Konto zu speichern.";

const REFERENCE_PAYLOAD = {
  name: "Landbrot",
  targetDoughWeight: 1920,
  targetHydration: 72.7,
  ingredients: [
    { name: "Weizenmehl", type: "flour", amountGrams: 800, bakersPercent: 80, starterHydration: 100 },
    { name: "Roggenmehl", type: "flour", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
    { name: "Wasser", type: "water", amountGrams: 700, bakersPercent: 70, starterHydration: 100 },
    { name: "Starter", type: "starter", amountGrams: 200, bakersPercent: 20, starterHydration: 100 },
    { name: "Salz", type: "salt", amountGrams: 20, bakersPercent: 2, starterHydration: 100 },
  ],
};

type User = ReturnType<typeof userEvent.setup>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function replaceValue(user: User, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, text);
}

function recipeNameField(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Rezeptname" }) as HTMLInputElement;
}

function kneadingSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "Knetmethode" }) as HTMLSelectElement;
}

function mockUuids(...ids: Array<`${string}-${string}-${string}-${string}-${string}`>) {
  const spy = vi.spyOn(crypto, "randomUUID");
  for (const id of ids) spy.mockReturnValueOnce(id);
  return spy;
}

function expectReferenceInputs() {
  expect(textbox("Gesamtmehl (g)")).toHaveValue("1000");
  expectIngredientOrder(REFERENCE_NAMES);
  expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
  expectPercents(REFERENCE_NAMES, ["80,0", "20,0", "70,0", "20,0", "2,0"]);
}

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
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

describe("F010 Speichern im Konto (angemeldet, online)", () => {
  it("F010/AC-8 speichert „Landbrot“: „Speichern …“ während des Speicherns, danach Bestätigung, Eingaben bleiben", async () => {
    const user = userEvent.setup();
    mockUuids(UUID_1);
    const pending = deferred<{ ok: true; recipeId: string }>();
    mocks.saveRecipe.mockReturnValue(pending.promise);
    render(<Calculator owner={U1} />);
    expect(screen.queryByRole("button", { name: SAVE_LOCAL_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();

    await user.type(recipeNameField(), "Landbrot");
    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));

    const savingButton = await screen.findByRole("button", { name: SAVING_LABEL });
    expect(savingButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: SAVE_LABEL })).not.toBeInTheDocument();
    await user.click(savingButton);
    await user.dblClick(savingButton);
    expect(mocks.saveRecipe).toHaveBeenCalledTimes(1);

    pending.resolve({ ok: true, recipeId: UUID_1 });

    expect(await screen.findByText(SAVED_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE_LABEL })).toBeEnabled();
    expect(mocks.saveRecipe).toHaveBeenCalledTimes(1);
    expect(mocks.saveRecipe).toHaveBeenCalledWith({ ...REFERENCE_PAYLOAD, recipeId: UUID_1 });
    expect(recipeNameField()).toHaveValue("Landbrot");
    expectReferenceInputs();
  });

  it("F010/AC-8 die Bestätigung steht in einem höflichen Live-Bereich", async () => {
    const user = userEvent.setup();
    mockUuids(UUID_1);
    mocks.saveRecipe.mockResolvedValue({ ok: true, recipeId: UUID_1 });
    render(<Calculator owner={U1} />);

    await user.type(recipeNameField(), "Landbrot");
    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));

    const message = await screen.findByText(SAVED_MESSAGE);
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it("F010/AC-8 speichert das Rezept in der angezeigten Reihenfolge inklusive neuer Zeilen", async () => {
    const user = userEvent.setup();
    mockUuids(UUID_1);
    mocks.saveRecipe.mockResolvedValue({ ok: true, recipeId: UUID_1 });
    render(<Calculator owner={U1} />);

    await user.click(screen.getByRole("button", { name: "Zutat hinzufügen" }));
    await user.type(within(ingredientGroup("Sonstiges")).getByRole("textbox", { name: "Name" }), "Saaten");
    await replaceValue(user, percentField("Saaten"), "5");
    await user.type(recipeNameField(), "  Landbrot ");
    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));

    expect(await screen.findByText(SAVED_MESSAGE)).toBeInTheDocument();
    expect(mocks.saveRecipe).toHaveBeenCalledWith({
      name: "Landbrot",
      targetDoughWeight: 1970,
      targetHydration: 72.7,
      ingredients: [
        ...REFERENCE_PAYLOAD.ingredients,
        { name: "Saaten", type: "other", amountGrams: 50, bakersPercent: 5, starterHydration: 100 },
      ],
      recipeId: UUID_1,
    });
  });

  it.each([
    ["leer", ""],
    ["nur Leerzeichen", "   "],
  ])("F010/AC-8 speichert ohne Rezeptnamen (%s) nichts und meldet es am Feld", async (_label, name) => {
    const user = userEvent.setup();
    render(<Calculator owner={U1} />);

    if (name) await user.type(recipeNameField(), name);
    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));

    expect(recipeNameField()).toHaveAccessibleDescription(NAME_REQUIRED);
    expect(mocks.saveRecipe).not.toHaveBeenCalled();
    expect(screen.queryByText(SAVED_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE_LABEL })).toBeEnabled();
  });
});

describe("F010 Speichern im Konto: Fehlerfälle", () => {
  it.each([
    ["Netzwerkfehler", () => mocks.saveRecipe.mockRejectedValue(new TypeError("Failed to fetch"))],
    ["Serverfehler", () => mocks.saveRecipe.mockResolvedValue({ ok: false, error: "SAVE_FAILED" })],
  ])("F010/AC-9 zeigt bei %s die Fehlermeldung, Eingaben bleiben und der Button ist wieder aktiv", async (_label, arrange) => {
    const user = userEvent.setup();
    mockUuids(UUID_1);
    arrange();
    render(<Calculator owner={U1} />);

    await user.type(recipeNameField(), "Landbrot");
    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));

    const message = await screen.findByText(SAVE_FAILED);
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByText(SAVED_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE_LABEL })).toBeEnabled();
    expect(recipeNameField()).toHaveValue("Landbrot");
    expectReferenceInputs();
    expect(mocks.saveRecipe).toHaveBeenCalledTimes(1);
  });

  it("F010/AC-9 ein erneuter Versuch ohne Änderung sendet dieselbe Rezept-ID, nach einer Änderung eine neue", async () => {
    const user = userEvent.setup();
    mockUuids(UUID_1, UUID_2);
    mocks.saveRecipe.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Calculator owner={U1} />);
    await user.type(recipeNameField(), "Landbrot");

    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));
    await waitFor(() => expect(mocks.saveRecipe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE_LABEL })).toBeEnabled());

    await replaceValue(user, gramsField("Wasser"), "750");
    await user.click(screen.getByRole("button", { name: SAVE_LABEL }));
    await waitFor(() => expect(mocks.saveRecipe).toHaveBeenCalledTimes(3));

    const ids = mocks.saveRecipe.mock.calls.map(([input]) => (input as { recipeId: string }).recipeId);
    expect(ids).toEqual([UUID_1, UUID_1, UUID_2]);
    expect(mocks.saveRecipe.mock.calls[2][0]).toMatchObject({
      ingredients: expect.arrayContaining([
        { name: "Wasser", type: "water", amountGrams: 750, bakersPercent: 75, starterHydration: 100 },
      ]),
    });
  });
});

describe("F010 Lokal merken (Gast oder offline)", () => {
  it("F010/AC-10 Gäste sehen „Lokal merken“ und einen Anmelde-Hinweis statt Rezeptname und Konto-Speichern", () => {
    render(<Calculator owner={GUEST} />);

    expect(screen.getByRole("button", { name: SAVE_LOCAL_LABEL })).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: "Rezeptname" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_LABEL })).not.toBeInTheDocument();
    expect(screen.getByText(SIGN_IN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Anmelden" })).toHaveAttribute("href", "/login");
  });

  it("F010/AC-10 angemeldet, aber offline: „Lokal merken“ ohne Rezeptname und ohne Gast-Hinweis", () => {
    setNavigatorOnline(false);
    onlineManager.setOnline(false);
    render(<Calculator owner={U1} />);

    expect(screen.getByRole("button", { name: SAVE_LOCAL_LABEL })).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: "Rezeptname" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Anmelden" })).not.toBeInTheDocument();
  });

  it("F010/AC-10 wechselt beim Verbindungsverlust von „Als Rezept speichern“ auf „Lokal merken“", async () => {
    render(<Calculator owner={U1} />);
    expect(screen.getByRole("button", { name: SAVE_LABEL })).toBeInTheDocument();

    act(() => onlineManager.setOnline(false));

    expect(await screen.findByRole("button", { name: SAVE_LOCAL_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Rezeptname" })).not.toBeInTheDocument();
  });

  it("F010/AC-10 stellt nach „Lokal merken“ beim erneuten Öffnen alle Eingaben wieder her", async () => {
    const user = userEvent.setup();
    const first = render(<Calculator owner={GUEST} />);

    // Basis Ziel-Teiggewicht 960
    await user.click(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" }));
    await replaceValue(user, textbox("Ziel-Teiggewicht (g)"), "960");
    // Mehl „Dinkel“ hinzufügen, Mehlanteile 60 / 20 / 20
    await user.click(screen.getByRole("button", { name: "Mehl hinzufügen" }));
    await user.keyboard("Dinkel");
    await replaceValue(user, percentField("Weizenmehl"), "60");
    await replaceValue(user, percentField("Dinkel"), "20");
    // Starter-Hydratation 80, Salz als „Sonstiges“
    await replaceValue(user, starterHydrationField(), "80");
    await user.selectOptions(within(ingredientGroup("Salz")).getByRole("combobox", { name: "Typ" }), "Sonstiges");
    // Temperaturen und eigene Knetreibung
    setSlider("Ziel-Teigtemperatur (DDT)", 26);
    await replaceValue(user, textbox("Raumtemperatur"), "21,5");
    setSlider("Mehltemperatur", 20);
    setSlider("Startertemperatur", 24);
    await user.selectOptions(kneadingSelect(), "Eigener Wert");
    await replaceValue(user, textbox("Knetreibung (°C)"), "3");
    await user.tab();
    // 4 × 26 − (21,5 + 20 + 24 + 3) = 35,5
    expect(metricText("Wassertemperatur")).toBe("35,5 °C");

    await user.click(screen.getByRole("button", { name: SAVE_LOCAL_LABEL }));

    expect(await screen.findByText(SAVED_LOCAL)).toBeInTheDocument();
    expect(screen.getByText(SAVED_LOCAL).closest('[aria-live="polite"]')).not.toBeNull();
    expect(localStorage.getItem(CALCULATOR_DRAFT_KEY)).not.toBeNull();

    first.unmount();
    render(<Calculator owner={GUEST} />);

    expect(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" })).toBeChecked();
    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("960");
    const names = ["Weizenmehl", "Roggenmehl", "Dinkel", "Wasser", "Starter", "Salz"];
    expectIngredientOrder(names);
    expectGrams(names, ["300", "100", "100", "350", "100", "10"]);
    expectPercents(names, ["60,0", "20,0", "20,0", "70,0", "20,0", "2,0"]);
    expect(within(ingredientGroup("Dinkel")).getByRole("textbox", { name: "Name" })).toHaveValue("Dinkel");
    expect(within(ingredientGroup("Salz")).getByRole("combobox", { name: "Typ" })).toHaveDisplayValue("Sonstiges");
    expect(starterHydrationField()).toHaveValue("80,0");
    expect(textbox("Ziel-Teigtemperatur (DDT)")).toHaveValue("26,0");
    expect(textbox("Raumtemperatur")).toHaveValue("21,5");
    expect(textbox("Mehltemperatur")).toHaveValue("20,0");
    expect(textbox("Startertemperatur")).toHaveValue("24,0");
    expect(kneadingSelect()).toHaveDisplayValue("Eigener Wert");
    expect(textbox("Knetreibung (°C)").value).toMatch(/^3(,0)?$/);
    expect(metricText("Wassertemperatur")).toBe("35,5 °C");
  });

  it("F010/AC-10 ein erneuter Klick auf „Lokal merken“ überschreibt den gemerkten Stand", async () => {
    const user = userEvent.setup();
    const first = render(<Calculator owner={GUEST} />);
    await replaceValue(user, gramsField("Wasser"), "750");
    await user.click(screen.getByRole("button", { name: SAVE_LOCAL_LABEL }));
    expect(await screen.findByText(SAVED_LOCAL)).toBeInTheDocument();

    await replaceValue(user, gramsField("Wasser"), "720");
    await user.click(screen.getByRole("button", { name: SAVE_LOCAL_LABEL }));
    first.unmount();
    render(<Calculator owner={GUEST} />);

    expect(gramsField("Wasser")).toHaveValue("720");
    expect(percentField("Wasser")).toHaveValue("72,0");
  });

  it("F010/AC-10 stellt einen Konto-Stand offline für dasselbe Konto wieder her, nicht für andere oder Gäste", async () => {
    const user = userEvent.setup();
    setNavigatorOnline(false);
    onlineManager.setOnline(false);
    const first = render(<Calculator owner={U1} />);
    await replaceValue(user, gramsField("Wasser"), "750");
    await user.click(screen.getByRole("button", { name: SAVE_LOCAL_LABEL }));
    expect(await screen.findByText(SAVED_LOCAL)).toBeInTheDocument();
    first.unmount();

    const same = render(<Calculator owner={U1} />);
    expect(gramsField("Wasser")).toHaveValue("750");
    same.unmount();

    const other = render(<Calculator owner={U2} />);
    expectReferenceInputs();
    other.unmount();

    render(<Calculator owner={GUEST} />);
    expectReferenceInputs();
  });

  it("F010/AC-10 ein Gast-Stand wird für eine angemeldete Person nicht wiederhergestellt", async () => {
    const user = userEvent.setup();
    const first = render(<Calculator owner={GUEST} />);
    await replaceValue(user, gramsField("Wasser"), "750");
    await user.click(screen.getByRole("button", { name: SAVE_LOCAL_LABEL }));
    expect(await screen.findByText(SAVED_LOCAL)).toBeInTheDocument();
    first.unmount();

    render(<Calculator owner={U1} />);

    expectReferenceInputs();
    expect(screen.getByRole("radio", { name: "Basis: Gesamtmehl" })).toBeChecked();
  });
});

// Komponententests zu den Befunden aus Review-Runde 1 (F010): Basis-Umschaltung nach geleertem
// Gesamtmehl, unvollständige Zahleneingaben, Einheit der Temperaturfelder, veraltete Rückmeldungen.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/calculator/actions", () => ({ saveRecipe: vi.fn() }));

import { Calculator } from "@/components/calculator/calculator";
import type { CalculatorOwner } from "@/lib/calculator/local-draft";
import { REFERENCE_NAMES, expectGrams, expectPercents, gramsField, metric, percentField, textbox } from "@/test/calculator";

const GUEST: CalculatorOwner = { kind: "guest" };
const INVALID_FLOUR_BASIS = "Die Mehlbasis muss größer als 0 g sein.";
const NON_FINITE_GRAMS = "Grammangaben müssen gültige Zahlen sein.";
const NEGATIVE_GRAMS = "Grammangaben dürfen nicht negativ sein.";
const SAVED_LOCAL = "Auf diesem Gerät gemerkt.";

async function replaceValue(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, text);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("F010 Hydratations-Rechner: geleertes Gesamtmehl und Umschalten", () => {
  it("F010/AC-2 Gesamtmehl leeren, auf Ziel-Teiggewicht umschalten, Wasser 80 %: Gramm und Kennzahlen folgen", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await user.clear(textbox("Gesamtmehl (g)"));
    expect(screen.getByText(INVALID_FLOUR_BASIS)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" }));

    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("1920");
    expectGrams(REFERENCE_NAMES, ["800", "200", "700", "200", "20"]);
    expect(screen.queryByText(INVALID_FLOUR_BASIS)).not.toBeInTheDocument();

    await replaceValue(user, percentField("Wasser"), "80");
    await user.tab();

    expect(gramsField("Wasser")).toHaveValue("800");
    expectPercents(REFERENCE_NAMES, ["80,0", "20,0", "80,0", "20,0", "2,0"]);
    expect(textbox("Ziel-Teiggewicht (g)")).toHaveValue("2020");
    // (800 + 100) / (1000 + 100) × 100 = 81,8 %
    expect(metric("Netto-Hydratation")).toHaveTextContent("81,8 %");
    expect(metric("Teigausbeute (TA)")).toHaveTextContent("181,8");
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeEnabled();
  });
});

describe("F010 Zahlenfelder: unvollständige Eingaben", () => {
  it("F010/AC-5 ein einzelnes „-“ zeigt noch keine Meldung, „-5“ dann die passende", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const water = gramsField("Wasser");

    await user.clear(water);
    await user.type(water, "-");

    expect(water).toHaveValue("-");
    expect(screen.queryByText(NON_FINITE_GRAMS)).not.toBeInTheDocument();

    await user.type(water, "5");

    expect(water).toHaveValue("-5");
    expect(screen.getByText(NEGATIVE_GRAMS)).toBeInTheDocument();
  });

  it("F010/AC-5 bleibt die Eingabe beim Verlassen unvollständig, zählt sie wie ein leeres Feld (Q7)", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const water = gramsField("Wasser");

    await user.clear(water);
    await user.type(water, ",");
    await user.tab();

    expect(water).toHaveValue("0");
    expect(percentField("Wasser")).toHaveValue("0,0");
    expect(screen.queryByText(NON_FINITE_GRAMS)).not.toBeInTheDocument();
  });

  it("F010/AC-6 ein unvollständiges Temperaturfeld meldet beim Verlassen die ungültige Zahl", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const room = textbox("Raumtemperatur");

    await user.tripleClick(room);
    await user.keyboard("-");

    expect(room).toHaveValue("-");
    expect(room).not.toBeInvalid();

    await user.tab();

    expect(room).toHaveValue("");
    expect(room).toBeInvalid();
  });
});

describe("F010 DDT-Rechner: Einheit der Temperaturfelder", () => {
  it("F010/AC-6 die Temperatur-Eingabefelder tragen „°C“ in ihrer zugänglichen Beschreibung", () => {
    render(<Calculator owner={GUEST} />);

    for (const name of ["Ziel-Teigtemperatur (DDT)", "Raumtemperatur", "Mehltemperatur", "Startertemperatur"]) {
      expect(textbox(name)).toHaveAccessibleDescription("°C");
    }
  });
});

describe("F010 Speichern: Rückmeldungen", () => {
  it("F010/AC-10 „Auf diesem Gerät gemerkt.“ verschwindet nach einer Änderung und erscheint beim erneuten Merken wieder", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const saveLocal = screen.getByRole("button", { name: "Lokal merken" });

    await user.click(saveLocal);
    expect(screen.getByText(SAVED_LOCAL)).toBeInTheDocument();

    await replaceValue(user, gramsField("Wasser"), "750");
    expect(screen.queryByText(SAVED_LOCAL)).not.toBeInTheDocument();

    await user.click(saveLocal);
    expect(screen.getByText(SAVED_LOCAL)).toBeInTheDocument();
  });

  it("F010/AC-10 ein zweites „Lokal merken“ ersetzt die Meldung durch einen neuen Knoten, damit sie erneut angesagt wird", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const saveLocal = screen.getByRole("button", { name: "Lokal merken" });

    await user.click(saveLocal);
    const first = screen.getByText(SAVED_LOCAL);
    await user.click(saveLocal);
    const second = screen.getByText(SAVED_LOCAL);

    expect(second).not.toBe(first);
    expect(first).not.toBeInTheDocument();
  });
});

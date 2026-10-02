import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveRecipe: vi.fn() }));

vi.mock("@/app/calculator/actions", () => ({ saveRecipe: mocks.saveRecipe }));

import { Calculator } from "@/components/calculator/calculator";
import type { CalculatorOwner } from "@/lib/calculator/local-draft";
import { metric, metricText, politeRegions, setSlider, slider, textbox } from "@/test/calculator";

const GUEST: CalculatorOwner = { kind: "guest" };

const DDT = "Ziel-Teigtemperatur (DDT)";
const ROOM = "Raumtemperatur";
const FLOUR = "Mehltemperatur";
const STARTER = "Startertemperatur";
const FRICTION = "Knetreibung (°C)";
const COLD = "Eiswasser erforderlich";
const HEAT = "Kritische Temperatur für Starter-Mikroben!";

type User = ReturnType<typeof userEvent.setup>;

async function replaceValue(user: User, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, text);
}

function kneadingSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "Knetmethode" }) as HTMLSelectElement;
}

function waterTemperature(): string {
  return metricText("Wassertemperatur");
}

function warning(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-warning]");
}

function setTemperatures(ddt: number, room: number, flour: number, starter: number) {
  setSlider(DDT, ddt);
  setSlider(ROOM, room);
  setSlider(FLOUR, flour);
  setSlider(STARTER, starter);
}

beforeEach(() => {
  mocks.saveRecipe.mockReset();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("F010 DDT-Rechner: Wassertemperatur", () => {
  it("F010/AC-6 startet mit Ziel-Teigtemperatur 25 °C, 22 °C und Handknetung (33,0 °C Wasser)", () => {
    render(<Calculator owner={GUEST} />);

    expect(screen.getByRole("heading", { name: "DDT-Rechner" })).toBeInTheDocument();
    expect(textbox(DDT)).toHaveValue("25,0");
    expect(slider(DDT)).toHaveValue("25");
    for (const label of [ROOM, FLOUR, STARTER]) {
      expect(textbox(label)).toHaveValue("22,0");
      expect(slider(label)).toHaveValue("22");
    }
    expect(kneadingSelect()).toHaveDisplayValue("Handknetung (+1 °C)");
    expect(waterTemperature()).toBe("33,0 °C");
  });

  it("F010/AC-6 zeigt nach den Eingaben für jede Knetmethode ohne weiteren Klick die Wassertemperatur", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await replaceValue(user, textbox(DDT), "26");
    await replaceValue(user, textbox(ROOM), "22");
    setSlider(FLOUR, 20);
    setSlider(STARTER, 24);

    expect(waterTemperature()).toBe("37,0 °C");

    await user.selectOptions(kneadingSelect(), "Küchenmaschine (+5 °C)");
    expect(waterTemperature()).toBe("33,0 °C");

    await user.selectOptions(kneadingSelect(), "Spiralkneter (+9 °C)");
    expect(waterTemperature()).toBe("29,0 °C");

    await user.selectOptions(kneadingSelect(), "Eigener Wert");
    await replaceValue(user, textbox(FRICTION), "3");
    expect(waterTemperature()).toBe("35,0 °C");
  });

  it("F010/AC-6 Slider und Eingabefeld derselben Temperatur zeigen immer denselben Wert", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    await replaceValue(user, textbox(DDT), "26");
    expect(slider(DDT)).toHaveValue("26");

    setSlider(FLOUR, 20);
    expect(textbox(FLOUR)).toHaveValue("20,0");

    setSlider(STARTER, 24.5);
    expect(textbox(STARTER)).toHaveValue("24,5");

    await replaceValue(user, textbox(ROOM), "18,5");
    expect(slider(ROOM)).toHaveValue("18.5");
  });

  it("F010/AC-6 Slider haben die Bereiche DDT 18–32 °C bzw. −10 bis 40 °C, Werte außerhalb sind im Feld erlaubt", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    expect(slider(DDT)).toHaveAttribute("min", "18");
    expect(slider(DDT)).toHaveAttribute("max", "32");
    expect(slider(DDT)).toHaveAttribute("step", "0.5");
    for (const label of [ROOM, FLOUR, STARTER]) {
      expect(slider(label)).toHaveAttribute("min", "-10");
      expect(slider(label)).toHaveAttribute("max", "40");
      expect(slider(label)).toHaveAttribute("step", "0.5");
    }

    await replaceValue(user, textbox(DDT), "35");

    expect(textbox(DDT)).toHaveValue("35");
    expect(slider(DDT)).toHaveValue("32");
    // 4 × 35 − (22 + 22 + 22 + 1) = 73
    expect(waterTemperature()).toBe("73,0 °C");
  });

  it("F010/AC-6 bietet die Knetmethoden mit Reibungswert an, „Knetreibung (°C)“ nur bei „Eigener Wert“", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    expect(within(kneadingSelect()).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Handknetung (+1 °C)",
      "Küchenmaschine (+5 °C)",
      "Spiralkneter (+9 °C)",
      "Eigener Wert",
    ]);
    expect(screen.queryByRole("textbox", { name: FRICTION })).not.toBeInTheDocument();

    await user.selectOptions(kneadingSelect(), "Eigener Wert");
    expect(textbox(FRICTION)).toBeInTheDocument();

    await user.selectOptions(kneadingSelect(), "Spiralkneter (+9 °C)");
    expect(screen.queryByRole("textbox", { name: FRICTION })).not.toBeInTheDocument();
  });

  it("F010/AC-6 eine negative Knetreibung zeigt die Meldung am Feld und „–“ als Wassertemperatur", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    await user.selectOptions(kneadingSelect(), "Eigener Wert");
    const friction = textbox(FRICTION);

    await replaceValue(user, friction, "-1");

    expect(friction).toHaveAccessibleDescription("Die Knetreibung darf nicht negativ sein.");
    expect(waterTemperature()).toBe("–");
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeDisabled();

    await replaceValue(user, friction, "3");

    expect(screen.queryByText("Die Knetreibung darf nicht negativ sein.")).not.toBeInTheDocument();
    // 4 × 25 − (22 + 22 + 22 + 3) = 31
    expect(waterTemperature()).toBe("31,0 °C");
  });

  it("F010/AC-6 die Wassertemperatur liegt in keinem Live-Bereich (kein Vorlesen beim Ziehen)", () => {
    render(<Calculator owner={GUEST} />);

    const water = metric("Wassertemperatur");
    expect(water.closest("[aria-live]")).toBeNull();
    expect(water.closest('[role="status"], [role="alert"]')).toBeNull();
  });
});

describe("F010 DDT-Rechner: Warnanzeige", () => {
  it("F010/AC-7 zeigt bei 3,0 °C den Kalt-Hinweis „Eiswasser erforderlich“ mit Textlabel", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    const statusBefore = new Set(screen.getAllByRole("status"));
    const politeBefore = politeRegions();
    expect(warning()).toBeNull();

    setTemperatures(24, 30, 26, 28);
    await user.selectOptions(kneadingSelect(), "Spiralkneter (+9 °C)");

    expect(waterTemperature()).toBe("3,0 °C");
    const cold = screen.getByText(COLD).closest<HTMLElement>("[data-warning]");
    expect(cold).not.toBeNull();
    expect(cold).toHaveAttribute("data-warning", "cold");
    expect(cold).toHaveTextContent("Kalt");
    expect(cold).toHaveTextContent(COLD);
    const region = cold?.closest('[role="status"]');
    expect(region).not.toBeNull();
    expect(statusBefore.has(region as HTMLElement)).toBe(true);
    expect(politeBefore.has(cold?.closest('[aria-live="polite"]') as Element)).toBe(true);
  });

  it("F010/AC-7 zeigt bei 57,0 °C den Heiß-Hinweis mit Textlabel, farblich verschieden vom Kalt-Hinweis", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    setTemperatures(24, 30, 26, 28);
    await user.selectOptions(kneadingSelect(), "Spiralkneter (+9 °C)");
    const coldClass = warning()?.className;

    setTemperatures(27, 17, 15, 18);
    await user.selectOptions(kneadingSelect(), "Handknetung (+1 °C)");

    expect(waterTemperature()).toBe("57,0 °C");
    expect(screen.queryByText(COLD)).not.toBeInTheDocument();
    const heat = screen.getByText(HEAT).closest<HTMLElement>("[data-warning]");
    expect(heat).toHaveAttribute("data-warning", "heat");
    expect(heat).toHaveTextContent("Heiß");
    expect(heat).not.toHaveTextContent("Kalt");
    expect(coldClass).toBeTruthy();
    expect(heat?.className).toBeTruthy();
    expect(heat?.className).not.toBe(coldClass);
  });

  it("F010/AC-7 zeigt bei genau 4,0 °C und 45,0 °C keinen Hinweis", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);

    setTemperatures(26, 32, 30, 29);
    await user.selectOptions(kneadingSelect(), "Spiralkneter (+9 °C)");
    expect(waterTemperature()).toBe("4,0 °C");
    expect(warning()).toBeNull();
    expect(screen.queryByText(COLD)).not.toBeInTheDocument();

    setTemperatures(26, 20, 18, 20);
    await user.selectOptions(kneadingSelect(), "Handknetung (+1 °C)");
    expect(waterTemperature()).toBe("45,0 °C");
    expect(warning()).toBeNull();
    expect(screen.queryByText(HEAT)).not.toBeInTheDocument();
  });

  it("F010/AC-7 der Hinweis verschwindet sofort, wenn das Ergebnis wieder zwischen 4 °C und 45 °C liegt", async () => {
    const user = userEvent.setup();
    render(<Calculator owner={GUEST} />);
    setTemperatures(24, 30, 26, 28);
    await user.selectOptions(kneadingSelect(), "Spiralkneter (+9 °C)");
    expect(screen.getByText(COLD)).toBeInTheDocument();

    setSlider(ROOM, 22);

    // 4 × 24 − (22 + 26 + 28 + 9) = 11
    expect(waterTemperature()).toBe("11,0 °C");
    expect(warning()).toBeNull();
    expect(screen.queryByText(COLD)).not.toBeInTheDocument();

    setTemperatures(27, 17, 15, 18);
    await user.selectOptions(kneadingSelect(), "Handknetung (+1 °C)");
    expect(screen.getByText(HEAT)).toBeInTheDocument();

    await replaceValue(user, textbox(DDT), "25");

    // 4 × 25 − (17 + 15 + 18 + 1) = 49 → noch heiß; 24 → 45
    expect(screen.getByText(HEAT)).toBeInTheDocument();
    await replaceValue(user, textbox(DDT), "24");
    expect(waterTemperature()).toBe("45,0 °C");
    expect(warning()).toBeNull();
  });
});

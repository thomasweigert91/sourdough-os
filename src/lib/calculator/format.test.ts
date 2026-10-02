import { describe, expect, it } from "vitest";
import { formatDecimal, parseDecimal } from "@/lib/calculator/format";

describe("F010 Zahlenformat des Rechners", () => {
  it("F010/AC-1 formatiert Kennzahlen im deutschen Format mit fester Nachkommastelle", () => {
    expect(formatDecimal(72.7272, 1)).toBe("72,7");
    expect(formatDecimal(172.7272, 1)).toBe("172,7");
    expect(formatDecimal(75, 1)).toBe("75,0");
    expect(formatDecimal(37, 1)).toBe("37,0");
    expect(formatDecimal(67.647, 1)).toBe("67,6");
  });

  it("F010/AC-1 formatiert Gramm ohne Nachkommastelle und ohne Tausendertrennzeichen", () => {
    expect(formatDecimal(1920, 0)).toBe("1920");
    expect(formatDecimal(1000, 0)).toBe("1000");
    expect(formatDecimal(800, 0)).toBe("800");
    expect(formatDecimal(766.666, 0)).toBe("767");
    expect(formatDecimal(12345.6, 1)).toBe("12345,6");
  });

  it("F010/AC-1 zeigt kein „-0“ und liefert für nicht endliche Werte einen leeren Text", () => {
    expect(formatDecimal(-0.04, 1)).toBe("0,0");
    expect(formatDecimal(-0, 0)).toBe("0");
    expect(formatDecimal(-0.4, 0)).toBe("0");
    expect(formatDecimal(-5, 0)).toBe("-5");
    expect(formatDecimal(Number.NaN, 1)).toBe("");
    expect(formatDecimal(Number.POSITIVE_INFINITY, 0)).toBe("");
  });

  it("F010/AC-2 akzeptiert Dezimaleingaben mit Komma und mit Punkt", () => {
    expect(parseDecimal("2,5")).toBe(2.5);
    expect(parseDecimal("2.5")).toBe(2.5);
    expect(parseDecimal(" 750 ")).toBe(750);
    expect(parseDecimal("-5")).toBe(-5);
    expect(parseDecimal("2,")).toBe(2);
    expect(parseDecimal("0")).toBe(0);
  });

  it("F010/AC-2 liefert null für leere Eingaben und NaN für ungültige", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("1.000,5")).toBeNaN();
    expect(parseDecimal("2,5,1")).toBeNaN();
  });
});

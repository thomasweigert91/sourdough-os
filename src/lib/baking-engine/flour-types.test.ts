// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOUR_TYPE_ID,
  FLOUR_TYPES,
  OTHER_FLOUR_TYPE_ID,
  calculateAdjustedWaterForFlourSwap,
  calculateFlourAbsorption,
  findFlourTypeByName,
  getFlourType,
  isFlourTypeId,
  normalizeFlourName,
  type FlourPortion,
  type FlourType,
  type FlourTypeId,
} from "@/lib/baking-engine/flour-types";

const SPELT_NOTE = "Dinkel überknetet schnell.";
const RYE_NOTE = "Roggenteig nur kurz mischen, nicht auskneten.";

/** Katalogtabelle aus dem Plan F011 (Reihenfolge = Anzeigereihenfolge der Auswahl „Mehltyp“). */
const EXPECTED_CATALOG: FlourType[] = [
  { id: "wheat_405", name: "Weizen 405", group: "wheat", absorptionFactor: 0.95, kneadingTolerance: "medium", note: null },
  { id: "wheat_550", name: "Weizen 550", group: "wheat", absorptionFactor: 1.0, kneadingTolerance: "medium", note: null },
  { id: "wheat_1050", name: "Weizen 1050", group: "wheat", absorptionFactor: 1.05, kneadingTolerance: "medium", note: null },
  {
    id: "wheat_wholegrain",
    name: "Weizen Vollkorn",
    group: "wheat",
    absorptionFactor: 1.15,
    kneadingTolerance: "low",
    note: "Kleie schwächt das Klebergerüst, kürzer kneten.",
  },
  { id: "spelt_630", name: "Dinkel 630", group: "spelt", absorptionFactor: 0.92, kneadingTolerance: "low", note: SPELT_NOTE },
  { id: "spelt_1050", name: "Dinkel 1050", group: "spelt", absorptionFactor: 0.96, kneadingTolerance: "low", note: SPELT_NOTE },
  {
    id: "spelt_wholegrain",
    name: "Dinkel Vollkorn",
    group: "spelt",
    absorptionFactor: 1.02,
    kneadingTolerance: "low",
    note: SPELT_NOTE,
  },
  { id: "rye_815", name: "Roggen 815", group: "rye", absorptionFactor: 1.08, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "rye_997", name: "Roggen 997", group: "rye", absorptionFactor: 1.11, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "rye_1150", name: "Roggen 1150", group: "rye", absorptionFactor: 1.15, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "rye_1370", name: "Roggen 1370", group: "rye", absorptionFactor: 1.19, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "rye_wholegrain", name: "Roggen Vollkorn", group: "rye", absorptionFactor: 1.24, kneadingTolerance: "low", note: RYE_NOTE },
  { id: "manitoba", name: "Manitoba", group: "special", absorptionFactor: 1.25, kneadingTolerance: "high", note: null },
  {
    id: "tipo_00",
    name: "Tipo 00 (Pizzamehl)",
    group: "special",
    absorptionFactor: 0.98,
    kneadingTolerance: "medium",
    note: "Der Wasserbedarf weicht je nach Packung (Kleberstärke) ab.",
  },
  { id: "other_flour", name: "Sonstiges Mehl", group: "other", absorptionFactor: 1.0, kneadingTolerance: "medium", note: null },
];

/** Referenzrezept F010: Weizen 550 800 g, Roggen 1150 200 g. */
const REFERENCE_FLOURS: FlourPortion[] = [
  { flourType: "wheat_550", amountGrams: 800 },
  { flourType: "rye_1150", amountGrams: 200 },
];
const SPELT_FLOURS: FlourPortion[] = [
  { flourType: "spelt_630", amountGrams: 800 },
  { flourType: "rye_1150", amountGrams: 200 },
];

function withFirst(flourType: FlourTypeId): FlourPortion[] {
  return [
    { flourType, amountGrams: 800 },
    { flourType: "rye_1150", amountGrams: 200 },
  ];
}

describe("F011 Mehltypen-Katalog", () => {
  it("F011/AC-1 enthält genau die 15 Mehltypen der Katalogtabelle in Anzeigereihenfolge", () => {
    expect(FLOUR_TYPES).toHaveLength(15);
    expect(FLOUR_TYPES).toEqual(EXPECTED_CATALOG);
    expect(FLOUR_TYPES.map((flour) => flour.name)).toEqual([
      "Weizen 405",
      "Weizen 550",
      "Weizen 1050",
      "Weizen Vollkorn",
      "Dinkel 630",
      "Dinkel 1050",
      "Dinkel Vollkorn",
      "Roggen 815",
      "Roggen 997",
      "Roggen 1150",
      "Roggen 1370",
      "Roggen Vollkorn",
      "Manitoba",
      "Tipo 00 (Pizzamehl)",
      "Sonstiges Mehl",
    ]);
  });

  it("F011/AC-1 hat die im Ticket festgelegten Absorptionsfaktoren", () => {
    expect(getFlourType("wheat_550").absorptionFactor).toBe(1.0);
    expect(getFlourType("wheat_wholegrain").absorptionFactor).toBe(1.15);
    expect(getFlourType("spelt_630").absorptionFactor).toBe(0.92);
    expect(getFlourType("rye_1150").absorptionFactor).toBe(1.15);
    expect(getFlourType("manitoba").absorptionFactor).toBe(1.25);
    expect(getFlourType("other_flour").absorptionFactor).toBe(1.0);
  });

  it("F011/AC-1 gruppiert nach Getreide: Weizen, Dinkel, Roggen (fünf Typen), Sonderfälle, danach Sonstiges Mehl", () => {
    const idsOf = (group: FlourType["group"]) => FLOUR_TYPES.filter((flour) => flour.group === group).map((f) => f.id);

    expect(idsOf("wheat")).toEqual(["wheat_405", "wheat_550", "wheat_1050", "wheat_wholegrain"]);
    expect(idsOf("spelt")).toEqual(["spelt_630", "spelt_1050", "spelt_wholegrain"]);
    expect(idsOf("rye")).toEqual(["rye_815", "rye_997", "rye_1150", "rye_1370", "rye_wholegrain"]);
    expect(idsOf("special")).toEqual(["manitoba", "tipo_00"]);
    expect(idsOf("other")).toEqual(["other_flour"]);
    expect(FLOUR_TYPES.map((flour) => flour.group)).toEqual([
      ...Array(4).fill("wheat"),
      ...Array(3).fill("spelt"),
      ...Array(5).fill("rye"),
      ...Array(2).fill("special"),
      "other",
    ]);
  });

  it("F011/AC-1 erkennt gültige Mehltyp-Schlüssel und liefert den Katalogeintrag", () => {
    for (const flour of EXPECTED_CATALOG) {
      expect(isFlourTypeId(flour.id)).toBe(true);
      expect(getFlourType(flour.id)).toEqual(flour);
    }
    for (const value of ["weizen_550", "WHEAT_550", "Weizen 550", "", null, undefined, 550, {}, ["wheat_550"]]) {
      expect(isFlourTypeId(value)).toBe(false);
    }
  });

  it("F011/AC-2 Standard für neue Mehlzeilen ist Weizen 550", () => {
    expect(DEFAULT_FLOUR_TYPE_ID).toBe("wheat_550");
    expect(getFlourType(DEFAULT_FLOUR_TYPE_ID).name).toBe("Weizen 550");
  });

  it("F011/AC-10 „Sonstiges Mehl“ hat einen eigenen Schlüssel und Faktor 1,00", () => {
    expect(OTHER_FLOUR_TYPE_ID).toBe("other_flour");
    expect(getFlourType(OTHER_FLOUR_TYPE_ID)).toMatchObject({ name: "Sonstiges Mehl", absorptionFactor: 1.0 });
  });
});

describe("F011 Rechenregel calculateAdjustedWaterForFlourSwap", () => {
  it("F011/AC-4 Absorption der Referenzmischung 1030, nach Wechsel auf Dinkel 630 966", () => {
    expect(calculateFlourAbsorption(REFERENCE_FLOURS)).toBeCloseTo(1030, 9);
    expect(calculateFlourAbsorption(SPELT_FLOURS)).toBeCloseTo(966, 9);
    expect(calculateFlourAbsorption([])).toBe(0);
  });

  it("F011/AC-4 Weizen 550 → Dinkel 630 senkt 70 % Wasser auf 65,65 % (ungerundet, Einheit bleibt)", () => {
    expect(calculateAdjustedWaterForFlourSwap(REFERENCE_FLOURS, SPELT_FLOURS, 70)).toBeCloseTo(65.6504854, 6);
    expect(calculateAdjustedWaterForFlourSwap(REFERENCE_FLOURS, SPELT_FLOURS, 700)).toBeCloseTo(656.504854, 5);
    // Manitoba: 70 × (800 × 1,25 + 200 × 1,15) / 1030
    expect(calculateAdjustedWaterForFlourSwap(REFERENCE_FLOURS, withFirst("manitoba"), 70)).toBeCloseTo(
      (70 * 1230) / 1030,
      9,
    );
    // Weizen Vollkorn und Roggen 1150 haben denselben Faktor 1,15.
    expect(
      calculateAdjustedWaterForFlourSwap(withFirst("rye_1150"), withFirst("wheat_wholegrain"), 70),
    ).toBeCloseTo(70, 12);
  });

  it("F011/AC-5 Hin- und Rückwechsel über mehrere Mehltypen führt ohne Drift auf 70 % zurück", () => {
    const chain: FlourTypeId[] = ["spelt_630", "manitoba", "rye_wholegrain", "tipo_00", "rye_815", "wheat_550"];
    let previous = REFERENCE_FLOURS;
    let water = 70;
    for (const flourType of chain) {
      const next = withFirst(flourType);
      water = calculateAdjustedWaterForFlourSwap(previous, next, water);
      previous = next;
    }

    expect(water).toBeCloseTo(70, 9);
    expect(calculateAdjustedWaterForFlourSwap(SPELT_FLOURS, REFERENCE_FLOURS, (70 * 966) / 1030)).toBeCloseTo(70, 9);
  });

  it("F011/AC-8 ohne Mehlmenge oder bei ungültigen Werten bleibt das Wasser unverändert, ohne Fehler", () => {
    const zero: FlourPortion[] = [
      { flourType: "wheat_550", amountGrams: 0 },
      { flourType: "rye_1150", amountGrams: 0 },
    ];
    const zeroSpelt: FlourPortion[] = [
      { flourType: "spelt_630", amountGrams: 0 },
      { flourType: "rye_1150", amountGrams: 0 },
    ];

    expect(calculateAdjustedWaterForFlourSwap(zero, zeroSpelt, 70)).toBe(70);
    expect(calculateAdjustedWaterForFlourSwap([], SPELT_FLOURS, 70)).toBe(70);
    expect(calculateAdjustedWaterForFlourSwap(REFERENCE_FLOURS, [], 70)).toBe(70);
    expect(
      calculateAdjustedWaterForFlourSwap(
        REFERENCE_FLOURS,
        [
          { flourType: "spelt_630", amountGrams: Number.NaN },
          { flourType: "rye_1150", amountGrams: 200 },
        ],
        70,
      ),
    ).toBe(70);
    expect(
      calculateAdjustedWaterForFlourSwap(
        [
          { flourType: "wheat_550", amountGrams: -800 },
          { flourType: "rye_1150", amountGrams: 2000 },
        ],
        [
          { flourType: "spelt_630", amountGrams: -800 },
          { flourType: "rye_1150", amountGrams: 2000 },
        ],
        70,
      ),
    ).toBe(70);
    expect(
      calculateAdjustedWaterForFlourSwap(
        [{ flourType: "wheat_550", amountGrams: Number.POSITIVE_INFINITY }],
        [{ flourType: "spelt_630", amountGrams: Number.POSITIVE_INFINITY }],
        70,
      ),
    ).toBe(70);
    expect(Number.isNaN(calculateAdjustedWaterForFlourSwap(REFERENCE_FLOURS, SPELT_FLOURS, Number.NaN))).toBe(true);
    expect(() => calculateAdjustedWaterForFlourSwap(zero, zeroSpelt, Number.NaN)).not.toThrow();
  });
});

describe("F011 Namensabgleich für ältere Stände", () => {
  it("F011/AC-11 normalizeFlourName entfernt Randleerzeichen und ignoriert Groß-/Kleinschreibung", () => {
    expect(normalizeFlourName(" Dinkel 630 ")).toBe("dinkel 630");
    expect(normalizeFlourName("ROGGENMEHL")).toBe("roggenmehl");
    expect(normalizeFlourName("Dinkel  630")).toBe("dinkel  630");
    expect(normalizeFlourName("   ")).toBe("");
  });

  it("F011/AC-11 findFlourTypeByName findet nur exakte Katalognamen, keine Aliasse oder Teilstrings", () => {
    expect(findFlourTypeByName("dinkel 630")?.id).toBe("spelt_630");
    expect(findFlourTypeByName(" DINKEL 630 ")?.id).toBe("spelt_630");
    expect(findFlourTypeByName("tipo 00 (pizzamehl)")?.id).toBe("tipo_00");
    expect(findFlourTypeByName("sonstiges mehl")?.id).toBe("other_flour");
    expect(findFlourTypeByName("Roggen Vollkorn")).toEqual(getFlourType("rye_wholegrain"));

    for (const name of ["Weizenmehl", "Roggenmehl", "Ruchmehl", "Dinkel  630", "Dinkel", "Weizenmehl 550", ""]) {
      expect(findFlourTypeByName(name)).toBeUndefined();
    }
  });
});

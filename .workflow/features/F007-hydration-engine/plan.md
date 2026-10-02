# Plan F007: Bäckerprozent- und Netto-Hydratations-Engine

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Ein reines, seiteneffektfreies TypeScript-Modul `src/lib/baking-engine/hydration.ts` ohne React, ohne Datenbankzugriff und ohne neue Abhängigkeiten. Es exportiert die vom Nutzer vorgegebenen Funktionen `calculateRecipeFromFlourBasis`, `calculateRecipeFromTotalWeight` und `calculateNetHydration`. Für AC-7 (Bäckerprozente aus Grammangaben) kommt `calculateBakersPercentages` als vierte Funktion dazu, weil keine der drei vorgegebenen Funktionen diese Richtung abdeckt. Die Funktionen rechnen intern ungerundet und geben ungerundete Werte zurück (Rundung erst in der Anzeige, siehe Ticket). Ungültige Eingaben führen zu einem `Error` mit exportierter deutscher Meldung (Muster wie die Message-Konstanten in `src/lib/auth-form.ts`). Der Zutatentyp wird als `import type { IngredientType }` aus `src/db/schema/recipes.ts` übernommen. Das ist ein reiner Typimport, zur Laufzeit wird kein Drizzle-Code geladen.

Begriffe im Code (verbindlich laut Ticket): `flourBasis` = **Mehlbasis** (nur Zutaten vom Typ `flour`, Bezugsgröße aller Bäckerprozente und der Skalierung); `totalFlour` / `totalWater` = **Gesamtmehl** / **Gesamtwasser** (inkl. Starter-Anteil, nur für die Netto-Hydratation).

Verworfene Alternativen:
- Direkt mit `RecipeIngredient` aus Drizzle arbeiten: verlangt `id`, `recipeId`, `position`. Die Engine soll aber auch mit ungespeicherten Editor-Daten laufen. Deshalb gibt es schmale eigene Eingabetypen.
- Ergebnis-Klasse oder `Result`-Typ statt Exceptions: Das Ticket verlangt ausdrücklich, dass ein Fehler geworfen wird (AC-8, AC-9).
- Netto-Hydratation zusammen mit der Brutto-Hydratation als Objekt zurückgeben: AC-4 schließt aus, dass die Bruttoangabe ausgegeben wird. Deshalb liefert die Funktion `number | null`.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/lib/baking-engine/hydration.ts | neu | Rechen-Engine: Typen, Fehlermeldungs-Konstanten, vier exportierte Funktionen |
| src/lib/baking-engine/hydration.test.ts | neu | Vitest-Unit-Tests für AC-1 bis AC-11 (`// @vitest-environment node`) |

Keine bestehenden Dateien werden geändert. `src/db/schema/recipes.ts` wird nur per `import type` gelesen.

## Komponenten & Datenfluss
Keine Komponenten, kein State, keine API-Aufrufe, keine Lade- oder Fehlerzustände in der UI. Die Engine ist synchron: Daten rein, Ergebnis raus.

### Öffentliche API von `src/lib/baking-engine/hydration.ts`
```ts
import type { IngredientType } from "@/db/schema/recipes";

/** Zutat mit Bäckerprozent (Eingabe für die Skalierung). */
export interface PercentIngredient {
  name: string;
  type: IngredientType;            // "flour" | "water" | "starter" | "salt" | "other"
  bakersPercent: number;           // bezogen auf die Mehlbasis, >= 0
  starterHydration?: number;       // nur bei type "starter" relevant, Standard 100, >= 0
}

/** Zutat mit Grammangabe (Eingabe für Netto-Hydratation und Bäckerprozente). */
export interface GramIngredient {
  name: string;
  type: IngredientType;
  amountGrams: number;             // >= 0
  starterHydration?: number;       // nur bei type "starter" relevant, Standard 100, >= 0
}

/** Ausgabe-Zutat: alle Eingabefelder unverändert plus berechnetes Feld. */
export type ScaledIngredient = PercentIngredient & { amountGrams: number };
export type PercentagedIngredient = GramIngredient & { bakersPercent: number };

export interface ScaledRecipe {
  flourBasis: number;              // Mehlbasis in g, ungerundet
  totalWeight: number;             // Summe aller amountGrams, ungerundet
  ingredients: ScaledIngredient[]; // gleiche Reihenfolge wie die Eingabe
}

export const DEFAULT_STARTER_HYDRATION = 100;
export const FLOUR_PERCENT_TOLERANCE = 0.01; // Prozentpunkte

export const FLOUR_PERCENT_SUM_MESSAGE = "Die Mehlanteile müssen zusammen 100 % ergeben.";
export const INVALID_FLOUR_BASIS_MESSAGE = "Die Mehlbasis muss größer als 0 g sein.";
export const INVALID_TOTAL_WEIGHT_MESSAGE = "Das Teiggewicht muss größer als 0 g sein.";
export const NEGATIVE_BAKERS_PERCENT_MESSAGE = "Bäckerprozente dürfen nicht negativ sein.";
export const NEGATIVE_GRAMS_MESSAGE = "Grammangaben dürfen nicht negativ sein.";
export const NEGATIVE_STARTER_HYDRATION_MESSAGE = "Die Starter-Hydratation darf nicht negativ sein.";
export const NO_FLOUR_MESSAGE = "Das Rezept enthält kein Mehl.";

export function calculateRecipeFromFlourBasis(
  ingredients: readonly PercentIngredient[], flourBasis: number): ScaledRecipe;
export function calculateRecipeFromTotalWeight(
  ingredients: readonly PercentIngredient[], totalWeight: number): ScaledRecipe;
export function calculateNetHydration(ingredients: readonly GramIngredient[]): number | null;
export function calculateBakersPercentages(
  ingredients: readonly GramIngredient[]): PercentagedIngredient[];
```

### Rechenregeln und Fehlerverhalten
- **Validierung (intern, `assertValid…`-Helfer):** Nicht endliche Zahlen (`NaN`, `Infinity`) gelten als ungültig und werden mit derselben Meldung abgewiesen wie negative Werte. Jede Funktion prüft alle Zahlen ihrer Eingabe. Fehlt `starterHydration`, gilt `DEFAULT_STARTER_HYDRATION`.
- **calculateRecipeFromFlourBasis:** `flourBasis` muss endlich und > 0 sein (sonst `INVALID_FLOUR_BASIS_MESSAGE`). Jedes `bakersPercent` muss >= 0 sein, die Starter-Hydratation >= 0. Die Summe der `bakersPercent` aller `flour`-Zutaten muss innerhalb von `|sum − 100| <= FLOUR_PERCENT_TOLERANCE` liegen, sonst `FLOUR_PERCENT_SUM_MESSAGE`. Das gilt auch, wenn kein Mehl vorhanden ist (Summe 0). Wegen Gleitkomma wird mit `<= 0.01 + 1e-9` verglichen, damit z. B. 80 + 20,005 sicher durchgeht. Dann gilt `amountGrams = flourBasis × bakersPercent / 100`. Die Zutaten werden kopiert (`{ ...ing, amountGrams }`), Name, Typ und Starter-Hydratation bleiben erhalten. `totalWeight` ist die Summe aller Grammangaben.
- **calculateRecipeFromTotalWeight:** `totalWeight` muss endlich und > 0 sein (sonst `INVALID_TOTAL_WEIGHT_MESSAGE`). Danach dieselben Prüfungen der Prozente wie oben. `flourBasis = totalWeight / Σ bakersPercent × 100` (alle Zutaten), dann Aufruf von `calculateRecipeFromFlourBasis`. Die Σ ist durch die Mehlprüfung immer >= 99,99, Division durch 0 ist also ausgeschlossen.
- **calculateNetHydration:** Prüft `amountGrams >= 0` und die Starter-Hydratation >= 0. Jeder Starter wird einzeln zerlegt: `starterFlour = m / (1 + h/100)`, `starterWater = m − starterFlour`. `totalFlour = Σ flour + Σ starterFlour`, `totalWater = Σ water + Σ starterWater`. `salt` und `other` werden ignoriert. Ist `totalFlour === 0`, ist das Ergebnis `null`. Sonst `totalWater / totalFlour × 100`.
- **calculateBakersPercentages:** Prüft `amountGrams >= 0`. Die Mehlbasis ist `Σ amountGrams` der `flour`-Zutaten, ohne Starter-Mehl. Ist sie 0, wird `NO_FLOUR_MESSAGE` geworfen (sonst Division durch 0 bzw. NaN, AC-9-Geist). `bakersPercent = amountGrams / flourBasis × 100`. Die Zutaten werden mit allen Feldern kopiert.

Neue Abhängigkeiten: keine.

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Ordner `src/lib/baking-engine/` und Datei `hydration.ts` anlegen: Typen (`PercentIngredient`, `GramIngredient`, `ScaledIngredient`, `PercentagedIngredient`, `ScaledRecipe`), Konstanten und Fehlermeldungen wie oben exportieren. `IngredientType` per `import type` aus `@/db/schema/recipes` (AC-1, AC-8, AC-9)
2. Interne Validierungshelfer: endlich und > 0 für Mehlbasis bzw. Teiggewicht, endlich und >= 0 für Prozente, Gramm und Starter-Hydratation, jeweils mit der passenden Meldung (AC-9)
3. Interne Prüfung der Mehlanteile `|Σ flour% − 100| <= 0,01` (mit Epsilon für Gleitkomma) und Fehler `FLOUR_PERCENT_SUM_MESSAGE` (AC-8)
4. `calculateRecipeFromFlourBasis`: Grammangaben = Mehlbasis × % / 100, Name, Typ und Reihenfolge erhalten, `flourBasis` und `totalWeight` ungerundet zurückgeben (AC-1, AC-8, AC-9)
5. `calculateRecipeFromTotalWeight`: Mehlbasis = Teiggewicht / Σ% × 100, dann an Schritt 4 delegieren (AC-2, AC-3, AC-8, AC-9)
6. `calculateNetHydration`: jeden Starter einzeln mit eigener oder Standard-Hydratation zerlegen, Gesamtmehl und Gesamtwasser summieren, Salz und Sonstiges ignorieren, `null` bei Gesamtmehl 0, nur die Netto-Zahl zurückgeben (AC-4, AC-5, AC-6, AC-9, AC-10, AC-11)
7. `calculateBakersPercentages`: Prozente bezogen auf die Mehlbasis (nur `flour`, ohne Starter-Mehl), Fehler bei negativen Gramm oder fehlendem Mehl (AC-7, AC-9)
8. `npm test -- src/lib/baking-engine` und `npx tsc --noEmit` grün; `npm run lint` ohne Fehler (AC-1 bis AC-11)

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle Tests sind Vitest-Unit-Tests in **einer** Datei `src/lib/baking-engine/hydration.test.ts`, erste Zeile `// @vitest-environment node`, Import aus `@/lib/baking-engine/hydration`. Testnamen nach Projektmuster mit Präfix `F007/AC-n …`. Zahlen werden mit `toBeCloseTo(wert, 2)` verglichen, außer bei der ungerundeten Summe in AC-3 (`toBeCloseTo(1000, 9)`). Fehler werden mit `expect(() => …).toThrow(MESSAGE_KONSTANTE)` geprüft. Das Referenzrezept liegt als `PercentIngredient[]`-Fixture im Test: `{name:"Weizenmehl 550",type:"flour",bakersPercent:80}`, `{name:"Roggenmehl 1150",type:"flour",bakersPercent:20}`, `{name:"Wasser",type:"water",bakersPercent:70}`, `{name:"Starter",type:"starter",bakersPercent:20}`, `{name:"Salz",type:"salt",bakersPercent:2}`.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/baking-engine/hydration.test.ts | `calculateRecipeFromFlourBasis(ref, 1000)` liefert 800/200/700/200/20 g, `totalWeight` 1920, `flourBasis` 1000. Name und Typ jeder Zutat bleiben in Eingabereihenfolge erhalten, die Eingabe wird nicht mutiert. |
| AC-2 | Unit | src/lib/baking-engine/hydration.test.ts | `calculateRecipeFromTotalWeight(ref, 960)` liefert `flourBasis` 500 und 400/100/350/100/10 g. Die Summe der `amountGrams` und `totalWeight` sind 960. |
| AC-3 | Unit | src/lib/baking-engine/hydration.test.ts | `calculateRecipeFromTotalWeight(ref, 1000)` liefert `flourBasis` ≈ 520,83 und 416,67/104,17/364,58/104,17/10,42 g (2 Stellen). Die ungerundete Summe der `amountGrams` ist ≈ 1000 (9 Stellen), die Werte sind also nicht vorgerundet. |
| AC-4 | Unit | src/lib/baking-engine/hydration.test.ts | `calculateNetHydration` mit 800/200 Mehl, 700 Wasser, Starter 200 g (`starterHydration: 100`), Salz 20 ergibt ≈ 72,73. Der Rückgabewert ist eine `number` (kein Objekt mit Brutto-Wert) und ungleich 70. Zusatzfall: Ohne `starterHydration` wird der Standard 100 verwendet, Ergebnis ebenfalls ≈ 72,73. |
| AC-5 | Unit | src/lib/baking-engine/hydration.test.ts | Dasselbe Rezept mit `starterHydration: 50` ergibt ≈ 67,65 (766,67 / 1133,33). |
| AC-6 | Unit | src/lib/baking-engine/hydration.test.ts | Mehl 1000, Wasser 650, Salz 20 ergibt 65. Zusatzfall mit `other`-Zutat (z. B. Saaten 100 g): Ergebnis bleibt 65. |
| AC-7 | Unit | src/lib/baking-engine/hydration.test.ts | `calculateBakersPercentages` mit 800/200/700/200(Starter)/20 g ergibt 80/20/70/20/2 %. Das Starter-Mehl fließt nicht in die Basis ein (Starter = 20 %, nicht 200/1100). Name, Typ und `amountGrams` bleiben erhalten. |
| AC-8 | Unit | src/lib/baking-engine/hydration.test.ts | Drei Mehle 33,3/33,3/33,4 bei 1000 g Mehlbasis ergeben 333/333/334 g ohne Fehler. 80 + 20,005 wirft weder bei `calculateRecipeFromFlourBasis` noch bei `calculateRecipeFromTotalWeight`. 80 + 30 wirft in beiden Funktionen `FLOUR_PERCENT_SUM_MESSAGE` („Die Mehlanteile müssen zusammen 100 % ergeben.“). |
| AC-9 | Unit | src/lib/baking-engine/hydration.test.ts | `it.each`: Mehlbasis 0 und −1 werfen `INVALID_FLOUR_BASIS_MESSAGE`, Teiggewicht 0 und −1 werfen `INVALID_TOTAL_WEIGHT_MESSAGE`. Ein negatives `bakersPercent` wirft `NEGATIVE_BAKERS_PERCENT_MESSAGE` (beide Skalierfunktionen). Negative `amountGrams` werfen `NEGATIVE_GRAMS_MESSAGE` (`calculateNetHydration`, `calculateBakersPercentages`). `starterHydration: -1` wirft `NEGATIVE_STARTER_HYDRATION_MESSAGE` (`calculateNetHydration` und `calculateRecipeFromFlourBasis`). `NaN` als Mehlbasis wirft ebenfalls. `calculateBakersPercentages` ohne Mehl wirft `NO_FLOUR_MESSAGE`. |
| AC-10 | Unit | src/lib/baking-engine/hydration.test.ts | Wasser 500 und Salz 10 (ohne Mehl und Starter) ergeben `toBeNull()`. Leeres Array ebenfalls `null`. |
| AC-11 | Unit | src/lib/baking-engine/hydration.test.ts | Mehl 1000, Wasser 700, Roggensauer 200 g (100 %) und Lievito Madre 150 g (50 %) ergeben ≈ 70,83 (850 / 1200). |

## Risiken & Rollback
- **Vierte Funktion außerhalb der Nutzervorgabe:** Die Vorgabe nennt drei Funktionen. AC-7 verlangt aber die Umrechnung Gramm → Bäckerprozent, die keine davon leistet. Deshalb gibt es zusätzlich `calculateBakersPercentages`. Keine Abweichung vom Ticket, aber dem Hauptagenten gemeldet.
- **Zusätzliche Fehlerfälle, die das Ticket nicht ausdrücklich nennt:** `NO_FLOUR_MESSAGE` bei `calculateBakersPercentages` ohne Mehl und die Abweisung von `NaN`/`Infinity`. Beides folgt aus dem Grundsatz in AC-9 (kein 0/NaN). Die Meldungstexte außer der Mehlanteil-Meldung sind von mir festgelegt, nicht vom Ticket.
- **Gleitkomma an der Toleranzgrenze:** 80 + 20,005 bzw. eine Abweichung von genau 0,01 kann binär knapp über 0,01 landen. Gegenmaßnahme: Vergleich mit kleinem Epsilon (1e-9). Werte knapp über der Grenze (z. B. 100,0101) werden weiter abgewiesen.
- **Starter-Hydratation „Standard 100“:** In der DB ist das Feld `NOT NULL DEFAULT 100`. In der Engine ist es optional mit demselben Standard, damit Editor-Daten ohne das Feld funktionieren.
- **Typkopplung an das DB-Schema:** `import type` aus `src/db/schema/recipes.ts` erzeugt keine Laufzeitabhängigkeit auf Drizzle, das Modul bleibt clientseitig nutzbar. Ändert sich das Enum später, meldet der Compiler die betroffenen Stellen.
- **Rollback:** Es gibt nur zwei neue Dateien und keine Änderungen an bestehendem Code, Schema oder Abhängigkeiten. Zurückrollen heißt den Ordner `src/lib/baking-engine/` löschen bzw. den Commit reverten.

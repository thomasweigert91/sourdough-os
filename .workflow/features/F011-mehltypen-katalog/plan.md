# Plan F011: Mehltypen-Katalog und automatische Hydratations-Kompensation

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Der Katalog kommt als typisierte Konstante `FLOUR_TYPES` neben die Rechenregel `calculateAdjustedWaterForFlourSwap` in ein neues Engine-Modul `src/lib/baking-engine/flour-types.ts`, analog zu `FRICTION_PRESETS` in `ddt.ts`. Das Modul enthält nur reine Funktionen, liefert ungerundete Werte und importiert nichts aus `@/db`. Der Rechner-Zustand (`recipe-state.ts`) bekommt je Zeile ein Feld `flourType` (bei Mehlzeilen ein Katalog-Schlüssel, sonst `null`) und im Rezept den Schalterzustand `adjustWaterOnFlourSwap`. Die neue reine Funktion `setRowFlourType` wechselt den Mehltyp und passt bei eingeschaltetem Schalter das Wasser-Bäckerprozent mit dem Verhältnis „Absorption nachher / Absorption vorher“ an. Die Grammwerte folgen über die bestehenden Basisregeln: bei „Gesamtmehl“ g = F × p / 100, bei „Ziel-Teiggewicht“ über `setBasisValue` mit unverändertem Teiggewicht. Der Anzeigename einer Mehlzeile wird aus dem Katalog abgeleitet. Bei „Sonstiges Mehl“ gilt der freie Name. Speichern im Konto (`buildSaveRecipeInput` → `ingredientDisplayName`) liefert deshalb ohne Codeänderung den Mehltyp als Zutatennamen. „Lokal merken“ speichert die neuen Felder automatisch mit, weil sie Teil von `RecipeState` sind. Beim Laden ergänzt der Parser bei älteren Ständen fehlende Felder (AC-11). Dabei ordnet er freie Mehlnamen ohne Beachtung von Groß-/Kleinschreibung und Randleerzeichen zu: „Weizenmehl“ → Weizen 550, „Roggenmehl“ → Roggen 1150, Katalogname → dieser Mehltyp, alles andere → „Sonstiges Mehl“ mit dem bisherigen Namen.

Verworfene Alternativen:
- **DB-Tabelle `flour_types`**: laut Ticket (Frage 4) ausgeschlossen. Außerdem müsste der Katalog dann offline geladen werden.
- **Schalter als eigener Zustand in `Calculator`/`CalculatorDraft`**: `setRowFlourType` bräuchte ihn als zusätzlichen Parameter, und `local-draft.ts` bräuchte ein weiteres Top-Level-Feld. Als Feld in `RecipeState` ist er automatisch Teil von „Lokal merken“, gelangt aber nicht ins Konto-Rezept, weil `buildSaveRecipeInput` nur die Zeilen abbildet.
- **„Anker“-Wasserwert (Wasser bei Mehlfaktor 1,0) für exakten Rückwechsel**: Der Anker müsste bei jeder anderen Eingabe zurückgesetzt werden, also in allen Setzern. Das Ticket verlangt Freiheit von Rundungsdrift. Die ist bereits gegeben, weil der Zustand ungerundet bleibt und nie Anzeigewerte weiterrechnet. Die verbleibende Gleitkomma-Abweichung liegt bei etwa 1e-14 und ist in der Anzeige unsichtbar (siehe Risiken).
- **`DRAFT_VERSION` auf 2 erhöhen**: Damit wären alle F010-Stände ungültig, oder es bräuchte einen Versionszweig. Stattdessen bleibt Version 1, und die neuen Felder sind beim Parsen optional. Fehlen sie, greift die Migration aus AC-11.
- **Absorption aus Bäckerprozenten statt Gramm**: Das Ticket legt Gramm × Faktor fest. Das Verhältnis ist bei gemeinsamer Basis identisch. Die Gültigkeitsprüfung (siehe unten) schließt die Fälle aus, in denen Gramm und Prozent nicht zusammenpassen.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/lib/baking-engine/flour-types.ts | neu | Katalog `FLOUR_TYPES`, Typen, Lookups, `calculateFlourAbsorption`, `calculateAdjustedWaterForFlourSwap` |
| src/lib/baking-engine/flour-types.test.ts | neu | Unit-Tests Katalog (Reihenfolge, Werte) und Rechenregel |
| src/lib/calculator/messages.ts | ändern | Labels „Mehltyp“, Schaltertext, Gruppenüberschriften |
| src/lib/calculator/recipe-state.ts | ändern | `RecipeRow.flourType`, `RecipeState.adjustWaterOnFlourSwap`, Referenzrezept, `newRow`, `setRowFlourType`, `setAdjustWaterOnFlourSwap`, `ingredientDisplayName` |
| src/lib/calculator/recipe-state-flour-type.test.ts | neu | Unit-Tests Mehlwechsel, Schalter, Basis-Modi, Sonstiges Mehl, Payload-Namen |
| src/lib/calculator/local-draft.ts | ändern | Parsen von `flourType`/`adjustWaterOnFlourSwap`, `migrateLegacyFlourName` mit Aliassen „Weizenmehl“/„Roggenmehl“ für ältere Stände |
| src/lib/calculator/local-draft-flour-type.test.ts | neu | Unit-Tests Merken/Laden der neuen Felder, Migrations-Testmatrix (AC-9, AC-11) |
| src/components/calculator/ingredient-row.tsx | ändern | Auswahl „Mehltyp“ mit `optgroup`, Feld „Name“ nur bei „Sonstiges Mehl“, Fokus-Ref auf die Auswahl |
| src/components/calculator/hydration-calculator.tsx | ändern | Schalter oberhalb der Zutatenliste, Verdrahtung `setRowFlourType`, Fokus nach „Mehl hinzufügen“ auf „Mehltyp“ |
| src/components/calculator/calculator-flour-types.test.tsx | neu | Komponententests AC-1 bis AC-11 |
| src/test/calculator.ts | ändern | `REFERENCE_NAMES` auf „Weizen 550“/„Roggen 1150“; Helfer `flourTypeSelect`, `adjustWaterSwitch` |
| src/components/calculator/calculator-hydration.test.tsx | ändern | F010-Erwartungen an neue Mehlnamen und an „Mehl hinzufügen“ (Fokus auf „Mehltyp“) anpassen |
| src/components/calculator/calculator-save.test.tsx | ändern | F010-Payload-Namen und Lokal-merken-Rundlauf (freier Mehlname nur noch über „Sonstiges Mehl“) anpassen |
| src/lib/calculator/recipe-state.test.ts | ändern | F010-Erwartungen an Namen des Referenzrezepts, `RecipeRow`-Literal um `flourType` ergänzen |
| src/lib/calculator/save-recipe.test.ts | ändern | F010-Payload-Namen („Weizen 550“, „Roggen 1150“, neue Mehlzeile „Weizen 550“) |

Unverändert und wiederverwendet: `hydration.ts` (F007/F008), `ddt.ts`, `save-recipe.ts`, `save-panel.tsx`, `calculator.tsx`, `number-field.tsx`, `src/app/calculator/actions.ts`. Keine neuen Abhängigkeiten, keine Migration, keine Schemaänderung.

## Komponenten & Datenfluss

### Katalog (`src/lib/baking-engine/flour-types.ts`)
```ts
export type FlourTypeId =
  | "wheat_405" | "wheat_550" | "wheat_1050" | "wheat_wholegrain"
  | "spelt_630" | "spelt_1050" | "spelt_wholegrain"
  | "rye_815" | "rye_997" | "rye_1150" | "rye_1370" | "rye_wholegrain"
  | "manitoba" | "tipo_00"
  | "other_flour";
export type FlourGroup = "wheat" | "spelt" | "rye" | "special" | "other";
/** Drei Stufen laut Ticket: niedrig / mittel / hoch. Nur Metadaten, in F011 nicht angezeigt. */
export type KneadingTolerance = "low" | "medium" | "high";

export interface FlourType {
  id: FlourTypeId;
  /** Anzeigename und Zutatenname beim Speichern, z. B. "Dinkel 630". */
  name: string;
  group: FlourGroup;
  /** Relativ zu Weizen 550 = 1,00. */
  absorptionFactor: number;
  kneadingTolerance: KneadingTolerance;
  /** Hinweistext für spätere Warnungen, sonst null. In F011 nicht angezeigt. */
  note: string | null;
}

/** Reihenfolge = Anzeigereihenfolge der Auswahl „Mehltyp“. */
export const FLOUR_TYPES: readonly FlourType[];
export const DEFAULT_FLOUR_TYPE_ID = "wheat_550";   // neue Mehlzeile (AC-2)
export const OTHER_FLOUR_TYPE_ID = "other_flour";   // freier Name (AC-10)
export function isFlourTypeId(value: unknown): value is FlourTypeId;
export function getFlourType(id: FlourTypeId): FlourType;
/**
 * Katalogeintrag, dessen name nach normalizeFlourName gleich ist, sonst undefined (Migration AC-11).
 * Findet auch „Sonstiges Mehl“ (other_flour). Kein Teilstring- oder Unscharf-Abgleich.
 */
export function findFlourTypeByName(name: string): FlourType | undefined;
/** trim() + toLowerCase(); innere Leerzeichen bleiben unverändert. */
export function normalizeFlourName(name: string): string;

export interface FlourPortion { flourType: FlourTypeId; amountGrams: number }
/** Summe amountGrams × absorptionFactor, ungerundet. */
export function calculateFlourAbsorption(flours: readonly FlourPortion[]): number;
/**
 * currentWater × Absorption(newFlours) / Absorption(originalFlours), ungerundet. Die Einheit von
 * currentWater bleibt erhalten (der Rechner übergibt das Wasser-Bäckerprozent). Gibt currentWater
 * unverändert zurück, wenn currentWater nicht endlich ist, eine Grammangabe nicht endlich oder negativ ist
 * oder eine der beiden Absorptionssummen nicht > 0 ist (AC-8). Wirft nie.
 */
export function calculateAdjustedWaterForFlourSwap(
  originalFlours: readonly FlourPortion[],
  newFlours: readonly FlourPortion[],
  currentWater: number,
): number;
```

**Katalogeinträge (Reihenfolge = Anzeige).** „fest“ heißt laut Ticket vorgegeben. **Richtwert** heißt vom Plan vorgeschlagen; der Nutzer bestätigt diese Werte mit der Planfreigabe.

| # | Gruppe | Name | `id` | Faktor | Faktor fest/Richtwert | Knet-Toleranz | Toleranz fest/Richtwert | Hinweistext (`note`) | Hinweis fest/Richtwert |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Weizen | Weizen 405 | wheat_405 | 0,95 | **Richtwert** | mittel | **Richtwert** | – | – |
| 2 | Weizen | Weizen 550 | wheat_550 | 1,00 | fest | mittel | fest | – | – |
| 3 | Weizen | Weizen 1050 | wheat_1050 | 1,05 | **Richtwert** | mittel | **Richtwert** | – | – |
| 4 | Weizen | Weizen Vollkorn | wheat_wholegrain | 1,15 | fest (Nutzervorgabe) | niedrig | **Richtwert** | „Kleie schwächt das Klebergerüst, kürzer kneten.“ | **Richtwert** |
| 5 | Dinkel | Dinkel 630 | spelt_630 | 0,92 | fest | niedrig | fest | „Dinkel überknetet schnell.“ | fest |
| 6 | Dinkel | Dinkel 1050 | spelt_1050 | 0,96 | **Richtwert** | niedrig | **Richtwert** | „Dinkel überknetet schnell.“ | **Richtwert** |
| 7 | Dinkel | Dinkel Vollkorn | spelt_wholegrain | 1,02 | **Richtwert** | niedrig | **Richtwert** | „Dinkel überknetet schnell.“ | **Richtwert** |
| 8 | Roggen | Roggen 815 | rye_815 | 1,08 | **Richtwert** | niedrig | **Richtwert** | „Roggenteig nur kurz mischen, nicht auskneten.“ | **Richtwert** |
| 9 | Roggen | Roggen 997 | rye_997 | 1,11 | **Richtwert** | niedrig | **Richtwert** | „Roggenteig nur kurz mischen, nicht auskneten.“ | **Richtwert** |
| 10 | Roggen | Roggen 1150 | rye_1150 | 1,15 | fest | niedrig | fest | „Roggenteig nur kurz mischen, nicht auskneten.“ | **Richtwert** |
| 11 | Roggen | Roggen 1370 | rye_1370 | 1,19 | **Richtwert** | niedrig | **Richtwert** | „Roggenteig nur kurz mischen, nicht auskneten.“ | **Richtwert** |
| 12 | Roggen | Roggen Vollkorn | rye_wholegrain | 1,24 | **Richtwert** | niedrig | **Richtwert** | „Roggenteig nur kurz mischen, nicht auskneten.“ | **Richtwert** |
| 13 | Sonderfälle | Manitoba | manitoba | 1,25 | fest | hoch | fest | – | – |
| 14 | Sonderfälle | Tipo 00 (Pizzamehl) | tipo_00 | 0,98 | **Richtwert** (Ticket: „nahe 1,00“) | mittel | **Richtwert** | „Der Wasserbedarf weicht je nach Packung (Kleberstärke) ab.“ | fest (Inhalt laut Ticket, Wortlaut Richtwert) |
| 15 | – (ohne Gruppe) | Sonstiges Mehl | other_flour | 1,00 | fest | mittel | **Richtwert** | – | – |

Die Tabelle enthält genau 15 Einträge: 4 × Weizen, 3 × Dinkel, 5 × Roggen (815, 997, 1150, 1370, Vollkorn), 2 × Sonderfälle, 1 × Sonstiges Mehl. Feste Faktoren laut Ticket: Weizen 550 = 1,00, Weizen Vollkorn = 1,15, Dinkel 630 = 0,92, Roggen 1150 = 1,15, Manitoba = 1,25, Sonstiges Mehl = 1,00. Weizen Vollkorn und Roggen 1150 haben damit denselben Faktor; ein Wechsel zwischen beiden ändert das Wasser nicht.

Begründung der Richtwerte: Faktor ≈ typische Wasseraufnahme ÷ 65 % (Weizen 550). Weizen 405 ≈ 62 %, Weizen 1050 ≈ 68 % (zwischen 550 und dem festen Vollkornwert 1,15). Dinkel liegt unter Weizen gleicher Type. Roggen steigt mit der Type von 1,15 (1150) aus in Schritten von etwa 0,03 bis 0,05; Vollkorn liegt knapp unter Manitoba. Die Knet-Toleranz ist bei Dinkel, Roggen und Vollkorn niedrig, weil das Klebergerüst schwächer oder kaum vorhanden ist. Die Gruppenüberschriften stehen in `messages.ts` (UI-Text), die Mehlnamen im Katalog (Daten), wie `KNEADING_METHOD_NAMES` und `FRICTION_PRESETS`.

### Zustand (`src/lib/calculator/recipe-state.ts`)
```ts
export interface RecipeRow {
  id: string; name: string; type: IngredientType; grams: number; percent: number; starterHydration: number;
  /** Mehlzeilen: Katalog-Schlüssel (nie null bei Zeilen aus dieser App). Alle anderen Zeilen: null. */
  flourType: FlourTypeId | null;
}
export interface RecipeState {
  basis: BasisMode; flourBasis: number; doughWeight: number; rows: RecipeRow[];
  /** Schalter „Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)“, Standard true. */
  adjustWaterOnFlourSwap: boolean;
}
export function setRowFlourType(state: RecipeState, rowId: string, flourType: FlourTypeId): RecipeState;
export function setAdjustWaterOnFlourSwap(state: RecipeState, enabled: boolean): RecipeState;
```
- `createReferenceRecipe()`: row-1 `flourType "wheat_550"`, `name "Weizen 550"`; row-2 `"rye_1150"`, `name "Roggen 1150"`; andere Zeilen `flourType null`; `adjustWaterOnFlourSwap: true`. Gramm, Prozent und IDs bleiben wie in F010.
- `newRow(id, type)`: Mehl → `flourType "wheat_550"`, `name "Weizen 550"`; sonst `flourType null`, `name ""`. Damit legt `addFlourRow` die neue Zeile mit „Weizen 550“, 0 g und 0 % an. Das Wasser ändert sich nicht (AC-2).
- **Name-Regel**: Bei Katalog-Mehltypen enthält `name` den Katalognamen. Das bleibt nach einem Rollback auf F010 lesbar; die Anzeige leitet sich trotzdem aus `flourType` ab. Bei `other_flour` ist `name` der freie Name. `setRowFlourType` setzt `name` bei jedem Wechsel neu: Katalogname bzw. `""` bei `other_flour`. Das Feld „Name“ erscheint dann also leer (AC-10).
- `ingredientDisplayName(row)`: Mehlzeile mit Katalogtyp → `getFlourType(id).name`. `other_flour` → getrimmter Name, leer → „Sonstiges Mehl“. Mehlzeile mit `flourType null` (nur in Testdaten) → wie F010 (Name oder „Mehl“). Andere Typen bleiben wie in F010.
- `setRowFlourType(state, rowId, flourType)`:
  1. Zeile fehlt, ist keine Mehlzeile oder hat bereits diesen Typ → `state` unverändert.
  2. `next` = Zeile mit neuem `flourType` und `name` gemäß Name-Regel.
  3. Keine Anpassung (Rückgabe `next`), wenn `!state.adjustWaterOnFlourSwap` (AC-6) oder `!evaluateRecipe(state).isValid` vor dem Wechsel. Das deckt AC-8 ab: Bei Gesamtmehl 0 greift der Basisfehler, bei 0 g Mehl der Mehlanteil-Fehler. Ungültige Zeilen werden so ebenfalls abgedeckt.
  4. Für jede Zeile `type "water"` (in der App genau eine): `p' = calculateAdjustedWaterForFlourSwap(portions(state.rows), portions(next.rows), water.percent)` mit `portions` = Mehlzeilen → `{ flourType: row.flourType ?? "other_flour", amountGrams: row.grams }`. Die Starter-Zeile zählt nicht mit.
  5. Basis „Gesamtmehl“: `grams = flourBasis × p' / 100`, `doughWeight = Summe Gramm` (wie `withRows`). Basis „Ziel-Teiggewicht“: Zeilen mit `percent = p'`, danach `setBasisValue(…, state.doughWeight)`. Das Teiggewicht bleibt fest, alle Gramm und die Mehlbasis werden aus den Prozenten neu berechnet (AC-7: 1920 g → Wasser 671,72 g, Anzeige 672).
- `setAdjustWaterOnFlourSwap(state, enabled)` → `{ ...state, adjustWaterOnFlourSwap: enabled }`. Gramm und Prozent bleiben unverändert (AC-3). Eine nachträgliche Anpassung gibt es nicht (AC-6).
- Rückwechsel (AC-5): Der Zustand ist ungerundet, also ergibt 70 × (966/1030) × (1030/966) wieder 70 (bis auf Gleitkomma ≈ 1e-14), und die Anzeige ist exakt 70,0 % / 700 g.

### Lokal merken (`src/lib/calculator/local-draft.ts`)
- `DRAFT_VERSION` bleibt 1. `saveCalculatorDraft` bleibt unverändert, weil die neuen Felder Teil von `recipe` sind.
- `parseRow`: Ist `flourType` vorhanden, muss es bei Mehlzeilen `isFlourTypeId` erfüllen, sonst `null` (Stand verwerfen). Bei Nicht-Mehlzeilen wird es immer auf `null` gesetzt. Fehlt es bei einer Mehlzeile (F010-Stand), gilt die **Migration AC-11** über die neue, exportierte reine Funktion:
  ```ts
  /** Zuordnung eines freien F010-Mehlnamens zu Mehltyp und Zeilenname (AC-11). */
  export function migrateLegacyFlourName(name: string): { flourType: FlourTypeId; name: string };
  ```
  Regeln in dieser Reihenfolge, Abgleich jeweils über `normalizeFlourName` (trim + Kleinschreibung):
  1. Altname aus dem F010-Referenzrezept (Konstante `LEGACY_FLOUR_NAME_ALIASES` in `local-draft.ts`, nicht exportiert): „weizenmehl“ → `wheat_550`, „roggenmehl“ → `rye_1150` (wie Frage 6). `name` = Katalogname („Weizen 550“ bzw. „Roggen 1150“).
  2. `findFlourTypeByName(name)` liefert einen Katalogtyp ≠ `other_flour` → dessen `id`, `name` = Katalogname (z. B. „dinkel 630“ → `spelt_630`, „Dinkel 630“).
  3. Name entspricht „Sonstiges Mehl“ oder ist nach trim leer → `other_flour` mit `name ""` (Anzeige „Sonstiges Mehl“).
  4. Sonst → `other_flour` mit dem bisherigen `name` unverändert (z. B. „Ruchmehl“).
  
  Kein Teilstring-Abgleich: „Weizenmehl 550“ oder „Dinkel  630“ (doppeltes Leerzeichen) werden zu „Sonstiges Mehl“ mit diesem Namen. Gramm, Prozent und Starter-Hydratation der Zeile bleiben unverändert, die Wassermenge wird bei der Migration nie angepasst.
- `parseRecipe`: Fehlt `adjustWaterOnFlourSwap`, gilt `true` (AC-11). Ist es vorhanden, aber kein Boolean → `null`.

### Komponentenbaum (Änderungen fett)
```
Calculator (unverändert, State: CalculatorDraft)
└─ HydrationCalculator { state, evaluation, onChange }   (Props unverändert)
   ├─ fieldset Basis (Radio)
   ├─ NumberField Gesamtmehl / Ziel-Teiggewicht
   ├─ **Schalter**: <label><input type="checkbox" role="switch" id="adjust-water-on-flour-swap"
   │     checked={state.adjustWaterOnFlourSwap} onChange → setAdjustWaterOnFlourSwap/> Text</label>
   ├─ ul "Zutaten"
   │  └─ IngredientRow (je Zeile)
   │     ├─ **Mehlzeile**: <label for="{id}-flour-type">Mehltyp</label> <select id="{id}-flour-type">
   │     │     <optgroup label="Weizen">…</optgroup> … <optgroup label="Sonderfälle">…</optgroup>
   │     │     <option value="other_flour">Sonstiges Mehl</option></select>
   │     │   **nur bei other_flour**: <label for="{id}-name">Name</label> <input id="{id}-name" maxLength 200>
   │     ├─ Salz/Sonstiges: Name + Typ wie F010
   │     ├─ Button „Entfernen“ (aria-label `${ingredientDisplayName(row)} entfernen`, wie F010)
   │     └─ Gramm, Prozent, ggf. Starter-Hydratation wie F010
   ├─ Buttons „Mehl hinzufügen“ (Fokus → **Mehltyp-Auswahl der neuen Zeile**), „Zutat hinzufügen“
   └─ Kennzahlen (unverändert, ohne Live-Bereich)
```
- `IngredientRowProps`: neu `onFlourTypeChange: (flourType: FlourTypeId) => void` und `flourTypeSelectRef?: Ref<HTMLSelectElement>`. `nameInputRef` entfällt, weil es nur für den Fokus nach „Mehl hinzufügen“ genutzt wurde. Die Optionen werden aus `FLOUR_TYPES` erzeugt: gruppiert nach `group` in der Reihenfolge wheat, spelt, rye, special mit `FLOUR_GROUP_LABELS`, `other` danach ohne `optgroup`. `onChange` prüft den Wert mit `isFlourTypeId`. Der Button „Entfernen“ bleibt bei allen Mehlzeilen sichtbar. Bisher hing er an `hasName`; künftig gilt `type` ist flour, salt oder other.
- `HydrationCalculator`: `nameRefs` wird zu `flourTypeRefs: Map<string, HTMLSelectElement>`. `handleAddFlour` fokussiert nach `flushSync` die Auswahl der neuen Zeile. `onFlourTypeChange={(t) => onChange(setRowFlourType(state, row.id, t))}`.
- Native `<select>`/`<optgroup>` und native Checkbox mit `role="switch"`: Tab, Pfeiltasten und Leertaste funktionieren ohne eigenen Code. Screenreader erkennen Gruppen und den Ein/Aus-Zustand. Alles ist clientseitig, also auch offline und ohne Anmeldung nutzbar (AC-1, AC-3). Styling: Auswahl mit `INPUT_CLASS_NAME`/`INPUT_BORDER_CLASS_NAME`, Schalter wie die Radio-Buttons (`size-4 accent-zinc-900 dark:accent-zinc-100`), Label `flex items-start gap-2` (bricht ab 320 px um).
- Neue Texte in `messages.ts`: `FLOUR_TYPE_LABEL = "Mehltyp"`, `ADJUST_WATER_ON_FLOUR_SWAP_LABEL = "Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)"`, `FLOUR_GROUP_LABELS = { wheat: "Weizen", spelt: "Dinkel", rye: "Roggen", special: "Sonderfälle" } as const satisfies Record<Exclude<FlourGroup, "other">, string>`.
- Speichern (unverändert): `buildSaveRecipeInput` → `ingredientDisplayName` → „Dinkel 630“ bzw. „Emmer“ / „Sonstiges Mehl“ (AC-9, AC-10). Schalter und `flourType` gehen nicht ins Konto-Rezept, das Datenmodell aus F006 bleibt unverändert.
- Lade- und Fehlerzustände: keine neuen. Es gibt keine Netzwerkaufrufe, und der Mehlwechsel erzeugt keine Meldung (AC-8).

### Testhelfer (`src/test/calculator.ts`)
- `REFERENCE_NAMES = ["Weizen 550", "Roggen 1150", "Wasser", "Starter", "Salz"]`
- `flourTypeSelect(name: string): HTMLSelectElement` → `within(ingredientGroup(name)).getByRole("combobox", { name: "Mehltyp" })`
- `adjustWaterSwitch(): HTMLInputElement` → `screen.getByRole("switch", { name: "Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)" })`

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. `src/lib/baking-engine/flour-types.ts`: Typen, `FLOUR_TYPES` exakt laut Katalogtabelle (15 Einträge, Weizen Vollkorn 1,15), `DEFAULT_FLOUR_TYPE_ID`, `OTHER_FLOUR_TYPE_ID`, `isFlourTypeId`, `getFlourType`, `normalizeFlourName`, `findFlourTypeByName` (ohne Beachtung von Groß-/Kleinschreibung und Randleerzeichen) (AC-1, AC-2, AC-10, AC-11)
2. Im selben Modul `calculateFlourAbsorption` und `calculateAdjustedWaterForFlourSwap` mit den Rückfallregeln für nicht endliche, negative oder leere Mengen (AC-4, AC-5, AC-8)
3. `messages.ts`: `FLOUR_TYPE_LABEL`, `ADJUST_WATER_ON_FLOUR_SWAP_LABEL`, `FLOUR_GROUP_LABELS` (AC-1, AC-3)
4. `recipe-state.ts`: `RecipeRow.flourType`, `RecipeState.adjustWaterOnFlourSwap`, Referenzrezept („Weizen 550“, „Roggen 1150“, Schalter ein), `newRow` mit „Weizen 550“ für Mehl (AC-1, AC-2, AC-3)
5. `ingredientDisplayName` für Katalogtypen und „Sonstiges Mehl“ (Name oder Rückfall „Sonstiges Mehl“) (AC-1, AC-9, AC-10)
6. `setRowFlourType` mit Name-Regel, Gültigkeitsprüfung vor dem Wechsel, Wasseranpassung für Basis Gesamtmehl (AC-4, AC-5, AC-8, AC-10)
7. `setRowFlourType` für Basis Ziel-Teiggewicht über `setBasisValue(…, state.doughWeight)` (AC-7)
8. `setAdjustWaterOnFlourSwap` ohne Änderung der Werte; bei „aus“ nur Typwechsel (AC-3, AC-6)
9. `local-draft.ts`: neue Felder parsen und validieren, Schalter-Standard `true` bei fehlendem Feld (AC-9, AC-11)
10. `local-draft.ts`: `LEGACY_FLOUR_NAME_ALIASES` („weizenmehl“ → `wheat_550`, „roggenmehl“ → `rye_1150`) und `migrateLegacyFlourName` mit den vier Regeln; `parseRow` nutzt sie bei Mehlzeilen ohne `flourType` (AC-11)
11. `ingredient-row.tsx`: Auswahl „Mehltyp“ mit `optgroup`-Gruppen und „Sonstiges Mehl“ am Ende, Feld „Name“ nur bei `other_flour`, `flourTypeSelectRef`, `onFlourTypeChange`; Entfernen-Label über `ingredientDisplayName` (AC-1, AC-10)
12. `hydration-calculator.tsx`: Schalter (`role="switch"`) zwischen Basisfeld und Zutatenliste, Verdrahtung `setRowFlourType`/`setAdjustWaterOnFlourSwap`, Fokus nach „Mehl hinzufügen“ auf „Mehltyp“ der neuen Zeile (AC-2, AC-3, AC-4, AC-6, AC-7)
13. Tests-Phase: F010-Tests und `src/test/calculator.ts` auf die neuen Mehlnamen umstellen (siehe Teststrategie, „Anpassung bestehender Tests“). Dabei kein F010-Test entfernen oder abschwächen, nur Namen und Bedienweg anpassen (AC-1, AC-2, AC-9, AC-10)
14. Manuelle Abnahme im Browser: Pfeiltasten in „Mehltyp“, Leertaste am Schalter, Screenreader-Ansage von Gruppen und Ein/Aus, 320 px ohne horizontales Scrollen, Hell/Dunkel, offline als Gast (AC-1, AC-3)

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle neuen Tests tragen den Tag `F011/AC-n` im Testnamen. Komponententests rendern `<Calculator owner={GUEST} />` (bzw. `U1` + gemocktes `saveRecipe` wie in `calculator-save.test.tsx`) und greifen nur über Rollen und zugängliche Namen zu. Mehltyp-Wechsel erfolgen über `user.selectOptions(flourTypeSelect(...), "Dinkel 630")`. Hinweis: Nach „Mehl hinzufügen“ gibt es zwei Zeilen „Weizen 550“. Dann über `ingredientItems()[index]` zugreifen statt über `ingredientGroup`.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/baking-engine/flour-types.test.ts | `FLOUR_TYPES` exakt laut Katalogtabelle: genau 15 Einträge, Reihenfolge, `id`, `name`, `group`, `absorptionFactor`, `kneadingTolerance`, `note` (gesamte Tabelle per `toEqual`); feste Faktoren zusätzlich einzeln: Weizen 550 1,00, Weizen Vollkorn 1,15, Dinkel 630 0,92, Roggen 1150 1,15, Manitoba 1,25, Sonstiges Mehl 1,00; Gruppe „rye“ enthält genau `rye_815`, `rye_997`, `rye_1150`, `rye_1370`, `rye_wholegrain`; `isFlourTypeId`, `getFlourType` |
| AC-1 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Mehlzeilen haben die Combobox „Mehltyp“ und kein Textfeld „Name“; Zeile 1 „Weizen 550“, Zeile 2 „Roggen 1150“ (`toHaveDisplayValue`); `optgroup`-Labels in DOM-Reihenfolge „Weizen“, „Dinkel“, „Roggen“, „Sonderfälle“ mit den Optionstexten je Gruppe (über `select.querySelectorAll("optgroup")`), danach Option „Sonstiges Mehl“ außerhalb einer Gruppe; Tab vom Basisfeld über den Schalter auf „Mehltyp“ der ersten Zeile; Button „Roggen 1150 entfernen“ vorhanden; Bedienung als Gast mit `onlineManager.setOnline(false)` |
| AC-2 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Nach „Mehl hinzufügen“: 6 Listeneinträge, Eintrag 3 hat „Mehltyp“ = „Weizen 550“, 0 g / „0,0“, Fokus liegt auf dessen „Mehltyp“; Wasser „70,0“ / „700“ |
| AC-2 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | `addFlourRow` → neue Zeile `flourType "wheat_550"`, `name "Weizen 550"`, 0/0; Wasser-Prozent 70 unverändert |
| AC-3 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | `adjustWaterSwitch()` ist `toBeChecked()`; erreichbar per Tab direkt nach dem Basisfeld; Klick und `user.keyboard(" ")` schalten um (`not.toBeChecked()` / `toBeChecked()`); alle Gramm/Prozent und Kennzahlen danach unverändert |
| AC-3 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | `createReferenceRecipe().adjustWaterOnFlourSwap === true`; `setAdjustWaterOnFlourSwap` ändert nur das Flag (Zeilen per `toEqual` gleich) |
| AC-4 | Unit | src/lib/baking-engine/flour-types.test.ts | Referenzmischung 800 g Weizen 550 + 200 g Roggen 1150 → Absorption 1030; nach Dinkel 630 → 966; `calculateAdjustedWaterForFlourSwap(…, 70)` ≈ 65,6504854 (`toBeCloseTo(…, 6)`) |
| AC-4 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | `setRowFlourType(ref, "row-1", "spelt_630")`: Wasser % ≈ 65,6505, g ≈ 656,50; Mehle, Starter, Salz, `flourBasis` 1000 unverändert; `evaluateRecipe` Netto-Hydratation ≈ 68,77, TA ≈ 168,77 |
| AC-4 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Nach Auswahl „Dinkel 630“ ohne weiteren Klick: Wasser „65,7“ / „657“, „Netto-Hydratation“ 68,8 %, TA 168,8; Mehle 800/200, Starter 200, Salz 20, „Gesamtmehl (g)“ 1000 |
| AC-5 | Unit | src/lib/baking-engine/flour-types.test.ts | Hin- und Rückrechnung über mehrere Typen (550 → Dinkel 630 → Manitoba → Roggen Vollkorn → 550) ergibt `toBeCloseTo(70, 9)` |
| AC-5 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | Kette von `setRowFlourType` über mehrere Typen zurück auf `wheat_550` → Wasser-Prozent `toBeCloseTo(70, 9)`, Gramm `toBeCloseTo(700, 6)` |
| AC-5 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Dinkel 630 → Weizen 550: Wasser „70,0“ / „700“, 72,7 %, TA 172,7; danach mehrere Wechsel (z. B. Manitoba, Tipo 00, Roggen 815) und zurück → wieder „70,0“ / „700“ |
| AC-6 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | Flag aus → `setRowFlourType` ändert nur `flourType`/`name`; danach Flag ein → Wasser weiter 70; nächster Wechsel (Dinkel 630 → Weizen 550) passt an (≈ 70 × 1030/966 ≈ 74,64) |
| AC-6 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Schalter aus, Dinkel 630 → Wasser „70,0“ / „700“, 72,7 %, TA 172,7; Schalter ein → unverändert; nächster Wechsel ändert das Wasser |
| AC-7 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | Basis „dough“ 1920 → Dinkel 630: `doughWeight` 1920, Wasser % ≈ 65,6505, Wasser g ≈ 671,72, Mehl-/Starter-/Salz-Prozente unverändert, Gramm aus 1920 neu (Summe ≈ 1920) |
| AC-7 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Radio „Basis: Ziel-Teiggewicht“, Feld 1920, Dinkel 630 → „Ziel-Teiggewicht (g)“ „1920“, Wasser „65,7“ / „672“, „Netto-Hydratation“ 68,8 %; Prozente 80/20/20/2 unverändert |
| AC-8 | Unit | src/lib/baking-engine/flour-types.test.ts | Absorption vorher 0 (alle 0 g), leere Liste, `NaN`- oder negative Gramm, `currentWater` `NaN` → Rückgabe `currentWater` unverändert, kein Throw |
| AC-8 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | `setBasisValue(ref, 0)` bzw. alle Mehlzeilen 0 g, dann `setRowFlourType` → Wasser-Prozent und -Gramm unverändert, `flourType` übernommen |
| AC-8 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | „Gesamtmehl (g)“ 0 → Meldung „Die Mehlbasis muss größer als 0 g sein.“; Wechsel auf Dinkel 630 → Wasser-Gramm/-Prozent unverändert, Auswahl zeigt „Dinkel 630“, keine weitere Meldung (Anzahl der Meldungen gleich); zweiter Fall: beide Mehle 0 g |
| AC-9 | Unit | src/lib/calculator/local-draft-flour-type.test.ts | `saveCalculatorDraft` + `loadCalculatorDraft` mit Dinkel 630 und Flag aus → `toEqual`; Stand mit ungültigem `flourType` oder nicht-booleschem Flag → `null` |
| AC-9 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | `buildSaveRecipeInput` nach Wechsel auf Dinkel 630 (Flag aus) → Zutatennamen „Dinkel 630“, „Roggen 1150“, „Wasser“, „Starter“, „Salz“; Payload enthält kein Schalterfeld |
| AC-9 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Gast: Dinkel 630, Schalter aus, „Lokal merken“, unmount, neu rendern → „Dinkel 630“, Schalter aus. Konto (`U1`, online, `saveRecipe` gemockt): „Als Rezept speichern“ → `ingredients[0].name === "Dinkel 630"` |
| AC-10 | Unit | src/lib/calculator/recipe-state-flour-type.test.ts | `other_flour`: Wasser unverändert (Faktor 1,00), `name ""`; `setRowName` „Emmer“ → Anzeigename „Emmer“, leer → „Sonstiges Mehl“; zurück auf Katalogtyp → `name` = Katalogname; Payload-Name „Emmer“ bzw. „Sonstiges Mehl“ |
| AC-10 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Auswahl „Sonstiges Mehl“ → Textfeld „Name“ (leer) erscheint, Wasser „70,0“ / „700“, Button „Sonstiges Mehl entfernen“; „Emmer“ eingeben → „Emmer entfernen“; Konto-Speichern sendet „Emmer“; Rückwechsel auf „Weizen 550“ → kein Textfeld „Name“ in der Zeile |
| AC-11 | Unit | src/lib/baking-engine/flour-types.test.ts | `normalizeFlourName(" Dinkel 630 ")` → „dinkel 630“; `findFlourTypeByName`: „dinkel 630“, „ DINKEL 630 “ → `spelt_630`; „tipo 00 (pizzamehl)“ → `tipo_00`; „sonstiges mehl“ → `other_flour`; „Weizenmehl“, „Ruchmehl“, „Dinkel  630“, „Dinkel“ → `undefined` (Aliasse gehören nicht in den Katalog-Lookup) |
| AC-11 | Unit | src/lib/calculator/local-draft-flour-type.test.ts | `migrateLegacyFlourName` per `it.each`-Testmatrix (siehe unten) |
| AC-11 | Unit | src/lib/calculator/local-draft-flour-type.test.ts | Gespeicherter F010-Stand (Version 1, Zeilen ohne `flourType`, Rezept ohne Flag) mit den vier Mehlzeilen aus dem Ticket „ weizenmehl “, „ROGGENMEHL“, „dinkel 630“, „Ruchmehl“ (400/200/200/200 g, 40/20/20/20 %, Wasser 700 g / 70 %, Starter 200 g, Salz 20 g, Basis Gesamtmehl 1000) → Zeilen in derselben Reihenfolge `wheat_550`/„Weizen 550“, `rye_1150`/„Roggen 1150“, `spelt_630`/„Dinkel 630“, `other_flour`/„Ruchmehl“; Gramm, Prozent, Wasser unverändert; Flag `true`; Nicht-Mehlzeilen `flourType null`. Zweiter Fall: unverändertes F010-Referenzrezept („Weizenmehl“, „Roggenmehl“) → `wheat_550`, `rye_1150`, ergibt `toEqual(createReferenceRecipe())` |
| AC-11 | Komponente | src/components/calculator/calculator-flour-types.test.tsx | Denselben Vier-Mehl-Altstand in `localStorage` schreiben, rendern → über `ingredientItems()[0..3]` zeigt „Mehltyp“ „Weizen 550“, „Roggen 1150“, „Dinkel 630“, „Sonstiges Mehl“; nur Zeile 4 hat ein Feld „Name“ mit Wert „Ruchmehl“ und den Button „Ruchmehl entfernen“; Gramm 400/200/200/200, Prozent „40,0“/„20,0“/„20,0“/„20,0“, Wasser „70,0“ / „700“; Schalter `toBeChecked()` |

**Testmatrix `migrateLegacyFlourName` (AC-11):**

| Eingabe | `flourType` | `name` | Regel |
|---|---|---|---|
| `" weizenmehl "` | `wheat_550` | „Weizen 550“ | Alias, Randleerzeichen und Kleinschreibung ignoriert |
| `"ROGGENMEHL"` | `rye_1150` | „Roggen 1150“ | Alias, Großschreibung ignoriert |
| `"Weizenmehl"` | `wheat_550` | „Weizen 550“ | Alias (F010-Referenzrezept) |
| `"Roggenmehl"` | `rye_1150` | „Roggen 1150“ | Alias (F010-Referenzrezept) |
| `"dinkel 630"` | `spelt_630` | „Dinkel 630“ | Katalogname |
| `"  Weizen Vollkorn "` | `wheat_wholegrain` | „Weizen Vollkorn“ | Katalogname |
| `"ROGGEN 815"` | `rye_815` | „Roggen 815“ | Katalogname |
| `"Ruchmehl"` | `other_flour` | „Ruchmehl“ | freier Name bleibt |
| `"Weizenmehl 550"` | `other_flour` | „Weizenmehl 550“ | kein Teilstring-Abgleich |
| `"Sonstiges Mehl"` | `other_flour` | `""` | Katalogeintrag „Sonstiges Mehl“ |
| `""` bzw. `"   "` | `other_flour` | `""` | leerer Name |

**Anpassung bestehender Tests (Tests-Phase, ohne F010-Tags zu entfernen oder Assertions zu reduzieren):**
- `src/test/calculator.ts`: `REFERENCE_NAMES` wie oben, neue Helfer `flourTypeSelect`, `adjustWaterSwitch`.
- `calculator-hydration.test.tsx`: Literale „Weizenmehl“/„Roggenmehl“ → „Weizen 550“/„Roggen 1150“ (auch in den Entfernen-Labels). Test „Mehl hinzufügen“: neue Zeile heißt „Weizen 550“, der Fokus liegt auf „Mehltyp“; statt „Dinkel“ zu tippen „Sonstiges Mehl“ wählen und „Dinkel“ ins Feld „Name“ eingeben.
- `calculator-save.test.tsx`: Payload-Namen; im Lokal-merken-Rundlauf die neue Mehlzeile auf „Sonstiges Mehl“ + Name „Dinkel“ setzen.
- `recipe-state.test.ts`: erwartete Namen des Referenzrezepts; `RecipeRow`-Literal um `flourType: null` ergänzen (Anzeigename „Mehl“ bleibt für diesen Testfall gültig).
- `save-recipe.test.ts`: Payload-Namen; neue Mehlzeile heißt jetzt „Weizen 550“ statt „Mehl“.
- `local-draft.test.ts` und `calculator-review-fixes.test.tsx` brauchen keine Änderung: Die neuen Felder laufen über `toEqual(draft)` bzw. über `REFERENCE_NAMES` mit.

## Risiken & Rollback
- **Richtwerte**: Alle mit **Richtwert** markierten Faktoren, Knet-Toleranzen und Hinweistexte sind Vorschläge des Plans und erst mit der Planfreigabe bestätigt. Spätere Korrekturen betreffen nur `FLOUR_TYPES` und die Tabelle im Test `flour-types.test.ts`.
- **Absichtlich geänderte F010-Tests**: Referenznamen, Fokus nach „Mehl hinzufügen“ und der freie Name bei Mehlen ändern sich laut Ticket. Die F010-Tests in den fünf genannten Dateien werden in der Tests-Phase angepasst. Inhaltlich bleiben sie gleich, es kommen keine Tags weg und keine Assertions entfallen. Der Reviewer sollte diese Diffs gezielt prüfen.
- **Migration AC-11 (Altnamen)**: Nur die beiden F010-Referenznamen „Weizenmehl“ und „Roggenmehl“ werden als Aliasse auf Weizen 550 bzw. Roggen 1150 abgebildet, plus exakte Katalognamen (Groß-/Kleinschreibung und Randleerzeichen egal). Ähnliche Namen wie „Weizenmehl 550“, „Dinkelmehl“ oder „Dinkel  630“ werden bewusst zu „Sonstiges Mehl“ mit dem alten Namen und behalten Faktor 1,00. Ein unscharfer Abgleich würde Mehlen stillschweigend einen falschen Faktor geben. Die Aliasse stehen nur in `local-draft.ts`. `findFlourTypeByName` im Katalog kennt sie nicht, damit die Engine frei von F010-Altlasten bleibt.
- **Weizen Vollkorn = Roggen 1150 = 1,15**: Beide Faktoren sind Nutzervorgaben. Ein Wechsel zwischen diesen beiden Mehltypen ändert das Wasser nicht. Das ist gewollt und kein Fehler.
- **Gleichnamige Zeilen**: Zwei Mehlzeilen mit demselben Mehltyp (z. B. nach AC-2 zweimal „Weizen 550“) haben gleiche Gruppennamen und gleiche Entfernen-Labels („Weizen 550 entfernen“). Das verlangt das Ticket (AC-1, AC-2). Für Screenreader ist es weniger eindeutig, fachlich aber korrekt.
- **Gleitkomma beim Rückwechsel**: Exakte Gleichheit (`toBe(70)`) ist nach mehreren Wechseln nicht garantiert, sondern nur bis etwa 1e-14. Die Tests prüfen deshalb `toBeCloseTo(…, 9)` und die gerundete Anzeige. Eine sichtbare Rundungsdrift entsteht nicht, weil der Zustand nie gerundet wird.
- **Gültigkeitsprüfung vor der Anpassung**: Solange der Rechner eine Meldung zeigt (z. B. Mehlanteile ≠ 100 % während der Eingabe), wechselt der Mehltyp ohne Wasseranpassung. Das ist für AC-8 gewollt und hier dokumentiert.
- **Pfeiltasten, Screenreader-Ansage, 320 px, Dunkelmodus**: jsdom bildet natives `<select>`-Verhalten und Layout nicht ab. Das wird über native Elemente gelöst und manuell abgenommen (Schritt 14).
- **Rollback**: Commit zurücknehmen. Es gibt keine DB-Änderung und keine neue Abhängigkeit. Mit F011 gemerkte Stände bleiben für F010 lesbar: Der Parser ignoriert unbekannte Felder, und `name` enthält bei Katalogtypen den Katalognamen. Gespeicherte Konto-Rezepte enthalten nur Zutatennamen und bleiben unverändert gültig.

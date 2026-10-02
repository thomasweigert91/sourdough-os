# Plan F010: Rechner-UI und interaktive Anpassung

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Die Rechenlogik der UI liegt in reinen TS-Modulen unter `src/lib/calculator/`. Sie halten den Zustand als Zahlen (ungerundet), ändern ihn über reine Funktionen und werten ihn über die vorhandene Engine aus (`hydration.ts`, `ddt.ts`). Meldungstexte und `FRICTION_PRESETS` werden importiert und nicht kopiert. Die React-Komponenten unter `src/components/calculator/` sind dünn: Ein `Calculator` hält den gesamten Zustand in einem `useState`, die Unterkomponenten bekommen Werte und Callbacks als Props. Rohtext gibt es nur in einem fokussierten Zahlenfeld (lokaler Entwurf in `NumberField`), damit „das gerade bearbeitete Feld behält den eingegebenen Wert“ (AC-2) ohne Rundungsverlust im Zustand gilt. Gespeichert wird im Konto über eine **Server Action** `saveRecipe` (`src/app/calculator/actions.ts`, Session über `auth.api.getSession({ headers: await headers() })`). Sie schreibt Kopf und Zutaten atomar in einem `db.batch` und ist über eine im Browser erzeugte, bei unverändertem Inhalt wiederverwendete Rezept-ID doppelklick-sicher (`onConflictDoNothing`). Lokal merken schreibt einen eigenen `localStorage`-Schlüssel mit Besitzer-Marker, den `clearOfflineData` beim Abmelden nur für Konto-Stände löscht. Die Seite `/calculator` wird wie `/dashboard` aufgebaut (`QueryProvider`, `OfflineSync`, `AppHeader`), aber ohne Session-Gate.

Verworfene Alternativen:
- **Route Handler `/api/recipes` + TanStack-Mutation** (Muster aus F005-Präferenzen): Die Offline-Warteschlange von F005 wird hier nicht gebraucht, offline wird nur lokal gemerkt (Q12). Eine Server Action ist kleiner (kein URL-/JSON-Vertrag, typisierter Aufruf) und folgt dem Next-Guide „Server Actions and Mutations“.
- **Lokalen Stand im TanStack-Query-Cache ablegen** (`sourdough-os:query-cache`): `clearOfflineData` löscht beim Abmelden den kompletten Cache, ein Gast-Stand ginge damit verloren (widerspricht AC-10). Außerdem verfallen persistierte Queries nach 7 Tagen (`maxAge`). Deshalb gibt es einen eigenen Schlüssel.
- **Gramm- und Prozentfelder als Strings im Zustand**: Gerundete Anzeigewerte würden weitergerechnet (Rundungsdrift). Deshalb gilt: Zahlen im Zustand, Rohtext nur während des Fokus.
- **Formularbibliothek (react-hook-form o. Ä.)**: neue Abhängigkeit ohne Mehrwert, das Projekt nutzt `useState` und eigene Validierung (Login/Register).
- **Zwei einzelne Inserts mit Ausgleichs-Löschen des Rezeptkopfs**: nicht atomar und nicht doppelklick-sicher. Ersetzt durch **einen `db.batch()`** (neon-http führt ihn als eine Postgres-Transaktion aus) mit `onConflictDoNothing` und einer Rezept-ID, die bei Wiederholung gleich bleibt (Abschnitt „Speichern im Konto“).
- **Rezept-ID pro Aufruf auf dem Server erzeugen**: Jeder Aufruf, also auch ein Doppelklick oder eine Wiederholung nach dem Timeout, bekäme eine neue ID. `onConflictDoNothing` griffe dann nie. Eine vorab vom Server geholte ID kostet einen zusätzlichen Roundtrip, der selbst scheitern kann. Deshalb erzeugt der Client die ID als Idempotenzschlüssel (das F006-Schema akzeptiert ausdrücklich vom Client mitgegebene UUIDs). Der Server prüft Format und Besitz.
- **Ein einzelnes SQL-Statement mit datenändernder CTE** (`WITH r AS (INSERT … RETURNING) INSERT …`): wäre auch ohne Batch atomar, aber `$with(...).as()` akzeptiert in Drizzle nur Select-Builder bzw. rohes SQL (`drizzle-orm/pg-core/subquery.d.ts`, `WithBuilder`). Das Statement müsste komplett als Roh-SQL geschrieben werden.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/app/calculator/page.tsx | neu | Route `/calculator` ohne Anmeldung: `QueryProvider`, `OfflineSync`, `AppHeader`, Überschrift „Rechner“, `CalculatorScreen` |
| src/app/calculator/actions.ts | neu | `"use server"`: `saveRecipe(input)` prüft Session und Eingabe und schreibt `recipes` + `recipe_ingredients` |
| src/app/calculator/actions.test.ts | neu | Server Action gegen PGlite (node): Speichern, Reihenfolge, 401-Fall, ungültige Eingabe, DB-Fehler |
| src/lib/calculator/format.ts | neu | `parseDecimal` (Komma und Punkt), `formatDecimal` (de-DE, ohne Tausendertrennzeichen) |
| src/lib/calculator/format.test.ts | neu | Unit-Tests Parsen/Formatieren |
| src/lib/calculator/messages.ts | neu | Neue UI-Texte und Labels (Engine-Meldungen werden nicht dupliziert) |
| src/lib/calculator/recipe-state.ts | neu | Typen, Referenzrezept, reine Zustandsfunktionen, `evaluateRecipe` |
| src/lib/calculator/recipe-state.test.ts | neu | Unit-Tests Rechen- und Validierungsverhalten AC-1 bis AC-5 |
| src/lib/calculator/ddt-state.ts | neu | DDT-Zustand, Startwerte, Slider-Bereiche, Knetmethoden-Optionen aus `FRICTION_PRESETS`, `evaluateDdt` |
| src/lib/calculator/ddt-state.test.ts | neu | Unit-Tests AC-6, AC-7 |
| src/lib/calculator/local-draft.ts | neu | `CalculatorOwner`, Lokal merken/laden mit Besitzer-Marker, Löschen von Konto-Ständen |
| src/lib/calculator/local-draft.test.ts | neu | Unit-Tests AC-10 inkl. `clearOfflineData` |
| src/lib/calculator/save-recipe.ts | neu | `SaveRecipeInput`/`SaveRecipeResult`, `buildSaveRecipeInput`, `resolveSaveRecipeId`, `SAVE_TIMEOUT_MS`, `withTimeout` |
| src/lib/calculator/save-recipe.test.ts | neu | Unit-Tests Payload für das Referenzrezept, ID-Wiederverwendung, Timeout |
| src/test/pglite-db.ts | ändern | `createTestDb()` liefert zusätzlich `batchDb`: das PGlite-`db` mit nachgebildetem `batch` (BEGIN … COMMIT/ROLLBACK auf der einen PGlite-Verbindung), weil `drizzle-orm/pglite` kein `batch` hat |
| src/lib/calculator/use-calculator-owner.ts | neu | Hook: aktuelle Person (Gast / Konto-ID / lädt), offline über gecachte Nutzer-ID |
| src/components/calculator/calculator-screen.tsx | neu | Client-Einstieg: Besitzer ermitteln, Ladehinweis oder `<Calculator key owner>` |
| src/components/calculator/calculator-screen.test.tsx | neu | Besitzer-Ermittlung (Gast, online angemeldet, offline mit Cache) und Seite ohne Umleitung |
| src/components/calculator/calculator.tsx | neu | Hält `CalculatorDraft`-State, Layout (zwei Spalten ab `md`), verbindet Teil-Komponenten |
| src/components/calculator/hydration-calculator.tsx | neu | Basis-Umschalter, Basisfeld, Zutatenliste, Hinzufügen-Buttons, Mehlanteil-Meldung, Kennzahlen |
| src/components/calculator/ingredient-row.tsx | neu | Eine Zutatenzeile (Name, Typ, Gramm, Prozent, Starter-Hydratation, Entfernen, Zeilenmeldung) |
| src/components/calculator/ddt-calculator.tsx | neu | Vier Temperatur-Steuerungen, Knetmethode, Knetreibung, Wassertemperatur + Warnung |
| src/components/calculator/temperature-control.tsx | neu | Slider + Eingabefeld mit gemeinsamem Label und Wert |
| src/components/calculator/number-field.tsx | neu | `NumberField` (Entwurfstext während Fokus) und `FieldMessage` (höfliche Feldmeldung) |
| src/components/calculator/save-panel.tsx | neu | „Als Rezept speichern“ bzw. „Lokal merken“, Gast-Hinweis, Rückmeldungen |
| src/components/calculator/calculator-hydration.test.tsx | neu | Komponententests AC-1 bis AC-5 |
| src/components/calculator/calculator-ddt.test.tsx | neu | Komponententests AC-6, AC-7 |
| src/components/calculator/calculator-save.test.tsx | neu | Komponententests AC-8 bis AC-10 |
| src/lib/query/clear-offline-data.ts | ändern | Beim Abmelden zusätzlich `clearAccountCalculatorDraft()` aufrufen (AC-10) |
| src/components/auth/dashboard.tsx | ändern | Link „Zum Rechner“ auf `/calculator` |
| src/components/auth/dashboard.test.tsx | ändern | Test für den Link „Zum Rechner“ |

Keine neuen Abhängigkeiten, keine Migration, keine Schemaänderung. `hydration.ts`, `ddt.ts`, `AppHeader`, `QueryProvider`, `OfflineSync` und `TextField` bleiben unverändert und werden wiederverwendet.

## Komponenten & Datenfluss

### Komponentenbaum
```
src/app/calculator/page.tsx (Server Component, Default-Export CalculatorRoute)
└─ QueryProvider
   └─ div.flex-1 bg-zinc-50 dark:bg-black
      ├─ OfflineSync            (F005, für Gäste ein No-op)
      ├─ AppHeader              (F005, Offline-Hinweis)
      └─ main > div.mx-auto max-w-5xl px-4 py-8
         ├─ h1 „Rechner“
         └─ CalculatorScreen ("use client")
            ├─ owner === null → <p role="status">{SESSION_LOADING_MESSAGE}</p>  („Lade Sitzung …“ aus auth-form)
            └─ Calculator key={ownerKey(owner)} owner={owner}
               ├─ div.grid gap-8 md:grid-cols-2
               │  ├─ HydrationCalculator (section, h2 „Hydratations-Rechner“)
               │  │  ├─ fieldset legend „Basis“: Radios „Basis: Gesamtmehl“ / „Basis: Ziel-Teiggewicht“
               │  │  ├─ NumberField „Gesamtmehl (g)“ bzw. „Ziel-Teiggewicht (g)“ + FieldMessage
               │  │  ├─ ul aria-label „Zutaten“ → li → IngredientRow (je Zeile)
               │  │  ├─ FieldMessage id „flour-sum-error“ (Mehlanteil-Meldung)
               │  │  ├─ Buttons „Mehl hinzufügen“, „Zutat hinzufügen“
               │  │  └─ dl: „Netto-Hydratation“, „Teigausbeute (TA)“
               │  └─ DdtCalculator (section, h2 „DDT-Rechner“)
               │     ├─ TemperatureControl ×4
               │     ├─ select „Knetmethode“, bei custom NumberField „Knetreibung (°C)“
               │     └─ dl: „Wassertemperatur“ + Warnung (role="status")
               └─ SavePanel (section, h2 „Speichern“, volle Breite unter dem Grid)
```
DOM-Reihenfolge = Tab-Reihenfolge: Hydratations-Rechner, DDT-Rechner, Speichern. Unter `md` stehen die Bereiche untereinander, Zeilen nutzen `flex flex-wrap`, Felder `min-w-0 w-full`, damit ab 320 px nichts horizontal scrollt. Stile wie Login/Dashboard: Inputs mit der Klassenliste aus `TextField`, Buttons `h-11 rounded-full bg-foreground …` (primär) bzw. Rahmen-Variante `border border-zinc-300 dark:border-zinc-700` (sekundär), Fehlertexte `text-sm text-red-700 dark:text-red-400`, alle mit `dark:`-Varianten.

### Zustand (lebt in `Calculator`)
`const [draft, setDraft] = useState<CalculatorDraft>(() => loadCalculatorDraft(owner) ?? createDefaultDraft())`. Auswertungen werden bei jedem Render berechnet (`evaluateRecipe(draft.recipe)`, `evaluateDdt(draft.ddt)`), sie sind rein und billig (React Compiler ist aktiv). Kein Context, kein globaler Store.

#### `src/lib/calculator/recipe-state.ts`
```ts
import type { IngredientType } from "@/db/schema/recipes"; // nur Typ-Import

export type BasisMode = "flour" | "dough";
export type AdditiveType = "salt" | "other";

export interface RecipeRow {
  /** Stabil, deterministisch: "row-1", "row-2", … */
  id: string;
  name: string;
  type: IngredientType;
  /** g, ungerundet; NaN bei ungültiger Eingabe. */
  grams: number;
  /** Bäckerprozent bezogen auf die Mehlbasis, ungerundet. */
  percent: number;
  /** Für alle Zeilen gespeichert (Standard 100), ausgewertet nur bei type "starter". */
  starterHydration: number;
}

export interface RecipeState {
  basis: BasisMode;
  /** Mehlbasis F in g (Basis „Gesamtmehl“). Wird in beiden Modi mitgeführt. */
  flourBasis: number;
  /** Ziel-Teiggewicht W in g (Basis „Ziel-Teiggewicht“). */
  doughWeight: number;
  rows: RecipeRow[];
}

export interface RecipeEvaluation {
  basisError: string | null;
  /** rowId → eine Meldung pro Zeile */
  rowErrors: Record<string, string>;
  flourSumError: string | null;
  /** null, solange eine Meldung existiert oder kein Mehl vorhanden ist */
  netHydration: number | null;
  doughYield: number | null;
  /** Summe aller Gramm, ungerundet */
  totalWeight: number;
  isValid: boolean;
}

export function createReferenceRecipe(): RecipeState;
// basis "flour", flourBasis 1000, doughWeight 1920, rows:
// row-1 Weizenmehl flour 800 g/80 %, row-2 Roggenmehl flour 200/20, row-3 Wasser water 700/70,
// row-4 Starter starter 200/20 (Hydratation 100), row-5 Salz salt 20/2; starterHydration überall 100.

export function setBasisMode(state: RecipeState, mode: BasisMode): RecipeState;
export function setBasisValue(state: RecipeState, value: number): RecipeState;
export function setRowGrams(state: RecipeState, rowId: string, grams: number): RecipeState;
export function setRowPercent(state: RecipeState, rowId: string, percent: number): RecipeState;
export function setStarterHydration(state: RecipeState, rowId: string, value: number): RecipeState;
export function setRowName(state: RecipeState, rowId: string, name: string): RecipeState;
export function setRowType(state: RecipeState, rowId: string, type: AdditiveType): RecipeState;
export function addFlourRow(state: RecipeState): { state: RecipeState; rowId: string };
export function addAdditiveRow(state: RecipeState): { state: RecipeState; rowId: string };
export function removeRow(state: RecipeState, rowId: string): RecipeState;
export function canRemoveRow(state: RecipeState, rowId: string): boolean;
/** Name getrimmt, leer → Typname ("Mehl", "Wasser", "Starter", "Salz", "Sonstiges"). */
export function ingredientDisplayName(row: RecipeRow): string;
export function evaluateRecipe(state: RecipeState): RecipeEvaluation;
```

Regeln (gegen diese schreibt der Test-Writer). `gramsFromPercent(F, p) = F × p / 100` und `percentFromGrams(g, F) = g / F × 100` sind interne Helfer, sie setzen nur die Definition des Bäckerprozents aus F007 um. Mehrzeilige Rechnungen laufen über die Engine.
- **`setBasisValue`**
  - Modus `flour`: `flourBasis = value`. Ist `value` endlich und > 0, dann gilt für jede Zeile `grams = gramsFromPercent(value, percent)`, und `doughWeight` wird die Summe der Gramm. Sonst bleiben die Gramm unverändert.
  - Modus `dough`: `doughWeight = value`. Ist `value` endlich und > 0, wird `calculateRecipeFromTotalWeight(rows→PercentIngredient, value)` versucht. Klappt das, werden die Gramm übernommen und `flourBasis = result.flourBasis` gesetzt. Wirft die Engine, bleiben Gramm und `flourBasis` unverändert, die Meldung liefert `evaluateRecipe`.
- **`setRowGrams`** (in beiden Modi gleich, Q4/Q5):
  - Mehl-Zeile mit endlichen Gramm ≥ 0 in allen Zeilen und einer Mehlsumme > 0: `calculateBakersPercentages` berechnet die Prozente **aller** Zeilen neu, `flourBasis` wird die neue Mehlsumme.
  - Andere Zeile oder ungültiger Fall: Nur das Prozent dieser Zeile ändert sich (`percentFromGrams(grams, flourBasis)`, nur bei `flourBasis` > 0). `flourBasis` bleibt.
  - Danach gilt in jedem Fall `doughWeight = Summe der Gramm`.
- **`setRowPercent`**: Das Prozent wird gesetzt. Ist `flourBasis` endlich und > 0, wird `grams = gramsFromPercent(flourBasis, percent)`. Danach `doughWeight = Summe der Gramm`. `flourBasis` bleibt (AC-2: „Gesamtmehl (g)“ bleibt 1000; AC-5: Weizenmehl 70 % ergibt eine Mehlsumme von 90 %).
- **`setBasisMode`**: Nur `basis` ändert sich. Beim Wechsel auf `dough` wird `doughWeight = Summe der Gramm` gesetzt, das sind 1920 bei Referenz (AC-3). Beim Wechsel auf `flour` bleibt `flourBasis`. Gramm und Prozente bleiben unverändert (Q6).
- **`addFlourRow`**: Fügt eine neue Zeile `{ name: "", type: "flour", grams: 0, percent: 0, starterHydration: 100 }` direkt nach der letzten Mehl-Zeile ein. **`addAdditiveRow`**: hängt `{ name: "", type: "other", grams: 0, percent: 0, starterHydration: 100 }` ans Ende an. Neue ID ist `row-${max+1}`.
- **`removeRow`**: Wasser- und Starter-Zeilen sind nie entfernbar, die letzte Mehl-Zeile auch nicht (dann No-op). Sonst wird die Zeile entfernt, die Reihenfolge der übrigen bleibt. Prozente und Gramm der übrigen Zeilen bleiben unverändert, `doughWeight` wird neu summiert.
- **`evaluateRecipe`**:
  1. Basisfeld des aktiven Modus prüfen: nicht endlich → `NON_FINITE_FLOUR_BASIS_MESSAGE` / `NON_FINITE_TOTAL_WEIGHT_MESSAGE`, ≤ 0 → `INVALID_FLOUR_BASIS_MESSAGE` / `INVALID_TOTAL_WEIGHT_MESSAGE`.
  2. Je Zeile höchstens eine Meldung, in dieser Reihenfolge: Gramm nicht endlich → `NON_FINITE_GRAMS_MESSAGE`, < 0 → `NEGATIVE_GRAMS_MESSAGE`. Danach Prozent: `NON_FINITE_BAKERS_PERCENT_MESSAGE` / `NEGATIVE_BAKERS_PERCENT_MESSAGE`. Danach nur beim Starter `NON_FINITE_STARTER_HYDRATION_MESSAGE` / `NEGATIVE_STARTER_HYDRATION_MESSAGE`.
  3. Nur wenn keine Zeilenmeldung existiert: Mehlanteil über die Engine prüfen, `try { calculateRecipeFromFlourBasis(percentRows, 100) } catch (e) { if (e.message === FLOUR_PERCENT_SUM_MESSAGE) flourSumError = … }`. Die Toleranzregel bleibt so allein in `hydration.ts`.
  4. Ohne Meldungen: `netHydration = calculateNetHydration(gramRows)`, `doughYield = 100 + netHydration`. Liefert die Engine `null`, sind beide `null` und `isValid` ist `false`.
  Alle Texte kommen als Konstanten aus `@/lib/baking-engine/hydration`.

#### `src/lib/calculator/ddt-state.ts`
```ts
import { FRICTION_PRESETS, type DdtResult, type KneadingMethod } from "@/lib/baking-engine/ddt";

export interface DdtState {
  desiredDoughTemperature: number;
  roomTemperature: number;
  flourTemperature: number;
  starterTemperature: number;
  kneadingMethod: KneadingMethod;
  /** Nur bei "custom" an die Engine übergeben. */
  customFriction: number;
}
export type DdtField = "desiredDoughTemperature" | "roomTemperature" | "flourTemperature" | "starterTemperature" | "customFriction";

export const DEFAULT_DDT_STATE: DdtState; // 25 / 22 / 22 / 22, "hand", customFriction 0
export const DDT_SLIDER_RANGE: { min: 18; max: 32; step: 0.5 };
export const AMBIENT_SLIDER_RANGE: { min: -10; max: 40; step: 0.5 };
/** Reihenfolge hand, stand_mixer, spiral, custom; Labels "Handknetung (+1 °C)" … "Eigener Wert", Werte aus FRICTION_PRESETS. */
export const KNEADING_METHOD_OPTIONS: ReadonlyArray<{ value: KneadingMethod; label: string }>;

export interface DdtEvaluation {
  errors: Partial<Record<DdtField, string>>;
  result: DdtResult | null; // null bei Fehler
}
export function evaluateDdt(state: DdtState): DdtEvaluation;
```
`evaluateDdt` ruft `calculateWaterTemperature` in `try/catch` auf. Eine geworfene Meldung wird über ihre Konstante dem passenden Feld zugeordnet:
- `NON_FINITE_DOUGH_TEMPERATURE_MESSAGE` → `desiredDoughTemperature`
- `NON_FINITE_ROOM_TEMPERATURE_MESSAGE` → `roomTemperature`
- `NON_FINITE_FLOUR_TEMPERATURE_MESSAGE` → `flourTemperature`
- `NON_FINITE_STARTER_TEMPERATURE_MESSAGE` → `starterTemperature`
- Reibungs-Meldungen (`NEGATIVE_FRICTION_MESSAGE`, `NON_FINITE_FRICTION_MESSAGE`, `MISSING_CUSTOM_FRICTION_MESSAGE`) → `customFriction`

Das Options-Label wird als `${Name} (+${formatDecimal(preset, 0)} °C)` aus `FRICTION_PRESETS` gebaut. Die Zahl wird nicht in der UI dupliziert.

#### `src/lib/calculator/format.ts`
```ts
/** "" (nach trim) → null; "2,5" und "2.5" → 2.5; "-5" → -5; "2," → 2; sonst NaN. Kein Tausendertrenner. */
export function parseDecimal(text: string): number | null;
/** de-DE, feste Nachkommastellen, ohne Gruppierung; -0 → "0"; NaN/Infinity → "". */
export function formatDecimal(value: number, fractionDigits: number): string;
```
Anzeige: Gramm `formatDecimal(g, 0)`, Prozent/Hydratation/TA/Temperatur `formatDecimal(x, 1)`. Kennzahlen als Text: `"72,7 %"`, `"172,7"`, `"37,0 °C"`, ohne Wert `NO_VALUE` = „–“ (U+2013).

#### `src/lib/calculator/messages.ts` (neue Texte, exakt)
`CALCULATOR_TITLE` „Rechner“, `HYDRATION_SECTION_TITLE` „Hydratations-Rechner“, `DDT_SECTION_TITLE` „DDT-Rechner“, `SAVE_SECTION_TITLE` „Speichern“, `BASIS_LEGEND` „Basis“, `BASIS_FLOUR_LABEL` „Basis: Gesamtmehl“, `BASIS_DOUGH_LABEL` „Basis: Ziel-Teiggewicht“, `FLOUR_BASIS_LABEL` „Gesamtmehl (g)“, `DOUGH_WEIGHT_LABEL` „Ziel-Teiggewicht (g)“, `INGREDIENT_LIST_LABEL` „Zutaten“, `NAME_LABEL` „Name“, `TYPE_LABEL` „Typ“, `ADDITIVE_TYPE_LABELS` `{ salt: "Salz", other: "Sonstiges" }`, `DEFAULT_INGREDIENT_NAMES` `{ flour: "Mehl", water: "Wasser", starter: "Starter", salt: "Salz", other: "Sonstiges" }`, `GRAMS_LABEL` „Gramm (g)“, `PERCENT_LABEL` „Prozent (%)“, `STARTER_HYDRATION_LABEL` „Starter-Hydratation (%)“, `ADD_FLOUR_LABEL` „Mehl hinzufügen“, `ADD_INGREDIENT_LABEL` „Zutat hinzufügen“, `REMOVE_LABEL` „Entfernen“, `removeIngredientLabel(name)` → `${name} entfernen`, `NET_HYDRATION_LABEL` „Netto-Hydratation“, `DOUGH_YIELD_LABEL` „Teigausbeute (TA)“, `NO_VALUE` „–“, `DDT_LABEL` „Ziel-Teigtemperatur (DDT)“, `ROOM_TEMPERATURE_LABEL` „Raumtemperatur“, `FLOUR_TEMPERATURE_LABEL` „Mehltemperatur“, `STARTER_TEMPERATURE_LABEL` „Startertemperatur“, `KNEADING_METHOD_LABEL` „Knetmethode“, `KNEADING_METHOD_NAMES` `{ hand: "Handknetung", stand_mixer: "Küchenmaschine", spiral: "Spiralkneter", custom: "Eigener Wert" }`, `CUSTOM_FRICTION_LABEL` „Knetreibung (°C)“, `WATER_TEMPERATURE_LABEL` „Wassertemperatur“, `WARNING_LABELS` `{ cold_warning: "Kalt", heat_warning: "Heiß" }`, `RECIPE_NAME_LABEL` „Rezeptname“, `SAVE_RECIPE_LABEL` „Als Rezept speichern“, `SAVING_LABEL` „Speichern …“, `recipeSavedMessage(name)` → `Rezept „${name}“ gespeichert.`, `RECIPE_NAME_REQUIRED_MESSAGE` „Bitte gib einen Rezeptnamen ein.“, `SAVE_FAILED_MESSAGE` „Das Rezept konnte nicht gespeichert werden. Bitte versuche es erneut.“, `SAVE_LOCAL_LABEL` „Lokal merken“, `SAVED_LOCAL_MESSAGE` „Auf diesem Gerät gemerkt.“, `SIGN_IN_HINT` „Melde dich an, um Rezepte in deinem Konto zu speichern.“, `SIGN_IN_LINK_LABEL` „Anmelden“, `CALCULATOR_LINK_LABEL` „Zum Rechner“.

### Komponenten-Props
```ts
// number-field.tsx
export interface NumberFieldProps {
  id: string;                       // <label id={`${id}-label`} htmlFor={id}>
  label: string;                    // sichtbar
  value: number;
  onValueChange: (value: number) => void;
  fractionDigits: number;
  /** Wert für leeres Feld (Zutaten und Basis: 0). Ohne Angabe NaN. */
  emptyValue?: number;
  /** Einheit sichtbar neben dem Feld, z. B. "g", "%", "°C" (aria-hidden, Einheit steht schon im Label oder im Wert). */
  unit?: string;
  invalid?: boolean;
  /** IDs für aria-describedby (Feldmeldung, Mehlanteil-Meldung). */
  describedBy?: string[];
  ref?: Ref<HTMLInputElement>;
}
// <input type="text" inputMode="decimal" autoComplete="off">. Entwurf: useState<string | null>(null).
// Anzeige = Entwurf ?? formatDecimal(value, fractionDigits). onChange: Entwurf setzen und
// onValueChange(parseDecimal(text) ?? emptyValue ?? NaN). onBlur: Entwurf verwerfen.

export interface FieldMessageProps { id: string; message: string | null | undefined }
// Immer gerendert: <div aria-live="polite">{message ? <p id={id} className="text-sm text-red-700 …">{message}</p> : null}</div>

// temperature-control.tsx
export interface TemperatureControlProps {
  id: string; label: string; value: number; onValueChange: (value: number) => void;
  min: number; max: number; step: number; error?: string;
}
// NumberField (fractionDigits 1, unit "°C") + <input type="range" aria-labelledby={`${id}-label`}
// value={Number.isFinite(value) ? clamp(value, min, max) : min} aria-valuetext="26,0 °C">.
// Beide Elemente heißen damit gleich (Rolle textbox bzw. slider). FieldMessage `${id}-error`.

// ingredient-row.tsx
export interface IngredientRowProps {
  row: RecipeRow;
  error?: string;
  /** zusätzliche describedBy-ID für Prozentfelder von Mehlen (Mehlanteil-Meldung) */
  flourSumErrorId?: string;
  canRemove: boolean;
  onGramsChange: (grams: number) => void;
  onPercentChange: (percent: number) => void;
  onStarterHydrationChange: (value: number) => void;
  onNameChange: (name: string) => void;
  onTypeChange: (type: AdditiveType) => void;
  onRemove: () => void;
  nameInputRef?: Ref<HTMLInputElement>;
}
// <div role="group" aria-label={ingredientDisplayName(row)}>:
// - Mehl/Salz/Sonstiges: Textfeld „Name“. Wasser und Starter haben feste Namen, kein Namensfeld, kein Entfernen.
// - Salz/Sonstiges: <select> „Typ“ mit „Salz“/„Sonstiges“.
// - Immer: NumberField „Gramm (g)“ (0 Stellen, emptyValue 0), „Prozent (%)“ (1 Stelle, emptyValue 0).
// - Starter: zusätzlich „Starter-Hydratation (%)“ (1 Stelle, ohne emptyValue).
// - Button „Entfernen“ mit aria-label removeIngredientLabel(displayName), disabled={!canRemove}.
// - FieldMessage `${row.id}-error`; Gramm-, Prozent- und Hydratationsfeld verweisen darauf (aria-invalid).

// hydration-calculator.tsx
export interface HydrationCalculatorProps {
  state: RecipeState;
  evaluation: RecipeEvaluation;
  onChange: (next: RecipeState) => void;
}
// Fokus nach „Mehl hinzufügen“: flushSync(() => onChange(next)); nameRefs.get(rowId)?.focus().
// Kennzahlen: <dl>, je <dt id="…-label"> + <dd aria-labelledby="…-label">; kein aria-live (kein Vorlesen beim Ziehen).

// ddt-calculator.tsx
export interface DdtCalculatorProps {
  state: DdtState;
  evaluation: DdtEvaluation;
  onChange: (next: DdtState) => void;
}
// Wassertemperatur: <dd aria-labelledby="water-temperature-label">„37,0 °C“ | „–“</dd>.
// Daneben immer gerendert <div role="status" aria-live="polite">; bei Warnung
// <p data-warning="cold"|"heat" class="(kalt: bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100 | heiß: bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100)">
//   <span>{WARNING_LABELS[status]}:</span> <span>{result.message}</span></p>

// save-panel.tsx
export interface SavePanelProps {
  owner: CalculatorOwner;
  draft: CalculatorDraft;
  recipeEvaluation: RecipeEvaluation;
  ddtEvaluation: DdtEvaluation;
}

// calculator.tsx
export interface CalculatorProps { owner: CalculatorOwner }
export function createDefaultDraft(): CalculatorDraft; // { recipe: createReferenceRecipe(), ddt: DEFAULT_DDT_STATE }

// calculator-screen.tsx: export function CalculatorScreen(): JSX.Element  (keine Props)
```

### Besitzer und Online-Status
`src/lib/calculator/use-calculator-owner.ts`: `useCalculatorOwner(): CalculatorOwner | null` (null = lädt). Die Regeln:
- `useSession()` liefert eine ID → `{ kind: "user", userId }`.
- `useIsRestoring()` oder `isPending` → `null`.
- `!useOnlineStatus()` und `useCachedUserId()` (F005-Cache) → `{ kind: "user", userId: cachedUserId }`. So bleibt eine angemeldete Person auch offline (Session-Abruf scheitert) eine angemeldete Person.
- Sonst `{ kind: "guest" }`.

`ownerKey(owner)` (in `local-draft.ts`) liefert `"guest"` bzw. `user:<id>` als React-`key`. Wechselt die Person, wird der Rechner neu gemountet und lädt den passenden Stand. Auf dem Server und beim ersten Client-Render ist `isRestoring` true, dadurch gibt es keine Hydration-Abweichung.

### Speichern im Konto (AC-8, AC-9)
`SavePanel` zeigt den Kontomodus genau dann, wenn `owner.kind === "user" && useOnlineStatus()` gilt. Der Ablauf:
- `<form noValidate onSubmit>` mit `TextField` aus `@/components/auth/text-field` (`id="recipe-name"`, `name="recipeName"`, Label „Rezeptname“, `type="text"`, `autoComplete="off"`) und Submit-Button „Als Rezept speichern“. Der Button ist `disabled`, wenn `!recipeEvaluation.isValid` oder während des Speicherns.
- Klick bei leerem bzw. nur aus Leerzeichen bestehendem Namen: Fehler am Feld (`RECIPE_NAME_REQUIRED_MESSAGE`), Fokus aufs Feld, kein Aufruf.
- Doppelklick-Sperre: `savingRef = useRef(false)`. Ist er gesetzt, kehrt `onSubmit` sofort zurück. Zusätzlich ist der Button während des Speicherns `disabled`, so erzeugt ein zweiter Klick im selben Frame keinen zweiten Aufruf.
- Sonst: `savingRef.current = true`, `setStatus("saving")`, Button-Text „Speichern …“.
  - `const payload = buildSaveRecipeInput(draft.recipe, name)`
  - `const attempt = resolveSaveRecipeId(attemptRef.current, payload, () => crypto.randomUUID())`, danach `attemptRef.current = attempt`
  - Aufruf `await withTimeout(saveRecipe({ ...payload, recipeId: attempt.recipeId }), SAVE_TIMEOUT_MS)`
- Ergebnis `ok: true`: Rückmeldung `recipeSavedMessage(name.trim())`. Ergebnis `ok: false`, ein Wurf (Netzwerk) oder ein Timeout: `SAVE_FAILED_MESSAGE`. Danach `savingRef.current = false`, der Button ist wieder aktiv, Eingaben und Name bleiben stehen. `attemptRef` bleibt in beiden Fällen erhalten.
- Rückmeldungen stehen in einem immer gerenderten `<div role="status" aria-live="polite">`, Fehler rot, Erfolg neutral.

**Wo die Rezept-ID entsteht und wie eine Wiederholung dieselbe ID trifft:**
- Die ID entsteht im Browser (`crypto.randomUUID()`) in `SavePanel`, und zwar nur, wenn sich der Inhalt geändert hat. `attemptRef` (ein `useRef<SaveAttempt | null>`) merkt sich `{ recipeId, fingerprint }`, wobei `fingerprint = JSON.stringify(payload)` ohne ID ist. `resolveSaveRecipeId` gibt den alten Versuch zurück, wenn der Fingerprint gleich ist, sonst einen neuen mit frischer ID.
- **Doppelklick:** Der zweite Klick wird durch `savingRef` und den deaktivierten Button gar nicht erst gesendet. Kommt er nach einer sehr schnellen Antwort doch durch, hat er denselben Inhalt und damit dieselbe ID. Der Server erkennt die Wiederholung und schreibt nichts doppelt.
- **Wiederholung nach Fehler oder Timeout:** Bei unverändertem Inhalt wird dieselbe ID erneut gesendet. Hat der erste Aufruf nach dem 15-s-Timeout doch noch committet, findet `onConflictDoNothing` den Kopf, der Zutaten-Insert ist durch `NOT EXISTS` gesperrt, und der Server meldet `ok: true` (gespeichert, kein Duplikat). Ist er gescheitert (Rollback der ganzen Transaktion), wird beim erneuten Versuch normal gespeichert. Läuft er noch: Next schickt Server Actions pro Client nacheinander (Guide „Server Actions“, Abschnitt „Sequential dispatch“), die Wiederholung wartet also im Client. Treffen zwei Aufrufe mit derselben ID trotzdem gleichzeitig auf die DB (z. B. zwei Tabs), wartet der zweite `INSERT … ON CONFLICT DO NOTHING` auf die Primärschlüssel-Sperre des ersten und sieht danach dessen Zutaten (READ COMMITTED, neuer Snapshot pro Statement).
- **Erfolg und erneuter Klick ohne Änderung:** gleiche ID, keine Kopie, Meldung erneut „gespeichert“.
- **Inhalt oder Name geändert:** neue ID, also ein neues Rezept. Ein spät doch committeter Vorversuch mit dem alten Inhalt bleibt dann als eigenes Rezept bestehen (siehe Risiken).
- `attemptRef` lebt nur im gemounteten `SavePanel`. Nach einem Neuladen gibt es eine neue ID.

`src/lib/calculator/save-recipe.ts` (client-sicher, keine Laufzeit-Imports aus `@/db`):
```ts
export interface SaveRecipeIngredientInput {
  name: string; type: IngredientType; amountGrams: number; bakersPercent: number; starterHydration: number;
}
export interface SaveRecipeInput {
  name: string;                // getrimmt
  targetDoughWeight: number;   // Math.round(Summe Gramm)
  targetHydration: number;     // Netto-Hydratation, auf 1 Stelle gerundet (72.7)
  ingredients: SaveRecipeIngredientInput[]; // angezeigte Reihenfolge, position = Index
}
/** Was an die Server Action geht: Payload plus Idempotenzschlüssel. */
export type SaveRecipeRequest = SaveRecipeInput & { recipeId: string };
export type SaveRecipeResult =
  | { ok: true; recipeId: string }
  | { ok: false; error: "UNAUTHORIZED" | "INVALID_INPUT" | "SAVE_FAILED" };
export interface SaveAttempt { recipeId: string; fingerprint: string }
export const SAVE_TIMEOUT_MS = 15_000;
/** Wirft, wenn das Rezept ungültig ist (Aufrufer prüft vorher isValid). Name je Zutat = ingredientDisplayName(row); Gramm/Prozent/Hydratation auf 2 Stellen (Spaltenpräzision). */
export function buildSaveRecipeInput(recipe: RecipeState, name: string): SaveRecipeInput;
/** Gleicher Fingerprint (JSON.stringify(payload)) → `previous` unverändert; sonst { recipeId: createId(), fingerprint }. */
export function resolveSaveRecipeId(
  previous: SaveAttempt | null,
  payload: SaveRecipeInput,
  createId: () => string,
): SaveAttempt;
/** Lehnt nach `ms` mit Error ab, wenn `promise` bis dahin nicht erfüllt ist. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>;
```

`src/app/calculator/actions.ts`:
```ts
"use server";
export async function saveRecipe(input: SaveRecipeRequest): Promise<SaveRecipeResult>;
```
Der Ablauf:
1. `const session = await auth.api.getSession({ headers: await headers() })`. Ohne Session → `{ ok: false, error: "UNAUTHORIZED" }`.
2. Interne, nicht exportierte Prüfung `parseSaveRecipeInput(input: unknown)`. Ein Fehlschlag ergibt `INVALID_INPUT`. Geprüft werden:
   - `recipeId` ist eine UUID (Regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case-insensitive, danach kleingeschrieben)
   - Objekt mit getrimmtem, nicht leerem `name`
   - `targetDoughWeight` ganzzahlig und ≥ 0, `targetHydration` endlich und ≥ 0
   - `ingredients` ist ein nicht leeres Array, jeder Eintrag hat einen nicht leeren Namen, einen `type` aus `INGREDIENT_TYPES` und endliche Werte ≥ 0 für Gramm, Prozent und Starter-Hydratation. Zusätzliche Felder werden ignoriert.
3. Ein einziger `db.batch([...])` mit drei Statements. `userId` kommt immer aus der Session, nie vom Client:
   - a) `db.insert(recipes).values({ id: recipeId, userId, name, targetDoughWeight, targetHydration }).onConflictDoNothing({ target: recipes.id }).returning({ id: recipes.id })`
   - b) `db.insert(recipeIngredients).select(sql\`select gen_random_uuid(), ${recipeId}::uuid, v.name, v.type::ingredient_type, v.amount_grams, v.bakers_percent, v.starter_hydration, v.position from (values …) as v(name, type, amount_grams, bakers_percent, starter_hydration, position) where exists (select 1 from recipes where id = ${recipeId} and user_id = ${userId}) and not exists (select 1 from recipe_ingredients where recipe_id = ${recipeId})\`)`. Die Spaltenreihenfolge im `select` muss der Tabellendefinition entsprechen (`id, recipe_id, name, type, amount_grams, bakers_percent, starter_hydration, position`), denn Drizzle füllt bei `insert().select()` alle Spalten. Die Zeilen in `values` werden mit `sql.join` gebaut, Zahlen mit `::numeric` bzw. `::integer` gecastet. Gesperrt ist der Insert, wenn das Rezept einer anderen Person gehört (`exists … user_id`) oder schon Zutaten hat (`not exists`, Wiederholung).
   - c) `db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))`
4. Auswertung:
   - c) liefert eine Zeile → `{ ok: true, recipeId }` (Erstanlage oder erkannte Wiederholung)
   - c) leer (ID gehört einer anderen Person) → `{ ok: false, error: "SAVE_FAILED" }`, nichts geschrieben
   - jeder DB-Fehler (z. B. Wertebereich `numeric(6,2)` überschritten) → Rollback des ganzen Batches, `{ ok: false, error: "SAVE_FAILED" }`, nicht geworfen

Kein Ausgleichs-Löschen mehr nötig: Ein gescheiterter Batch hinterlässt nichts.

**Atomarität, Belege:**
- `node_modules/drizzle-orm/neon-http/session.js` Z. 117–133: `batch()` baut alle Statements und schickt sie über `this.client.transaction(builtQueries, queryConfig)`.
- `node_modules/@neondatabase/serverless/index.d.ts` Z. 892–923: `transaction()` sendet die Queries „as a single, non-interactive Postgres transaction“.
- „Nicht interaktiv“ heißt: Statement b) kann nicht vom JS-Ergebnis von a) abhängen. Die Bedingungen stehen deshalb in SQL (`exists` / `not exists`), b) sieht innerhalb der Transaktion die Zeile aus a).
- Die interaktive `db.transaction()` wirft bei neon-http (`session.js` Z. 151–158, „No transactions support in neon-http driver“) und kommt nicht in Frage.

**Schema, Beleg `src/db/schema/recipes.ts`:**
- `recipes.id` ist `uuid` Primärschlüssel mit `defaultRandom()`, eine mitgegebene UUID wird akzeptiert. Das ist das Konfliktziel von `onConflictDoNothing`.
- `recipe_ingredients` hat nur den Primärschlüssel `id` und keinen Unique-Constraint auf `(recipe_id, position)`. Ein `onConflictDoNothing` auf Zutaten griffe also nie. Deshalb sperrt `not exists` die Zutaten bei einer Wiederholung, ohne Schemaänderung.

**Tests mit PGlite:**
- `drizzle-orm/pglite` hat kein `batch` (`typeof db.batch === "undefined"`, geprüft).
- `createTestDb()` liefert deshalb zusätzlich `batchDb`: ein `Proxy` auf das PGlite-`db`, dessen `batch(queries)` auf der einzigen PGlite-Verbindung `BEGIN` ausführt, die Statements nacheinander awaitet und mit `COMMIT` abschließt, bei einem Fehler mit `ROLLBACK`.
- Die Tests mocken `@/db` mit `{ db: testDb.batchDb }`.
- Probelauf im Scratchpad mit PGlite 0.5 und drizzle 0.45 bestanden: Erstanlage schreibt 1 Kopf + 2 Zutaten. Die Wiederholung mit derselben ID liefert a) leer, c) eine Zeile, keine neuen Zutaten. Eine fremde ID liefert c) leer, nichts wird geschrieben. Ein Überlauf (`bakers_percent` 100000) führt zum Rollback, auch der Kopf fehlt danach.

Kein `revalidatePath`, denn es gibt noch keine Rezeptliste. Rückgabewerte sind bewusst schmal (Next-Guide „Constrain return values“).

### Lokal merken (AC-10)
`src/lib/calculator/local-draft.ts`:
```ts
export const CALCULATOR_DRAFT_KEY = "sourdough-os:calculator-draft";
export type CalculatorOwner = { kind: "guest" } | { kind: "user"; userId: string };
export interface CalculatorDraft { recipe: RecipeState; ddt: DdtState }
/** Gespeichertes Format: { version: 1, owner: CalculatorOwner, recipe, ddt } */
export function saveCalculatorDraft(owner: CalculatorOwner, draft: CalculatorDraft): boolean; // false, wenn localStorage wirft
export function loadCalculatorDraft(owner: CalculatorOwner): CalculatorDraft | null;        // null bei fehlendem, kaputtem oder fremdem Stand
export function clearAccountCalculatorDraft(): void; // entfernt den Schlüssel nur, wenn owner.kind === "user"
export function ownerKey(owner: CalculatorOwner): string;
```
- Beim Laden wird die Form geprüft: Version 1, `basis` ∈ {flour, dough}, Zahlenfelder vom Typ `number`, `type` aus einer lokalen Liste (`satisfies readonly IngredientType[]`, kein Laufzeit-Import aus `@/db`), mindestens ein Mehl, `kneadingMethod` gültig.
- Der Besitzer muss passen: Gast nur für Gast, `userId` nur für dieselbe ID. Sonst ergibt das Laden `null`, und der Rechner startet mit dem Referenzrezept.
- Ein Stand wird nur gemerkt, wenn Rezept **und** DDT gültig sind. Dann enthält er keine `NaN`-Werte, die JSON als `null` speichern würde.
- `SavePanel` im lokalen Modus (Gast oder offline):
  - Ausgeblendet (nicht gerendert) sind „Rezeptname“ und „Als Rezept speichern“. Gäste sehen stattdessen `SIGN_IN_HINT` + `<Link href="/login">Anmelden</Link>`.
  - Der Button „Lokal merken“ ist `disabled`, wenn `!recipeEvaluation.isValid || ddtEvaluation.result === null`.
  - Klick → `saveCalculatorDraft(owner, draft)`. Ergebnis `true` → `SAVED_LOCAL_MESSAGE`, `false` → `GENERIC_ERROR_MESSAGE` (aus `auth-form`).
- `clearOfflineData` ruft am Ende `clearAccountCalculatorDraft()` auf. Der Abmelden-Flow im Dashboard (F004/F005) bleibt sonst unverändert.

### Lade- und Fehlerzustände
- Session/Cache lädt → „Lade Sitzung …“ statt des Rechners (kurz, ohne Layout-Sprung im Header).
- Ungültige Eingaben → Feld- bzw. Listenmeldungen, Kennzahlen „–“, Speicher-Buttons deaktiviert.
- Speichern läuft → Button „Speichern …“, deaktiviert.
- Server-Fehler, Netzwerkfehler oder Timeout → `SAVE_FAILED_MESSAGE`.
- `localStorage` gesperrt → Lokal merken meldet `GENERIC_ERROR_MESSAGE`, das Laden liefert `null`.

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Tests vorab (Test-Writer): Unit-Tests `format.test.ts`, `recipe-state.test.ts`, `ddt-state.test.ts`, `local-draft.test.ts`, `save-recipe.test.ts` gegen die oben festgelegten Exporte. Testnamen beginnen mit `F010/AC-n` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10)
2. Tests vorab: In `src/test/pglite-db.ts` `batchDb` ergänzen (Proxy mit `batch` über BEGIN/COMMIT/ROLLBACK, bestehende Rückgabe `db`/`reset`/`close` unverändert). Dazu `src/app/calculator/actions.test.ts` (`// @vitest-environment node`, PGlite, `vi.doMock("@/db", () => ({ db: testDb.batchDb }))`, Mocks für `@/lib/auth` und `next/headers`, Muster aus `preferences-route.test.ts`) (AC-8, AC-9)
3. Tests vorab: Komponententests `calculator-hydration.test.tsx`, `calculator-ddt.test.tsx`, `calculator-save.test.tsx`, `calculator-screen.test.tsx` sowie der Link-Test in `dashboard.test.tsx`. Alle Komponententests mocken `@/app/calculator/actions` (sonst lädt `@/db` und scheitert an `DATABASE_URL`), `calculator-screen.test.tsx` zusätzlich `@/lib/auth-client` und `next/navigation` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10)
4. `format.ts`: `parseDecimal` mit Komma und Punkt, `formatDecimal` de-DE ohne Gruppierung, ohne „-0“ (AC-1, AC-2)
5. `messages.ts` mit allen neuen Texten aus dem Abschnitt oben (AC-4, AC-6, AC-7, AC-8, AC-9, AC-10)
6. `recipe-state.ts`: Typen, `createReferenceRecipe`, `setBasisValue` im Modus Gesamtmehl, `setStarterHydration`, `evaluateRecipe` Schritt 4 (Netto-Hydratation, TA über `calculateNetHydration`) (AC-1)
7. `recipe-state.ts`: `setRowGrams` (Mehl-Zeile über `calculateBakersPercentages`, sonst Einzelzeile) und `setRowPercent` (AC-2)
8. `recipe-state.ts`: `setBasisMode` und `setBasisValue` im Modus Ziel-Teiggewicht über `calculateRecipeFromTotalWeight` (AC-3)
9. `recipe-state.ts`: `addFlourRow`, `addAdditiveRow`, `removeRow`, `canRemoveRow`, `setRowName`, `setRowType`, `ingredientDisplayName` (AC-4)
10. `recipe-state.ts`: `evaluateRecipe` Schritte 1–3 (Basis-, Zeilen- und Mehlanteil-Meldungen aus der Engine), `isValid` (AC-5)
11. `ddt-state.ts`: `DEFAULT_DDT_STATE`, Slider-Bereiche, `KNEADING_METHOD_OPTIONS` aus `FRICTION_PRESETS`, `evaluateDdt` mit Zuordnung der Meldungen zu Feldern (AC-6, AC-7)
12. `number-field.tsx`: `NumberField` mit Entwurfstext während des Fokus, `FieldMessage` als immer gerenderter höflicher Bereich, `aria-describedby`/`aria-invalid` (AC-2, AC-5)
13. `ingredient-row.tsx` und `hydration-calculator.tsx`: Basis-Radios (Tab, Pfeiltasten, Leertaste nativ), Basisfeld je Modus, Zutatenliste, Kennzahlen-`dl` ohne `aria-live` (AC-1, AC-2, AC-3)
14. `hydration-calculator.tsx`: Buttons „Mehl hinzufügen“ (Fokus aufs neue Namensfeld per `flushSync` + Ref) und „Zutat hinzufügen“, Entfernen mit zugänglichem Namen, deaktiviert beim letzten Mehl (AC-4)
15. `hydration-calculator.tsx`: Mehlanteil-Meldung unter der Liste, Basis- und Zeilenmeldungen, „–“ bei ungültigem Zustand (AC-5)
16. `temperature-control.tsx` und `ddt-calculator.tsx`: vier Steuerungen mit gekoppeltem Slider/Feld, Auswahl „Knetmethode“, Feld „Knetreibung (°C)“ nur bei „Eigener Wert“, Wassertemperatur (AC-6)
17. `ddt-calculator.tsx`: Warnhinweis mit Textlabel „Kalt“/„Heiß“, Farbklassen, `data-warning`, immer gerenderter `role="status"`-Bereich (AC-7)
18. `save-recipe.ts`: Typen inkl. `SaveRecipeRequest`/`SaveAttempt`, `buildSaveRecipeInput`, `resolveSaveRecipeId`, `SAVE_TIMEOUT_MS`, `withTimeout` (AC-8, AC-9)
19. `src/app/calculator/actions.ts`: Server Action `saveRecipe` mit Session-Prüfung, Eingabeprüfung inkl. UUID-Format, ein `db.batch` aus Kopf-Insert mit `onConflictDoNothing`, gesperrtem Zutaten-Insert (`exists`/`not exists`) und Besitz-Select, Auswertung nach c) (AC-8, AC-9)
20. `local-draft.ts`: Speichern/Laden mit Besitzer-Marker und Formprüfung, `clearAccountCalculatorDraft`, `ownerKey`. In `src/lib/query/clear-offline-data.ts` `clearAccountCalculatorDraft()` aufrufen (AC-10)
21. `save-panel.tsx`: Kontomodus (Rezeptname, Namensprüfung, `savingRef`-Sperre, ID über `attemptRef` + `resolveSaveRecipeId`, „Speichern …“, Erfolg/Fehler) und lokaler Modus (Lokal merken, Gast-Hinweis mit Link), Buttons deaktiviert bei ungültigem Zustand (AC-5, AC-8, AC-9, AC-10)
22. `calculator.tsx`: `useState` mit `loadCalculatorDraft(owner) ?? createDefaultDraft()`, Auswertungen, Grid-Layout (untereinander unter `md`), Tab-Reihenfolge Hydratation → DDT → Speichern (AC-1, AC-6, AC-10)
23. `use-calculator-owner.ts`, `calculator-screen.tsx` und `src/app/calculator/page.tsx` ohne Session-Gate, mit `OfflineSync` und `AppHeader` (AC-10)
24. `dashboard.tsx`: `<Link href="/calculator">Zum Rechner</Link>` im Stil des Registrieren-Links (Einstieg für AC-1)
25. Abnahme (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10): `npx vitest run` mindestens zweimal grün (inkl. aller F004–F009-Tests), `npx tsc --noEmit`, `npx eslint`, `npx next build` (prüft `"use server"`-Datei und Client-/Server-Grenze: kein `@/db` im Client-Bundle). Manuell im Browser (`next dev`) prüfen:
    - 320 px Breite ohne horizontales Scrollen
    - Slider per Pfeiltasten
    - Hell- und Dunkelmodus
    - Offline über DevTools: Lokal merken, Neuladen, Wiederherstellung
    - gegen die Neon-Entwicklungs-DB: Speichern, Doppelklick und Wiederholung derselben ID ergeben genau ein Rezept mit fünf Zutaten

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Vitest + Testing Library + `user-event` (jsdom), Tags `F010/AC-n` im Testnamen. Konventionen für die Komponententests:
- Sie rendern `<Calculator owner={…} />` direkt. Ein `QueryProvider` ist nicht nötig, `useOnlineStatus` läuft ohne Provider. Offline wird mit `onlineManager.setOnline(false)` geschaltet, im `afterEach` wieder `true`.
- `vi.mock("@/app/calculator/actions", () => ({ saveRecipe: mocks.saveRecipe }))` ist Pflicht.
- Feldzugriff: `within(screen.getByRole("group", { name: "Wasser" })).getByRole("textbox", { name: "Gramm (g)" })`. Basisfeld über `getByRole("textbox", { name: "Gesamtmehl (g)" })`. Kennzahlen über `getByRole("definition", { name: "Netto-Hydratation" })` und `toHaveTextContent("72,7 %")`. Feldwerte über `toHaveValue("800")`.
- Eingabe: `user.clear` + `user.type`. Wert nach dem Verlassen des Felds: `user.tab()`. Slider über `fireEvent.change(slider, { target: { value: "26" } })`, weil jsdom keine Pfeiltasten-Logik für `type="range"` hat. Das Pfeiltasten-Verhalten ist nativ und wird manuell geprüft (Schritt 25).
- In `afterEach`: `localStorage.clear()`.

Unit-Tests prüfen Zahlen mit `toBeCloseTo(x, 6)` und Texte exakt.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/calculator/recipe-state.test.ts | `createReferenceRecipe()` liefert die fünf Zeilen in Reihenfolge, `setBasisValue(…, 1000)` ergibt Gramm 800/200/700/200/20, `evaluateRecipe` liefert `netHydration ≈ 72.727`, `doughYield ≈ 172.727`. `setStarterHydration(starter, 50)` ergibt ≈ 67.647 / 167.647. |
| AC-1 | Unit | src/lib/calculator/format.test.ts | `formatDecimal(72.7272, 1)` = „72,7“, `formatDecimal(1920, 0)` = „1920“ (ohne Punkt), `formatDecimal(-0.04, 1)` = „0,0“. `parseDecimal("2,5")` = `parseDecimal("2.5")` = 2.5, `""` → null, `"abc"` → NaN. |
| AC-1 | Komponente | src/components/calculator/calculator-hydration.test.tsx | „Basis: Gesamtmehl“ ist ausgewählt, „Gesamtmehl (g)“ wird geleert und mit „1000“ befüllt. Ohne Klick: Gramm „800“, „200“, „700“, „200“, „20“, Netto-Hydratation „72,7 %“, TA „172,7“. „Starter-Hydratation (%)“ auf 50 → „67,6 %“ und „167,6“. Kennzahlen-Elemente haben kein `aria-live` und liegen in keinem Live-Bereich. |
| AC-1 | Komponente | src/components/auth/dashboard.test.tsx | Link „Zum Rechner“ mit `href="/calculator"` (UI-Anforderung, Einstieg zu AC-1). |
| AC-2 | Unit | src/lib/calculator/recipe-state.test.ts | `setRowGrams(water, 750)` → Wasser-Prozent 75, `flourBasis` 1000, Hydratation ≈ 77.273. `setRowPercent(salt, 2.5)` → 25 g. `setRowGrams(weizen, 900)` → `flourBasis` 1100, Weizen ≈ 81.818 %, Wasser bleibt 700 g mit ≈ 63.636 % (Q4). |
| AC-2 | Komponente | src/components/calculator/calculator-hydration.test.tsx | Wasser-Gramm „750“ tippen: Wasser-Prozent „75,0“, „77,3 %“, „177,3“, „Gesamtmehl (g)“ bleibt „1000“. Salz-Prozent „2,5“ und separat „2.5“ tippen: Salz-Gramm „25“. Das bearbeitete Feld zeigt während des Tippens den Rohtext (nach „2,“ steht „2,“ im Feld), nach `user.tab()` den formatierten Wert. |
| AC-3 | Unit | src/lib/calculator/recipe-state.test.ts | `setBasisMode(ref, "dough")` → `doughWeight` 1920, Gramm/Prozente unverändert. `setBasisValue(…, 960)` → 400/100/350/100/10, Prozente gleich, `flourBasis` 500, Hydratation unverändert ≈ 72.727. In `dough` ergibt `setRowGrams(water, 750)` ein neues Prozent aus der Mehlbasis und `doughWeight` 1970 (Q5). |
| AC-3 | Komponente | src/components/calculator/calculator-hydration.test.tsx | Klick auf „Basis: Ziel-Teiggewicht“: Feld „Ziel-Teiggewicht (g)“ zeigt sofort „1920“, „Gesamtmehl (g)“ ist weg, Werte unverändert. „960“ tippen ergibt 400/100/350/100/10, Prozente und „72,7 %“/„172,7“ gleich. Tastatur: `user.tab()` bis Radio „Basis: Gesamtmehl“ fokussiert, `{ArrowDown}` wählt Ziel-Teiggewicht, `{ArrowUp}` zurück, Leertaste auf einem nicht ausgewählten Radio wählt es aus. |
| AC-4 | Unit | src/lib/calculator/recipe-state.test.ts | `addFlourRow` fügt nach Index 1 ein (`name ""`, 0/0), liefert die neue `rowId`. `addAdditiveRow` hängt `type "other"` ans Ende. `removeRow(roggen)` lässt die Reihenfolge Weizen, Wasser, Starter, Salz und `evaluateRecipe().flourSumError` = Mehlanteil-Meldung. `canRemoveRow` ist false für Wasser, Starter und das letzte Mehl, `removeRow` ist dort ein No-op. `ingredientDisplayName` fällt bei leerem Namen auf „Mehl“/„Sonstiges“ zurück. |
| AC-4 | Komponente | src/components/calculator/calculator-hydration.test.tsx | „Mehl hinzufügen“: Neue Gruppe „Mehl“ steht als drittes Listenelement, Feld „Name“ leer und fokussiert, „0“ g / „0,0“ %. „Zutat hinzufügen“: Neue letzte Zeile mit Auswahl „Typ“ (Optionen „Salz“, „Sonstiges“), 0/0. „Roggenmehl entfernen“: Zeile weg, Mehlanteil-Meldung sichtbar, Kennzahlen „–“, Reihenfolge der übrigen gleich. Danach ist „Weizenmehl entfernen“ deaktiviert. Für „Wasser“ und „Starter“ gibt es keinen Entfernen-Button. |
| AC-5 | Unit | src/lib/calculator/recipe-state.test.ts | Weizen 70 % → `flourSumError` „Die Mehlanteile müssen zusammen 100 % ergeben.“. Wasser −5 g → `rowErrors[water]` „Grammangaben dürfen nicht negativ sein.“. `flourBasis` 0 → „Die Mehlbasis muss größer als 0 g sein.“. `dough` mit 0 → „Das Teiggewicht muss größer als 0 g sein.“. In jedem Fall `isValid false` und `netHydration null`, nach Korrektur wieder gültig. Texte sind identisch mit den Engine-Konstanten (Import aus `hydration.ts`). |
| AC-5 | Komponente | src/components/calculator/calculator-hydration.test.tsx | Die vier Fehleingaben einzeln, ohne Button-Klick. Die Meldung erscheint am jeweiligen Ort: Mehlanteil unter der Liste, Wasser-Meldung als `toHaveAccessibleDescription` des Wasser-Grammfelds, Basis-Meldung am Basisfeld. „–“ bei beiden Kennzahlen, „Lokal merken“ (Gast) deaktiviert. Ein Fall mit `owner` user online: „Als Rezept speichern“ deaktiviert. Nach Korrektur verschwindet die Meldung und die Werte erscheinen wieder. Meldungen liegen in einem `aria-live="polite"`-Bereich, der schon vor der Meldung im DOM war. Ein leeres Grammfeld zählt als 0 (Q7). |
| AC-6 | Unit | src/lib/calculator/ddt-state.test.ts | `DEFAULT_DDT_STATE` ist 25/22/22/22/hand und `evaluateDdt` ergibt 33. Bei 26/22/20/24 ergibt hand 37, stand_mixer 33, spiral 29, custom 3 → 35. `KNEADING_METHOD_OPTIONS`-Labels sind „Handknetung (+1 °C)“, „Küchenmaschine (+5 °C)“, „Spiralkneter (+9 °C)“, „Eigener Wert“ , die Zahl im Label wird aus `FRICTION_PRESETS[m]` gebildet (Vergleich gegen ein aus dem Import erzeugtes Label). custom −1 → `errors.customFriction` „Die Knetreibung darf nicht negativ sein.“, `result null`. `NaN`-Raumtemperatur → Raum-Meldung aus `ddt.ts`. |
| AC-6 | Komponente | src/components/calculator/calculator-ddt.test.tsx | Beim Öffnen zeigen Slider und Feld „Ziel-Teigtemperatur (DDT)“ beide 25. Eingaben je einmal über Feld (DDT, Raum) und über Slider (Mehl, Starter). Danach zeigt „Wassertemperatur“ „37,0 °C“, „33,0 °C“, „29,0 °C“ bzw. „35,0 °C“ für die vier Knetmethoden. Tippen ins Feld ändert `slider.value`, Slider-`change` ändert den Feldwert. Ein Wert außerhalb des Bereichs (DDT 35) ist im Feld erlaubt, der Slider steht auf 32. „Knetreibung (°C)“ ist nur bei „Eigener Wert“ im DOM. −1 zeigt die Meldung und „–“. |
| AC-7 | Unit | src/lib/calculator/ddt-state.test.ts | 24/30/26/28/spiral → 3, `status cold_warning`, Meldung „Eiswasser erforderlich“. 27/17/15/18/hand → 57, `heat_warning`, „Kritische Temperatur für Starter-Mikroben!“. 26/32/30/29/spiral → 4 `ok` und 26/20/18/20/hand → 45 `ok`. |
| AC-7 | Komponente | src/components/calculator/calculator-ddt.test.tsx | Kalt-Fall: „3,0 °C“, Warnung „Eiswasser erforderlich“ in einem Element mit `data-warning="cold"` und Textlabel „Kalt“. Heiß-Fall: „57,0 °C“, `data-warning="heat"`, Label „Heiß“. Die Klassen beider Varianten unterscheiden sich. Bei 4,0 °C und 45,0 °C gibt es kein `[data-warning]`. Zurück in den Bereich → Warnung sofort weg. Der Warnungsbereich (`role="status"`) existiert schon vor der Warnung. |
| AC-8 | Unit | src/lib/calculator/save-recipe.test.ts | `buildSaveRecipeInput(ref, "  Landbrot ")` → `{ name: "Landbrot", targetDoughWeight: 1920, targetHydration: 72.7, ingredients: [Weizenmehl flour 800/80/100, Roggenmehl flour 200/20/100, Wasser water 700/70/100, Starter starter 200/20/100, Salz salt 20/2/100] }`. Eine Zeile ohne Namen bekommt „Mehl“. |
| AC-8 | Integration (node, PGlite) | src/app/calculator/actions.test.ts | Angemeldet: `saveRecipe({ ...input, recipeId: R })` → `{ ok: true, recipeId: R }`. In der DB stehen eine `recipes`-Zeile mit `id` R (userId aus der Session, name „Landbrot“, `targetDoughWeight` 1920, `targetHydration` 72.7) und fünf `recipe_ingredients` mit `position` 0–4 in der Eingabereihenfolge, Name, Typ, Gramm, Prozent, Starter-Hydratation. Doppelt-sicher: Ein zweiter Aufruf mit derselben ID R liefert `ok true` und lässt weiterhin genau 1 Kopf und 5 Zutaten. Zwei Aufrufe mit verschiedenen IDs ergeben 2 Rezepte. Ungültige Eingaben ergeben `INVALID_INPUT` ohne Schreibzugriff: leerer bzw. nur aus Leerzeichen bestehender Name, `recipeId` ohne UUID-Format. |
| AC-8 | Unit | src/lib/calculator/save-recipe.test.ts | `resolveSaveRecipeId(null, p, createId)` ruft `createId` einmal auf. Gleicher Payload mit dem Vorversuch → dasselbe Objekt, `createId` wird nicht aufgerufen. Geänderter Name oder geänderte Gramm → neue ID. |
| AC-8 | Komponente | src/components/calculator/calculator-save.test.tsx | Owner user, online: Rezeptname „Landbrot“, Klick. Während das gemockte Promise offen ist: Button „Speichern …“ und deaktiviert. Ein `user.dblClick` bzw. ein zweiter Klick löst trotzdem nur einen Aufruf aus. Nach Auflösen: „Rezept „Landbrot“ gespeichert.“, Eingaben unverändert. `saveRecipe` wurde genau einmal mit dem erwarteten Payload plus `recipeId` aufgerufen (`crypto.randomUUID` per `vi.spyOn` fest). Leerer Name bzw. „   “ → kein Aufruf, Meldung „Bitte gib einen Rezeptnamen ein.“ als Beschreibung des Felds. „Lokal merken“ ist nicht im DOM. |
| AC-9 | Integration (node, PGlite) | src/app/calculator/actions.test.ts | Ohne Session → `{ ok: false, error: "UNAUTHORIZED" }`, keine Zeilen. Ein Insert-Fehler bei den Zutaten (`bakersPercent` 100000 überschreitet `numeric(6,2)`) → `SAVE_FAILED`, und es gibt **keine** `recipes`-Zeile (Rollback des Batches, kein Ausgleichs-Löschen). Danach ist ein erneuter Versuch mit derselben ID und gültigen Werten erfolgreich. Eine ID, die schon einem Rezept von `u2` gehört, liefert als `u1` `SAVE_FAILED`: Name und Zutaten von `u2` bleiben unverändert, es entstehen keine zusätzlichen Zutaten. |
| AC-9 | Komponente | src/components/calculator/calculator-save.test.tsx | `saveRecipe` lehnt ab (`TypeError("Failed to fetch")`) bzw. liefert `{ ok: false, error: "SAVE_FAILED" }`: „Das Rezept konnte nicht gespeichert werden. Bitte versuche es erneut.“, Rezeptname und Eingaben unverändert, Button „Als Rezept speichern“ wieder aktiv. Ein erneuter Klick ohne Änderung sendet dieselbe `recipeId` wie der erste Versuch. Nach einer Änderung (z. B. Wasser-Gramm) wird eine neue ID gesendet. |
| AC-9 | Unit | src/lib/calculator/save-recipe.test.ts | `withTimeout(neverResolving, SAVE_TIMEOUT_MS)` lehnt nach `vi.advanceTimersByTime(15000)` ab und bleibt vorher offen (Fake-Timer). `SAVE_TIMEOUT_MS` ist 15000. |
| AC-10 | Unit | src/lib/calculator/local-draft.test.ts | `saveCalculatorDraft(guest, d)` schreibt unter `sourdough-os:calculator-draft` `{ version: 1, owner: { kind: "guest" }, recipe, ddt }`. `loadCalculatorDraft(guest)` liefert `d` zurück, `loadCalculatorDraft(user u1)` liefert null. Ein Stand von `u1` lädt nur für `u1`, nicht für `u2` und nicht für den Gast. Ein zweites Speichern überschreibt. Kaputtes JSON oder eine falsche Version → null. `clearOfflineData(undefined)` löscht einen `u1`-Stand und lässt einen Gast-Stand stehen. Ein werfender `localStorage` → `saveCalculatorDraft` liefert `false`. |
| AC-10 | Komponente | src/components/calculator/calculator-save.test.tsx | Gast: kein Feld „Rezeptname“, kein Button „Als Rezept speichern“ (`queryByRole` null). Hinweis „Melde dich an, um Rezepte in deinem Konto zu speichern.“ und Link „Anmelden“ mit `href="/login"`. Angemeldet + offline: „Lokal merken“, kein Rezeptname, kein Gast-Hinweis. Ablauf: Basis auf Ziel-Teiggewicht 960, Mehl „Dinkel“ hinzufügen und Prozente anpassen, Salz-Typ „Sonstiges“, Temperaturen, „Eigener Wert“ 3. Danach „Lokal merken“ → „Auf diesem Gerät gemerkt.“, `unmount`, neu rendern: alle Werte inkl. Reihenfolge, Typ, Knetmethode und Knetreibung wiederhergestellt. Mit fremdem Besitzer neu rendern → Referenzrezept. |
| AC-10 | Komponente | src/components/calculator/calculator-screen.test.tsx | `useSession` gemockt. Gast (online, keine Session) → Rechner ohne Umleitung (`replace` nicht aufgerufen) und mit Gast-Hinweis. Session `u1` online → „Als Rezept speichern“ sichtbar. Offline, Session-Fehler, `seedPersistedCache([{ queryKey: ["offline-user"], data: { id: "u1" } }])` und `u1`-Stand in `localStorage` → Stand wird wiederhergestellt, „Lokal merken“ sichtbar, kein Gast-Hinweis. Während `isPending` → „Lade Sitzung …“. Die Seite `src/app/calculator/page.tsx` zeigt den Offline-Hinweis der Kopfzeile, wenn offline. |

## Risiken & Rollback
- **Entschieden (Nutzer):** Leere Zutatennamen werden beim Speichern durch den Typnamen ersetzt („Mehl“, „Salz“, „Sonstiges“, bei Wasser und Starter ohnehin fest). Derselbe Name erscheint als Gruppenname und in „… entfernen“. Das erfüllt den Constraint `length(trim(name)) > 0` von `recipe_ingredients.name`, eine eigene Pflichtmeldung gibt es nicht.
- **Nicht spezifiziertes Verhalten (Meldung an den Hauptagenten):**
  - Prozentänderung im Modus Ziel-Teiggewicht: Der Plan rechnet mit der aktuellen Mehlbasis, und das Ziel-Teiggewicht zeigt die neue Summe (analog Q5).
  - Pro Zeile wird nur eine Meldung angezeigt (Gramm vor Prozent).
  - Im DDT-Rechner erscheint immer nur die erste Engine-Meldung.
  - „Lokal merken“ ist zusätzlich deaktiviert, wenn der DDT-Rechner eine Meldung zeigt, weil sonst `NaN` gespeichert würde.
  - Kalt- und Heiß-Hinweise tragen die Textlabels „Kalt:“/„Heiß:“ vor der Engine-Meldung.
  - Ein neuer Zusatzstoff startet mit Typ „Sonstiges“.
- **Batch-Nachbildung in Tests:** Atomar ist auf Neon `db.batch` (non-interactive HTTP-Transaktion). In den Tests bildet `batchDb` das mit BEGIN/COMMIT/ROLLBACK auf PGlite nach. Getestet werden so die SQL-Logik und die Rollback-Semantik, nicht der Neon-Transaktionsendpunkt selbst. Ein Unterschied im Treiberverhalten (z. B. Ergebnisform von `returning` im Batch) fiele erst gegen echtes Neon auf. Deshalb werden in Schritt 25 zusätzlich ein Speichern, ein Doppelklick und eine Wiederholung gegen die Entwicklungs-DB manuell geprüft. Die Auswertung stützt sich bewusst nur auf das Select c), nicht auf die Ergebnisform von a).
- **Spaltenreihenfolge im Zutaten-Insert:** `insert().select(sql…)` füllt alle Spalten in Tabellenreihenfolge. Eine spätere neue Spalte in `recipe_ingredients` bricht das Statement. Der Integrationstest fällt dann sofort auf.
- **Timeout ≠ Fehlschlag:** Nach 15 s zeigt die UI „konnte nicht gespeichert werden“, der Server kann trotzdem noch committen. Bei unverändertem Inhalt trifft der nächste Klick dieselbe ID: kein Duplikat, Meldung „gespeichert“. Ändert die Person vorher Inhalt oder Name, bekommt der neue Versuch eine neue ID, und ein spät committeter Vorversuch bleibt als eigenes Rezept bestehen. Ebenso nach einem Neuladen, weil `attemptRef` dann leer ist. Aufräumen ist erst mit der Rezeptliste aus einem Folgeticket möglich. Wegen des sequenziellen Dispatchs von Server Actions wartet eine Wiederholung im selben Tab, bis der hängende Erstaufruf fertig ist, und kann deshalb selbst in den Timeout laufen.
- **Client-erzeugte ID:** `crypto.randomUUID()` braucht einen sicheren Kontext (HTTPS oder localhost), das ist beim Deployment gegeben. Eine manipulierte oder fremde ID kann nichts überschreiben: `onConflictDoNothing` plus die Besitzbedingung im Zutaten-Insert sorgen dafür, das Ergebnis ist `SAVE_FAILED`.
- **Server Actions und Deployments:** Nach einem neuen Deployment kann ein offener Tab eine alte Action-ID senden („Failed to find Server Action“). Das landet im Fehlerpfad (AC-9-Meldung), ein Neuladen behebt es.
- **Besitzer offline:** Die Kontoerkennung offline hängt am F005-Cache (`offline-user`, `maxAge` 7 Tage). Ist er abgelaufen, gilt die Person offline als Gast und sieht einen Konto-Stand nicht. Sie sieht dann aber auch keine fremden Daten.
- **Geänderte F005-Funktion `clearOfflineData`:** Sie entfernt jetzt zusätzlich einen Konto-Stand des Rechners. Die bestehenden F005-Tests (u. a. „andere-app bleibt“) bleiben gültig, der Gast-Stand ist ausdrücklich ausgenommen.
- **jsdom-Grenzen:** Pfeiltasten am Slider, Layout ab 320 px und Dunkelmodus sind nicht automatisiert prüfbar und werden in Schritt 25 manuell abgenommen.
- **Client-/Server-Grenze:** Client-Module dürfen `@/db/schema/recipes` nur als Typ importieren, sonst landet drizzle im Client-Bundle. `"use server"`-Dateien dürfen nur async-Funktionen exportieren, Typen liegen deshalb in `save-recipe.ts`. `next build` in Schritt 25 deckt Verstöße auf.
- **Rollback:** Keine Migration, kein Schemawechsel, kein Feature-Flag nötig. Den F010-Commit reverten: Die Route `/calculator` verschwindet, Dashboard-Link und `clearOfflineData` sind wieder im alten Stand. Ein im Browser verbliebener Schlüssel `sourdough-os:calculator-draft` ist danach harmlos und ungenutzt. Bereits gespeicherte Rezepte bleiben gültige F006-Daten.

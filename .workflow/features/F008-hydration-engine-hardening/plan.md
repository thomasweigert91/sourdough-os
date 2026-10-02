# Plan F008: Hydratations-Engine: Review-Nachbesserungen aus F007

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Die Änderungen bleiben im reinen TS-Modul `src/lib/baking-engine/hydration.ts`. Es kommen keine neuen Abhängigkeiten dazu, und Schema und Rechenregeln bleiben unverändert. Die beiden Validierungshelfer `assertPositive` und `assertNonNegative` bekommen eine zweite Meldung für nicht endliche Werte. Sie prüfen zuerst `Number.isFinite` und erst danach das Vorzeichen bzw. `> 0`. Damit sind AC-2 bis AC-8 an einer Stelle gelöst. Für AC-1 und AC-9 bekommt der `switch` in `calculateNetHydration` einen `default`-Zweig mit `const unknownType: never = ingredient.type`. Kommt ein neuer Typ dazu, meldet tsc dort einen Fehler. Zur Laufzeit wirft derselbe Zweig „Unbekannter Zutatentyp: <typ>.“.

**AC-1 wird belastbar und ohne Schemaänderung nachgewiesen:** Ein eigener Vitest-Test (`hydration.typecheck.test.ts`) ruft die TypeScript-Compiler-API auf (`typescript` 5.9.3 ist bereits devDependency). Er kompiliert `hydration.ts` zweimal mit der Projekt-`tsconfig.json`. Im ersten Lauf liest er `src/db/schema/recipes.ts` unverändert von der Platte. Im zweiten Lauf liefert ein überschriebener `CompilerHost` eine **nur im Speicher** veränderte Fassung, in der `INGREDIENT_TYPES` zusätzlich `"milk"` enthält. Der Test prüft: Der erste Lauf hat 0 Fehler. Der zweite hat mindestens einen Fehler in `hydration.ts`, und zwar innerhalb des `switch (ingredient.type)` von `calculateNetHydration` (Position per AST ermittelt, nicht per Zeilennummer). Auf die Platte wird nichts geschrieben. Der Nachweis läuft bei jedem `npm test` mit, nicht nur einmal von Hand.

Verworfene Alternativen:
- AC-1 von Hand nachweisen (Schema temporär ändern, `npx tsc --noEmit`, zurücksetzen): nicht wiederholbar, und es besteht die Gefahr, dass die Änderung versehentlich committet wird.
- `vitest --typecheck` / `expectTypeOf`: prüft nur Typen in Testdateien, kann aber kein verändertes Schema in `hydration.ts` einspeisen.
- `tsc` als Kindprozess auf einer kopierten, veränderten Schema-Datei: das braucht Dateisystem-Schreibzugriffe, und die Pfad-Aliase (`@/db/schema/recipes`) müssten umgebogen werden. Ein CompilerHost-Override ist kleiner und schreibt nichts.
- `Record<IngredientType, …>`-Lookup statt `switch`: würde die Logik aus F007 umbauen. Der `never`-Zweig ist die kleinste Änderung und entspricht der Empfehlung aus dem F007-Review.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/lib/baking-engine/hydration.ts | ändern | Neue Meldungs-Konstanten und Meldungsfunktion, Endlichkeitsprüfung vor der Vorzeichenprüfung, `never`-Zweig im `switch` von `calculateNetHydration` |
| src/lib/baking-engine/hydration.test.ts | ändern | Neuer `describe`-Block „F008 …“ für AC-2 bis AC-9. Die NaN/Infinity-Fälle in den F007/AC-9-`it.each` (Zeilen 251 und 261) werden auf `[0, -1]` reduziert, weil F008 sie mit neuen Meldungen abdeckt |
| src/lib/baking-engine/hydration.typecheck.test.ts | neu | AC-1: Compiler-API-Test mit Schema-Override im Speicher |

`src/db/schema/recipes.ts` wird weder geändert noch beschrieben, sondern nur gelesen (im Test und per `import type`).

## Komponenten & Datenfluss
Keine Komponenten, kein State, keine API-Aufrufe, keine UI. Die Engine bleibt synchron und frei von Seiteneffekten. Neue Abhängigkeiten: keine (`typescript` ist bereits devDependency und wird nur im Test importiert).

### Öffentliche API: Ergänzungen in `src/lib/baking-engine/hydration.ts`
Alle bestehenden Exporte bleiben mit gleichem Namen und Wert erhalten (`INVALID_FLOUR_BASIS_MESSAGE`, `INVALID_TOTAL_WEIGHT_MESSAGE`, `NEGATIVE_*_MESSAGE`, `FLOUR_PERCENT_SUM_MESSAGE`, `NO_FLOUR_MESSAGE`, Funktionen, Typen). Neu:
```ts
export const NON_FINITE_FLOUR_BASIS_MESSAGE = "Die Mehlbasis muss eine gültige Zahl sein.";
export const NON_FINITE_TOTAL_WEIGHT_MESSAGE = "Das Teiggewicht muss eine gültige Zahl sein.";
export const NON_FINITE_BAKERS_PERCENT_MESSAGE = "Bäckerprozente müssen gültige Zahlen sein.";
export const NON_FINITE_GRAMS_MESSAGE = "Grammangaben müssen gültige Zahlen sein.";
export const NON_FINITE_STARTER_HYDRATION_MESSAGE = "Die Starter-Hydratation muss eine gültige Zahl sein.";

/** Meldung für einen Zutatentyp, den die Netto-Hydratation nicht kennt. */
export function unknownIngredientTypeMessage(type: string): string; // => `Unbekannter Zutatentyp: ${type}.`
```

### Interne Helfer (nicht exportiert)
```ts
function assertFinite(value: number, nonFiniteMessage: string): void;           // !Number.isFinite -> throw
function assertPositive(value: number, nonFiniteMessage: string, message: string): void;    // erst assertFinite, dann value <= 0 -> message
function assertNonNegative(value: number, nonFiniteMessage: string, message: string): void; // erst assertFinite, dann value < 0 -> message
```
Aufrufe:
- `calculateRecipeFromFlourBasis`: `assertPositive(flourBasis, NON_FINITE_FLOUR_BASIS_MESSAGE, INVALID_FLOUR_BASIS_MESSAGE)`
- `calculateRecipeFromTotalWeight`: `assertPositive(totalWeight, NON_FINITE_TOTAL_WEIGHT_MESSAGE, INVALID_TOTAL_WEIGHT_MESSAGE)`
- `assertValidPercentIngredients`: `assertNonNegative(bakersPercent, NON_FINITE_BAKERS_PERCENT_MESSAGE, NEGATIVE_BAKERS_PERCENT_MESSAGE)`
- `assertValidGramIngredients`: `assertNonNegative(amountGrams, NON_FINITE_GRAMS_MESSAGE, NEGATIVE_GRAMS_MESSAGE)`
- `assertValidStarterHydration`: `assertNonNegative(starterHydration, NON_FINITE_STARTER_HYDRATION_MESSAGE, NEGATIVE_STARTER_HYDRATION_MESSAGE)`

Die Reihenfolge der Prüfungen bleibt wie in F007: zuerst Mehlbasis bzw. Teiggewicht, dann jede Zutat (Prozent bzw. Gramm vor der Starter-Hydratation), dann die Mehlanteil-Summe. Ein nicht endliches Mehl-Prozent wird also schon von der Zutatenprüfung abgefangen und erreicht die Summenprüfung nicht. Das ist wichtig für AC-2: Ohne diese Reihenfolge käme „Mehlanteile …“.

### `switch` in `calculateNetHydration`
```ts
case "salt":
case "other":
  break;
default: {
  const unknownType: never = ingredient.type;
  throw new Error(unknownIngredientTypeMessage(String(unknownType)));
}
```
- Typprüfung (AC-1): Kommt `"milk"` zu `INGREDIENT_TYPES`, meldet tsc TS2322 `Type '"milk"' is not assignable to type 'never'.` an `unknownType`, also im `switch`.
- Laufzeit (AC-9): Eine Zutat mit `type: "milk"` (im Test per `as unknown as IngredientType`) erreicht `default` und wirft `Unbekannter Zutatentyp: milk.`. Die Grammprüfung läuft wie bisher vorher. `calculateBakersPercentages` bekommt keinen Typ-Check, eine `milk`-Zutat zählt dort wie jede Nicht-Mehl-Zutat.
- Die JSDoc von `calculateNetHydration` wird um „wirft bei unbekanntem Zutatentyp“ ergänzt.

### AC-1-Test: `src/lib/baking-engine/hydration.typecheck.test.ts`
- Erste Zeile `// @vitest-environment node`. Imports: `ts from "typescript"`, `fs`, `path`, `fileURLToPath` (Muster wie `src/lib/auth-client.test.ts`).
- `ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")`, `HYDRATION_FILE = path.join(ROOT, "src/lib/baking-engine/hydration.ts")`, `RECIPES_FILE = path.join(ROOT, "src/db/schema/recipes.ts")`.
- `addMilkType(source: string): string`: ersetzt das Array in der Zeile `export const INGREDIENT_TYPES = [...] as const;` per Regex durch dasselbe Array mit angehängtem `, "milk"`. Ein Guard im Test prüft `modified !== original` und `modified` enthält `"milk"`. Ändert sich das Schemaformat, schlägt der Test laut fehl statt fälschlich grün zu sein.
- `compileHydration(recipesOverride?: string): { program: ts.Program; errors: readonly ts.Diagnostic[] }`:
  - `ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile)` + `ts.parseJsonConfigFileContent(config, ts.sys, ROOT)`. Optionen: `{ ...parsed.options, noEmit: true, incremental: false }`. `incremental: false` vermeidet Options-Diagnosen ohne `tsBuildInfoFile`.
  - `host = ts.createCompilerHost(options)`. `host.readFile` und `host.getSourceFile` werden so umschlossen, dass bei `samePath(fileName, RECIPES_FILE)` und gesetztem Override der Override-Text geliefert wird (`ts.createSourceFile(fileName, override, languageVersion, true)`). `samePath` vergleicht `path.resolve(a).toLowerCase()` mit `path.resolve(b).toLowerCase()` (Windows, TS liefert Schrägstriche vorwärts).
  - `ts.createProgram({ rootNames: [HYDRATION_FILE], options, host })`, `errors = ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error)`.
- `findNetHydrationSwitch(sf: ts.SourceFile): ts.SwitchStatement`: per AST die `FunctionDeclaration` mit Namen `calculateNetHydration` suchen, darin das `SwitchStatement`, dessen Ausdruck `ingredient.type` ist.
- Bei Fehlschlag werden die Diagnosen mit `ts.formatDiagnostics` ausgegeben, damit man den Grund sieht. Timeout je Test `120_000` ms, weil die Drizzle-Typen mitgeladen werden.

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Tests vorab (Test-Writer): `src/lib/baking-engine/hydration.typecheck.test.ts` anlegen wie unter „AC-1-Test“ beschrieben (AC-1)
2. Tests vorab (Test-Writer): In `hydration.test.ts` die Imports um die fünf `NON_FINITE_*_MESSAGE`-Konstanten, `unknownIngredientTypeMessage` und `type IngredientType` erweitern. Dazu einen neuen `describe("F008 …")`-Block mit den Fällen aus der Teststrategie anlegen (AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9)
3. Tests vorab (Test-Writer): In den F007/AC-9-`it.each` (Mehlbasis `:251`, Teiggewicht `:261`) die Werte auf `[0, -1]` reduzieren. NaN/Infinity übernimmt F008/AC-5 bzw. AC-6, alle anderen F007-Tests bleiben unverändert (AC-5, AC-6, AC-7)
4. `hydration.ts`: die fünf `NON_FINITE_*_MESSAGE`-Konstanten und `unknownIngredientTypeMessage` exportieren (AC-2, AC-3, AC-4, AC-5, AC-6, AC-9)
5. `hydration.ts`: `assertFinite` einführen, `assertPositive`/`assertNonNegative` auf zwei Meldungen umstellen, Endlichkeit vor dem Vorzeichen prüfen (AC-7, AC-8)
6. `hydration.ts`: alle fünf Aufrufstellen auf die neuen Signaturen umstellen: Mehlbasis, Teiggewicht, Bäckerprozent, Gramm, Starter-Hydratation (AC-2, AC-3, AC-4, AC-5, AC-6, AC-8)
7. `hydration.ts`: `default`-Zweig mit `never`-Zuweisung und Laufzeitfehler im `switch` von `calculateNetHydration`, JSDoc ergänzen, `calculateBakersPercentages` unverändert lassen (AC-1, AC-9)
8. Prüfen: `npx vitest run src/lib/baking-engine` grün, `npx tsc --noEmit` ohne Fehler (Basisfall AC-1), `npx eslint src/lib/baking-engine` ohne Meldungen, `git diff src/db` leer (AC-1 bis AC-9)

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle Tests sind Vitest-Tests mit `// @vitest-environment node`. Die Testnamen haben das Präfix `F008/AC-n …`. Die Laufzeittests importieren aus `@/lib/baking-engine/hydration` und verwenden die bestehenden Fixtures `referenceRecipe()` und `gramRecipe()`. Weil `toThrow(string)` nur einen Teilstring prüft, nutzen die F008-Tests einen kleinen Helfer `expectThrowMessage(fn, message)`, der den Fehler fängt und `error.message` mit `toBe` vergleicht. Zusätzlich wird je neuer Konstante einmal der Literaltext aus dem Ticket geprüft (`expect(NON_FINITE_GRAMS_MESSAGE).toBe("Grammangaben müssen gültige Zahlen sein.")` usw.). Die Werte NaN, Infinity und −Infinity laufen per `it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])`.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit (TypeScript-Compiler-API) | src/lib/baking-engine/hydration.typecheck.test.ts | (a) Basisfall: `compileHydration()` mit unverändertem `recipes.ts` liefert 0 Fehler. (b) `addMilkType` verändert den Quelltext wirklich (Guard). (c) `compileHydration(addMilkType(original))` liefert mindestens einen Fehler mit `file` = `hydration.ts`, dessen `start` im Bereich `getStart()…getEnd()` des per AST gefundenen `switch (ingredient.type)` in `calculateNetHydration` liegt und dessen Meldungstext (`ts.flattenDiagnosticMessageText`) `milk` enthält. (d) Im Milk-Lauf gibt es keine Fehler in anderen Dateien als `hydration.ts`, der Fehler entsteht also nicht im Override selbst. Das Schema auf der Platte bleibt unberührt, der Test schreibt keine Dateien. |
| AC-2 | Unit | src/lib/baking-engine/hydration.test.ts | `referenceRecipe()` mit `bakersPercent` NaN bzw. Infinity bei der Salz-Zutat **und** (eigener Fall) bei einem Mehl. `calculateRecipeFromFlourBasis(…, 1000)` und `calculateRecipeFromTotalWeight(…, 1000)` werfen exakt „Bäckerprozente müssen gültige Zahlen sein.“, nicht die Negativ- oder Mehlanteil-Meldung. |
| AC-3 | Unit | src/lib/baking-engine/hydration.test.ts | `gramRecipe()` mit `amountGrams` NaN bzw. Infinity beim Wasser. `calculateNetHydration` und `calculateBakersPercentages` werfen exakt „Grammangaben müssen gültige Zahlen sein.“. |
| AC-4 | Unit | src/lib/baking-engine/hydration.test.ts | Starter mit `starterHydration` NaN bzw. Infinity: `calculateNetHydration(gramRecipe(x))` und `calculateBakersPercentages(gramRecipe(x))`. Für die Prozentfunktionen `referenceRecipe()` mit Starter-Hydratation x: `calculateRecipeFromFlourBasis(…, 1000)` und `calculateRecipeFromTotalWeight(…, 1000)`. Alle vier werfen exakt „Die Starter-Hydratation muss eine gültige Zahl sein.“. |
| AC-5 | Unit | src/lib/baking-engine/hydration.test.ts | `calculateRecipeFromFlourBasis(referenceRecipe(), x)` mit x = NaN, Infinity wirft exakt „Die Mehlbasis muss eine gültige Zahl sein.“. |
| AC-6 | Unit | src/lib/baking-engine/hydration.test.ts | `calculateRecipeFromTotalWeight(referenceRecipe(), x)` mit x = NaN wirft exakt „Das Teiggewicht muss eine gültige Zahl sein.“. Eigener Testfall für x = Infinity: gleiche Meldung, und es wird kein Rezept zurückgegeben (der Aufruf wirft, ein Ergebnis-Wert wird nie zugewiesen). |
| AC-7 | Unit | src/lib/baking-engine/hydration.test.ts | Exakte Meldungen für endliche ungültige Werte: Mehlbasis 0/−1 → „Die Mehlbasis muss größer als 0 g sein.“, Teiggewicht 0/−1 → „Das Teiggewicht muss größer als 0 g sein.“, Bäckerprozent −1 (beide Skalierfunktionen) → „Bäckerprozente dürfen nicht negativ sein.“, Grammangabe −1 (Netto-Hydratation, Bäckerprozente) → „Grammangaben dürfen nicht negativ sein.“, Starter-Hydratation −1 (alle vier Funktionen) → „Die Starter-Hydratation darf nicht negativ sein.“. Die übrigen F007-Tests laufen unverändert grün (bis auf die in Schritt 3 reduzierten `it.each`-Listen). |
| AC-8 | Unit | src/lib/baking-engine/hydration.test.ts | −Infinity als Mehlbasis, Teiggewicht, Bäckerprozent, Grammangabe und Starter-Hydratation ergibt jeweils die „gültige Zahl(en)“-Meldung aus AC-2 bis AC-6, nicht „negativ“ oder „größer als 0 g“. Das ist über die `it.each`-Listen der AC-2- bis AC-6-Tests abgedeckt, die `Number.NEGATIVE_INFINITY` enthalten, plus ein eigener benannter Testfall `F008/AC-8 …` je Eingabeart. |
| AC-9 | Unit | src/lib/baking-engine/hydration.test.ts | `gramRecipe()` plus `{ name: "Milch", type: "milk" as unknown as IngredientType, amountGrams: 100 }`. `calculateNetHydration` wirft exakt „Unbekannter Zutatentyp: milk.“. `unknownIngredientTypeMessage("milk")` liefert genau diesen Text. `calculateBakersPercentages` mit derselben Eingabe wirft nicht und liefert für die Milch-Zutat 10 % (100 g / 1000 g Mehlbasis). |

## Risiken & Rollback
- **Zwei F007-Tests ändern sich (Widerspruch zum Ticket-Wortlaut):** AC-7 sagt „Alle übrigen F007-Tests laufen unverändert grün“. Die F007/AC-9-`it.each` für Mehlbasis (`hydration.test.ts:251`, enthält NaN und Infinity) und Teiggewicht (`:261`, enthält NaN) erwarten aber die alten „größer als 0 g“-Meldungen. Das widerspricht AC-5 und AC-6 direkt, denn `toThrow` prüft einen Teilstring, und die neue Meldung enthält die alte nicht. Der Plan reduziert diese Listen auf `[0, -1]` und verschiebt NaN/Infinity in die F008-Tests. Alle anderen F007-Tests bleiben wörtlich gleich. Wird dem Hauptagenten gemeldet.
- **Laufzeit und Robustheit des Compiler-API-Tests (AC-1):** Das Programm lädt die Drizzle-Typen über `recipes.ts`. Das kann einige Sekunden pro Kompilierung dauern, deshalb ist das Timeout auf 120 s gesetzt. Der Test hängt am Format der Zeile `export const INGREDIENT_TYPES = [...] as const;`. Der Guard sorgt dafür, dass er bei einem Formatwechsel rot wird statt fälschlich grün. Fällt der Test wegen Pfadvergleichen unter Windows aus, ist `samePath` die Stelle zum Nachbessern.
- **Schema bleibt unangetastet:** Der Test überschreibt `recipes.ts` nur im Speicher des CompilerHosts. Schritt 8 prüft mit `git diff src/db`, dass nichts geändert wurde.
- **Öffentliche API:** Es kommen nur Exporte dazu, die Namen und Werte bestehender Konstanten bleiben gleich. Es gibt noch keine Aufrufer außerhalb der Engine (noch keine UI), ein Breaking Change ist also ausgeschlossen.
- **F007 ist noch nicht committet:** F008 ändert dieselben, noch nicht committeten Dateien. Ein getrennter Rollback von F008 ist per Git erst möglich, wenn F007 vorher committet wird. Empfehlung an den Hauptagenten: F007 vor der Implementierung von F008 committen. Rollback danach: den F008-Commit reverten bzw. `git checkout -- src/lib/baking-engine/hydration.ts src/lib/baking-engine/hydration.test.ts` und `hydration.typecheck.test.ts` löschen.

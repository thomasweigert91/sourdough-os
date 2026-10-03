# Review F011: Mehltypen-Katalog und automatische Hydratations-Kompensation

<!-- Rolle: code-reviewer. Alle Platzhalter ersetzt. -->

**Status:** APPROVED
**Diff-Hash:** fbba81b6d42e

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | Code: `src/components/calculator/ingredient-row.tsx:122-149` (natives `select` mit `optgroup` aus `FLOUR_TYPE_GROUPS`, „Sonstiges Mehl“ ohne Gruppe), `ingredient-row.tsx:190-199` (Entfernen-Label über `ingredientDisplayName`), Katalog `src/lib/baking-engine/flour-types.ts:46-90`. Tests: `calculator-flour-types.test.tsx:113` „F011/AC-1 jede Mehlzeile hat eine Auswahl …“, `:133` Gruppen und Reihenfolge, `:155` Tab und „Roggen 1150 entfernen“, `:173` offline als Gast; `flour-types.test.ts:79-127` (15 Einträge per `toEqual`, feste Faktoren). Pfeiltasten und Screenreader-Ansage über native Elemente, in jsdom nicht prüfbar (siehe Befund 4). |
| AC-2 | ✅ | Code: `recipe-state.ts:179` (`newRow` mit `wheat_550`), `hydration-calculator.tsx:79` (Fokus auf `flourTypeRefs`). Tests: `calculator-flour-types.test.tsx:188` „F011/AC-2 „Mehl hinzufügen“ legt Weizen 550 …“ (Fokus, 0 g / 0,0, Wasser 70,0 / 700); `recipe-state-flour-type.test.ts:70`. |
| AC-3 | ✅ | Code: `hydration-calculator.tsx:129-139` (`input type="checkbox" role="switch"` im `label`, zwischen Basisfeld und Liste), `recipe-state.ts:353` (`setAdjustWaterOnFlourSwap` ändert nur das Flag). Tests: `calculator-flour-types.test.tsx:210` (eingeschaltet, oberhalb der Liste), `:223` (Tab nach Basisfeld, Leertaste und Klick, Werte unverändert); `recipe-state-flour-type.test.ts:90`, `:94`. |
| AC-4 | ✅ | Code: `recipe-state.ts:326-346` (`setRowFlourType`, Verhältnis aus `flour-types.ts:147-159`, Gramm aus `flourBasis`). Tests: `calculator-flour-types.test.tsx:253` „F011/AC-4 Weizen 550 → Dinkel 630 …“ (65,7 / 657, 68,8 %, TA 168,8, übrige Werte und 1000 unverändert); `recipe-state-flour-type.test.ts:112`; `flour-types.test.ts:149`, `:155`. |
| AC-5 | ✅ | Code: Zustand bleibt ungerundet, `recipe-state.ts:336-340`. Tests: `calculator-flour-types.test.tsx:270` (Rückwechsel 70,0 / 700, 72,7 %, TA 172,7), `:284` (Kette über Manitoba, Tipo 00, Roggen 815 und zweite Zeile zurück); `recipe-state-flour-type.test.ts:162`, `:173`; `flour-types.test.ts:169`. |
| AC-6 | ✅ | Code: `recipe-state.ts:332` (`!state.adjustWaterOnFlourSwap` → nur Typwechsel), `:353` (keine nachträgliche Anpassung). Tests: `calculator-flour-types.test.tsx:305` (Schalter aus → 70,0 / 700; Einschalten ändert nichts; nächster Wechsel → 74,6 / 746); `recipe-state-flour-type.test.ts:199`. |
| AC-7 | ✅ | Code: `recipe-state.ts:349` (`setBasisValue(…, state.doughWeight)`). Tests: `calculator-flour-types.test.tsx:329` (1920 bleibt, Wasser 65,7 / 672, 68,8 %, Prozente 80/20/20/2, Gramm 819/205/205/20); `recipe-state-flour-type.test.ts:223`. |
| AC-8 | ✅ | Code: `recipe-state.ts:332` (`!evaluateRecipe(state).isValid` → keine Anpassung, Typ wird übernommen), Rückfallregeln `flour-types.ts:152-157`. Tests: `calculator-flour-types.test.tsx:348` (Gesamtmehl 0, Meldungen unverändert), `:367` (alle Mehle 0 g); `recipe-state-flour-type.test.ts:254`, `:270`; `flour-types.test.ts:183`. |
| AC-9 | ✅ | Code: Felder in `RecipeState`, Parsen `local-draft.ts:99-106`; Payload-Name über `recipe-state.ts:390` (`ingredientDisplayName`). Tests: `calculator-flour-types.test.tsx:388` (Lokal merken → Dinkel 630, Schalter aus nach Remount), `:407` (Payload `name: "Dinkel 630"`); `local-draft-flour-type.test.ts:73`, `:95`, `:103`; `recipe-state-flour-type.test.ts:289` (kein Schalter im Payload). |
| AC-10 | ✅ | Code: `ingredient-row.tsx:108` (Feld „Name“ nur bei `other_flour`), `recipe-state.ts:330` (Name-Regel), `:390-396` (Rückfall „Sonstiges Mehl“). Tests: `calculator-flour-types.test.tsx:434` (Feld erscheint, Wasser 70,0 / 700, „Sonstiges Mehl entfernen“ → „Emmer entfernen“), `:459` (Rückwechsel entfernt Feld), `:474` („Emmer“ im Payload), `:488` (leer → „Sonstiges Mehl“); `recipe-state-flour-type.test.ts:312-337`. |
| AC-11 | ✅ | Code: `local-draft.ts:80` (`migrateLegacyFlourName` mit Aliassen, Katalogabgleich, Rückfall), `:99` (nur bei fehlendem `flourType`), `:106` (Schalter-Standard `true`). Tests: `calculator-flour-types.test.tsx:503` (vier Altnamen → Weizen 550 / Roggen 1150 / Dinkel 630 / Sonstiges Mehl „Ruchmehl“, Mengen, Wasser, Schalter ein); `local-draft-flour-type.test.ts:145` (Testmatrix per `it.each`), `:163`, `:197`; `flour-types.test.ts:232`, `:239`. |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | src/lib/calculator/recipe-state.ts:332 | Die Anpassung entfällt bei jeder Meldung im Rezept, nicht nur ohne Mehlmenge (AC-8). Beispiel: Mehlanteile kurz ≠ 100 % während der Eingabe oder ungültige Starter-Hydratation. Dann wechselt der Mehltyp still ohne Wasseranpassung, und die Person erfährt das nicht. Der Plan nennt das unter „Risiken“ und es wurde freigegeben, für Nutzer ist es trotzdem eine überraschende Lücke. | Für ein Folgeticket vormerken: Die Bedingung auf das Nötige eingrenzen (positive Absorption vorher und nachher, gültige Basis) oder einen Hinweis zeigen, wenn die Anpassung wegen einer Meldung ausfällt. In F011 keine Änderung nötig. | offen |
| 2 | NIT | src/lib/calculator/recipe-state.ts:330 | Beim Wechsel von „Sonstiges Mehl“ mit freiem Namen (z. B. „Emmer“) auf einen Katalogtyp und zurück ist der freie Name verloren. Das ist laut Plan-Name-Regel so gewollt, kann bei einer versehentlichen Auswahl aber stören. | Optional: den letzten freien Namen der Zeile merken und beim Rückwechsel auf `other_flour` wiederherstellen. | offen |
| 3 | NIT | src/components/calculator/ingredient-row.tsx:63-66 | Zwischen `FlourTypeOption` und dem Doc-Kommentar zu `INGREDIENT_NAME_MAX_LENGTH` fehlt eine Leerzeile. Außerdem ist die einzeilige Komponente `FlourTypeOption` kaum nötig. | Leerzeile einfügen; `FlourTypeOption` optional inline als `<option>` schreiben. | offen |
| 4 | NIT | .workflow/features/F011-mehltypen-katalog/plan.md (Arbeitsschritt 14) | Für die manuelle Abnahme (Pfeiltasten im `select`, Screenreader-Ansage von Gruppen und Ein/Aus, 320 px, Hell/Dunkel) gibt es im Diff keinen Nachweis. Der Code nutzt native Elemente, ein Risiko ist deshalb kaum erkennbar. | Abnahme vor dem Abschluss kurz durchführen und festhalten. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

Eigene Läufe: `npx vitest run` → 51 Dateien, 635 Tests grün; `npx tsc --noEmit` und `eslint` auf den geänderten Dateien ohne Meldungen.

## Workflow-Ausnahmen
<!-- Vom Workflow eingefügt. Jede Ausnahme bewerten: War sie gerechtfertigt, verdeckt sie ein Problem? -->
- `2026-10-03T22:39:45.122Z` **allow-green** (tests): Testhelfer in src/test/calculator.ts korrigiert: ingredientGroup und expectIngredientOrder nutzen neuen Helfer rowGroup, der role=group-Treffer innerhalb eines select (optgroup Dinkel der Mehltyp-Auswahl) verwirft. Behebt Mehrfachtreffer in F010/AC-4 (calculator-hydration) und F010/AC-10 (calculator-save). Strenge bleibt: 0 oder mehr als 1 Zeilengruppe wirft weiterhin.
  Bewertung: gerechtfertigt. Ein `<optgroup label="Dinkel">` hat implizit `role="group"` mit dem Namen „Dinkel“ und kollidiert so mit der Zeilengruppe „Dinkel“ aus den F010-Tests. Der Helfer `rowGroup` (`src/test/calculator.ts`) schließt nur Treffer innerhalb eines `select` aus und wirft bei 0 oder mehr als 1 Zeilengruppe weiterhin, genau wie `getByRole`. Er verdeckt also kein Fehlverhalten. Die angepassten F010-Tests habe ich geprüft: Es wurden nur Namen und der Bedienweg geändert, keine Assertions entfernt. `save-recipe.test.ts` deckt den Typnamen-Rückfall jetzt über eine zusätzliche „Sonstiges“-Zeile ab.

## Fazit
Die Umsetzung entspricht dem Plan. Der Katalog ist eine reine, typisierte Konstante. `setRowFlourType` passt das Wasser-Bäckerprozent ungerundet an und übernimmt die Basisregeln aus F010. Migration und Validierung alter Stände sind sauber in `local-draft.ts` gekapselt. Alle elf AC sind durch Komponententests und Unit-Tests belegt, die Testsuite ist grün. Offen sind nur ein MINOR (die Anpassung entfällt still bei jeder Rezeptmeldung, im Plan so freigegeben) und kleinere NITs, deshalb APPROVED.

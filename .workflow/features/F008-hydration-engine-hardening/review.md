# Review F008: Hydratations-Engine: Review-Nachbesserungen aus F007

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** d5d75a469f1f

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `hydration.ts:207-210` (`default` mit `const unknownType: never = ingredient.type`). `hydration.typecheck.test.ts:137` „F008/AC-1 meldet mit den fünf bestehenden Zutatentypen keinen Typfehler“ (Basisfall, 0 Fehler), `:158` „… einen Typfehler im switch (ingredient.type) von calculateNetHydration“ (Fehler per AST-Position im switch, Text enthält `milk`), `:180` (keine Fehler außerhalb `hydration.ts`), `:146` Guard gegen Formatwechsel und Plattenschreibzugriff. Ohne den `never`-Zweig würde `:158` rot werden, der Test ist also nicht trivial erfüllt. Zusätzlich lokal: `npx tsc --noEmit` Exit 0, `git status src/db` leer |
| AC-2 | ✅ | `hydration.ts:111-115` (`assertNonNegative` mit `NON_FINITE_BAKERS_PERCENT_MESSAGE`, `:66`), Prüfung vor `assertFlourPercentSum` (`:136-139`). Tests `hydration.test.ts:413` (Salz, NaN/±Infinity, beide Skalierfunktionen) und `:423` (Mehl, statt Mehlanteil-Meldung), exakter Vergleich über `expectThrowMessage` (`:356`) |
| AC-3 | ✅ | `hydration.ts:122` mit `NON_FINITE_GRAMS_MESSAGE` (`:67`). Test `hydration.test.ts:438` „F008/AC-3 wirft bei Grammangabe %s beim Wasser in Netto-Hydratation und Bäckerprozenten …“ |
| AC-4 | ✅ | `hydration.ts:99-107` mit `NON_FINITE_STARTER_HYDRATION_MESSAGE` (`:68`), aufgerufen in beiden Zutatenprüfungen (`:116`, `:123`). Test `hydration.test.ts:453` „F008/AC-4 … in allen vier Berechnungen“ |
| AC-5 | ✅ | `hydration.ts:146` (`assertPositive` mit `NON_FINITE_FLOUR_BASIS_MESSAGE`). Test `hydration.test.ts:480` „F008/AC-5 wirft bei Mehlbasis %s die Gültige-Zahl-Meldung …“ |
| AC-6 | ✅ | `hydration.ts:165`. Tests `hydration.test.ts:495` (NaN, −Infinity) und eigener Fall `:505` „F008/AC-6 wirft bei Ziel-Teiggewicht Infinity … und gibt kein Rezept zurück“ (prüft `result` bleibt `undefined`) |
| AC-7 | ✅ | `hydration.ts:84-97` (Vorzeichen-/`> 0`-Prüfung nach der Endlichkeit, alte Konstanten `:57-61` unverändert). Tests `hydration.test.ts:516`, `:526`, `:536`, `:543`, `:550` mit exaktem Meldungsvergleich. F007-Tests grün. Nur die `it.each` in `:259` und `:270` wurden auf `[0, -1]` reduziert, wie im Plan angekündigt und begründet (sonst Widerspruch zu AC-5/AC-6) |
| AC-8 | ✅ | `hydration.ts:77-81` + `:85`/`:93`: `assertFinite` läuft vor dem Vorzeichen. `NEGATIVE_INFINITY` in allen `it.each` von AC-2 bis AC-6, dazu eigene Fälle `hydration.test.ts:567`, `:574`, `:581`, `:588`, `:595` |
| AC-9 | ✅ | `hydration.ts:72-74` und `:207-210`, kein Typ-Check in `calculateBakersPercentages` (`:221-239`). Tests `hydration.test.ts:622` (exakter Meldungstext), `:627` „F008/AC-9 wirft in der Netto-Hydratation „Unbekannter Zutatentyp: milk.“ …“, `:631` (Bäckerprozente unberührt, Milch = 10 %) |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | NIT | src/lib/baking-engine/hydration.ts:209 | Die Meldung übernimmt den rohen Typwert aus ungeprüften Daten (`String(unknownType)`). Kommt z. B. ein sehr langer String oder ein Objekt (`[object Object]`) an, landet das ungekürzt in einer Meldung, die später in der UI erscheinen soll. In React wird das automatisch escaped, ein XSS-Risiko besteht also nicht. | Für jetzt in Ordnung. Wenn die Meldung später angezeigt wird, nur als Text rendern (kein `dangerouslySetInnerHTML`) und Eingaben vorher per Schema validieren. | offen |
| 2 | NIT | src/lib/baking-engine/hydration.test.ts:567-612 | Die benannten AC-8-Fälle wiederholen genau die −Infinity-Fälle, die die `it.each` von AC-2 bis AC-6 schon abdecken. Das ist vom Plan so gewollt, aber redundant. | Kann so bleiben. Optional die `it.each`-Listen ohne −Infinity führen und AC-8 nur über die benannten Fälle abdecken. | offen |
| 3 | NIT | src/lib/baking-engine/hydration.test.ts:623 | `expect(typeof unknownIngredientTypeMessage).toBe("function")` prüft nichts, was der Aufruf in der nächsten Zeile nicht ohnehin prüft. | Zeile streichen. | offen |
| 4 | NIT | src/lib/baking-engine/hydration.test.ts:374-384 | Die Literaltexte stehen doppelt: einmal als `MSG_*` in der Testdatei und einmal in den Export-Konstanten. Das ist gewollt, weil der Text gegen das Ticket geprüft werden soll, aber eine Textänderung muss dann an zwei Stellen nachgezogen werden. | Kann so bleiben, ein kurzer Kommentar zur Absicht würde helfen. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders (nicht zutreffend, reines TS-Modul)
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast (nicht zutreffend, keine UI)
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

## Fazit
Die Umsetzung entspricht dem Plan genau: Die Endlichkeitsprüfung liegt zentral in `assertFinite` und läuft vor der Vorzeichenprüfung. Der `never`-Zweig sichert neue Zutatentypen sowohl bei der Typprüfung als auch zur Laufzeit ab. Der AC-1-Nachweis über die Compiler-API ist wiederholbar, schreibt nichts auf die Platte und würde ohne den `never`-Zweig tatsächlich fehlschlagen. Alle 67 Tests, `tsc --noEmit` und ESLint sind grün. Es gibt nur NITs, keinen Grund für Nacharbeit.

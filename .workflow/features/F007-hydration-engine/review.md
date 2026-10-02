# Review F007: Bäckerprozent- und Netto-Hydratations-Engine

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** 90804407abfb

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `hydration.ts:111-127` (`amountGrams = flourBasis × % / 100`, Spread erhält Name/Typ/Starter-Hydratation, `map` erhält Reihenfolge). Tests `hydration.test.ts:55` „F007/AC-1 berechnet die Grammangaben aus 1000 g Mehlbasis …“ (800/200/700/200/20, 1920 g, Name/Typ, keine Mutation) und `:77` „F007/AC-1 übernimmt die Starter-Hydratation …“ |
| AC-2 | ✅ | `hydration.ts:130-142` (`flourBasis = totalWeight / Σ% × 100`, Delegation an AC-1-Funktion). Test `hydration.test.ts:93` „F007/AC-2 berechnet aus 960 g Ziel-Teiggewicht …“ (Basis 500, 400/100/350/100/10, Summe 960) |
| AC-3 | ✅ | `hydration.ts:130-142`, keine Rundung im Modul. Test `hydration.test.ts:109` „F007/AC-3 skaliert auf 1000 g Teiggewicht ungerundet“ (Werte auf 2 Stellen, Summe auf 9 Stellen = 1000, `not.toBe(416.67)` belegt fehlende Vorrundung) |
| AC-4 | ✅ | `hydration.ts:150-181`, Starter-Zerlegung `:162-167`, Rückgabe nur `number \| null`. Tests `hydration.test.ts:122` (72,73 %, Typ `number`, ≠ 70) und `:132` (Standard-Hydratation 100 bei fehlender Angabe) |
| AC-5 | ✅ | `hydration.ts:164` (`m / (1 + h/100)`). Test `hydration.test.ts:139` „F007/AC-5 … Lievito Madre (50 %) als 67,65 %“ inkl. exakter Formel auf 9 Stellen |
| AC-6 | ✅ | `hydration.ts:171-173` (`salt`/`other` ignoriert). Tests `hydration.test.ts:147` (65 %) und `:157` „zählt Salz und Sonstiges weder als Mehl noch als Wasser“ |
| AC-7 | ✅ | `hydration.ts:184-202` (Basis nur `type === "flour"`). Test `hydration.test.ts:168` „F007/AC-7 berechnet Bäckerprozente …“ (80/20/70/20/2, Gegenprobe ≠ 200/1100, Felder erhalten, keine Mutation) |
| AC-8 | ✅ | `hydration.ts:96-104` (Toleranz 0,01 + Epsilon 1e-9), in beiden Skalierfunktionen über `assertValidPercentRecipe`. Tests `hydration.test.ts:191` (33,3/33,3/33,4 → 333/333/334 g), `:206` (80 + 20,005 ohne Fehler), `:222` (80 + 30 wirft exakte Meldung in beiden Funktionen), `:238` (20,02 und ohne Mehl) |
| AC-9 | ✅ | `hydration.ts:64-94` (`Number.isFinite` + Grenzprüfung), Aufrufe `:115-116`, `:134-135`, `:151`, `:187`, `NO_FLOUR_MESSAGE` `:192-194`. Tests `hydration.test.ts:251`, `:261` (Basis/Teiggewicht 0, −1, NaN, ∞), `:271` (negatives %), `:284` (negative Gramm), `:293` (negative Starter-Hydratation), `:306` (Bäckerprozente ohne Mehl) |
| AC-10 | ✅ | `hydration.ts:177-179` (`totalFlour === 0` → `null`). Tests `hydration.test.ts:316` (Wasser + Salz → `null`) und `:325` (leeres Rezept → `null`) |
| AC-11 | ✅ | `hydration.ts:156-169` (Zerlegung pro Starter in der Schleife). Test `hydration.test.ts:329` „F007/AC-11 zerlegt mehrere Starter einzeln …“ (70,83 % = 850/1200) |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | src/lib/baking-engine/hydration.ts:157 | Der `switch` über `ingredient.type` hat keine Exhaustiveness-Prüfung. Kommt später ein neuer `IngredientType` dazu (z. B. „Milch“), wird er still ignoriert und der Compiler meldet nichts. Der Plan behauptet unter „Typkopplung an das DB-Schema“ das Gegenteil. | `default: { const unreachable: never = ingredient.type; throw new Error(...) }` ergänzen, damit tsc neue Enum-Werte erzwingt. | offen |
| 2 | NIT | src/lib/baking-engine/hydration.ts:78-82 | Bei `starterHydration` = `NaN` oder `Infinity` lautet die Meldung „Die Starter-Hydratation darf nicht negativ sein.“, ebenso bei Gramm und Prozent. Das ist laut Plan so gewollt, für Nutzer aber irreführend. | Später ggf. neutraler formulieren („muss eine Zahl ≥ 0 sein“). Kein Handlungsbedarf für dieses Ticket. | offen |
| 3 | NIT | src/lib/baking-engine/hydration.ts:138-141 | Bei extrem großen Prozentwerten (Σ% läuft auf `Infinity`) wird `flourBasis` 0, und der Fehler lautet „Die Mehlbasis muss größer als 0 g sein.“, obwohl der Nutzer ein Teiggewicht angegeben hat. Das ist rein theoretisch. Außerdem validiert der Delegationsaufruf die Prozente ein zweites Mal. | Optional `totalPercent` auf Endlichkeit prüfen. Die doppelte Validierung ist harmlos. | offen |
| 4 | NIT | src/lib/baking-engine/hydration.test.ts:261 | Der `it.each` für das Ziel-Teiggewicht prüft `Infinity` nicht, anders als der für die Mehlbasis (`:251`). Der Code fängt den Fall ab, nur der Test fehlt. | `Number.POSITIVE_INFINITY` in die Liste aufnehmen. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

Anmerkungen: Reines TS-Modul ohne React und UI, daher sind React und Barrierefreiheit nicht anwendbar. Sicherheit: Alle numerischen Eingaben werden mit `Number.isFinite` und Grenzen geprüft. `IngredientType` wird nur per `import type` eingebunden, im Client-Bundle landet also kein Drizzle-Code. Eigene Läufe: `npx vitest run src/lib/baking-engine` mit 28/28 grün, `npx tsc --noEmit` und `npx eslint src/lib/baking-engine` ohne Meldungen. Die Eingaben werden nicht mutiert (Spread-Kopien, per `structuredClone`-Snapshot getestet).

## Fazit
Die Engine setzt die fachlichen Rechenregeln und alle elf Akzeptanzkriterien korrekt und planmäßig um. Jede AC hat einen Test, der das Verhalten mit konkreten Zahlen und Gegenproben prüft. Fehlerpfade werfen statt 0, NaN oder Infinity zu liefern, und Mehlbasis und Gesamtmehl sind sauber getrennt. Offen sind nur eine MINOR-Empfehlung (Exhaustiveness-Prüfung im `switch`) und kleinere NITs, die die Freigabe nicht verhindern.

# Review F009: DDT-Wassertemperatur-Rechner (Vier-Faktoren-Modell)

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** 8e522c1061ea

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `src/lib/baking-engine/ddt.ts:18` (`FRICTION_PRESETS`), `ddt.ts:89-92` (Preset-Zweig liest `customFriction` nicht), Rückgabe `frictionFactor` `ddt.ts:131-138`. Tests `ddt.test.ts:69` „F009/AC-1 berechnet bei Preset %s …“ (37/1, 33/5, 29/9, ok, null), `:85` Presets, `:89` „ignoriert einen Custom-Reibungswert bei gewähltem Preset“, `:100` Custom −1/NaN bei `hand` wirft nicht |
| AC-2 | ✅ | `ddt.ts:93-103` (Custom-Zweig, Wert ungerundet übernommen, 0 gültig). Tests `ddt.test.ts:117` „F009/AC-2 berechnet bei Custom-Reibung %d °C …“ (3 → 35, 0 → 38), `:131` „verrechnet Custom-Reibung 2,5 °C ungerundet zu 35,5 °C“ (`toBeCloseTo(35.5, 9)`, `frictionFactor` 2,5) |
| AC-3 | ✅ | `ddt.ts:131-133` (`< 4 − ε` → `cold_warning` + `COLD_WARNING_MESSAGE`, keine Kappung). Tests `ddt.test.ts:151` „meldet bei 3 °C cold_warning …“, `:160` „gibt ein negatives Ergebnis (−2 °C) unverändert … zurück“ (`toBe(-2)`) |
| AC-4 | ✅ | `ddt.ts:134-136` (`> 45 + ε` → `heat_warning` + `HEAT_WARNING_MESSAGE`). Test `ddt.test.ts:174` „meldet bei 57 °C heat_warning …“ |
| AC-5 | ✅ | `ddt.ts:25-29` (Grenzen 4/45, `FLOAT_EPSILON = 1e-9`), Vergleiche strikt in `ddt.ts:131/134`. Tests `ddt.test.ts:206` (genau 4 → ok), `:214` (genau 45 → ok), `:222` (3,9 → cold), `:230` (45,1 → heat), `:238`/`:252` Gleitkomma-Grenzfälle 3.999999999999993 bzw. 45.00000000000001 → ok, `:267` Konstanten |
| AC-6 | ✅ | `ddt.ts:76-80` (`assertFinite`), `ddt.ts:120-123` (vier Temperaturen in fester Reihenfolge), `ddt.ts:95-101` (fehlend / nicht endlich / negativ), `ddt.ts:104-107` (`never`-Default wirft). Tests `ddt.test.ts:282` (NaN/±Infinity je Feld, exakter Meldungsvergleich), `:290` Custom nicht endlich, `:300` Custom fehlt, `:307` −1/−0,1, `:317` kein Ergebnis zugewiesen, `:327`/`:335` negative Mehl/Raum/Starter gültig, `:345` keine Obergrenze, `:352` unbekannte Knetart. Eigene Läufe: `npx vitest run src/lib/baking-engine` grün, `tsc --noEmit` und `eslint` ohne Meldungen |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | vitest.config.test.ts:1-10 | Neue Datei steht nicht im Plan. Der Plan sagt ausdrücklich: „Für `vitest.config.mts` gibt es keinen eigenen Test“. Der Test prüft nur einen Konfigurationswert, kein Verhalten. Außerdem trägt er das Label „F009/AC-1“, obwohl AC-1 fachlich nichts mit dem Timeout zu tun hat. Das verfälscht die AC-Rückverfolgung. | Datei entfernen. Den Nachweis liefern laut Plan die wiederholten vollen Suite-Läufe. Wer den Test behalten will, nimmt ihn in den Plan auf und entfernt das AC-Label. | offen |
| 2 | MINOR | vitest.config.mts:20-21 | `maxWorkers: 4` war laut Plan-Schritt 8c/8d nur erlaubt, wenn die Suite mit `testTimeout: 15000` allein weiter scheitert. Diff und Plan enthalten keinen Beleg dafür. Eigene Gegenprobe: 3 Läufe mit `--maxWorkers=32` waren grün (412/412). Der Kommentar nennt zusätzlich „offline-sync“ als Grund, das steht nicht in der Plan-Begründung. Die Einstellung bremst die Suite auf schnellen Rechnern dauerhaft. | `maxWorkers: 4` entfernen, sofern kein reproduzierbarer Fehlschlag ohne die Einstellung belegt ist. Sonst den Beleg (welcher Test, welcher Fehler) im Plan bzw. Commit dokumentieren. | offen |
| 3 | NIT | src/lib/baking-engine/ddt.test.ts:100 | Dass `customFriction` bei Presets nicht validiert wird (−1/NaN wirft nicht), legt der Plan selbst aus („wird dem Hauptagenten zur Bestätigung gemeldet“). Es deckt sich mit AC-1 („wird ignoriert“), aber nicht eindeutig mit dem Wortlaut von AC-6. | Bestätigung des Nutzers im Ticket bzw. unter den offenen Fragen festhalten, damit spätere UIs nicht davon abweichen. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders (nicht zutreffend, reine Rechenlogik ohne Komponenten)
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast (nicht zutreffend, keine UI; Meldungstexte direkt anzeigbar)
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen (Abweichungen siehe Befunde 1 und 2)

## Fazit
Die Engine `ddt.ts` setzt Formel, Presets, Statuslogik mit Gleitkomma-Puffer und Fehlerfälle genau nach Plan um. Sie folgt den Konventionen aus `hydration.ts` (`assertFinite`, `*_MESSAGE`-Konstanten, `never`-Default). Laufzeitwerte, die nicht dem Typ entsprechen (z. B. `null` oder Strings), werden sauber abgewiesen. Die Tests prüfen alle sechs AC als Verhalten, mit exaktem Meldungsvergleich und Gleitkomma-Grenzfällen. Volle Suite, `tsc` und `eslint` sind grün. Offen bleiben nur zwei kleine Abweichungen von Plan und Scope in der Testkonfiguration (zusätzliche `vitest.config.test.ts`, unbelegtes `maxWorkers: 4`). Sie betreffen keinen Produktionscode und sollten vor dem Commit bereinigt werden.

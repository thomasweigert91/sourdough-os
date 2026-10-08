# Review F014: Live-Rekalibrierung bei Planabweichungen und Verzögerungen

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** CHANGES_REQUESTED
**Diff-Hash:** e228e7aa5e70

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `recalibrate.ts:597` → `reflowAfter` (343–363), `coldProofDurationMs` (323–337); Test „F014/AC-1 Stockgare 60 Min. verspätet…“ und Zeitumstellungsfall „F014/AC-1 Zeitumstellung 25.10.2026…“ (`recalibrate.test.ts:157`, `:200`) |
| AC-2 | ✅ | `recalibrate.ts:330-331` (Untergrenze Mindest-Kaltgare), `finalize` 505–517; Test „F014/AC-2 Stockgare 7 Std. verspätet…“ (`recalibrate.test.ts:227`) inkl. `warnedSteps` = ["shaping"], `conflicts` leer |
| AC-3 | ✅ | `recalibrate.ts:328` (Strategie `shift`), `moveTo` verschiebt offene Durchgänge (310–320); Test „F014/AC-3 Mischen 30 Min. verspätet…“ (`recalibrate.test.ts:261`) |
| AC-4 | ✅ | `parkDoughInFridge` `recalibrate.ts:640-701` (Faktor 0,1, Rest, `fridgeParkings`); Tests „F014/AC-4 parkt 16:30–20:30…“, „…nur während der offenen Stockgare…“, „Herausnehmen nicht nach dem Parken…“ (`recalibrate.test.ts:315`, `:354`, `:398`) |
| AC-5 | ✅ | `recalibrate.ts:333-334` (Verlängerung bis Max); Test „F014/AC-5 Stockgare 30 Min. zu früh…“ (`recalibrate.test.ts:415`), „nie vor jetzt“ für Phasen nach dem erledigten Schritt geprüft |
| AC-6 | ✅ | `recalibrate.ts:334` (`Math.min(..., maxColdProofMs)`); Test „F014/AC-6 Max-Kaltgare 14 Std. 15 Min.…“ (`recalibrate.test.ts:457`) |
| AC-7 | ✅ | `completeStretchAndFold` `recalibrate.ts:617-621`; Test „F014/AC-7 dritter Durchgang um 16:00…“ (`recalibrate.test.ts:483`), Strategie „Keine“ |
| AC-8 | ✅ | `recalibrate.ts:623-629` (`max(Ende, letzter Durchgang + Abstand)`); Test „F014/AC-8 vierter Durchgang um 18:30…“ (`recalibrate.test.ts:516`) |
| AC-9 | ✅ | `buildConflicts`/`buildSuggestion`/`nextLocalMinute` `recalibrate.ts:389-464`; Tests „F014/AC-9 Backen um 23:15…“ und Zeitumstellungsfall (`recalibrate.test.ts:561`, `:590`) |
| AC-10 | ✅ | `applySuggestion` `recalibrate.ts:708-736`; Test „F014/AC-10 Vorschlag übernommen…“ (`recalibrate.test.ts:618`) prüft Zeiten, `conflicts` leer, `warnedSteps` leer |
| AC-11 | ✅ | `recalibrate.ts:451` (`coldProofMs > maxColdProofMs` → null); Test „F014/AC-11 Max-Kaltgare 9 Std.…“ (`recalibrate.test.ts:664`) |
| AC-12 | ✅ | Δt = 0 → keine Änderung in `reflowAfter`, `finalize` → "none"; Test „F014/AC-12 Stockgare genau 18:45…“ (`recalibrate.test.ts:678`) |
| AC-13 | ✅ | Prüfkette `recalibrate.ts:561-566`, Meldungen 56–60; Tests „F014/AC-13 …“ (`recalibrate.test.ts:703-787`) inkl. Prüfreihenfolge und unverändertem Eingabeplan |
| AC-14 | ✅ | `finalize` `recalibrate.ts:488-492`, `preheatStartImmediately` 524; Tests „F014/AC-14 Abendplan, Formgebung genau 18:45…“ und beide Gegenproben (`recalibrate.test.ts:791`, `:814`, `:827`) |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MAJOR | src/lib/baking-engine/recalibrate.ts:310-320, 343-363, 597 | Wird ein Schritt erledigt, nachdem ein späterer Schritt schon erledigt ist (realistisch: Levain-Haken vergessen), verschiebt `reflowAfter` auch bereits erledigte Phasen. Nachgestellt: Referenzplan, Stockgare um 18:45 erledigt, danach Levain um 19:00 erledigt. Die erledigte Stockgare wandert von Sa 14:15–18:45 auf 20:00–00:30, der Rest des Plans wird umgeschichtet und das Ergebnis meldet „Kompensation“. Damit werden festgehaltene Abschlusszeiten überschrieben, und der Plan ist falsch. | Die Folgezeiten nur ab der letzten erledigten Phase der Hauptkette neu legen (erledigte Phasen in `moveTo`/`reflowAfter` nie verschieben). Alternativ den Fall mit fester Meldung ablehnen oder nur den Status setzen. Dazu einen Test schreiben: früheren Schritt nach einem späteren erledigen, die erledigten Zeiten bleiben gleich. | offen |
| 2 | MINOR | src/lib/baking-engine/recalibrate.ts:585-595, 507-517 | Wird das Vorheizen verspätet erledigt, verlängert der Code die offene Kaltgare bis „jetzt“ (`setEnd(previous, nowMs)`). Dadurch gilt `coldProofChanged`, und das Ergebnis meldet „Kompensation + Verschiebung“ (nachgestellt: +30 Min.). Laut Ticket und Plan gibt es nach der Kaltgare nur Verschiebung, die gemeldete Strategie ist also irreführend. Kein Test deckt das ab. | Diesen Pfad fest als „shift“ melden oder `coldProofChanged` nur aus der Strategie-Kompensation ableiten. Einen Test für verspätetes Vorheizen ergänzen. | offen |
| 3 | MINOR | src/lib/baking-engine/recalibrate.ts:582 | Liegt `completedAt` vor dem Beginn der Phase, wird der Beginn auf „jetzt“ gezogen (Dauer 0). Die offenen Vorgänger bleiben dabei unverändert. Nachgestellt: Stockgare um 12:00 erledigt, Mischen & Autolyse läuft aber bis 14:15, die Formgebung beginnt um 12:00. Die Hauptkette überlappt also. | Den Fall ablehnen oder offene Vorgänger als erledigt bzw. gekürzt behandeln. Mindestens im Risiko-Abschnitt festhalten und mit einem Test absichern. | offen |
| 4 | MINOR | src/lib/baking-engine/recalibrate.test.ts:618-640 | Der AC-10-Test prüft weder `appliedStrategy` noch `targetShiftMinutes` von `applySuggestion`. Außerdem prüft kein Test die Kompensation für einen anderen Schritt vor der Kaltgare als die Stockgare (Ticket: „Gilt für jeden Schritt vor der Kaltgare“, z. B. Formgebung oder Mischen mit Standardstrategie). | Asserts ergänzen: `compensationAndShift` und +525 Min. für AC-10, dazu ein Fall „Formgebung verspätet, Standardstrategie“. | offen |
| 5 | NIT | src/lib/baking-engine/recalibrate.ts:646-653 | `parkDoughInFridge` dupliziert die Min/Max-Prüfung aus `validateOptions`. `validateOptions` läuft danach in Zeile 671 ein zweites Mal. | Die Min/Max-Prüfung in eine eigene Funktion auslagern und an beiden Stellen aufrufen. | offen |
| 6 | NIT | src/lib/baking-engine/recalibrate.ts:186-188 | `options.strategy` wird zur Laufzeit nicht geprüft. Ein unbekannter Wert (z. B. aus späteren Formulardaten) wird stillschweigend als „compensate“ behandelt. | Gegen `RECALIBRATION_STRATEGIES` prüfen und bei Bedarf mit fester Meldung ablehnen. | offen |
| 7 | NIT | src/lib/baking-engine/recalibrate.ts:708-723 | `applySuggestion` prüft nicht, ob der Vorschlag zum Plan gehört, und auch nicht die Max-Kaltgare. Jede positive Minutenzahl wird übernommen. | Optional `coldProofMinutes ≤ maxColdProofMs` prüfen. Optional auch abgleichen, ob `suggestion` einem Eintrag in `timeline.conflicts` entspricht. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders (keine React-Anteile, reine TS-Funktionen)
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast (keine UI in diesem Ticket)
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

## Workflow-Ausnahmen
<!-- Vom Workflow eingefügt. Jede Ausnahme bewerten: War sie gerechtfertigt, verdeckt sie ein Problem? -->
- `2026-10-08T21:19:21.674Z` **allow-green** (tests): AC-5-Testfilter auf Phasen nach dem erledigten Schritt beschraenkt, da Levain und Mischen davor liegen und laut Ticket, AC-1 und AC-12 unveraendert und offen bleiben
  Bewertung: gerechtfertigt. Der Begriff „Nie vor jetzt“ würde wörtlich auch Levain und Mischen treffen, die noch offen sind. Laut der Ticket-Definition von „Erledigter Schritt“ sowie AC-1 und AC-12 bleiben sie aber unverändert vor dem erledigten Schritt stehen. Die Ausnahme verdeckt keinen Fehler im geprüften Szenario. Sie zeigt jedoch, dass die Engine den Status von Vorgängern nicht konsistent behandelt (siehe Befunde 1 und 3).

## Fazit
Alle 14 AC sind umgesetzt und mit genauen Zeit-Asserts getestet, auch über die Zeitumstellung. Vitest (301 Tests), `tsc` und ESLint laufen fehlerfrei, und die Exporte in `schedule.ts` ändern kein Verhalten. Blockierend ist Befund 1: Wird ein früherer Schritt nach einem späteren erledigt, verschiebt die Engine bereits erledigte Phasen und überschreibt deren Zeiten. Das muss vor der Freigabe behoben und getestet werden. Die MINOR-Punkte (Strategie-Meldung beim Vorheizen, Abschluss vor Phasenbeginn, Testlücken) sollten in derselben Runde mit erledigt werden.

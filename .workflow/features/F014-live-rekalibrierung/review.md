# Review F014: Live-Rekalibrierung bei Planabweichungen und Verzögerungen

<!-- Rolle: code-reviewer. Alle {{...}}-Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** a1e6256e9420

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | recalibrate.test.ts:157 „F014/AC-1 Stockgare 60 Min. verspätet …“ und :200 (Zeitumstellung 25.10.); Code recalibrate.ts:627-644 (setEnd + reflowAfter), Kompensation recalibrate.ts:340-354, Strategie recalibrate.ts:544-549 |
| AC-2 | ✅ | recalibrate.test.ts:227 „F014/AC-2 Stockgare 7 Std. verspätet …“ (Kaltgare 480, +60, `warnedSteps` = ["shaping"], `conflicts` leer); Code recalibrate.ts:348 (max(C − d, min)), Schlaf-Prüfung recalibrate.ts:523-533 |
| AC-3 | ✅ | recalibrate.test.ts:261 „F014/AC-3 Mischen 30 Min. verspätet …“ inkl. Durchgänge 15:15–16:45; Code recalibrate.ts:345 (shift), Durchgänge mitverschoben recalibrate.ts:327-337 |
| AC-4 | ✅ | recalibrate.test.ts:315 (Gutschrift 24, Rest 111, Stockgare bis 22:21, Kaltgare 624), :354 (nur während offener Stockgare), :398 (Herausnehmen ≤ Parken); Code recalibrate.ts:692-747 |
| AC-5 | ✅ | recalibrate.test.ts:415 „F014/AC-5 Stockgare 30 Min. zu früh …“ (Kaltgare 870, keine offene Folgephase vor jetzt); Code recalibrate.ts:350-352 |
| AC-6 | ✅ | recalibrate.test.ts:457 „F014/AC-6 Max-Kaltgare 14 Std. 15 Min. …“ (855, −15, „compensationAndShift“); Code recalibrate.ts:351 |
| AC-7 | ✅ | recalibrate.test.ts:483 „F014/AC-7 dritter Durchgang um 16:00 …“ (vierter 16:30, Phasen unverändert, „none“); Code recalibrate.ts:671-682 |
| AC-8 | ✅ | recalibrate.test.ts:516 „F014/AC-8 vierter Durchgang um 18:30 …“ (Stockgare bis 19:00, Kaltgare 825); Code recalibrate.ts:677-682 |
| AC-9 | ✅ | recalibrate.test.ts:561 (genau ein Konflikt „bake“, Vorschlag 555 Min., Mo 08:00, Mo 10:45) und :590 (Zeitumstellung, 615 Min.); Code recalibrate.ts:443-503, nextLocalMinute recalibrate.ts:428-441 |
| AC-10 | ✅ | recalibrate.test.ts:618 „F014/AC-10 Vorschlag übernommen …“ (Kaltgare bis Mo 08:00, `conflicts` und `warnedSteps` leer) und :642 (ohne Kaltgare abgelehnt); Code recalibrate.ts:754-787 |
| AC-11 | ✅ | recalibrate.test.ts:664 „F014/AC-11 Max-Kaltgare 9 Std. …“ (`suggestion` null); Code recalibrate.ts:490 |
| AC-12 | ✅ | recalibrate.test.ts:678 „F014/AC-12 Stockgare genau 18:45 …“ (alle Zeiten, Durchgänge, start/bakeStart/target gleich, nur Stockgare erledigt, „none“); Code recalibrate.ts:353, 548 |
| AC-13 | ✅ | recalibrate.test.ts:703-787 (Literaltexte, unbekannter Schritt, ungültiges Datum, bereits erledigt, Min > Max, Prüfreihenfolge, Eingabe jeweils unverändert über `withUnchangedInput`); Code recalibrate.ts:593-598 |
| AC-14 | ✅ | recalibrate.test.ts:791 (Vorheizen 18:15 „sofort starten“, `preheatStartImmediately` true), :814 (Gegenprobe Referenzplan), :827 (Gegenprobe Parken, jetzt = Herausnehmen); Code recalibrate.ts:525-529, 556, 746 |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | src/lib/baking-engine/recalibrate.ts:600, 650-674 | Die Prüfung „Abschluss nicht vor Beginn des Schritts“ (Befund 3 aus Runde 1) gilt nur für Phasen. Ein Durchgang kann vor dem Beginn der Stockgare oder vor einem bereits erledigten früheren Durchgang als erledigt markiert werden. Dann liegt `fold.at` vor `bulk.start` bzw. die Durchgänge sind zeitlich nicht mehr geordnet. | In `completeStretchAndFold` mit `COMPLETED_BEFORE_STEP_START_MESSAGE` ablehnen, wenn `nowMs < bulk.start` oder `nowMs <` dem `at` des letzten erledigten früheren Durchgangs. Dazu einen Härtungstest schreiben. | offen |
| 2 | MINOR | src/lib/baking-engine/recalibrate.ts:754-774 | `applySuggestion` prüft nicht, ob der Vorschlag zum aktuellen Plan gehört. Ein veralteter oder frei gebauter Vorschlag wird übernommen und kann die Kaltgare sogar kürzen, auch unter die Mindest-Kaltgare. `suggestion.bakeStart` und `suggestion.target` werden ignoriert, das Ergebnis kann also vom angezeigten Vorschlag abweichen. | Vorschlag gegen `timeline.conflicts[*].suggestion` abgleichen (`coldProofMinutes` und `bakeStart`) oder zusätzlich `durationMs >= aktuelle Kaltgare` verlangen. Sonst `SUGGESTION_NOT_APPLICABLE_MESSAGE`. | offen |
| 3 | MINOR | src/lib/baking-engine/recalibrate.ts:348 | Für die Ticket-Regel „Liegt die Kaltgare schon unter der Mindest-Kaltgare, wird nur verschoben“ (Begriff „Standardstrategie“) gibt es keinen Test mit Strategie `compensate`. Das zugehörige `appliedStrategy` „shift“ ist ebenfalls nicht abgesichert. | Test ergänzen: Abendplan (Kaltgare 30 Min.), Standardstrategie, Mischen 60 Min. verspätet → Kaltgare bleibt 30, Ziel +60, „shift“. | offen |
| 4 | NIT | src/lib/baking-engine/recalibrate.ts:707-716 | Mehrfaches Parken wird nicht gegen frühere `fridgeParkings` geprüft. Ein zweites Parken kann zeitlich im ersten Kühlschrank-Intervall liegen und wird dann doppelt gutgeschrieben. | `parkedAt >= letztes fridgeParkings.end` verlangen, sonst `INVALID_PARKING_TIME_MESSAGE`. | offen |
| 5 | NIT | src/lib/baking-engine/recalibrate.ts:726-728 | Die Gutschrift (Faktor 0,1) wird nicht gerundet. Bei ungeraden Parkdauern (z. B. 7 Min. → 42 s) entstehen Zeiten mit Sekunden und gebrochene `durationMinutes` bzw. `remainingBulkMinutes`. Das entspricht dem Plan („keine Rundung“), muss die spätere Timeline aber beim Formatieren berücksichtigen. | Entweder auf ganze Minuten runden oder im Folgeticket (Timeline) beim Formatieren berücksichtigen und dokumentieren. | offen |
| 6 | NIT | src/lib/baking-engine/schedule.ts:146-284 | Interne Helfer (`mergeDefined`, `timeFormatter`, `localMinuteOfDay` …) sind nun öffentliche Exporte des Planer-Moduls. „Intern“ steht nur im JSDoc. | Später in ein internes Modul (z. B. `baking-engine/internal/time.ts`) auslagern. Für dieses Ticket wie geplant in Ordnung. | offen |
| 7 | NIT | src/lib/baking-engine/recalibrate.ts:460, 641 | Typ-Casts `phase.id as "preheat" \| "bake"` und `previous.id as MainChainPhaseId`. | Über die Schleifenvariable `id` aus `["preheat", "bake"] as const` bzw. mit einem Type Guard typisieren. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders (nicht zutreffend, reine TS-Funktionen ohne UI)
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast (nicht zutreffend, keine Oberfläche im Ticket)
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

Eigene Läufe: `npx vitest run src/lib/baking-engine` mit 313/313 grün, `TZ=UTC` und `TZ=Europe/Berlin` für `recalibrate*` je 39/39 grün. `npx tsc --noEmit` und `npx eslint src/lib/baking-engine` laufen ohne Befund. `schedule.test.ts` und `schedule.hardening.test.ts` sind unverändert.

## Workflow-Ausnahmen
<!-- Vom Workflow eingefügt. Jede Ausnahme bewerten: War sie gerechtfertigt, verdeckt sie ein Problem? -->
- `2026-10-08T21:19:21.674Z` **allow-green** (tests): AC-5-Testfilter auf Phasen nach dem erledigten Schritt beschraenkt, da Levain und Mischen davor liegen und laut Ticket, AC-1 und AC-12 unveraendert und offen bleiben
  Bewertung: gerechtfertigt. Laut Ticket bleiben die Schritte vor dem erledigten Schritt unverändert, Levain und Mischen behalten also `completed: false` und Zeiten vor 18:15. AC-5 meint die neu gelegten Folgeschritte. Der Test prüft weiterhin hart, dass genau shaping, coldProof, bake und cool offen sind und keiner davor beginnt (recalibrate.test.ts:436-448). Die Ausnahme verdeckt kein Problem.

## Fazit
Alle 14 AC sind mit Verhaltenstests belegt und durch den Code auch außerhalb der Tests erfüllt, inklusive der Zeitumstellungs-Fälle und der Härtungen aus Runde 1. Offen sind nur Randfälle ohne AC: kein Startzeit-Check für Durchgänge, keine Zuordnung von Vorschlägen zum aktuellen Plan, ein fehlender Test für „Kaltgare unter Minimum → nur Verschiebung“. Keiner dieser Punkte blockiert die Abnahme, sie sollten aber vor der UI-Anbindung erledigt werden.

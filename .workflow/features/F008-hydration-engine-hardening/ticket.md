# F008: Hydratations-Engine: Review-Nachbesserungen aus F007

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
F007 hat die Rechen-Engine für Bäckerprozente und Netto-Hydratation geliefert (`src/lib/baking-engine/hydration.ts`, Tests in `hydration.test.ts`). Das Review zu F007 hat drei Schwächen gefunden, die dieses Ticket behebt (Befunde 1, 2 und 4 aus `F007-hydration-engine/review.md`):

1. **Neue Zutatentypen fallen nicht auf.** Die Netto-Hydratation unterscheidet die Zutatentypen Mehl, Wasser, Starter, Salz und Sonstiges. Kommt im Rezept-Schema ein weiterer Typ dazu (z. B. Milch), ignoriert die Berechnung ihn stillschweigend. Die Typprüfung meldet nichts. Die Netto-Hydratation wäre dann falsch, ohne dass es jemand bemerkt. Betroffen sind Entwickler, die das Schema erweitern, und später alle Nutzer, die eine falsche Hydratation angezeigt bekommen.
2. **Irreführende Fehlermeldungen bei ungültigen Zahlen.** Ist ein Bäckerprozent, eine Grammangabe oder eine Starter-Hydratation keine endliche Zahl (NaN, Infinity), lautet die Meldung heute „… darf nicht negativ sein.“ bzw. „… dürfen nicht negativ sein.“. Das trifft nicht zu. Dieselbe Unschärfe besteht bei Mehlbasis und Ziel-Teiggewicht: Bei NaN oder Infinity heißt es „Die Mehlbasis muss größer als 0 g sein.“ bzw. „Das Teiggewicht muss größer als 0 g sein.“, obwohl Infinity größer als 0 ist. Die Meldungen sollen später in der Oberfläche erscheinen und müssen deshalb zum tatsächlichen Fehler passen.
3. **Testlücke.** Der Fehlerfall „Ziel-Teiggewicht = Infinity“ wird im Code abgefangen, ist aber nicht getestet (für die Mehlbasis gibt es den Test bereits).

Das übrige Verhalten aus F007 (Rechenregeln, Begriffe, Rundung, Toleranz, bestehende Meldungen für negative Werte und 0) bleibt unverändert. Es gelten die Begriffe aus dem F007-Ticket.

## Ziel
Wird ein neuer Zutatentyp eingeführt, schlägt die Typprüfung fehl, bis die Netto-Hydratation ihn ausdrücklich behandelt. Ungültige Zahlen (NaN, Infinity) führen zu einer Fehlermeldung, die sagt, dass keine gültige Zahl vorliegt, statt fälschlich von „negativ“ oder „größer als 0 g“ zu sprechen. Der Fall „Ziel-Teiggewicht = Infinity“ ist durch einen Test abgesichert.

## Akzeptanzkriterien
<!--
"Nicht endlich" = NaN, Infinity und -Infinity (siehe Offene Fragen).
Die bestehenden Funktionen aus F007: Rezept aus Mehlbasis, Rezept aus Ziel-Teiggewicht,
Netto-Hydratation, Bäckerprozente aus Grammangaben.
-->

### AC-1: Neuer Zutatentyp fällt bei der Typprüfung auf
- **Angenommen** im Rezept-Schema wird probehalber ein weiterer Zutatentyp ergänzt (z. B. „milk“), ohne die Hydratations-Engine anzupassen
- **Wenn** die Typprüfung des Projekts (`npx tsc --noEmit`) läuft
- **Dann** meldet sie mindestens einen Fehler in `src/lib/baking-engine/hydration.ts` an der Stelle, an der die Netto-Hydratation die Zutatentypen unterscheidet. Ohne diese Ergänzung, also mit den fünf bestehenden Typen, meldet die Typprüfung keinen Fehler.

### AC-2: Ungültige Zahl beim Bäckerprozent
- **Angenommen** ein sonst gültiges Rezept mit Bäckerprozenten, in dem eine Zutat das Bäckerprozent NaN oder Infinity hat
- **Wenn** daraus ein Rezept aus Mehlbasis (1000 g) oder aus Ziel-Teiggewicht (1000 g) berechnet wird
- **Dann** wirft die Engine in beiden Fällen einen Fehler mit der Meldung „Bäckerprozente müssen gültige Zahlen sein.“ und nicht mehr „Bäckerprozente dürfen nicht negativ sein.“

### AC-3: Ungültige Zahl bei der Grammangabe
- **Angenommen** ein sonst gültiges Rezept mit Grammangaben, in dem eine Zutat die Grammangabe NaN oder Infinity hat
- **Wenn** daraus die Netto-Hydratation oder die Bäckerprozente berechnet werden
- **Dann** wirft die Engine in beiden Fällen einen Fehler mit der Meldung „Grammangaben müssen gültige Zahlen sein.“ und nicht mehr „Grammangaben dürfen nicht negativ sein.“

### AC-4: Ungültige Zahl bei der Starter-Hydratation
- **Angenommen** ein sonst gültiges Rezept, dessen Starter die Starter-Hydratation NaN oder Infinity hat
- **Wenn** eine der vier Berechnungen aufgerufen wird (Rezept aus Mehlbasis, Rezept aus Ziel-Teiggewicht, Netto-Hydratation, Bäckerprozente)
- **Dann** wirft die Engine einen Fehler mit der Meldung „Die Starter-Hydratation muss eine gültige Zahl sein.“ und nicht mehr „Die Starter-Hydratation darf nicht negativ sein.“

### AC-5: Ungültige Zahl bei der Mehlbasis
- **Angenommen** das Referenzrezept aus F007 mit Bäckerprozenten
- **Wenn** als Mehlbasis NaN oder Infinity vorgegeben wird
- **Dann** wirft die Engine einen Fehler mit der Meldung „Die Mehlbasis muss eine gültige Zahl sein.“ und nicht mehr „Die Mehlbasis muss größer als 0 g sein.“

### AC-6: Ungültige Zahl beim Ziel-Teiggewicht, einschließlich Infinity
- **Angenommen** das Referenzrezept aus F007 mit Bäckerprozenten
- **Wenn** als Ziel-Teiggewicht NaN oder Infinity vorgegeben wird
- **Dann** wirft die Engine einen Fehler mit der Meldung „Das Teiggewicht muss eine gültige Zahl sein.“ und gibt kein Rezept zurück. Der Fall Infinity ist durch einen eigenen Testfall abgedeckt.

### AC-7: Meldungen für negative Werte und 0 bleiben unverändert
- **Angenommen** eine endliche, aber ungültige Eingabe: Mehlbasis bzw. Ziel-Teiggewicht 0 oder −1, Bäckerprozent −1, Grammangabe −1 oder Starter-Hydratation −1
- **Wenn** die jeweilige Berechnung aufgerufen wird
- **Dann** lauten die Meldungen wie in F007: „Die Mehlbasis muss größer als 0 g sein.“, „Das Teiggewicht muss größer als 0 g sein.“, „Bäckerprozente dürfen nicht negativ sein.“, „Grammangaben dürfen nicht negativ sein.“ bzw. „Die Starter-Hydratation darf nicht negativ sein.“ Alle übrigen F007-Tests laufen unverändert grün.

### AC-8: −Infinity gilt als ungültige Zahl
- **Angenommen** eine Eingabe mit dem Wert −Infinity als Mehlbasis, Ziel-Teiggewicht, Bäckerprozent, Grammangabe oder Starter-Hydratation
- **Wenn** die jeweilige Berechnung aufgerufen wird
- **Dann** lautet die Meldung wie bei NaN und Infinity „… muss eine gültige Zahl sein.“ bzw. „… müssen gültige Zahlen sein.“ (AC-2 bis AC-6) und nicht „negativ“ oder „größer als 0 g“. Die Endlichkeit wird also vor dem Vorzeichen geprüft.

### AC-9: Unbekannter Zutatentyp zur Laufzeit
- **Angenommen** ein Rezept mit Grammangaben, in dem trotz Typprüfung eine Zutat einen unbekannten Typ hat (z. B. `"milk"` aus ungeprüften Daten, im Test per Typumgehung erzeugt)
- **Wenn** die Netto-Hydratation berechnet wird
- **Dann** wirft die Engine einen Fehler mit der Meldung „Unbekannter Zutatentyp: milk.“ und ignoriert die Zutat nicht still. Die Bäckerprozente aus Grammangaben bleiben davon unberührt (kein zusätzlicher Typ-Check dort).

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket. Die Fehlermeldungen sind so formuliert, dass spätere Ansichten sie unverändert anzeigen können.

## Nicht im Scope
- Review-Befund 3 aus F007: Bäckerprozente, deren Summe gegen Infinity läuft, und die dabei entstehende Meldung „Die Mehlbasis muss größer als 0 g sein.“ beim Teiggewicht, außerdem die doppelte Prüfung der Prozente
- Änderungen an den Rechenregeln, an der Rundung oder an der Mehlanteil-Toleranz aus F007
- Fachliche Behandlung neuer Zutatentypen (z. B. Wasseranteil von Milch) und Änderungen am Rezept-Schema
- Anzeige der Meldungen in einer Oberfläche

## Offene Fragen
- [x] Wie lauten die neuen Meldungen genau? → Je Eingabe eine eigene Meldung für nicht endliche Werte: „Bäckerprozente müssen gültige Zahlen sein.“, „Grammangaben müssen gültige Zahlen sein.“, „Die Starter-Hydratation muss eine gültige Zahl sein.“, „Die Mehlbasis muss eine gültige Zahl sein.“, „Das Teiggewicht muss eine gültige Zahl sein.“ (AC-2 bis AC-6). Meldungen für negative Werte und 0 bleiben (AC-7).
- [x] Welche Meldung gilt bei −Infinity? → Wie NaN und Infinity „keine gültige Zahl“; Endlichkeit wird zuerst geprüft (AC-8).
- [x] Laufzeitfehler bei unbekanntem Zutatentyp in der Netto-Hydratation? → Ja, Meldung „Unbekannter Zutatentyp: <typ>.“ (AC-9).
- [x] Bäckerprozente aus Grammangaben ebenfalls gegen neue Typen absichern? → Nein, das Verhalten ist für jeden Typ korrekt.

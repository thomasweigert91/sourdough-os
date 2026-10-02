# F007: Bäckerprozent- und Netto-Hydratations-Engine

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
Rezepte bestehen seit F006 aus Zutaten der Typen Mehl, Wasser, Starter, Salz und Sonstiges. Jede Zutat hat Gramm, Bäckerprozent und beim Starter eine eigene Starter-Hydratation (Standard 100 %). Bisher gibt es keine Rechenlogik, die diese Werte ineinander umrechnet. Wer ein Rezept nach Mehlmenge oder nach gewünschtem Teiggewicht skalieren oder die echte Teigführung beurteilen will, muss selbst rechnen. Dabei wird oft vergessen, dass der Starter Mehl und Wasser enthält. Die angezeigte Hydratation stimmt dann nicht mit der tatsächlichen überein. Betroffen sind alle späteren Ansichten, die Rezepte berechnen oder anzeigen (Rezepteditor, Skalierung, Rezeptdetail). Dieses Ticket liefert die Rechengrundlage dafür, noch ohne eigene Oberfläche. Vom Nutzer vorgegeben ist ein Rechenmodul unter `src/lib/baking-engine/hydration.ts` mit Unit-Tests (vitest).

Fachliche Rechenregeln (vom Nutzer vorgegeben):
- Mehlbasis: Mehl gesamt = Summe aller Zutaten vom Typ Mehl (ohne Starter).
- Bäckerprozent einer Zutat X = Masse X / Mehl gesamt × 100.
- Starter-Zerlegung: Mehl im Starter = Masse Starter / (1 + Starter-Hydratation / 100); Wasser im Starter = Masse Starter − Mehl im Starter.
- Netto-Hydratation (%) = (Summe Wasser-Zutaten + Wasser im Starter) / (Summe Mehl-Zutaten + Mehl im Starter) × 100.

Begriffe (verbindlich, auch für Code und Tests):
- **Mehlbasis** (Bezugsgröße der Bäckerprozente): nur die Summe der Zutaten vom Typ Mehl. Das Mehl im Starter zählt **nicht** dazu. Gilt für alle Bäckerprozent-Berechnungen und die Skalierung nach Mehlbasis bzw. Teiggewicht.
- **Gesamtmehl** (Bezugsgröße der Netto-Hydratation): Mehlbasis **plus** Mehl im Starter. Entsprechend **Gesamtwasser** = Wasser-Zutaten plus Wasser im Starter. Wird nur für die Netto-Hydratation verwendet.
- **Brutto-Hydratation** = Bäckerprozent der Wasser-Zutaten (bezogen auf die Mehlbasis); **Netto-Hydratation** = Gesamtwasser / Gesamtmehl × 100.

## Ziel
Aus einer Mehlmenge oder einem gewünschten Teiggewicht und den Bäckerprozenten entstehen die Grammangaben aller Zutaten, auch bei mehreren Mehlsorten. Zu jedem Rezept lässt sich die echte Netto-Hydratation einschließlich des im Starter enthaltenen Mehls und Wassers berechnen, für Starter mit beliebiger Hydratation (z. B. 100 % oder Lievito Madre mit 50 %).

## Akzeptanzkriterien
<!--
Referenzrezept für alle Kriterien ("Referenzrezept"):
Weizenmehl 550 80 %, Roggenmehl 1150 20 %, Wasser 70 %, Starter 20 %, Salz 2 % (Summe 192 %).
Werte in Gramm bzw. Prozent; Vergleich auf zwei Nachkommastellen gerundet.
-->

### AC-1: Grammangaben aus der Mehlbasis
- **Angenommen** das Referenzrezept mit Bäckerprozenten
- **Wenn** als Mehlbasis 1000 g vorgegeben werden
- **Dann** ergeben sich Weizenmehl 550 = 800 g, Roggenmehl 1150 = 200 g, Wasser = 700 g, Starter = 200 g, Salz = 20 g, zusammen 1920 g. Jede Zutat behält ihren Namen und Typ.

### AC-2: Grammangaben aus dem Ziel-Teiggewicht
- **Angenommen** das Referenzrezept mit Bäckerprozenten
- **Wenn** als Ziel-Teiggewicht 960 g vorgegeben werden
- **Dann** beträgt die Mehlbasis 500 g (960 / 192 × 100), und es ergeben sich Weizenmehl 550 = 400 g, Roggenmehl 1150 = 100 g, Wasser = 350 g, Starter = 100 g, Salz = 10 g. Die Summe aller Zutaten ist 960 g.

### AC-3: Skalierung auf ein krummes Teiggewicht
- **Angenommen** das Referenzrezept mit Bäckerprozenten
- **Wenn** als Ziel-Teiggewicht 1000 g vorgegeben werden
- **Dann** beträgt die Mehlbasis 520,83 g, es ergeben sich Weizenmehl 550 = 416,67 g, Roggenmehl 1150 = 104,17 g, Wasser = 364,58 g, Starter = 104,17 g, Salz = 10,42 g, und die ungerundete Summe aller Zutaten ist 1000 g.

### AC-4: Netto-Hydratation mit Starter bei 100 % Hydratation
- **Angenommen** ein Rezept mit Weizenmehl 550 800 g, Roggenmehl 1150 200 g, Wasser 700 g, Starter 200 g mit 100 % Starter-Hydratation und Salz 20 g
- **Wenn** die Netto-Hydratation berechnet wird
- **Dann** ist das Ergebnis 72,73 % (800 g Wasser / 1100 g Mehl). Die Bruttoangabe 70 % aus den Bäckerprozenten wird nicht ausgegeben.

### AC-5: Netto-Hydratation mit Lievito Madre (50 %)
- **Angenommen** dasselbe Rezept wie in AC-4, aber der Starter hat 50 % Starter-Hydratation
- **Wenn** die Netto-Hydratation berechnet wird
- **Dann** enthält der Starter 133,33 g Mehl und 66,67 g Wasser, und das Ergebnis ist 67,65 % (766,67 g Wasser / 1133,33 g Mehl).

### AC-6: Netto-Hydratation ohne Starter
- **Angenommen** ein Rezept mit Weizenmehl 550 1000 g, Wasser 650 g und Salz 20 g, ohne Starter
- **Wenn** die Netto-Hydratation berechnet wird
- **Dann** ist das Ergebnis 65 %. Salz und Zutaten vom Typ Sonstiges zählen weder als Mehl noch als Wasser.

### AC-7: Bäckerprozente aus Grammangaben
- **Angenommen** ein Rezept mit Weizenmehl 550 800 g, Roggenmehl 1150 200 g, Wasser 700 g, Starter 200 g und Salz 20 g
- **Wenn** die Bäckerprozente berechnet werden
- **Dann** ergeben sich Weizenmehl 550 = 80 %, Roggenmehl 1150 = 20 %, Wasser = 70 %, Starter = 20 %, Salz = 2 %. Bezugsgröße ist nur die Mehlbasis (Summe der Mehl-Zutaten, 1000 g), ohne das Mehl im Starter.

### AC-8: Mehlanteile müssen 100 % ergeben (Toleranz 0,01 Prozentpunkte)
- **Angenommen** Bäckerprozente mit drei Mehl-Zutaten 33,3 % + 33,3 % + 33,4 % (Summe 100 %) bzw. mit Mehl-Zutaten, deren Summe um höchstens 0,01 Prozentpunkte von 100 abweicht (z. B. 80 % + 20,005 %)
- **Wenn** daraus ein Rezept aus Mehlbasis oder Ziel-Teiggewicht berechnet wird
- **Dann** wird das Rezept ohne Fehler berechnet (bei 1000 g Mehlbasis: 333 g, 333 g, 334 g). Weichen die Mehlanteile um mehr als 0,01 Prozentpunkte ab (z. B. 80 % + 30 %), wirft die Engine einen Fehler mit der Meldung „Die Mehlanteile müssen zusammen 100 % ergeben.“

### AC-9: Ungültige Eingaben werfen Fehler
- **Angenommen** eine Mehlbasis bzw. ein Ziel-Teiggewicht ≤ 0, ein negatives Bäckerprozent, eine negative Grammangabe oder eine Starter-Hydratation < 0
- **Wenn** die jeweilige Berechnung aufgerufen wird
- **Dann** wirft die Engine einen Fehler und gibt weder 0 noch NaN zurück.

### AC-10: Netto-Hydratation ohne Mehl und ohne Starter
- **Angenommen** ein Rezept, das weder Mehl-Zutaten noch Starter enthält (z. B. nur Wasser 500 g und Salz 10 g)
- **Wenn** die Netto-Hydratation berechnet wird
- **Dann** ist das Ergebnis `null` (weder 0 noch Infinity noch NaN).

### AC-11: Mehrere Starter mit eigener Hydratation
- **Angenommen** ein Rezept mit Weizenmehl 550 1000 g, Wasser 700 g, Roggensauer 200 g mit 100 % Starter-Hydratation und Lievito Madre 150 g mit 50 % Starter-Hydratation
- **Wenn** die Netto-Hydratation berechnet wird
- **Dann** wird jeder Starter einzeln zerlegt (Roggensauer 100 g Mehl / 100 g Wasser, Lievito Madre 100 g Mehl / 50 g Wasser), und das Ergebnis ist 70,83 % (850 g Wasser / 1200 g Mehl).

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket. Das Ergebnis ist reine Rechenlogik, die spätere Ansichten nutzen.

## Nicht im Scope
- Anzeige oder Eingabe im Rezepteditor bzw. in der Rezeptdetailansicht
- Speichern berechneter Werte in der Datenbank oder Ändern des Rezept-Schemas
- Wasseranteile in Zutaten vom Typ Sonstiges (z. B. Milch, Ei, Honig)
- Einheiten außer Gramm

## Offene Fragen
- [x] Wie wird gerundet? → Intern ungerundet rechnen, Rundung (auf 0,1 g bzw. 0,01 %) erst in der Anzeige. Die Engine gibt keine gerundeten Werte zurück.
- [x] Was passiert, wenn die Bäckerprozente der Mehl-Zutaten nicht 100 % ergeben? → Fehler „Die Mehlanteile müssen zusammen 100 % ergeben.“, mit Toleranz von 0,01 Prozentpunkten; Testfall 33,3 + 33,3 + 33,4 (AC-8).
- [x] Wie reagiert die Engine auf ungültige Eingaben? → Fehler werfen statt still 0 oder NaN zurückzugeben (AC-9).
- [x] Netto-Hydratation ohne Mehl und ohne Starter? → `null`, nicht 0 und nicht Infinity (AC-10).
- [x] Mehrere Starter-Zutaten? → Ja, jeder Starter wird einzeln mit eigener Hydratation zerlegt (AC-11).
- [x] Zählt das Starter-Mehl zur Mehlbasis? → Nein. Bäckerprozente beziehen sich nur auf die Mehl-Zutaten (Mehlbasis); die Netto-Hydratation rechnet das Starter-Mehl ein (Gesamtmehl). Begriffe siehe Kontext.

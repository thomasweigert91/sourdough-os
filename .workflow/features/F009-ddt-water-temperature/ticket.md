# F009: DDT-Wassertemperatur-Rechner (Vier-Faktoren-Modell)

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
Die Teigtemperatur nach dem Kneten bestimmt, wie schnell ein Sauerteig gärt. Bäckerinnen und Bäcker geben dafür eine Ziel-Teigtemperatur vor (Desired Dough Temperature, DDT). Steuern können sie nur die Temperatur des Schüttwassers. Raum, Mehl und Starter haben ihre Temperatur, und beim Kneten kommt Reibungswärme dazu, je nach Knetart unterschiedlich viel. Heute muss man die passende Wassertemperatur von Hand ausrechnen. Dabei wird die Knetreibung oft vergessen oder falsch geschätzt, und extreme Ergebnisse (Eiswasser nötig, Wasser so heiß, dass die Starter-Mikroben Schaden nehmen) bleiben unbemerkt. Betroffen sind alle späteren Ansichten, die eine Teigführung planen (Rezeptdetail, Backplanung). Dieses Ticket liefert, wie F007 für die Hydratation, nur die Rechengrundlage, noch ohne eigene Oberfläche. Vom Nutzer vorgegeben ist ein Rechenmodul unter `src/lib/baking-engine/ddt.ts` mit der Funktion `calculateWaterTemperature(params: DdtParams): DdtResult` und Unit-Tests (vitest) mit Standard- und Grenzwerten.

Fachliche Rechenregel (vom Nutzer vorgegeben, alle Werte in °C):
- Wassertemperatur = (4 × DDT) − (Mehltemperatur + Raumtemperatur + Startertemperatur + Reibungswert)

Reibungs-Presets (vom Nutzer vorgegeben):
- Handknetung: 1 °C
- Standard-Küchenmaschine: 5 °C
- Spiralkneter: 9 °C
- Custom: frei wählbarer Wert

Status und Meldungen im Ergebnis (vom Nutzer vorgegeben):
- Wassertemperatur unter 4 °C: Status `cold_warning`, Meldung „Eiswasser erforderlich“
- Wassertemperatur über 45 °C: Status `heat_warning`, Meldung „Kritische Temperatur für Starter-Mikroben!“
- sonst: Status `ok`

## Ziel
Aus Ziel-Teigtemperatur, Raum-, Mehl- und Startertemperatur sowie der gewählten Knetart ergibt sich die nötige Schüttwassertemperatur. Ist das Ergebnis zu kalt oder zu heiß, enthält es einen Warnstatus mit der zugehörigen Meldung, die spätere Ansichten direkt anzeigen können.

## Akzeptanzkriterien
<!--
Referenzwerte für alle Kriterien ("Referenzbedingungen"):
DDT 26 °C, Mehl 20 °C, Raum 22 °C, Starter 24 °C.
Vergleich ungerundet bzw. auf eine Nachkommastelle.
-->

### AC-1: Wassertemperatur mit Reibungs-Preset
- **Angenommen** die Referenzbedingungen
- **Wenn** die Wassertemperatur mit dem Preset Handknetung, Standard-Küchenmaschine bzw. Spiralkneter berechnet wird
- **Dann** ist das Ergebnis 37 °C (Handknetung, Reibung 1 °C), 33 °C (Standard-Küchenmaschine, Reibung 5 °C) bzw. 29 °C (Spiralkneter, Reibung 9 °C), jeweils mit Status `ok` und ohne Meldung. Das Ergebnis enthält den tatsächlich verwendeten Reibungswert. Wird bei einem Preset zusätzlich ein Custom-Reibungswert mitgegeben, wird dieser ignoriert.

### AC-2: Wassertemperatur mit eigenem Reibungswert
- **Angenommen** die Referenzbedingungen
- **Wenn** die Wassertemperatur mit Reibungsart Custom und dem Reibungswert 3 °C bzw. 0 °C berechnet wird
- **Dann** ist das Ergebnis 35 °C bzw. 38 °C mit Status `ok`. Ein Custom-Wert mit Nachkommastelle (z. B. 2,5 °C) wird ungerundet verrechnet (Ergebnis 35,5 °C).

### AC-3: Kaltwarnung bei Wasser unter 4 °C
- **Angenommen** DDT 24 °C, Mehl 26 °C, Raum 30 °C, Starter 28 °C und Spiralkneter
- **Wenn** die Wassertemperatur berechnet wird
- **Dann** ist das Ergebnis 3 °C mit Status `cold_warning` und der Meldung „Eiswasser erforderlich“. Auch ein negatives Ergebnis (z. B. −2 °C) wird unverändert zurückgegeben, mit demselben Status und derselben Meldung.

### AC-4: Hitzewarnung bei Wasser über 45 °C
- **Angenommen** DDT 27 °C, Mehl 15 °C, Raum 17 °C, Starter 18 °C und Handknetung
- **Wenn** die Wassertemperatur berechnet wird
- **Dann** ist das Ergebnis 57 °C mit Status `heat_warning` und der Meldung „Kritische Temperatur für Starter-Mikroben!“

### AC-5: Grenzwerte 4 °C und 45 °C gehören zu `ok`
- **Angenommen** DDT 26 °C und Handknetung bzw. Spiralkneter
- **Wenn** die Wassertemperatur genau 4 °C (Mehl 30 °C, Raum 32 °C, Starter 29 °C, Spiralkneter) bzw. genau 45 °C (Mehl 18 °C, Raum 20 °C, Starter 20 °C, Handknetung) ergibt
- **Dann** ist der Status jeweils `ok` ohne Meldung. Bei 3,9 °C (Mehl 30,1 °C, sonst wie oben) ist der Status `cold_warning`, bei 45,1 °C (Raum 19,9 °C, sonst wie oben) `heat_warning`.

### AC-6: Ungültige Eingaben werfen Fehler
- **Angenommen** eine der Temperaturen (DDT, Mehl, Raum, Starter) oder der Custom-Reibungswert ist keine gültige Zahl (NaN, Infinity, −Infinity), bei Reibungsart Custom fehlt der Reibungswert, oder der Custom-Reibungswert ist negativ
- **Wenn** die Wassertemperatur berechnet wird
- **Dann** wirft die Engine einen Fehler mit einer deutschen Meldung und gibt weder eine Zahl noch NaN zurück. Feste Meldungstexte u. a.: „Die Teigtemperatur muss eine gültige Zahl sein.“ (ungültige DDT; für Mehl, Raum und Starter analog), „Die Knetreibung darf nicht negativ sein.“, „Für eigene Knetreibung muss ein Wert angegeben werden.“ Negative Mehl-, Raum- oder Startertemperaturen (z. B. Mehl aus dem Gefrierschrank) sind dagegen gültig und werden normal verrechnet; es gibt keine Plausibilitätsobergrenzen.

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket. Das Ergebnis ist reine Rechenlogik, die spätere Ansichten nutzen. Die Meldungstexte „Eiswasser erforderlich“ und „Kritische Temperatur für Starter-Mikroben!“ sind so formuliert, dass eine spätere Ansicht sie unverändert anzeigen kann.

## Nicht im Scope
- Eingabemaske oder Anzeige im Rezeptdetail bzw. in der Backplanung
- Umrechnung nach °F und Berücksichtigung der Einstellung „Temperatureinheit“ (°C/°F)
- Speichern von Temperaturen, Knetart oder Ergebnis in der Datenbank
- Weitere Faktoren wie Vorteig-/Poolish-Temperatur oder Fünf-Faktoren-Modelle
- Teige ohne Starter (z. B. nur Hefe, Drei-Faktoren-Modell)

## Offene Fragen
- [x] Wird intern ungerundet gerechnet und erst in der Anzeige gerundet, wie in F007? → Ja, die Engine gibt die Wassertemperatur ungerundet zurück.
- [x] Liegen die Grenzwerte 4 °C und 45 °C selbst im Bereich `ok`? → Ja, Warnung nur bei < 4 bzw. > 45 (AC-5).
- [x] Soll ein negatives Ergebnis unverändert zurückgegeben oder auf 0 °C begrenzt werden? → Unverändert zurückgeben, Status `cold_warning` (AC-3).
- [x] Rechnet die Engine nur in °C? → Ja, nur °C in diesem Ticket; Umrechnung nach °F erfolgt später in der Anzeige.
- [x] Welche Eingaben gelten als ungültig? → Nicht endliche Zahlen und ein negativer Custom-Reibungswert werfen Fehler; negative Mehl-, Raum- oder Startertemperaturen sind erlaubt; keine Plausibilitätsobergrenzen (AC-6).
- [x] Gilt der Custom-Reibungswert auch bei gewähltem Preset? → Nein, bei einem Preset wird ein mitgegebener Custom-Wert ignoriert; das Ergebnis enthält immer den tatsächlich verwendeten Reibungswert (AC-1).
- [x] Feste deutsche Fehlermeldungen wie in F007? → Ja, mit den Texten „Die Teigtemperatur muss eine gültige Zahl sein.“, „Die Knetreibung darf nicht negativ sein.“, „Für eigene Knetreibung muss ein Wert angegeben werden.“ (AC-6).

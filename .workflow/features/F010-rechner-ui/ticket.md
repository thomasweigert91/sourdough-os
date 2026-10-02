# F010: Rechner-UI und interaktive Anpassung

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
Sourdough OS kann Bäckerprozente, Netto-Hydratation (F007/F008) und die nötige Schüttwassertemperatur (F009) bereits berechnen, aber nur als Rechenlogik ohne Oberfläche. Wer ein Rezept planen will, kann diese Rechnungen heute nirgends in der App ausführen und rechnet weiter von Hand oder in Tabellen. Betroffen sind alle, die einen Sauerteig planen, angemeldet oder als Gast, am Rechner wie am Handy in der Küche, auch ohne Internetverbindung.

Dieses Ticket (Vorlage „Ticket 1.3“, 5 Story Points) liefert eine neue Seite unter `/calculator` mit drei Teilen:
- **Hydratations-Rechner:** Zutatenliste mit Gramm- und Prozentfeldern, die sich gegenseitig aktualisieren, Umschalter zwischen „Basis: Gesamtmehl“ und „Basis: Ziel-Teiggewicht“, Mehle und Zusatzstoffe hinzufügen und entfernen, Live-Anzeige von Netto-Hydratation und Teigausbeute (TA).
- **DDT-Rechner:** Slider und Eingabefelder für Ziel-Teigtemperatur (DDT, Standard 25 °C), Raum-, Mehl- und Startertemperatur, Auswahl der Knetmethode, sofortige Warnanzeige bei Extremtemperaturen.
- **Speichern:** „Als Rezept speichern“ im Konto (angemeldet und online) oder „Lokal merken“ auf dem Gerät (Gast oder offline).

Wiederverwendet werden ausdrücklich die vorhandenen Rechenregeln und Meldungstexte aus F007/F008 (Bäckerprozente, Netto-Hydratation, Mehlanteil-Prüfung) und F009 (Wassertemperatur, Knetreibungs-Presets, Warnstatus), die Anmeldung aus F004, die Offline-Erkennung und lokale Speicherung aus F005 sowie das Rezept-Datenmodell aus F006 (Name, Ziel-Teiggewicht, Ziel-Hydratation, Zutaten mit Typ, Gramm, Bäckerprozent, Starter-Hydratation, Reihenfolge).

Begriffe wie in F007: Bäckerprozente beziehen sich auf die Summe der Mehl-Zutaten ohne Starter-Mehl. Die Netto-Hydratation zählt Mehl und Wasser im Starter mit. Die Teigausbeute ist TA = 100 + Netto-Hydratation (entspricht (Gesamtmehl + Gesamtwasser) / Gesamtmehl × 100).

<!--
Referenzrezept für die Kriterien (Basis: Gesamtmehl 1000 g):
Weizenmehl (Mehl) 80 % = 800 g, Roggenmehl (Mehl) 20 % = 200 g, Wasser 70 % = 700 g,
Starter 20 % = 200 g mit Starter-Hydratation 100 %, Salz 2 % = 20 g. Teiggewicht 1920 g.
Netto-Hydratation = (700 + 100) / (1000 + 100) × 100 = 72,7 %, TA 172,7.
Anzeige: Gramm auf ganze Gramm, Prozent, Hydratation, TA und Temperaturen auf eine Nachkommastelle gerundet,
deutsches Zahlenformat (Komma).
-->

## Ziel
Unter `/calculator` kann man ein Sauerteigrezept interaktiv durchrechnen: Gramm oder Prozent ändern, Mehle und Zusatzstoffe ergänzen und sofort Netto-Hydratation, TA und die passende Wassertemperatur samt Warnhinweis sehen. Angemeldete Personen speichern das Ergebnis als Rezept in ihrem Konto, Gäste und Offline-Nutzer merken es sich auf dem Gerät.

## Akzeptanzkriterien

### AC-1: Rezept auf Basis Gesamtmehl mit Live-Kennzahlen
- **Angenommen** die Person ist auf `/calculator`, der Umschalter steht auf „Basis: Gesamtmehl“ und die Zutatenliste enthält Weizenmehl 80 %, Roggenmehl 20 %, Wasser 70 %, Starter 20 % mit Starter-Hydratation 100 % und Salz 2 %
- **Wenn** sie in das Feld „Gesamtmehl (g)“ den Wert 1000 eintippt
- **Dann** zeigen die Grammfelder ohne weiteren Klick 800 g, 200 g, 700 g, 200 g und 20 g, die Anzeige „Netto-Hydratation“ zeigt 72,7 % und „Teigausbeute (TA)“ zeigt 172,7. Ändert sie die Starter-Hydratation auf 50 %, zeigt die Netto-Hydratation 67,6 % (Gesamtwasser 766,7 g / Gesamtmehl 1133,3 g) und die TA 167,6.

### AC-2: Gramm und Prozent aktualisieren sich gegenseitig
- **Angenommen** das Referenzrezept aus AC-1 bei „Basis: Gesamtmehl“ 1000 g
- **Wenn** sie bei Wasser das Grammfeld auf 750 ändert bzw. bei Salz das Prozentfeld auf 2,5 ändert
- **Dann** zeigt das Prozentfeld von Wasser 75,0 %, die Netto-Hydratation 77,3 % und die TA 177,3 bzw. das Grammfeld von Salz 25 g. Das gerade bearbeitete Feld behält während des Tippens den eingegebenen Wert, nur das jeweils andere Feld und die Kennzahlen werden neu berechnet; das Feld „Gesamtmehl (g)“ bleibt 1000.

### AC-3: Umschalten auf Basis Ziel-Teiggewicht
- **Angenommen** das Referenzrezept aus AC-1 bei „Basis: Gesamtmehl“ 1000 g
- **Wenn** sie den Umschalter auf „Basis: Ziel-Teiggewicht“ stellt und anschließend in das Feld „Ziel-Teiggewicht (g)“ den Wert 960 eintippt
- **Dann** zeigt das Feld „Ziel-Teiggewicht (g)“ direkt nach dem Umschalten 1920 und alle Gramm- und Prozentwerte bleiben unverändert. Nach der Eingabe von 960 zeigen die Grammfelder 400 g, 100 g, 350 g, 100 g und 10 g; Prozentwerte, Netto-Hydratation (72,7 %) und TA (172,7) bleiben gleich. Der Umschalter ist per Tab erreichbar und mit Pfeiltasten bzw. Leertaste bedienbar.

### AC-4: Mehle und Zusatzstoffe hinzufügen und entfernen
- **Angenommen** das Referenzrezept aus AC-1 bei „Basis: Gesamtmehl“ 1000 g
- **Wenn** sie auf „Mehl hinzufügen“ klickt, bzw. auf „Zutat hinzufügen“ klickt, bzw. bei Roggenmehl auf „Entfernen“ klickt
- **Dann** erscheint am Ende der Mehle eine neue Zeile mit leerem Namensfeld „Name“ und 0 % / 0 g, und der Fokus liegt auf deren Namensfeld; bzw. es erscheint am Ende der Zutatenliste eine neue Zeile mit Typauswahl „Salz“ oder „Sonstiges“, 0 % / 0 g; bzw. die Zeile Roggenmehl verschwindet, die Kennzahlen werden sofort neu berechnet und die Mehlanteil-Meldung aus AC-5 erscheint, weil die Mehle nur noch 80 % ergeben. Ist nur noch ein Mehl übrig, ist dessen Button „Entfernen“ deaktiviert. Die Reihenfolge der übrigen Zeilen bleibt unverändert.

### AC-5: Live-Validierung ungültiger Eingaben
- **Angenommen** das Referenzrezept aus AC-1 bei „Basis: Gesamtmehl“ 1000 g
- **Wenn** sie eine ungültige Eingabe macht: Weizenmehl auf 70 % (Mehle ergeben 90 %), Wasser auf −5 g, „Gesamtmehl (g)“ auf 0 bzw. „Ziel-Teiggewicht (g)“ auf 0
- **Dann** erscheint ohne Klick auf einen Button die passende Meldung: „Die Mehlanteile müssen zusammen 100 % ergeben.“ unter der Zutatenliste, „Grammangaben dürfen nicht negativ sein.“ am Feld von Wasser, „Die Mehlbasis muss größer als 0 g sein.“ bzw. „Das Teiggewicht muss größer als 0 g sein.“ am jeweiligen Basisfeld. Solange eine Meldung sichtbar ist, zeigen Netto-Hydratation und TA „–“ und die Speichern-Buttons aus AC-8 und AC-10 sind deaktiviert. Ist die Eingabe korrigiert, verschwindet die Meldung und die Kennzahlen erscheinen wieder.

### AC-6: DDT-Rechner zeigt die Wassertemperatur
- **Angenommen** die Person öffnet `/calculator`
- **Wenn** sie den DDT-Rechner betrachtet und dann über Slider oder Eingabefeld „Ziel-Teigtemperatur (DDT)“ 26 °C, „Raumtemperatur“ 22 °C, „Mehltemperatur“ 20 °C, „Startertemperatur“ 24 °C einstellt und unter „Knetmethode“ nacheinander „Handknetung“, „Küchenmaschine“, „Spiralkneter“ und „Eigener Wert“ mit „Knetreibung (°C)“ 3 wählt
- **Dann** steht die Ziel-Teigtemperatur beim Öffnen auf 25 °C. Nach den Eingaben zeigt „Wassertemperatur“ ohne weiteren Klick 37,0 °C, 33,0 °C, 29,0 °C bzw. 35,0 °C. Slider und Eingabefeld derselben Temperatur zeigen immer denselben Wert: Tippen im Feld verschiebt den Slider, Bewegen des Sliders (auch per Pfeiltasten) ändert das Feld. Die Auswahl „Knetmethode“ zeigt die Optionen „Handknetung (+1 °C)“, „Küchenmaschine (+5 °C)“, „Spiralkneter (+9 °C)“ und „Eigener Wert“; die Reibungswerte stammen aus `FRICTION_PRESETS` (F009). Das Feld „Knetreibung (°C)“ ist nur bei „Eigener Wert“ sichtbar; ein negativer Wert zeigt „Die Knetreibung darf nicht negativ sein.“ und die Wassertemperatur „–“.

### AC-7: Warnanzeige bei Extremtemperaturen
- **Angenommen** die Person nutzt den DDT-Rechner
- **Wenn** sie DDT 24 °C, Raum 30 °C, Mehl 26 °C, Starter 28 °C und „Spiralkneter“ einstellt, bzw. DDT 27 °C, Raum 17 °C, Mehl 15 °C, Starter 18 °C und „Handknetung“
- **Dann** zeigt „Wassertemperatur“ 3,0 °C und direkt daneben ein Warnhinweis „Eiswasser erforderlich“, bzw. 57,0 °C und ein Warnhinweis „Kritische Temperatur für Starter-Mikroben!“. Die beiden Hinweise sind farblich unterscheidbar (kalt/heiß) und tragen zusätzlich ein Textlabel, damit sie nicht nur über Farbe erkennbar sind. Bei genau 4,0 °C bzw. 45,0 °C erscheint kein Hinweis. Wird ein Wert so geändert, dass das Ergebnis wieder zwischen 4 °C und 45 °C liegt, verschwindet der Hinweis sofort.

### AC-8: Als Rezept speichern (angemeldet und online)
- **Angenommen** die Person ist angemeldet und online, das Rezept aus AC-1 ist gültig eingegeben
- **Wenn** sie in das Feld „Rezeptname“ „Landbrot“ eintippt und auf „Als Rezept speichern“ klickt
- **Dann** zeigt der Button während des Speicherns „Speichern …“ und ist deaktiviert; danach erscheint „Rezept „Landbrot“ gespeichert.“ und alle Eingaben bleiben stehen. Gespeichert sind im Konto der Person: Name, Ziel-Teiggewicht 1920 g, Ziel-Hydratation 72,7 % sowie alle Zutaten in der angezeigten Reihenfolge mit Name, Typ, Gramm, Bäckerprozent und Starter-Hydratation. Ist „Rezeptname“ leer oder enthält nur Leerzeichen, wird nichts gespeichert und am Feld erscheint „Bitte gib einen Rezeptnamen ein.“

### AC-9: Speichern schlägt fehl
- **Angenommen** die Person ist angemeldet, das Rezept ist gültig und „Rezeptname“ ausgefüllt
- **Wenn** sie auf „Als Rezept speichern“ klickt und der Server nicht antwortet oder einen Fehler meldet
- **Dann** erscheint „Das Rezept konnte nicht gespeichert werden. Bitte versuche es erneut.“, alle Eingaben einschließlich „Rezeptname“ bleiben unverändert und der Button „Als Rezept speichern“ ist wieder aktiv.

### AC-10: Lokal merken als Gast oder offline
- **Angenommen** die Person ist nicht angemeldet, oder sie ist angemeldet, aber offline (Kopfzeile zeigt „Offline – Änderungen werden lokal gespeichert“), und das Rezept ist gültig
- **Wenn** sie auf „Lokal merken“ klickt und `/calculator` später auf demselben Gerät im selben Browser erneut öffnet (auch nach Neuladen oder ohne Internetverbindung)
- **Dann** wird statt „Als Rezept speichern“ der Button „Lokal merken“ angezeigt; das Feld „Rezeptname“ und der Button „Als Rezept speichern“ sind ausgeblendet (nicht nur deaktiviert). Für Gäste steht an ihrer Stelle der Hinweis „Melde dich an, um Rezepte in deinem Konto zu speichern.“ mit einem Link „Anmelden“ zu „/login“. Nach dem Klick auf „Lokal merken“ erscheint „Auf diesem Gerät gemerkt.“ Beim erneuten Öffnen sind alle Eingaben wiederhergestellt: Basis-Umschalter, Basiswert, alle Zutaten mit Namen, Typ, Gramm, Prozent und Starter-Hydratation in derselben Reihenfolge, alle Temperaturen, Knetmethode und bei „Eigener Wert“ die Knetreibung. Ein erneuter Klick auf „Lokal merken“ überschreibt den zuvor gemerkten Stand.
- **Und** der gemerkte Stand trägt einen Besitzer-Marker: „Gast“, wenn niemand angemeldet ist, sonst die Konto-ID der angemeldeten Person. Ein Stand wird nur wiederhergestellt, wenn sein Besitzer zur aktuellen Person passt (Gast-Stand für Gäste, Konto-Stand nur für dasselbe Konto); sonst startet der Rechner mit dem Referenzrezept aus AC-1. Beim Abmelden wird ein Stand mit Konto-ID gelöscht, ein Gast-Stand bleibt erhalten.

## UI & Barrierefreiheit
- Jedes Eingabefeld und jeder Slider hat ein sichtbares Label (siehe Texte in den Kriterien); Einheiten (g, %, °C) stehen am Feld.
- Meldungen an Feldern sind mit dem Feld verknüpft, damit Screenreader sie beim Fokus vorlesen; Validierungsmeldungen, Speicher-Rückmeldungen und Temperaturwarnungen werden höflich (nicht unterbrechend) angesagt, jede Änderung genau einmal.
- Die Kennzahlen „Netto-Hydratation“, „Teigausbeute (TA)“ und „Wassertemperatur“ werden beim Ziehen eines Sliders nicht bei jedem Zwischenschritt vorgelesen.
- Alles ist per Tastatur bedienbar: Tab-Reihenfolge von oben nach unten (Hydratations-Rechner, DDT-Rechner, Speichern), Slider mit Pfeiltasten, Auswahl „Knetmethode“ per Tastatur, „Entfernen“-Buttons tragen den Zutatennamen im zugänglichen Namen (z. B. „Roggenmehl entfernen“).
- Dezimaleingaben mit Komma und mit Punkt werden akzeptiert (2,5 und 2.5); Anzeige im deutschen Zahlenformat.
- Ab 320 px Breite ohne horizontales Scrollen nutzbar; auf schmalen Bildschirmen stehen Hydratations- und DDT-Rechner untereinander.
- `/calculator` ist ohne Anmeldung erreichbar; das Dashboard bekommt einen einfachen Link „Zum Rechner“.
- Optik wie die bestehenden Seiten (Dashboard, Login): gleiche Kopfzeile mit Offline-Hinweis, gleiche Button- und Fehlertext-Stile, Hell- und Dunkelmodus.

## Nicht im Scope
- Rezeptliste, Rezeptdetail sowie Laden, Bearbeiten oder Löschen gespeicherter Rezepte
- Automatisches Hochladen eines lokal gemerkten Stands ins Konto nach Anmeldung oder bei wiederhergestellter Verbindung
- Mehrere lokal gemerkte Stände nebeneinander
- Anzeige und Eingabe in °F bzw. Berücksichtigung der Einstellung „Temperatureinheit“
- Speichern der DDT-Werte (Temperaturen, Knetmethode) im Konto-Rezept
- Neue Rechenregeln: Hydratation, TA und Wassertemperatur folgen ausschließlich F007/F008/F009
- Neugestaltung der Startseite oder des Dashboards

## Offene Fragen
- [x] 1. Ist `/calculator` ohne Anmeldung erreichbar (Gastmodus)? → Ja, ohne Anmeldung erreichbar, keine Umleitung zu „/login“.
- [x] 2. Womit startet der Rechner beim ersten Öffnen (ohne gemerkten Stand)? → Mit dem Referenzrezept aus AC-1 (Weizenmehl 80 %, Roggenmehl 20 %, Wasser 70 %, Starter 20 % / 100 %, Salz 2 %, Gesamtmehl 1000 g).
- [x] 3. Welche Zeilen sind fest und welche dynamisch? → Wasser und Starter sind feste Zeilen (nicht entfernbar); Mehle über „Mehl hinzufügen“ und Zusatzstoffe (Typ „Salz“ oder „Sonstiges“) über „Zutat hinzufügen“ frei hinzufüg- und entfernbar; mindestens ein Mehl bleibt immer.
- [x] 4. Grammfeld eines Mehls ändern bei „Basis: Gesamtmehl“? → „Gesamtmehl (g)“ wird zur neuen Summe der Mehle, die Prozente aller Mehle werden neu berechnet, Grammwerte der übrigen Zutaten bleiben und ihre Prozente passen sich an.
- [x] 5. Grammfeld ändern bei „Basis: Ziel-Teiggewicht“? → Prozent der Zutat wird aus der aktuellen Mehlbasis neu berechnet und „Ziel-Teiggewicht (g)“ zeigt die neue Summe.
- [x] 6. Bleiben beim Umschalten der Basis die Grammwerte erhalten und wird das neue Basisfeld vorbelegt (AC-3)? → Ja.
- [x] 7. Leeres Zahlenfeld? → Leeres Gramm- oder Prozentfeld einer Zutat zählt als 0; leeres Basisfeld zeigt die Meldung aus AC-5 („… muss größer als 0 g sein.“); leeres Temperaturfeld zeigt „Die … muss eine gültige Zahl sein.“ (Texte aus F009).
- [x] 8. Wertebereiche und Schrittweiten der Slider? → DDT 18–32 °C, Raum-, Mehl- und Startertemperatur −10 bis 40 °C, Schritt 0,5 °C; im Eingabefeld sind auch Werte außerhalb des Slider-Bereichs erlaubt (Slider steht dann am Rand).
- [x] 9. Startwerte? → Raum-, Mehl- und Startertemperatur jeweils 22 °C, Knetmethode „Handknetung“ (ergibt 33,0 °C Wasser bei DDT 25 °C).
- [x] 10. Bezeichnungen der Knetmethoden? → „Handknetung“, „Küchenmaschine“, „Spiralkneter“, „Eigener Wert“, mit Reibungswert im Auswahltext (z. B. „Spiralkneter (+9 °C)“). Die Reibungswerte kommen aus `FRICTION_PRESETS` (F009) und werden nicht in der UI dupliziert.
- [x] 11. Warnanzeige nur für die berechnete Wassertemperatur? → Ja, nur Wassertemperatur mit den Grenzen 4 °C / 45 °C aus F009, keine weiteren Grenzwerte.
- [x] 12. Angemeldet, aber offline? → „Lokal merken“ wie in AC-10; automatische Übertragung ist ein Folgeticket.
- [x] 13. DDT-Werte beim „Als Rezept speichern“ mitspeichern? → Nein, nur beim „Lokal merken“.
- [x] 14. Neue Texte? → Ja, so übernehmen.
- [x] 15. Dashboard-Link zum Rechner? → Ja, ein einfacher Link „Zum Rechner“.
- [x] 16. Lokal gemerkten Stand beim Abmelden löschen? → Der gemerkte Stand trägt einen Besitzer-Marker (Gast oder Konto-ID). Beim Abmelden wird ein Stand mit Konto-ID gelöscht, ein Gast-Stand bleibt erhalten.
- [x] Zusatz (Nutzer): Für Gäste ist „Als Rezept speichern“ ausgeblendet; stattdessen erscheint ein Hinweis zur Anmeldung (siehe AC-10).

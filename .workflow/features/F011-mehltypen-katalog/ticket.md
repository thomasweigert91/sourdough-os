# F011: Mehltypen-Katalog und automatische Hydratations-Kompensation

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-03

## Kontext
Im Rechner unter `/calculator` (F010) haben Mehle heute nur ein freies Namensfeld („Name“). Die App weiß nicht, um welches Mehl es sich handelt. Mehle nehmen aber unterschiedlich viel Wasser auf: Weizen 550 etwa 65 %, Dinkel 630 etwa 60 %, Manitoba (High Protein) 80 bis 85 %. Wer im Rezept ein Mehl austauscht, zum Beispiel Weizen gegen Dinkel, und die Wassermenge gleich lässt, bekommt einen deutlich weicheren oder festeren Teig. Die Wassermenge muss heute von Hand nachgerechnet werden. Betroffen sind alle, die den Rechner nutzen, angemeldet oder als Gast, online wie offline.

Dieses Ticket (Vorlage „Ticket 1.4“, 5 Story Points) liefert:
- **Mehltypen-Katalog**: fest in der App hinterlegte, typisierte Konstante (analog zu `FRICTION_PRESETS`), keine DB-Tabelle. Je Mehltyp ein Name, eine Getreidegruppe, ein relativer Absorptionsfaktor (Baseline Weizen 550 = 1,00), eine Knet-Toleranz und ein optionaler Hinweistext als Metadaten für spätere Warnungen (z. B. „Dinkel überknetet schnell“). Knet-Toleranz und Hinweistexte werden in diesem Ticket nur hinterlegt, nicht angezeigt.
  - Weizen: Weizen 405, Weizen 550 (1,00), Weizen 1050, Weizen Vollkorn (1,15, Nutzervorgabe)
  - Dinkel: Dinkel 630 (0,92), Dinkel 1050, Dinkel Vollkorn
  - Roggen: Roggen 815, Roggen 997, Roggen 1150 (1,15), Roggen 1370, Roggen Vollkorn
  - Sonderfälle: Manitoba (1,25), Tipo 00 (Pizzamehl) (Faktor nahe 1,00, Hinweistext: Wasserbedarf weicht je nach Packung/Kleberstärke ab)
  - Sonstiges Mehl (1,00, freier Name)
  - Die Faktoren in Klammern sind fest. Alle übrigen Faktoren und Knet-Toleranzen schlägt der Plan als gekennzeichnete Richtwerte vor; der Nutzer bestätigt sie mit der Planfreigabe.
- **Rechenregel** `calculateAdjustedWaterForFlourSwap(originalFlours, newFlours, currentWater)`: berechnet aus dem Unterschied im Absorptionsvermögen der Mehlmischung vorher und nachher die neue Schüttwassermenge.
- **Rechner-UI**: je Mehlzeile eine Auswahl „Mehltyp“ und ein Schalter „Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)“.

Rechenregel (siehe Frage 3): Das gewichtete Absorptionsvermögen einer Mehlmischung ist die Summe aus Gramm × Absorptionsfaktor über alle Mehlzeilen (ohne Starter-Mehl). Bei einem Mehlwechsel wird das Bäckerprozent des Wassers mit dem Verhältnis „Absorptionsvermögen nachher / Absorptionsvermögen vorher“ multipliziert; Grammwerte folgen wie bisher aus der gewählten Basis. Netto-Hydratation und TA werden wie in F007/F008 berechnet.

<!--
Rechenbeispiel für die Kriterien, feste Katalogwerte laut Frage 1:
Weizen 550 = 1,00, Dinkel 630 = 0,92, Roggen 1150 = 1,15, Manitoba = 1,25.
Referenzrezept F010 (Basis: Gesamtmehl 1000 g): Weizen 550 80 % = 800 g, Roggen 1150 20 % = 200 g,
Wasser 70 % = 700 g, Starter 20 % = 200 g (100 %), Salz 2 % = 20 g.
Vorher: 800 × 1,00 + 200 × 1,15 = 1030. Weizen 550 -> Dinkel 630: 800 × 0,92 + 200 × 1,15 = 966.
Wasser: 70 % × 966 / 1030 = 65,6505 % -> Anzeige 65,7 %, 656,50 g -> Anzeige 657 g.
Netto-Hydratation = (656,50 + 100) / (1000 + 100) = 68,77 % -> 68,8 %, TA 168,8.
Basis Ziel-Teiggewicht 1920 g: Prozentsumme 187,6505 -> Gesamtmehl 1023,18 g, Wasser 671,72 g -> 672 g.
-->

## Ziel
Im Rechner wählt man für jedes Mehl einen Mehltyp aus einem festen Katalog. Tauscht man einen Mehltyp aus, passt die App die Wassermenge automatisch so an, dass die Teigkonsistenz gleich bleibt. Wer das nicht möchte, schaltet die Anpassung ab.

## Akzeptanzkriterien

### AC-1: Auswahl „Mehltyp“ je Mehlzeile
- **Angenommen** die Person öffnet `/calculator` ohne gemerkten Stand (Referenzrezept aus F010)
- **Wenn** sie die Auswahl „Mehltyp“ der ersten Mehlzeile öffnet
- **Dann** zeigt jede Mehlzeile statt des Namensfelds „Name“ eine Auswahl „Mehltyp“. Die erste Mehlzeile steht auf „Weizen 550“, die zweite auf „Roggen 1150“. Die Optionen sind nach Getreide gruppiert, mit sichtbaren Gruppenüberschriften, in dieser Reihenfolge: Gruppe „Weizen“ („Weizen 405“, „Weizen 550“, „Weizen 1050“, „Weizen Vollkorn“), Gruppe „Dinkel“ („Dinkel 630“, „Dinkel 1050“, „Dinkel Vollkorn“), Gruppe „Roggen“ („Roggen 815“, „Roggen 997“, „Roggen 1150“, „Roggen 1370“, „Roggen Vollkorn“), Gruppe „Sonderfälle“ („Manitoba“, „Tipo 00 (Pizzamehl)“), danach „Sonstiges Mehl“. Die Auswahl ist per Tab erreichbar und mit Pfeiltasten bedienbar, auch ohne Anmeldung und ohne Internetverbindung. Der Button „Entfernen“ trägt den Mehltyp im zugänglichen Namen (z. B. „Roggen 1150 entfernen“).

### AC-2: Neues Mehl startet mit Weizen 550
- **Angenommen** das Referenzrezept bei „Basis: Gesamtmehl“ 1000 g
- **Wenn** sie auf „Mehl hinzufügen“ klickt
- **Dann** erscheint am Ende der Mehle eine neue Zeile mit „Mehltyp“ „Weizen 550“ und 0 % / 0 g, der Fokus liegt auf deren Auswahl „Mehltyp“, und die Wassermenge bleibt bei 70,0 % / 700 g.

### AC-3: Schalter für die automatische Anpassung
- **Angenommen** die Person öffnet `/calculator` ohne gemerkten Stand
- **Wenn** sie den Hydratations-Rechner betrachtet und den Schalter per Tab ansteuert
- **Dann** sieht sie den Schalter „Wassermenge bei Mehlwechsel automatisch an Konsistenz anpassen (Empfehlung)“ im eingeschalteten Zustand. Er lässt sich per Klick und per Leertaste umschalten; sein Zustand (ein/aus) wird Screenreadern angesagt. Umschalten allein ändert keine Gramm- oder Prozentwerte.

### AC-4: Mehlwechsel passt das Wasser an (Schalter ein)
- **Angenommen** das Referenzrezept bei „Basis: Gesamtmehl“ 1000 g, der Schalter ist eingeschaltet
- **Wenn** sie in der ersten Mehlzeile „Mehltyp“ von „Weizen 550“ auf „Dinkel 630“ ändert
- **Dann** zeigt Wasser ohne weiteren Klick 65,7 % und 657 g, „Netto-Hydratation“ zeigt 68,8 % und „Teigausbeute (TA)“ 168,8. Gramm und Prozent beider Mehle, Starter, Salz und „Gesamtmehl (g)“ (1000) bleiben unverändert.

### AC-5: Rückwechsel stellt die ursprüngliche Wassermenge wieder her
- **Angenommen** der Zustand nach AC-4 (Dinkel 630, Wasser 65,7 % / 657 g), Schalter eingeschaltet
- **Wenn** sie „Mehltyp“ der ersten Mehlzeile wieder auf „Weizen 550“ ändert
- **Dann** zeigt Wasser wieder 70,0 % und 700 g, „Netto-Hydratation“ 72,7 % und TA 172,7. Hin- und Rückwechsel über beliebig viele Mehltypen ohne andere Eingaben dazwischen führen auf denselben Wert zurück, ohne Rundungsdrift.

### AC-6: Mehlwechsel ohne Anpassung (Schalter aus)
- **Angenommen** das Referenzrezept bei „Basis: Gesamtmehl“ 1000 g, der Schalter ist ausgeschaltet
- **Wenn** sie „Mehltyp“ der ersten Mehlzeile von „Weizen 550“ auf „Dinkel 630“ ändert
- **Dann** bleibt Wasser bei 70,0 % / 700 g, „Netto-Hydratation“ bei 72,7 % und TA bei 172,7. Wird der Schalter danach eingeschaltet, ändert sich die Wassermenge nicht nachträglich; erst der nächste Mehlwechsel wird angepasst.

### AC-7: Mehlwechsel bei Basis Ziel-Teiggewicht
- **Angenommen** das Referenzrezept, der Umschalter steht auf „Basis: Ziel-Teiggewicht“ mit 1920 g, der Schalter ist eingeschaltet
- **Wenn** sie „Mehltyp“ der ersten Mehlzeile von „Weizen 550“ auf „Dinkel 630“ ändert
- **Dann** bleibt „Ziel-Teiggewicht (g)“ bei 1920, Wasser zeigt 65,7 % und 672 g, „Netto-Hydratation“ 68,8 %. Die Prozentwerte von Mehlen, Starter und Salz bleiben unverändert, ihre Grammwerte werden aus dem Ziel-Teiggewicht neu berechnet.

### AC-8: Keine Anpassung ohne Mehlmenge
- **Angenommen** „Basis: Gesamtmehl“ steht auf 0 (Meldung „Die Mehlbasis muss größer als 0 g sein.“ sichtbar) oder alle Mehlzeilen stehen auf 0 g, der Schalter ist eingeschaltet
- **Wenn** sie den „Mehltyp“ einer Mehlzeile ändert
- **Dann** bleiben Gramm- und Prozentwert des Wassers unverändert, es erscheint keine zusätzliche Fehlermeldung, und die neue Auswahl wird übernommen.

### AC-9: Mehltyp und Schalter werden gemerkt
- **Angenommen** die Person hat in der ersten Mehlzeile „Dinkel 630“ gewählt und den Schalter ausgeschaltet
- **Wenn** sie auf „Lokal merken“ klickt und `/calculator` später auf demselben Gerät im selben Browser erneut öffnet
- **Dann** steht die erste Mehlzeile wieder auf „Dinkel 630“ und der Schalter ist ausgeschaltet. Beim „Als Rezept speichern“ wird für jede Mehlzeile der gewählte Mehltyp als Zutatenname gespeichert (z. B. „Dinkel 630“).

### AC-10: Sonstiges Mehl mit freiem Namen
- **Angenommen** das Referenzrezept bei „Basis: Gesamtmehl“ 1000 g, der Schalter ist eingeschaltet
- **Wenn** sie in der ersten Mehlzeile „Mehltyp“ von „Weizen 550“ auf „Sonstiges Mehl“ ändert und in das dann erscheinende Feld „Name“ derselben Zeile „Emmer“ eingibt
- **Dann** bleibt Wasser bei 70,0 % / 700 g (Faktor 1,00), der Button „Entfernen“ heißt „Emmer entfernen“ (bei leerem Namen „Sonstiges Mehl entfernen“), und beim „Als Rezept speichern“ wird „Emmer“ als Zutatenname gespeichert (bei leerem Namen „Sonstiges Mehl“). Wählt sie danach wieder einen Katalog-Mehltyp, verschwindet das Feld „Name“. Für alle anderen Mehltypen gibt es kein Feld „Name“.

### AC-11: Ältere gemerkte Stände mit freien Mehlnamen
- **Angenommen** auf dem Gerät liegt ein mit F010 gemerkter Stand, dessen vier Mehlzeilen die freien Namen „ weizenmehl “, „ROGGENMEHL“, „dinkel 630“ und „Ruchmehl“ tragen
- **Wenn** sie `/calculator` öffnet
- **Dann** stehen die Mehlzeilen in dieser Reihenfolge auf „Weizen 550“, „Roggen 1150“ (wie im Referenzrezept, Frage 6), „Dinkel 630“ (Name entspricht einem Katalogeintrag) und „Sonstiges Mehl“ mit dem Namen „Ruchmehl“. Der Abgleich ignoriert Groß-/Kleinschreibung und Leerzeichen am Anfang und Ende. Gramm- und Prozentwerte aller Zeilen sowie die Wassermenge bleiben wie gemerkt, und der Schalter ist eingeschaltet.

## UI & Barrierefreiheit
- Die Auswahl „Mehltyp“ hat ein sichtbares Label und ersetzt bei Mehlzeilen das Feld „Name“ (Ausnahme: „Sonstiges Mehl“ zeigt zusätzlich ein Feld „Name“, AC-10); Zeilen für Salz und Sonstiges behalten Namensfeld und Typauswahl wie in F010.
- Die Gruppen der Auswahl („Weizen“, „Dinkel“, „Roggen“, „Sonderfälle“) sind für Screenreader als Gruppen erkennbar.
- Der Schalter steht im Hydratations-Rechner oberhalb der Zutatenliste, hat ein sichtbares Label mit genau dem Text aus AC-3 und ist als Schalter (ein/aus) für Screenreader erkennbar.
- Die automatische Wasseranpassung erfolgt ohne Bestätigungsdialog; die Kennzahlen werden wie in F010 nicht live vorgelesen.
- Tab-Reihenfolge: Basis-Umschalter, Basisfeld, Schalter, Zutatenliste von oben nach unten.
- Ab 320 px Breite ohne horizontales Scrollen nutzbar; Hell- und Dunkelmodus wie die bestehenden Seiten.
- Anzeige im deutschen Zahlenformat, Rundung wie in F010 (Gramm ganze Gramm, Prozent eine Nachkommastelle).

## Nicht im Scope
- Anzeige oder Warnungen zur Knet-Toleranz und Anzeige der Hinweistexte (z. B. „Dinkel überknetet schnell“, Tipo-00-Hinweis); die Werte werden nur im Katalog hinterlegt
- DB-Tabelle `flour_types`, Seed-Daten oder Migration; der Katalog liegt nur in der App
- Hartweizen und Urgetreide (Emmer, Einkorn usw. nur über „Sonstiges Mehl“)
- Eigene, von Nutzern angelegte oder bearbeitete Mehltypen
- Berücksichtigung des Mehls im Starter bei der Wasseranpassung
- Anpassung des Wassers beim Hinzufügen, Entfernen oder Ändern der Menge eines Mehls; angepasst wird nur beim Wechsel des Mehltyps
- Änderungen an Netto-Hydratation, TA oder DDT-Rechenregeln aus F007/F008/F009
- Laden oder Bearbeiten gespeicherter Rezepte

## Offene Fragen
- [x] 1. Welche Mehltypen und Absorptionsfaktoren enthält der Katalog? → Gruppiert: Weizen (405, 550, 1050, Vollkorn), Dinkel (630, 1050, Vollkorn), Roggen (815, 997, 1150, 1370, Vollkorn), Sonderfälle (Manitoba, Tipo 00 (Pizzamehl)), Sonstiges Mehl. Fest: Weizen 550 = 1,00, Weizen Vollkorn = 1,15 (nachträgliche Nutzervorgabe), Dinkel 630 = 0,92, Roggen 1150 = 1,15, Manitoba = 1,25, Sonstiges Mehl = 1,00. Übrige Faktoren schlägt der Plan als Richtwerte vor, der Nutzer bestätigt sie im Plan. Tipo 00: Faktor nahe 1,00 plus Hinweis, dass der Wasserbedarf je nach Packung (Kleberstärke) abweicht. Hartweizen und Urgetreide nicht in diesem Ticket (AC-1).
- [x] 2. Welche Knet-Toleranz-Werte und in welcher Form? → Drei Stufen „niedrig“, „mittel“, „hoch“ plus optionaler Hinweistext; Weizen 550 mittel, Dinkel 630 niedrig („Dinkel überknetet schnell“), Roggen 1150 niedrig, Manitoba hoch. Übrige Mehle schlägt der Plan vor.
- [x] 3. Wie wird das Wasser angepasst? → Proportional: Wasser-Bäckerprozent × (Summe Gramm × Faktor nachher) / (Summe Gramm × Faktor vorher), nur über Mehlzeilen ohne Starter-Mehl (AC-4).
- [x] 4. Wo liegt der Katalog? → Nur fest in der App als typisierte Konstante wie `FRICTION_PRESETS`. Keine DB-Tabelle `flour_types`, keine Migration, keine Neon-Abnahme in diesem Ticket.
- [x] 5. Entfällt das freie Namensfeld bei Mehlen ganz? → Nein: Eintrag „Sonstiges Mehl“ mit Faktor 1,00 und freiem Namen. Für alle anderen Mehltypen ersetzt „Mehltyp“ das Feld „Name“ (AC-1, AC-10).
- [x] 6. Welchen Mehltyp bekommt eine neue Mehlzeile, und wie werden die Startmehle des Referenzrezepts zugeordnet? → Neue Zeile „Weizen 550“ (AC-2); „Weizenmehl“ wird zu „Weizen 550“, „Roggenmehl“ zu „Roggen 1150“.
- [x] 7. Was passiert mit früher lokal gemerkten Ständen (F010) mit freien Mehlnamen? → „Weizenmehl“ wird zu „Weizen 550“, „Roggenmehl“ zu „Roggen 1150“ (wie Frage 6). Name entspricht einem Katalogeintrag: dieser Mehltyp. Sonst „Sonstiges Mehl“ mit dem bisherigen Namen. Abgleich ohne Beachtung von Groß-/Kleinschreibung und Leerzeichen am Rand. Gramm und Prozent bleiben (AC-11).
- [x] 8. Startzustand und Speicherung des Schalters? → Standardmäßig eingeschaltet, Zustand wird mit „Lokal merken“ gespeichert (AC-9), aber nicht im Konto-Rezept.
- [x] 9. Wie wird der Mehltyp im Konto-Rezept gespeichert? → Als Zutatenname (z. B. „Dinkel 630“, bei „Sonstiges Mehl“ der freie Name), ohne Änderung des Rezept-Datenmodells aus F006 (AC-9, AC-10).
- [x] 10. Verhalten bei „Basis: Ziel-Teiggewicht“? → Ziel-Teiggewicht bleibt fest, nur das Wasser-Prozent wird angepasst, alle Grammwerte folgen daraus (AC-7).
- [x] 11. Soll nach einer automatischen Anpassung ein Hinweis erscheinen? → Nein in diesem Ticket, die Wasserfelder zeigen die Änderung direkt.

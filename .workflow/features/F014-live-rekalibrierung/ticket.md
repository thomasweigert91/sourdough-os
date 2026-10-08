# F014: Live-Rekalibrierung bei Planabweichungen und Verzögerungen

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-08

## Kontext
Seit F012/F013 erzeugt Sourdough OS mit dem Rückwärts-Planer einen Ablaufplan vom Zielzeitpunkt (essfertig) rückwärts: Levain ansetzen, Hauptteig mischen & Autolyse, Stockgare mit Dehnen & Falten, Formgebung & Bench Rest, Stückgare / Kaltgare im Kühlschrank, Ofen vorheizen, Backen, Auskühlen. Der Plan ist starr. Brotbacken läuft aber selten nach Laboruhr: Die Stockgare braucht länger, man kommt später nach Hause, ein Schritt wird früher oder später erledigt als geplant. Heute müsste man den ganzen Plan von Hand neu rechnen und merkt erst spät, dass das Backen dadurch in die Nacht rutscht.

Stand im Code (2026-10-08): Es gibt nur die reine Funktion `generateBackwardSchedule`. Es gibt keine Ansicht für Backpläne, keine Speicherung und keine Server-Action. Dieses Ticket liefert deshalb wie F012 nur die Rechengrundlage (entschieden, Offene Frage 1). Button, Timeline-Ansicht und Speicherung folgen als eigene Tickets (siehe „Nicht im Scope“).

Vom Nutzer vorgegeben:
- Funktion `recalibrateSchedule(timeline: ScheduleTimeline, stepId: string, completedAt: Date)`, die die Abweichung berechnet und die Folgeschritte neu legt.
- Strategien: Einfaches Verschieben, Kaltgare-Kompensation (Standard), Kühlschrank-Notbremse („Teig zwischenparken“).
- Konflikt- und Nachtwarnung, wenn Backen oder Vorheizen ins Schlaf-Fenster fällt, mit Lösungsvorschlag „Kaltgare bis morgen früh verlängern“.

Begriffe (verbindlich für dieses Ticket, zusätzlich zu den Begriffen aus F012):
- **Geplantes Ende**: Ende eines Schritts im aktuellen Plan (bei bereits rekalibrierten Plänen der zuletzt berechnete Wert). Bei einem Dehnen-&-Falten-Durchgang ist es sein geplanter Zeitpunkt.
- **Abschlusszeitpunkt**: Zeitpunkt, zu dem die Person den Schritt als erledigt markiert („jetzt“).
- **Abweichung (Δt)**: Abschlusszeitpunkt minus geplantes Ende. Δt > 0 = verspätet, Δt < 0 = zu früh.
- **Erledigter Schritt**: endet im neuen Plan zum Abschlusszeitpunkt und ist als erledigt markiert. Schritte davor bleiben unverändert. Erledigt werden können alle Phasen und jeder Dehnen-&-Falten-Durchgang einzeln.
- **Mindest-Kaltgare / Max-Kaltgare**: einstellbar über die Planer-Konfiguration, Standard 8 Std. (480 Min.) bzw. 48 Std. (2 880 Min.).
- **Standardstrategie (Mischform)**: Die Kaltgare fängt die Abweichung auf, bei Verspätung höchstens bis zur Mindest-Kaltgare, bei zu früh höchstens bis zur Max-Kaltgare. Der Rest verschiebt alle Folgeschritte und den Zielzeitpunkt. Liegt die Kaltgare des Plans schon unter der Mindest-Kaltgare, wird nur verschoben. Gilt für jeden Schritt vor der Kaltgare.
- **Angewandte Strategie**: Das Ergebnis meldet genau einen dieser Werte: „Kompensation“, „Kompensation + Verschiebung“, „Verschiebung“ oder „Keine“ (Δt = 0 oder die Abweichung wirkt sich nicht auf die Phasen nach dem erledigten Schritt aus, z. B. AC-7). Dazu meldet es, um wie viele Minuten sich der Zielzeitpunkt verschoben hat.
- **Jetzt**: bei der Rekalibrierung der Abschlusszeitpunkt, beim Parken der Zeitpunkt des Herausnehmens.
- **Nie vor jetzt**: Kein noch offener Schritt der Hauptkette beginnt im neuen Plan vor „jetzt“. Ausnahme ist das Ofen vorheizen (parallel zur Hauptkette): Liegt sein Beginn vor „jetzt“, bleiben die Zeiten unverändert und die Phase wird als „sofort starten“ gekennzeichnet (AC-14).
- **Schlaf-Prüfung**: Nach jeder Neuberechnung (auch nach Kompensation, Verlängerung und übernommenem Lösungsvorschlag) werden die Schlaf-Warnungen aus F012 und die Konfliktwarnungen neu bestimmt.
- **Konfliktwarnung**: entsteht, wenn der Beginn von Backen oder Ofen vorheizen im Schlaf-Fenster liegt (Standard 23:00 bis 07:00 Uhr, Europe/Berlin).

## Ziel
Wer einen Schritt früher oder später erledigt als geplant, bekommt sofort einen neuen, in sich stimmigen Plan und erfährt, welche Strategie angewandt wurde. Standardmäßig fängt die Kaltgare die Abweichung innerhalb ihrer Grenzen auf, sodass das Brot möglichst zur gewünschten Zeit fertig ist. Alternativ verschiebt sich der ganze Rest des Plans, oder der Teig wird im Kühlschrank geparkt. Fällt Backen oder Vorheizen dadurch in die Nacht, enthält der Plan eine Warnung und, wo möglich, einen konkreten Lösungsvorschlag.

## Akzeptanzkriterien
<!--
Referenzplan = Plan aus F012 AC-1: Standardwerte, Schlaf-Fenster 23:00–07:00, Europe/Berlin, Mindest-/Max-Kaltgare 8/48 Std., Zielzeitpunkt So 11.10.2026 12:00:
Levain Sa 08:15–13:15, Mischen & Autolyse 13:15–14:15, Stockgare 14:15–18:45 (Durchgänge 14:45, 15:15, 15:45, 16:15),
Formgebung 18:45–19:15, Kaltgare Sa 19:15–So 09:15 (14 Std.), Vorheizen So 08:15–09:15, Backen 09:15–10:00, Auskühlen 10:00–12:00.
Abendplan = Plan aus F012 AC-4 (Kaltgare 30 Min.), Zielzeitpunkt So 11.10.2026 22:00:
Levain 07:45–12:45, Mischen & Autolyse 12:45–13:45, Stockgare 13:45–18:15, Formgebung 18:15–18:45, Kaltgare 18:45–19:15,
Vorheizen 18:15–19:15, Backen 19:15–20:00, Auskühlen 20:00–22:00.
-->

### AC-1: Kaltgare fängt eine verspätete Stockgare auf
- **Angenommen** der Referenzplan und die Standardstrategie
- **Wenn** die Stockgare um Sa 19:45 Uhr als erledigt markiert wird (60 Min. nach dem geplanten Ende 18:45)
- **Dann** gilt im neuen Plan: Stockgare 14:15 bis 19:45 (erledigt), Formgebung & Bench Rest 19:45 bis 20:15, Kaltgare Sa 20:15 bis So 09:15 (13 Std.), Ofen vorheizen So 08:15 bis 09:15, Backen 09:15 bis 10:00, Auskühlen 10:00 bis 12:00. Levain und Mischen & Autolyse bleiben unverändert. Angewandte Strategie „Kompensation“, Verschiebung des Zielzeitpunkts 0 Min.

### AC-2: Kompensation bis zur Mindest-Kaltgare, Rest wird verschoben
- **Angenommen** der Referenzplan und die Standardstrategie
- **Wenn** die Stockgare um So 01:45 Uhr als erledigt markiert wird (7 Std. Verspätung, die Kaltgare kann nur um 6 Std. gekürzt werden)
- **Dann** gilt im neuen Plan: Formgebung & Bench Rest So 01:45 bis 02:15, Kaltgare 02:15 bis 10:15 (genau 8 Std.), Ofen vorheizen 09:15 bis 10:15, Backen 10:15 bis 11:00, Auskühlen 11:00 bis 13:00. Angewandte Strategie „Kompensation + Verschiebung“, Verschiebung des Zielzeitpunkts +60 Min. (So 13:00 Uhr). Die Formgebung trägt nach der Schlaf-Prüfung eine Schlaf-Warnung (Beginn 01:45), es gibt keine Konfliktwarnung.

### AC-3: Einfaches Verschieben als gewählte Strategie
- **Angenommen** der Referenzplan und die Strategie „Einfaches Verschieben“
- **Wenn** Mischen & Autolyse um Sa 14:45 Uhr als erledigt markiert wird (30 Min. Verspätung)
- **Dann** verschieben sich alle Folgeschritte um 30 Min.: Stockgare 14:45 bis 19:15 (Durchgänge 15:15, 15:45, 16:15, 16:45), Formgebung & Bench Rest 19:15 bis 19:45, Kaltgare Sa 19:45 bis So 09:45 (weiter 14 Std.), Ofen vorheizen So 08:45 bis 09:45, Backen 09:45 bis 10:30, Auskühlen 10:30 bis 12:30. Angewandte Strategie „Verschiebung“, Verschiebung des Zielzeitpunkts +30 Min. (So 12:30 Uhr).

### AC-4: Kühlschrank-Notbremse in der Stockgare
- **Angenommen** der Referenzplan, die Standardstrategie, alle vier Dehnen-&-Falten-Durchgänge sind erledigt und die Stockgare läuft seit Sa 14:15 Uhr
- **Wenn** der Teig um Sa 16:30 Uhr geparkt (135 von 270 Min. Stockgare vergangen) und um 20:30 Uhr wieder herausgenommen wird
- **Dann** enthält der Plan einen eigenen Abschnitt „Teig im Kühlschrank geparkt“ von 16:30 bis 20:30 Uhr. Die 4 Std. im Kühlschrank zählen mit dem festen Gärungsfaktor 0,1 als 24 Min. Stockgare, die restliche Stockgare dauert 111 Min. und endet um 22:21 Uhr. Danach: Formgebung & Bench Rest 22:21 bis 22:51, Kaltgare Sa 22:51 bis So 09:15 (10 Std. 24 Min.), Ofen vorheizen So 08:15 bis 09:15, Backen 09:15 bis 10:00, Auskühlen 10:00 bis 12:00. Angewandte Strategie „Kompensation“, Verschiebung des Zielzeitpunkts 0 Min. Parken ist nur während der Stockgare möglich.

### AC-5: Zu früh erledigt, Kaltgare wird verlängert
- **Angenommen** der Referenzplan und die Standardstrategie
- **Wenn** die Stockgare um Sa 18:15 Uhr als erledigt markiert wird (30 Min. zu früh)
- **Dann** gilt im neuen Plan: Formgebung & Bench Rest 18:15 bis 18:45, Kaltgare Sa 18:45 bis So 09:15 (14 Std. 30 Min.), Ofen vorheizen So 08:15 bis 09:15, Backen 09:15 bis 10:00, Auskühlen 10:00 bis 12:00. Kein offener Schritt beginnt vor 18:15 Uhr. Angewandte Strategie „Kompensation“, Verschiebung des Zielzeitpunkts 0 Min.

### AC-6: Zu früh erledigt, Verlängerung nur bis zur Max-Kaltgare
- **Angenommen** der Referenzplan mit Max-Kaltgare 14 Std. 15 Min. und die Standardstrategie
- **Wenn** die Stockgare um Sa 18:15 Uhr als erledigt markiert wird (30 Min. zu früh)
- **Dann** gilt im neuen Plan: Formgebung & Bench Rest 18:15 bis 18:45, Kaltgare Sa 18:45 bis So 09:00 (genau 14 Std. 15 Min.), Ofen vorheizen So 08:00 bis 09:00, Backen 09:00 bis 09:45, Auskühlen 09:45 bis 11:45. Angewandte Strategie „Kompensation + Verschiebung“, Verschiebung des Zielzeitpunkts −15 Min. (So 11:45 Uhr).

### AC-7: Verspäteter Dehnen-&-Falten-Durchgang verschiebt nur die folgenden Durchgänge
- **Angenommen** der Referenzplan und die Standardstrategie
- **Wenn** der dritte Durchgang (geplant 15:45) um Sa 16:00 Uhr als erledigt markiert wird
- **Dann** liegt der vierte Durchgang um 16:30 Uhr (ein Abstand von 30 Min. nach dem dritten). Die Stockgare endet weiter um 18:45 Uhr, alle anderen Schritte und der Zielzeitpunkt bleiben unverändert. Angewandte Strategie „Keine“, Verschiebung des Zielzeitpunkts 0 Min.

### AC-8: Stockgare endet frühestens 30 Min. nach dem letzten Durchgang
- **Angenommen** der Referenzplan und die Standardstrategie
- **Wenn** der vierte und letzte Durchgang (geplant 16:15) um Sa 18:30 Uhr als erledigt markiert wird
- **Dann** endet die Stockgare um 19:00 Uhr (30 Min. nach dem letzten Durchgang statt 18:45). Danach: Formgebung & Bench Rest 19:00 bis 19:30, Kaltgare Sa 19:30 bis So 09:15 (13 Std. 45 Min.), Ofen vorheizen So 08:15 bis 09:15, Backen 09:15 bis 10:00, Auskühlen 10:00 bis 12:00. Angewandte Strategie „Kompensation“, Verschiebung des Zielzeitpunkts 0 Min.

### AC-9: Konfliktwarnung mit Lösungsvorschlag
- **Angenommen** der Abendplan und die Strategie „Einfaches Verschieben“
- **Wenn** Mischen & Autolyse um So 17:45 Uhr als erledigt markiert wird (4 Std. Verspätung)
- **Dann** gilt im neuen Plan: Stockgare 17:45 bis 22:15, Formgebung & Bench Rest 22:15 bis 22:45, Kaltgare 22:45 bis 23:15, Ofen vorheizen 22:15 bis 23:15, Backen So 23:15 bis Mo 00:00, Auskühlen Mo 00:00 bis 02:00. Der Plan enthält genau eine Konfliktwarnung, und zwar für Backen (Beginn 23:15 im Schlaf-Fenster). Vorheizen beginnt um 22:15 und löst keine aus. Die Warnung enthält den Lösungsvorschlag „Kaltgare bis morgen früh verlängern“ mit Kaltgare 9 Std. 15 Min., Backen Mo 12.10.2026 08:00 Uhr und essfertig Mo 10:45 Uhr.

### AC-10: Lösungsvorschlag übernehmen
- **Angenommen** der neue Plan aus AC-9 mit seiner Konfliktwarnung
- **Wenn** der Lösungsvorschlag übernommen wird
- **Dann** gilt: Kaltgare So 22:45 bis Mo 08:00 (9 Std. 15 Min.), Ofen vorheizen Mo 07:00 bis 08:00, Backen 08:00 bis 08:45, Auskühlen 08:45 bis 10:45. Vorheizen beginnt genau zum Ende des Schlaf-Fensters. Nach der Schlaf-Prüfung enthält der Plan keine Konfliktwarnung und keine Schlaf-Warnung mehr, der Zielzeitpunkt ist Mo 10:45 Uhr.

### AC-11: Konfliktwarnung ohne Lösungsvorschlag über der Max-Kaltgare
- **Angenommen** der Abendplan mit Max-Kaltgare 9 Std. und die Strategie „Einfaches Verschieben“
- **Wenn** Mischen & Autolyse um So 17:45 Uhr als erledigt markiert wird
- **Dann** entsteht derselbe Plan wie in AC-9 mit der Konfliktwarnung für Backen, aber ohne Lösungsvorschlag, weil die nötige Kaltgare von 9 Std. 15 Min. die Max-Kaltgare überschreitet.

### AC-12: Pünktlich erledigt ändert nichts außer dem Status
- **Angenommen** der Referenzplan
- **Wenn** die Stockgare genau um Sa 18:45 Uhr als erledigt markiert wird (Δt = 0)
- **Dann** sind alle Zeiten identisch mit dem Referenzplan, die Stockgare ist als erledigt markiert. Angewandte Strategie „Keine“, Verschiebung des Zielzeitpunkts 0 Min., keine Konfliktwarnung.

### AC-13: Ungültige Eingaben
- **Angenommen** der Referenzplan
- **Wenn** ein Schritt markiert wird, der im Plan nicht vorkommt, oder der Abschlusszeitpunkt kein gültiges Datum ist, oder der Schritt bereits erledigt ist, oder die Mindest-Kaltgare länger als die Max-Kaltgare eingestellt ist
- **Dann** entsteht kein neuer Plan, der bisherige bleibt unverändert, und die Funktion meldet eine feste deutsche Meldung: „Der Schritt ist im Plan nicht vorhanden.“, „Der Abschlusszeitpunkt muss ein gültiges Datum sein.“, „Der Schritt ist bereits erledigt.“ bzw. „Die Mindest-Kaltgare darf nicht länger als die Max-Kaltgare sein.“

### AC-14: Vorheizen mit Beginn vor jetzt wird als „sofort starten“ gekennzeichnet
- **Angenommen** der Abendplan (Ofen vorheizen So 18:15 bis 19:15, noch offen) und die Standardstrategie
- **Wenn** die Formgebung genau um So 18:45 Uhr als erledigt markiert wird
- **Dann** sind alle Zeiten identisch mit dem Abendplan, angewandte Strategie „Keine“, Verschiebung des Zielzeitpunkts 0 Min. Die Phase Ofen vorheizen (Beginn 18:15, vor „jetzt“) ist als „sofort starten“ gekennzeichnet, und das Ergebnis meldet zusätzlich gesamthaft, dass ein Schritt sofort gestartet werden muss. Gegenprobe: Im Referenzplan mit pünktlich erledigter Stockgare (AC-12) beginnt das Vorheizen erst So 08:15 Uhr; dort gibt es weder die Kennzeichnung noch die Gesamtmeldung. Beim Parken (AC-4) gilt als „jetzt“ der Zeitpunkt des Herausnehmens.

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket. Neuer Plan, angewandte Strategie, Verschiebung des Zielzeitpunkts, Konfliktwarnungen und Lösungsvorschläge sind so aufgebaut, dass eine spätere Timeline-Ansicht sie direkt anzeigen kann. Die Meldungen aus AC-13 sind feste deutsche Texte.

## Nicht im Scope
- Folgeticket: Button „Schritt jetzt erledigt“ an jedem Timeline-Schritt und die Timeline-Ansicht selbst (inkl. Anzeige von Warnung, Lösungsvorschlag und angewandter Strategie, Tastaturbedienung, 320 px, Dunkelmodus)
- Folgeticket: Speicherung (Schema `baking_schedules`/`schedule_steps` mit Neon-Abnahme) und Server-Action
- Einstellung des Schlaf-Fensters, der Mindest- und Max-Kaltgare in der Oberfläche (Standard bleibt 23:00 bis 07:00 Uhr)
- Temperatur-Ausgleich (wärmere Gare, DDT-Anpassung) als Lösungsstrategie
- Weitere Lösungsvorschläge außer „Kaltgare bis morgen früh verlängern“; ohne Kaltgare im Plan gibt es nur die Warnung
- Parken außerhalb der Stockgare, Gärungsfaktor abhängig von der Kühlschranktemperatur
- Automatische Erkennung von Abweichungen (Timer, Sensoren, Benachrichtigungen, Erinnerungen)
- Rückgängig machen eines „erledigt“
- Hefeteige und andere Vorteige als Levain

## Offene Fragen
- [x] 1. Umfang: Nur Rechen-Engine wie F012? → Ja. Button, Timeline-Ansicht und Speicherung als Folgetickets.
- [x] 2. Welche Strategie gilt ohne Wahl? → Mischform: erst bis zur Mindest-Kaltgare kompensieren, Rest verschieben; das Ergebnis meldet die angewandte Strategie (AC-1, AC-2, AC-3).
- [x] 3. Gilt die Kaltgare-Kompensation nur bei verspäteter Stockgare? → Bei jedem Schritt vor der Kaltgare.
- [x] 4. Mindest-Kaltgare fest oder einstellbar? → Einstellbar, Standard 8 Std., zusätzlich einstellbare Max-Kaltgare (Standard 48 Std.); liegt die Kaltgare schon unter dem Minimum, wird verschoben.
- [x] 5. Gärungsfaktor bei der Notbremse? → Fest 0,1 ohne Temperatur-Eingabe (AC-4).
- [x] 6. Welche Schritte lassen sich parken? → Nur die Stockgare.
- [x] 7. Zu früh erledigter Schritt? → Kaltgare wird verlängert, nur bis zur Max-Kaltgare, kein Schritt beginnt vor „jetzt“; Schlaf-Prüfung nach jeder Neuberechnung (AC-5, AC-6).
- [x] 8. Schlaf-Fenster? → Standard des Planers 23:00 bis 07:00 Uhr bleibt, Einstellung in der Oberfläche als Folgeticket.
- [x] 9. Temperatur-Ausgleich in diesem Ticket? → Nein, Folgeticket.
- [x] 10. Lösungsvorschläge bei der Nachtwarnung? → Nur „Kaltgare bis morgen früh verlängern“ und nur, wenn die verlängerte Kaltgare die Max-Kaltgare nicht überschreitet, sonst nur Warnung (AC-9, AC-11).
- [x] 11. „Erledigt“ auch für einzelne Durchgänge? → Ja; ein verspäteter Durchgang verschiebt nur die folgenden, die Stockgare endet frühestens 30 Min. nach dem letzten Durchgang (AC-7, AC-8).

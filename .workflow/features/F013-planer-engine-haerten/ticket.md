# F013: F012b: Planer-Engine härten (Zeitzone, Schlaf-Fenster, Obergrenze, frühester Beginn)

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-04

## Kontext
Intern heißt dieses Ticket „F012b“. Typ: Core Logic, Komplexität: 2 SP.

F012 hat mit `generateBackwardSchedule` (Rückwärts-Planer) die Rechengrundlage für Backpläne geliefert. Ab F014 bekommt die Funktion ihre Werte aus Formularen und einer Server-Action, also aus Eingaben, die Nutzer frei wählen. Das Review zu F012 hat dafür offene Punkte gefunden:

- **#2:** Eine ungültige Zeitzone wirft einen englischen Fehler (RangeError), und das nur, wenn mindestens ein manueller Schritt oder Durchgang auf das Schlaf-Fenster geprüft wird.
- **#3:** Der Startzeitpunkt ist der Beginn der ersten Phase in der Liste, nicht immer der früheste Beginn. Wenn Levain, Mischen, Stockgare und Kaltgare entfallen, beginnt das Vorheizen vor der Formgebung, der Startzeitpunkt zeigt trotzdem auf die Formgebung.
- **#4:** Die Anzahl der Dehnen-&-Falten-Durchgänge hat keine Obergrenze. Eine sehr große Anzahl mit winzigem Abstand passt rechnerisch in die Stockgare und erzeugt dann Durchgänge ohne Ende.
- **#5:** Zwei Randfälle haben keine Tests: Stockgare 0 Min. ohne Durchgänge und ein nur teilweise angegebenes Schlaf-Fenster.
- **#6:** Ohne zweites Argument (Konfiguration) endet ein Aufruf in einem TypeError.

Ungültige Schlaf-Fenster (z. B. Minute 1440 oder 90,5) werden heute ohne Fehler angenommen und liefern stillschweigend falsche Warnungen.

Begriffe, Phasen, Standardwerte und die bestehenden Meldungen gelten wie in F012. Bestehende Meldungen, auf die sich die Reihenfolge in AC-4 bezieht:
- Zielzeitpunkt: „Der Zielzeitpunkt muss ein gültiges Datum sein.“
- Dauern: „Die Dauer einer Phase muss eine Zahl ab 0 sein.“
- Anzahl und Abstand: „Anzahl und Abstand der Dehnen-und-Falten-Durchgänge müssen gültige Zahlen sein.“
- Durchgänge passen nicht: „Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.“

## Ziel
Die Funktion lehnt alle ungültigen Eingaben vor jeder Berechnung mit einer festen deutschen Meldung ab, auch ungültige Zeitzonen und Schlaf-Fenster sowie zu viele Durchgänge. Der Startzeitpunkt ist immer der früheste Beginn aller Phasen. Die Konfiguration darf beim Aufruf fehlen.

## Akzeptanzkriterien
<!--
Referenz-Konfiguration = Standardwerte aus F012 (Dauern 300/60/270/30/840/60/45/120 Min.,
4 Durchgänge à 30 Min., Schlaf-Fenster 23:00–07:00, Zeitzone Europe/Berlin).
Uhrzeiten Ortszeit Europe/Berlin (+02:00), Sa 10.10.2026 / So 11.10.2026.
Test-Tags: F013/AC-n.
-->

### AC-1: Ungültige Zeitzone wird immer abgelehnt
- **Angenommen** es gibt die neue exportierte Meldung `INVALID_TIME_ZONE_MESSAGE` = „Die Zeitzone ist ungültig.“
- **Wenn** ein Plan mit der Zeitzone „Mars/Olympus“, „“ (leerer Text) oder „Europe/Berln“ erzeugt wird, jeweils einmal mit der Referenz-Konfiguration und einmal mit allen manuellen Dauern (Levain, Mischen & Autolyse, Formgebung, Vorheizen, Backen) = 0 und 0 Durchgängen
- **Dann** wirft die Funktion in allen sechs Fällen einen Fehler mit genau dieser Meldung und liefert keinen Plan. Mit den Zeitzonen „Europe/Berlin“, „America/New_York“ und „UTC“ wirft sie in beiden Konfigurationen nicht.
- **Und** eine Zeitzone, die keine Zeichenkette ist (z. B. `null`), wirft ebenfalls genau diese Meldung. Nur eine fehlende Zeitzone (`undefined`) nimmt den Standard Europe/Berlin.

### AC-2: Ungültiges Schlaf-Fenster wird abgelehnt
- **Angenommen** es gibt die neue exportierte Meldung `INVALID_SLEEP_WINDOW_MESSAGE` = „Das Schlaf-Fenster muss aus ganzen Minuten zwischen 0 und 1439 bestehen.“
- **Wenn** ein Plan mit Beginn oder Ende des Schlaf-Fensters -1, 1440, 90.5, NaN oder Infinity erzeugt wird (jeder Wert einmal als Beginn, einmal als Ende, der andere Wert jeweils Standard)
- **Dann** wirft die Funktion in allen zehn Fällen genau diese Meldung. Mit Beginn oder Ende 0 bzw. 1439 sowie mit Beginn gleich Ende (leeres Fenster, z. B. 600 und 600) wirft sie nicht. Beim leeren Fenster trägt kein Schritt eine Schlaf-Warnung.
- **Und** Werte, die keine Zahl sind (z. B. Text „600“ oder `null`), werfen als Beginn oder Ende ebenfalls genau diese Meldung. Nur ein fehlender Wert (`undefined`) nimmt den Standard.

### AC-3: Obergrenze von 20 Dehnen-&-Falten-Durchgängen
- **Angenommen** es gibt die neuen exportierten Konstanten `MAX_STRETCH_AND_FOLD_COUNT` = 20 und `TOO_MANY_STRETCH_AND_FOLDS_MESSAGE` = „Es sind höchstens 20 Dehnen-und-Falten-Durchgänge möglich.“, Stockgare 270 Min.
- **Wenn** ein Plan mit 20 Durchgängen im Abstand von 10 Min., mit 21 Durchgängen bzw. mit 1e9 Durchgängen im Abstand von 1e-7 Min. erzeugt wird
- **Dann** enthält der Plan bei 20 Durchgängen genau 20 Durchgänge. Bei 21 und bei 1e9 Durchgängen wirft die Funktion genau die neue Meldung. Der Fall 1e9 erzeugt keinen einzigen Durchgang und der Test dazu läuft in unter 100 ms.

### AC-4: Feste Reihenfolge der Prüfungen
- **Angenommen** mehrere Eingaben sind gleichzeitig ungültig
- **Wenn** ein Plan erzeugt wird
- **Dann** wirft die Funktion nur die Meldung der ersten fehlgeschlagenen Prüfung in dieser Reihenfolge, bevor irgendetwas berechnet wird:
  1. Zielzeitpunkt
  2. Dauern
  3. Anzahl und Abstand gültig
  4. Obergrenze
  5. Durchgänge passen in die Stockgare
  6. Schlaf-Fenster
  7. Zeitzone

  Beispiele:
  - 21 Durchgänge zusammen mit der Zeitzone „Mars/Olympus“ werfen die Meldung zur Obergrenze.
  - 10 Durchgänge à 30 Min. bei 270 Min. Stockgare zusammen mit Schlaf-Fenster-Beginn 1440 werfen „Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.“
  - Schlaf-Fenster-Beginn 1440 zusammen mit der Zeitzone „Mars/Olympus“ werfen die Meldung zum Schlaf-Fenster.

### AC-5: Startzeitpunkt ist der früheste Beginn
- **Angenommen** Zielzeitpunkt So 11.10.2026 12:00 Uhr, Dauern Levain, Mischen & Autolyse, Stockgare und Kaltgare 0, Formgebung 30, Vorheizen 60, Backen 45, Auskühlen 120 Min., 0 Durchgänge
- **Wenn** der Plan erzeugt wird
- **Dann** ist der Startzeitpunkt So 08:15 Uhr (Beginn Vorheizen), nicht mehr 08:45 Uhr (Beginn Formgebung). Der Plan mit der Referenz-Konfiguration beginnt weiter am Sa 10.10.2026 08:15 Uhr. Ohne Phasen (alle Dauern 0) bleibt der Startzeitpunkt gleich dem Zielzeitpunkt. Die Beschreibung des Startzeitpunkts in der Dokumentation des Ergebnistyps nennt den frühesten Beginn aller Phasen.

### AC-6: Konfiguration darf fehlen
- **Angenommen** der Zielzeitpunkt So 11.10.2026 12:00 Uhr
- **Wenn** ein Plan ohne zweites Argument erzeugt wird
- **Dann** wirft die Funktion nicht, und der Plan ist inhaltlich gleich (Vergleich mit `toEqual`) dem Plan, der mit einer leeren Konfiguration `{}` erzeugt wird.

### AC-7: Bisher ungetestete Randfälle
- **Angenommen** die Referenz-Konfiguration
- **Wenn** ein Plan mit Stockgare 0 Min. und 0 Durchgängen erzeugt wird, bzw. ein Plan mit einem Schlaf-Fenster, in dem nur der Beginn 1320 (22:00 Uhr) angegeben ist
- **Dann** gilt:
  - Stockgare 0 Min. mit 0 Durchgängen wirft nicht. Der Plan enthält keine Phase Stockgare.
  - Beim Schlaf-Fenster nur mit Beginn 22:00 Uhr gilt für das Ende der Standard 07:00 Uhr.
  - Beim Ziel So 15:45 beginnt die Formgebung Sa 22:30 und trägt als einziger Schritt eine Schlaf-Warnung.
  - Beim Ziel So 10:45 beginnen Levain ansetzen (Sa 07:00) und Ofen vorheizen (So 07:00) ohne Warnung. Kein Schritt dieses Plans warnt.

### AC-8: Bestehendes Verhalten bleibt erhalten
- **Angenommen** die F012-Tests in `schedule.test.ts`
- **Wenn** die Tests, die Typprüfung und der Linter laufen
- **Dann** sind alle bestehenden F012-Tests ohne Änderung grün, Typprüfung (tsc) und Linter (eslint) melden keinen Befund, und die neuen F013-Tests sind auch mit der Systemzeitzone UTC (TZ=UTC) grün.

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket. Die festen deutschen Meldungen sind so formuliert, dass eine spätere Formular- oder Server-Action-Schicht (ab F014) sie direkt anzeigen kann.

## Nicht im Scope
- Prüfung „Zielzeitpunkt liegt in der Vergangenheit“: gehört in die Server-Action (F014a), weil die Engine keine aktuelle Uhrzeit kennt
- Zeitzonen-Auswahl oder -Liste in der Oberfläche (F014b oder später)
- Obergrenzen für Dauern einzelner Phasen
- Datenbank, Schema, Speichern (F013a/F013b)

## Offene Fragen
- [x] 1. Sollen Werte des Schlaf-Fensters, die keine Zahl sind (z. B. Text „600“ oder null aus einem Formular), ebenfalls mit der Schlaf-Fenster-Meldung abgelehnt werden? → Ja. Nur ein fehlender Wert (undefined) nimmt den Standard. (in AC-2 ergänzt)
- [x] 2. Soll eine Zeitzone, die keine Zeichenkette ist (z. B. null), mit der Zeitzonen-Meldung abgelehnt werden statt still den Standard Europe/Berlin zu nehmen? → Ja. Nur undefined nimmt den Standard. (in AC-1 ergänzt)
- [x] 3. Was gilt als gültige Zeitzone: nur exakte IANA-Namen oder alles, was die Laufzeitumgebung akzeptiert (z. B. „europe/berlin“, „CET“, „Etc/GMT-2“)? → Alles, was die Laufzeitumgebung akzeptiert, ohne eigene Liste. Getestet werden nur die Beispiele aus AC-1.
- [x] 4. Braucht der Abstand der Durchgänge einen Mindestwert (z. B. 1 Min.), damit 20 Durchgänge nicht praktisch gleichzeitig liegen? → Nein, nicht in diesem Ticket. Die Obergrenze verhindert die Endlos-Erzeugung, sinnvolle Abstände regelt später das Formular.

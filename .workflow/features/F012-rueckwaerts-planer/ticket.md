# F012: Engine für den adaptiven Rückwärts-Planer

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-04

## Kontext
Ein Sauerteigbrot braucht vom Ansetzen des Levains bis zum essfertigen Brot meist mehr als einen Tag. Wer zu einem festen Zeitpunkt frisches Brot haben will (z. B. Sonntagmittag), muss heute von Hand rückwärts rechnen, wann Levain, Mischen, Stockgare, Formgebung, Kaltgare, Vorheizen und Backen beginnen. Dabei fällt oft erst spät auf, dass ein Handgriff wie Dehnen & Falten mitten in der Nacht liegt. Sourdough OS speichert seit F006 Rezepte und rechnet seit F007 bis F011 Hydratation, Wassertemperatur und Mehltypen. Eine Zeitplanung gibt es noch nicht. Dieses Ticket liefert wie F007 und F009 nur die Rechengrundlage, ohne Oberfläche und ohne Speicherung: eine Funktion, die einen Plan rückwärts vom Zielzeitpunkt erzeugt. Das Speichern von Plänen folgt in einem eigenen Ticket (siehe „Nicht im Scope“). Betroffen sind spätere Ansichten wie Backplanung und Rezeptdetail.

Vom Nutzer vorgegeben:
- Reine Funktion `generateBackwardSchedule(targetDate: Date, config: ScheduleConfig): ScheduleTimeline`, die lückenlos vom Zielzeitpunkt rückwärts rechnet und manuelle Schritte im Schlaf-Fenster (Standard 23:00 bis 07:00 Uhr) mit einer Warnung markiert.
- Unit-Tests (vitest) für typische Szenarien, u. a. Sonntagmorgen mit Kaltgare über Nacht.

Phasen in fester Reihenfolge (so erscheinen sie auch im Plan), mit Standarddauern:
1. Levain ansetzen: 5 Std. (wird vor dem Mischen angesetzt)
2. Hauptteig mischen & Autolyse: 60 Min.
3. Stockgare: 4 Std. 30 Min., mit 4 Dehnen-&-Falten-Durchgängen im Abstand von 30 Min.
4. Formgebung & Bench Rest: 30 Min.
5. Stückgare / Kaltgare im Kühlschrank: 14 Std.
6. Ofen vorheizen: 60 Min. (parallel, siehe Begriffe)
7. Backen: 45 Min.
8. Auskühlen: 120 Min.

Jede Dauer, Anzahl und Abstand der Dehnen-&-Falten-Durchgänge, das Schlaf-Fenster und die Zeitzone lassen sich über die Konfiguration überschreiben. Was nicht angegeben ist, nimmt den Standardwert.

Begriffe (verbindlich für dieses Ticket):
- **Zielzeitpunkt**: Ende des Auskühlens, das Brot ist essfertig.
- **Backbeginn**: Beginn der Phase Backen. Wird im Ergebnis als eigener Wert ausgegeben.
- **Startzeitpunkt**: Beginn der ersten Phase des Plans (in der Regel Levain ansetzen). Wird im Ergebnis als eigener Wert ausgegeben.
- **Hauptkette**: alle Phasen außer Ofen vorheizen, also Levain, Mischen & Autolyse, Stockgare, Formgebung & Bench Rest, Kaltgare, Backen und Auskühlen.
- **Lückenlos**: In der Hauptkette endet jede Phase genau zum Beginn der nächsten, die letzte Phase (Auskühlen) endet genau zum Zielzeitpunkt. Eine Phase mit Dauer 0 erscheint nicht im Plan, die Kette schließt sich über sie hinweg.
- **Ofen vorheizen**: gehört nicht zur Hauptkette. Endet genau zum Backbeginn und beginnt die Vorheizdauer davor. Das Vorheizen läuft dabei parallel zur Kaltgare. Ist die Kaltgare kürzer als das Vorheizen oder entfällt sie, beginnt das Vorheizen trotzdem die Vorheizdauer vor dem Backbeginn und überschneidet sich dann mit früheren Phasen. Dafür gibt es keine Warnung.
- **Dehnen-&-Falten-Durchgang**: Zeitpunkt innerhalb der Stockgare. Der erste liegt ein Abstand nach Beginn der Stockgare, jeder weitere einen Abstand nach dem vorigen.
- **Manueller Schritt**: Levain ansetzen, Hauptteig mischen & Autolyse, jeder Dehnen-&-Falten-Durchgang, Formgebung & Bench Rest, Ofen vorheizen, Backen. **Passiv** sind Stockgare (Wartezeit), Kaltgare und Auskühlen.
- **Schlaf-Fenster**: Standard 23:00 Uhr (einschließlich) bis 07:00 Uhr (ausschließlich), Ortszeit der übergebenen Zeitzone (Standard Europe/Berlin). Ein manueller Schritt bekommt eine Schlaf-Warnung, wenn sein Beginn im Schlaf-Fenster liegt. Passive Phasen bekommen nie eine Warnung.
- **Dauern** zählen als echte verstrichene Zeit, auch über eine Zeitumstellung hinweg.

## Ziel
Aus dem gewünschten Zeitpunkt, an dem das Brot essfertig sein soll, entsteht ein vollständiger Ablaufplan: Beginn und Ende jeder Phase, die Zeitpunkte aller Dehnen-&-Falten-Durchgänge, der Backbeginn und der Startzeitpunkt. Handgriffe, die in die Nacht fallen, sind im Plan als Warnung markiert, damit spätere Ansichten sie direkt anzeigen können.

## Akzeptanzkriterien
<!--
Referenz-Konfiguration = Standardwerte (siehe Kontext), Schlaf-Fenster 23:00–07:00, Zeitzone Europe/Berlin.
Abstände zum Zielzeitpunkt (T) in der Referenz-Konfiguration:
Auskühlen T−2:00, Backen/Backbeginn T−2:45, Vorheizen T−3:45, Kaltgare T−16:45,
Formgebung T−17:15, Stockgare T−21:45 (Durchgänge T−21:15, −20:45, −20:15, −19:45),
Mischen T−22:45, Levain/Startzeitpunkt T−27:45.
Uhrzeiten Ortszeit Europe/Berlin; Oktober 2026, ohne Zeitumstellung außer in AC-8.
Sa 10.10.2026 / So 11.10.2026.
-->

### AC-1: Lückenloser Plan rückwärts vom Zielzeitpunkt
- **Angenommen** die Referenz-Konfiguration
- **Wenn** ein Plan für den Zielzeitpunkt So 11.10.2026 12:00 Uhr erzeugt wird
- **Dann** enthält er die acht Phasen in dieser Reihenfolge: Levain Sa 08:15 bis 13:15, Mischen & Autolyse 13:15 bis 14:15, Stockgare 14:15 bis 18:45, Formgebung & Bench Rest 18:45 bis 19:15, Kaltgare Sa 19:15 bis So 09:15, Ofen vorheizen So 08:15 bis 09:15, Backen 09:15 bis 10:00, Auskühlen 10:00 bis 12:00. Die Hauptkette ist lückenlos und kein Schritt trägt eine Schlaf-Warnung. Wird die Funktion ohne Angabe von Dauern aufgerufen, entsteht genau derselbe Plan (Standarddauern).

### AC-2: Backbeginn und Startzeitpunkt als eigene Werte
- **Angenommen** die Referenz-Konfiguration
- **Wenn** Pläne für die Zielzeitpunkte So 11.10.2026 12:00 Uhr und So 11.10.2026 08:30 Uhr erzeugt werden
- **Dann** enthält das Ergebnis neben den Phasen den Backbeginn und den Startzeitpunkt als eigene Werte: So 09:15 und Sa 08:15 Uhr für 12:00 Uhr, So 05:45 und Sa 04:45 Uhr für 08:30 Uhr. Beide Werte stimmen mit dem Beginn der Phase Backen bzw. der ersten Phase überein.

### AC-3: Dehnen-&-Falten-Durchgänge innerhalb der Stockgare
- **Angenommen** die Referenz-Konfiguration und der Zielzeitpunkt So 11.10.2026 12:00 Uhr (Stockgare Sa 14:15 bis 18:45)
- **Wenn** der Plan erzeugt wird
- **Dann** enthält die Stockgare genau 4 Dehnen-&-Falten-Durchgänge um Sa 14:45, 15:15, 15:45 und 16:15 Uhr, jeweils als manueller Schritt. Beginn und Ende der Stockgare und aller anderen Phasen bleiben unverändert. Mit 3 Durchgängen im Abstand von 45 Min. liegen sie stattdessen um 15:00, 15:45 und 16:30 Uhr.

### AC-4: Vorheizen bei kurzer oder fehlender Kaltgare
- **Angenommen** die Referenz-Konfiguration, aber mit Kaltgare 30 Min. bzw. 0 Min., und der Zielzeitpunkt So 11.10.2026 22:00 Uhr
- **Wenn** der Plan erzeugt wird
- **Dann** gilt bei 30 Min. Kaltgare: Levain So 07:45 bis 12:45, Mischen & Autolyse 12:45 bis 13:45, Stockgare 13:45 bis 18:15, Formgebung & Bench Rest 18:15 bis 18:45, Kaltgare 18:45 bis 19:15, Ofen vorheizen 18:15 bis 19:15, Backen 19:15 bis 20:00, Auskühlen 20:00 bis 22:00. Bei 0 Min. Kaltgare: keine Phase Kaltgare im Plan, Levain So 08:15 bis 13:15, Mischen & Autolyse 13:15 bis 14:15, Stockgare 14:15 bis 18:45, Formgebung & Bench Rest 18:45 bis 19:15, Ofen vorheizen 18:15 bis 19:15, Backen 19:15 bis 20:00, Auskühlen 20:00 bis 22:00. In beiden Fällen ist der Backbeginn So 19:15, die Hauptkette lückenlos, und weder die Überschneidung noch sonst ein Schritt erzeugt eine Warnung.

### AC-5: Schlaf-Warnung beim Szenario Sonntagmorgen
- **Angenommen** die Referenz-Konfiguration
- **Wenn** ein Plan für den Zielzeitpunkt So 11.10.2026 08:30 Uhr (essfertig) erzeugt wird
- **Dann** gilt: Levain Sa 04:45 bis 09:45, Mischen & Autolyse 09:45 bis 10:45, Stockgare 10:45 bis 15:15 (Durchgänge 11:15, 11:45, 12:15, 12:45), Formgebung & Bench Rest 15:15 bis 15:45, Kaltgare Sa 15:45 bis So 05:45, Ofen vorheizen So 04:45 bis 05:45, Backen 05:45 bis 06:30, Auskühlen 06:30 bis 08:30. Genau drei Schritte tragen eine Schlaf-Warnung: Levain ansetzen (Sa 04:45), Ofen vorheizen (So 04:45) und Backen (So 05:45). Kaltgare und Auskühlen tragen als passive Phasen keine Warnung, obwohl sie im Schlaf-Fenster liegen.

### AC-6: Grenzen des Schlaf-Fensters
- **Angenommen** die Referenz-Konfiguration
- **Wenn** Pläne für die Zielzeitpunkte So 11.10.2026 16:15, 16:14, 10:45 und 10:44 Uhr erzeugt werden
- **Dann** gilt:
  - Bei 16:15 beginnt die Formgebung Sa 23:00 und trägt eine Schlaf-Warnung.
  - Bei 16:14 beginnt sie Sa 22:59 und trägt keine.
  - Bei 10:45 beginnen Levain ansetzen (Sa 07:00) und Ofen vorheizen (So 07:00) ohne Warnung.
  - Bei 10:44 beginnen beide um 06:59 und tragen jeweils eine Schlaf-Warnung.
  - Alle übrigen Schritte dieser vier Pläne sind ohne Warnung.

### AC-7: Eigenes Schlaf-Fenster und eigene Zeitzone
- **Angenommen** die Referenz-Konfiguration und der Zielzeitpunkt So 11.10.2026 12:00 Uhr Berliner Zeit (10:00 UTC)
- **Wenn** der Plan mit dem Schlaf-Fenster 00:00 bis 09:00 Uhr bzw. mit der Zeitzone America/New_York und dem Standard-Schlaf-Fenster erzeugt wird
- **Dann** liegen alle Phasen auf denselben Zeitpunkten wie in AC-1. Mit dem Schlaf-Fenster 00:00 bis 09:00 Uhr tragen genau Levain ansetzen (Sa 08:15) und Ofen vorheizen (So 08:15) eine Schlaf-Warnung, Backen (So 09:15) nicht. Mit America/New_York tragen genau Levain ansetzen (Sa 02:15 New Yorker Zeit), Ofen vorheizen (So 02:15) und Backen (So 03:15) eine Schlaf-Warnung.

### AC-8: Rechnen über die Zeitumstellung
- **Angenommen** die Referenz-Konfiguration und die Umstellung von Sommer- auf Winterzeit in der Nacht zum So 25.10.2026 (03:00 wird 02:00 Uhr)
- **Wenn** Pläne für die Zielzeitpunkte So 25.10.2026 12:00 Uhr und 10:45 bzw. 10:44 Uhr erzeugt werden
- **Dann** gilt bei 12:00 Uhr: Levain Sa 09:15 bis 14:15, Mischen & Autolyse 14:15 bis 15:15, Stockgare 15:15 bis 19:45 (Durchgänge 15:45, 16:15, 16:45, 17:15), Formgebung & Bench Rest 19:45 bis 20:15, Kaltgare Sa 20:15 bis So 09:15 (14 Std. echte Zeit), Ofen vorheizen So 08:15 bis 09:15, Backen 09:15 bis 10:00, Auskühlen 10:00 bis 12:00. Startzeitpunkt ist also Sa 09:15 Uhr, eine Stunde später auf der Uhr als ohne Umstellung, und kein Schritt trägt eine Warnung. Bei 10:45 Uhr beginnt das Vorheizen So 07:00 Uhr Winterzeit ohne Warnung. Bei 10:44 Uhr beginnt es um 06:59 Uhr und trägt als einziger Schritt eine Schlaf-Warnung.

### AC-9: Ungültige Eingaben werfen Fehler
- **Angenommen** der Zielzeitpunkt ist kein gültiges Datum, oder eine Phasendauer ist negativ oder keine endliche Zahl (NaN, Infinity), oder die Dehnen-&-Falten-Durchgänge enden nicht vor dem Ende der Stockgare (z. B. 10 Durchgänge im Abstand von 30 Min. bei 4 Std. 30 Min. Stockgare)
- **Wenn** ein Plan erzeugt wird
- **Dann** wirft die Funktion einen Fehler mit deutscher Meldung und liefert keinen Plan. Feste Meldungstexte: „Der Zielzeitpunkt muss ein gültiges Datum sein.“, „Die Dauer einer Phase muss eine Zahl ab 0 sein.“, „Die Dehnen-und-Falten-Durchgänge passen nicht in die Stockgare.“

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket. Der erzeugte Plan, Backbeginn, Startzeitpunkt und die Schlaf-Warnungen sind so aufgebaut, dass eine spätere Backplanungs-Ansicht sie direkt anzeigen kann.

## Nicht im Scope
- Folgeticket „Schema für Backpläne“: Tabellen `baking_schedules` und `schedule_steps` (Drizzle, mit Neon-Abnahme) mit Rezept-Referenz, Zielzeitpunkt, Startzeitpunkt und Status `pending`, `active` oder `completed`. Dafür bereits entschieden: Die Rezept-Referenz ist optional. Wird das Rezept gelöscht, bleibt der Plan erhalten und die Referenz wird leer. Dehnen-&-Falten-Durchgänge werden als eigene Schritte gespeichert, die Schlaf-Warnung als Ja/Nein-Feld je Schritt.
- Oberfläche zum Planen, Anzeigen, Bearbeiten oder Starten eines Backplans
- Server Actions, API-Routen und Offline-Sync für Backpläne
- Statuswechsel-Logik, Erinnerungen und Benachrichtigungen
- Automatisches Verschieben von Phasen aus dem Schlaf-Fenster heraus („adaptiv“ ist hier nur die Warnung)
- Anpassung der Gärdauern an Raum- oder Teigtemperatur (z. B. über die DDT aus F009)
- Prüfung, ob der Startzeitpunkt in der Vergangenheit liegt
- Hefeteige, Poolish und andere Vorteige als Levain

## Offene Fragen
- [x] 1. Soll F012 Schema und Funktion enthalten? → Nein, aufgeteilt: F012 = Funktion `generateBackwardSchedule`, das Schema kommt als Folgeticket (siehe „Nicht im Scope“).
- [x] 2. Ist der Zielzeitpunkt das Ende des Auskühlens oder der Backbeginn? → Ende des Auskühlens („essfertig“). Der Backbeginn ist ein Zwischenergebnis und wird im Ergebnis mit ausgegeben (AC-2).
- [x] 3. Läuft das Vorheizen nach der Kaltgare oder parallel? → Parallel. Kaltgare und Vorheizen enden mit dem Backbeginn. Ist die Kaltgare kürzer als das Vorheizen oder entfällt sie, beginnt das Vorheizen entsprechend früher, ohne Warnung (AC-4). „Lückenlos“ gilt für die Hauptkette ohne Vorheizen.
- [x] 4. Zeitzone und Zeitumstellung? → Dauern in echter verstrichener Zeit. Das Schlaf-Fenster gilt in Ortszeit einer übergebenen Zeitzone (Standard Europe/Berlin), siehe AC-7 und AC-8.
- [x] 5. Welche Schritte gelten als manuell, und was zählt? → Liste unter „Begriffe“, nur der Beginn zählt.
- [x] 6. Ist das Schlaf-Fenster einstellbar? → Ja, über die Konfiguration, Standard 23:00 bis 07:00 Uhr (AC-7).
- [x] 7. Wann ist der erste Dehnen-&-Falten-Durchgang? → Ein Abstand nach Beginn der Stockgare. Anzahl und Abstand kommen aus der Konfiguration (AC-3).
- [x] 8. Standarddauern? → Ja, die Werte der Referenz-Konfiguration. Jede Dauer lässt sich überschreiben (AC-1).
- [x] 9. Darf eine Phase entfallen? → Ja, eine Phase mit Dauer 0 erscheint nicht im Plan (AC-4).
- [x] 10. Ist die Rezept-Referenz Pflicht, und was passiert beim Löschen des Rezepts? → Gilt für das Schema-Folgeticket: optional, der Plan bleibt beim Löschen des Rezepts erhalten und die Referenz wird leer.
- [x] 11. Werden Dehnen-&-Falten-Durchgänge und Schlaf-Warnungen in `schedule_steps` gespeichert? → Gilt für das Schema-Folgeticket: ja, Durchgänge als eigene Schritte, Warnung als Ja/Nein-Feld je Schritt.
- [x] 12. Fehlermeldungen in AC-9? → Ja, wie formuliert.

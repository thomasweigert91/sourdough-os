# F005: Global State und Offline-Sync Vorbereitung

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
Sourdough OS wird beim Backen benutzt, also oft in der Küche mit schwachem oder fehlendem WLAN. Heute holt die App jede Information direkt vom Server: Bricht die Verbindung ab, sieht die angemeldete Person weder einen Hinweis darauf noch ihre zuletzt geladenen Daten. Künftige Funktionen wie Teig-Berechnungen und Timer müssen aber ohne Netz weiterlaufen. Betroffen sind alle angemeldeten Personen, zuerst auf dem Dashboard (`/dashboard`), dem einzigen geschützten Bereich, den es bisher gibt.

Dieses Ticket ist eine Architektur-Weichenstellung (Ticket 0.5, 5 Story Points). Fachliche Datenmodelle für Nutzer-Präferenzen und aktive Teig-Sessions gibt es noch nicht. Das Ticket legt die Grundlage, auf der sie später offline arbeiten.

## Ziel
Die angemeldete Person sieht jederzeit im Kopfbereich der App, ob sie offline ist. Bereits geladene Daten (Nutzer-Präferenzen, aktive Teig-Sessions) erscheinen sofort aus dem lokalen Speicher des Geräts, auch nach einem Neuladen. Änderungen, die ohne Verbindung entstehen, gehen nicht verloren und werden nach der Wiederverbindung automatisch an den Server übertragen.

## Akzeptanzkriterien

### AC-1: Hinweis bei Verbindungsverlust
- **Angenommen** die Person ist angemeldet, sieht das Dashboard und das Gerät ist online
- **Wenn** die Netzwerkverbindung des Geräts abbricht
- **Dann** erscheint innerhalb von 2 Sekunden im Kopfbereich der Hinweis „Offline – Änderungen werden lokal gespeichert“, und der Rest der Seite bleibt bedienbar

### AC-2: Hinweis verschwindet bei Wiederverbindung
- **Angenommen** der Hinweis „Offline – Änderungen werden lokal gespeichert“ wird angezeigt
- **Wenn** das Gerät wieder online ist
- **Dann** verschwindet der Hinweis innerhalb von 2 Sekunden, ohne dass die Person die Seite neu laden muss

### AC-3: Gerät ist schon beim Öffnen offline
- **Angenommen** das Gerät hat keine Netzwerkverbindung
- **Wenn** die Person eine bereits geöffnete App-Seite erneut anzeigt (z. B. Tab zurückholen oder im Verlauf zurücknavigieren)
- **Dann** ist der Offline-Hinweis von Anfang an sichtbar; online wird er zu keinem Zeitpunkt angezeigt, auch nicht kurz beim Laden

### AC-4: Gespeicherte Daten erscheinen vor der Serverantwort
- **Angenommen** die Person hat ihre Nutzer-Präferenzen auf diesem Gerät mindestens einmal geladen
- **Wenn** sie die Seite neu lädt
- **Dann** sieht sie die zuletzt gespeicherten Werte sofort, ohne Ladeanzeige und bevor der Server geantwortet hat; weichen die Serverdaten ab, werden die angezeigten Werte danach ohne weiteres Zutun aktualisiert

### AC-5: Offline-Änderung bleibt erhalten und wird nachgereicht
- **Angenommen** das Gerät ist offline und der Offline-Hinweis ist sichtbar
- **Wenn** die Person eine Nutzer-Präferenz oder eine aktive Teig-Session ändert und danach die Seite neu lädt
- **Dann** wird die Änderung sofort angezeigt, ist auch nach dem Neuladen noch sichtbar und ist innerhalb von 10 Sekunden nach der Wiederverbindung auf dem Server gespeichert, ohne dass die Person etwas tun muss

### AC-6: Synchronisation schlägt fehl
- **Angenommen** das Gerät ist online und es gibt lokal gespeicherte Änderungen, die noch nicht auf dem Server sind
- **Wenn** der Server das Speichern ablehnt oder nicht erreichbar ist
- **Dann** bleibt die Änderung lokal erhalten und sichtbar, und im Kopfbereich erscheint der Hinweis „Änderungen konnten nicht synchronisiert werden. Neuer Versuch läuft.“; nach erfolgreicher Übertragung verschwindet dieser Hinweis

### AC-7: Lokaler Speicher wird nur nach erfolgreichem Abmelden geleert
- **Angenommen** die Person ist angemeldet und auf dem Gerät sind Nutzer-Präferenzen lokal gespeichert
- **Wenn** sie auf „Abmelden“ klickt
- **Dann** gilt ohne vorherige Warnung oder Bestätigungsabfrage:
  - Ist das Abmelden erfolgreich, sind danach keine ihrer Daten mehr im lokalen Speicher des Geräts.
  - Scheitert das Abmelden wegen eines Netzwerkfehlers oder weil das Gerät offline ist, erscheint die Meldung „Du bist offline. Abmelden ist nur mit Internetverbindung möglich.“; die Person bleibt angemeldet und die lokalen Daten (inkl. nicht synchronisierter Änderungen) bleiben erhalten.
  - Scheitert das Abmelden aus einem anderen Grund, erscheint die bestehende allgemeine Fehlermeldung; die lokalen Daten bleiben erhalten.

## UI & Barrierefreiheit
- Der Offline-Hinweis und der Sync-Fehlerhinweis werden Screenreadern als Statusmeldung angesagt (höflich, nicht unterbrechend), einmal pro Zustandswechsel.
- Der Hinweis ist nicht nur durch Farbe erkennbar, sondern immer als Text sichtbar.
- Der Hinweis verdeckt keine Bedienelemente und ist ab 320 px Breite vollständig lesbar.
- Hell- und Dunkelmodus wie bestehende Seiten (Zinc-Töne, Fehlertöne wie bei bestehenden Fehlermeldungen).

## Nicht im Scope
- Fachliche Funktionen wie Teig-Berechnungen, Timer oder die Verwaltung von Teig-Sessions selbst
- Das endgültige Datenmodell für Nutzer-Präferenzen und Teig-Sessions in der Datenbank
- Öffnen der App ohne Verbindung von Grund auf (Service Worker / installierbare PWA)
- Konfliktauflösung bei gleichzeitiger Bearbeitung auf mehreren Geräten über „letzte Änderung gewinnt“ hinaus
- Offline-Anmeldung oder -Registrierung

## Offene Fragen
- [x] Einen Kopfbereich (Header) gibt es noch nicht. Wo soll er erscheinen? → Ein rudimentärer Header auf allen geschützten Seiten (bisher nur `/dashboard`), nicht auf `/login` und `/register`.
- [x] Nutzer-Präferenzen und Teig-Sessions existieren weder in der Datenbank noch in der Oberfläche. Womit sollen AC-4 bis AC-6 geprüft werden? → Ja, eine minimale Präferenz (bevorzugte Temperatureinheit °C/°F) als Testfall; Teig-Sessions nur als vorbereiteter Speicherbereich ohne Oberfläche.
- [x] Sind die Hinweistexte „Offline – Änderungen werden lokal gespeichert“ und „Änderungen konnten nicht synchronisiert werden. Neuer Versuch läuft.“ so gewünscht? → Ja.
- [x] Soll beim Abmelden der lokale Speicher des Geräts geleert werden (Datenschutz bei geteilten Geräten)? → Ja, aber nur nach erfolgreichem Abmelden. Offline ist Abmelden nicht möglich (eigene Meldung), die Daten bleiben erhalten; eine Warnung entfällt deshalb (siehe AC-7, nachträglich geändert in der Implementierungsphase).
- [x] Wie lange bleiben lokal gespeicherte Daten gültig? → 7 Tage, danach werden sie beim nächsten Online-Laden verworfen und neu geholt.
- [x] Soll nach Wiederverbindung kurz eine Bestätigung wie „Wieder online“ erscheinen? → Nein, der Offline-Hinweis verschwindet nur.
- [x] Wie oft und wie lange wird eine fehlgeschlagene Synchronisation wiederholt (AC-6)? → Automatisch mit wachsendem Abstand bis max. 5 Minuten, unbegrenzt solange die Seite offen ist.

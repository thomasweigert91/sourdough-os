# F004: UI Auth-Flow (Login, Register, Session Provider)

<!-- Rolle: spec-creator. Alle {{...}}-Platzhalter ersetzen. HTML-Kommentare ignoriert das Gate. -->

**Erstellt:** 2026-10-02

## Kontext
Das Auth-Backend steht (F003: E-Mail/Passwort-Anmeldung unter `/api/auth`), aber es gibt keine Oberfläche dafür. Besucherinnen und Besucher können sich nicht registrieren, nicht anmelden und nicht abmelden. Die App kennt bisher nur die Startseite `/` (Next.js-Vorlage). Die Seiten `/register`, `/login` und `/dashboard` existieren nicht.

## Ziel
Nutzer können sich über `/register` mit E-Mail und Passwort ein Konto anlegen, über `/login` anmelden und sich wieder abmelden. Die Formulare melden ungültige Eingaben und Serverfehler verständlich auf Deutsch zurück und zeigen einen Ladezustand. Nach erfolgreicher Anmeldung landet man auf `/dashboard`, wo der angemeldete Zustand sichtbar ist.

## Akzeptanzkriterien
<!--
Mindestens 2. Jedes Kriterium als "### AC-n: Titel" mit Angenommen / Wenn / Dann.
Beobachtbares Verhalten, konkret und messbar: exakte Texte, Zahlen, Zustände (Laden, leer, Fehler).
Ein Verhalten pro Kriterium; Fehler- und Randfälle als eigene Kriterien.
-->

### AC-1: Registrierung mit gültigen Daten
- **Angenommen** ich bin nicht angemeldet und öffne `/register`; das Formular enthält die Felder "Name", "E-Mail" und "Passwort" sowie den Button "Registrieren"
- **Wenn** ich einen Namen, eine noch nicht registrierte E-Mail-Adresse und ein Passwort mit mindestens 8 Zeichen eingebe und auf "Registrieren" klicke
- **Dann** wird mein Konto angelegt, ich bin angemeldet und werde auf `/dashboard` weitergeleitet

### AC-2: Eingabeprüfung bei der Registrierung
- **Angenommen** ich bin auf `/register`
- **Wenn** ich auf "Registrieren" klicke und der Name leer ist, die E-Mail kein gültiges Format hat (z. B. "max@") oder das Passwort kürzer als 8 Zeichen ist
- **Dann** wird kein Request an den Server gesendet, und direkt unter jedem fehlerhaften Feld erscheint eine Meldung: "Bitte gib deinen Namen ein.", "Bitte gib eine gültige E-Mail-Adresse ein." bzw. "Das Passwort muss mindestens 8 Zeichen lang sein."; bei mehr als 128 Zeichen erscheint "Das Passwort darf höchstens 128 Zeichen lang sein."; meine bisherigen Eingaben bleiben erhalten

### AC-3: E-Mail bereits registriert
- **Angenommen** unter "max@example.com" existiert bereits ein Konto und ich bin auf `/register`
- **Wenn** ich das Formular mit dieser E-Mail-Adresse und sonst gültigen Daten absende
- **Dann** bleibe ich auf `/register`, und über dem Button erscheint die Meldung "Diese E-Mail-Adresse ist bereits registriert."; die Eingaben bleiben erhalten

### AC-4: Anmeldung mit gültigen Daten
- **Angenommen** ich habe ein Konto und bin nicht angemeldet; ich öffne `/login` mit den Feldern "E-Mail" und "Passwort" sowie dem Button "Anmelden"
- **Wenn** ich meine korrekten Zugangsdaten eingebe und auf "Anmelden" klicke
- **Dann** werde ich auf `/dashboard` weitergeleitet, und die Seite zeigt meinen Namen und meine E-Mail-Adresse

### AC-5: Ungültige Anmeldedaten und Eingabeprüfung beim Login
- **Angenommen** ich bin auf `/login`
- **Wenn** ich eine falsche Kombination aus E-Mail und Passwort absende
- **Dann** bleibe ich auf `/login`, und es erscheint die Meldung "E-Mail oder Passwort ist falsch." (ohne Hinweis, welches der beiden Felder falsch ist); das Passwortfeld wird geleert, die E-Mail bleibt erhalten
- **Und** bei leerem Feld oder ungültigem E-Mail-Format erscheinen die Feldmeldungen aus AC-2 ("Bitte gib eine gültige E-Mail-Adresse ein." bzw. "Bitte gib dein Passwort ein.") ohne Server-Request

### AC-6: Ladezustand und Netzwerkfehler
- **Angenommen** ich habe auf `/login` oder `/register` ein gültig ausgefülltes Formular
- **Wenn** ich absende
- **Dann** ist der Button bis zur Antwort deaktiviert und zeigt "Bitte warten …", sodass ein zweites Absenden nicht möglich ist
- **Und** schlägt die Anfrage wegen eines Netzwerk- oder Serverfehlers fehl, erscheint "Etwas ist schiefgelaufen. Bitte versuche es erneut.", der Button ist wieder aktiv, und die Eingaben bleiben erhalten

### AC-7: Abmelden
- **Angenommen** ich bin angemeldet und auf `/dashboard`
- **Wenn** ich auf den Button "Abmelden" klicke
- **Dann** wird meine Sitzung beendet und ich werde auf `/login` weitergeleitet; ein erneuter Aufruf von `/dashboard` führt wieder auf `/login`

### AC-8: Sitzungszustand und Zugriffsschutz
- **Angenommen** die Sitzung wird noch geladen, bzw. ich bin angemeldet, bzw. ich bin nicht angemeldet
- **Wenn** ich `/dashboard` öffne
- **Dann** sehe ich beim Laden den Text "Lade Sitzung …" (nie kurz die Anmeldeansicht oder falsche Daten); als angemeldete Person sehe ich mein Dashboard mit meinem Namen; als nicht angemeldete Person werde ich auf `/login` weitergeleitet
- **Und** öffne ich als angemeldete Person `/login` oder `/register`, werde ich auf `/dashboard` weitergeleitet

### AC-9: Wechsel zwischen Login und Registrierung
- **Angenommen** ich bin nicht angemeldet
- **Wenn** ich auf `/login` den Link "Noch kein Konto? Registrieren" bzw. auf `/register` den Link "Schon ein Konto? Anmelden" anklicke
- **Dann** gelange ich auf die jeweils andere Seite

## UI & Barrierefreiheit
- Alle sichtbaren Texte sind Deutsch; `<html lang="de">`.
- Jedes Feld hat ein sichtbar verknüpftes Label ("Name", "E-Mail", "Passwort"); Klick auf das Label fokussiert das Feld. E-Mail-Feld mit Typ E-Mail, Passwortfeld verdeckt (Passwort-Manager-tauglich: passende `autocomplete`-Werte für Neu- bzw. bestehendes Passwort).
- Feldfehler und Formularfehler werden Screenreadern automatisch angekündigt und sind dem jeweiligen Feld zugeordnet; Fehlermeldungen sind nicht allein durch Farbe erkennbar.
- Komplette Bedienung per Tastatur: Tab-Reihenfolge Feld für Feld bis zum Button, Absenden mit Enter in jedem Feld. Nach fehlgeschlagener Prüfung erhält das erste fehlerhafte Feld den Fokus.
- Layout funktioniert ab 320 px Breite ohne horizontales Scrollen; Hell- und Dunkelmodus entsprechend der bestehenden Seite.
- Zustände pro Formular: Ausgangszustand, Feldfehler, Formularfehler, Laden (Button deaktiviert).

## Nicht im Scope
- Passwort vergessen / zurücksetzen
- E-Mail-Verifizierung und Bestätigungsmails
- Social Login (GitHub, Google) in der Oberfläche
- Profilverwaltung (Name, E-Mail, Passwort ändern), Konto löschen
- Inhalt des Dashboards über die Anzeige von Name/E-Mail und den Abmelden-Button hinaus
- "Angemeldet bleiben"-Option, Passwortstärke-Anzeige, Rate-Limiting-Meldungen
- Neugestaltung der Startseite `/` und globale Navigation

## Offene Fragen
- [x] In welcher Sprache sind die Oberfläche und die Fehlermeldungen? → Deutsch; `<html lang>` im Layout wird von "en" auf "de" gesetzt.
- [x] Hat die Registrierung ein Namensfeld? → Ja, Pflichtfeld "Name".
- [x] Welche Passwortregeln gelten? → Mindestens 8, maximal 128 Zeichen, keine weiteren Komplexitätsregeln (siehe AC-2).
- [x] Wird man nach erfolgreicher Registrierung direkt angemeldet und auf `/dashboard` geleitet? → Ja, ohne E-Mail-Verifizierung.
- [x] Sollen nicht angemeldete Besucher von `/dashboard` auf `/login` umgeleitet werden und angemeldete Personen von `/login`/`/register` auf `/dashboard`? → Ja, wie in AC-8.
- [x] Was soll `/dashboard` in diesem Ticket anzeigen? → Nur Überschrift "Dashboard", Name, E-Mail und Button "Abmelden" als Platzhalter.
- [x] Soll die Meldung bei bereits vergebener E-Mail verraten, dass das Konto existiert (AC-3)? → Ja, wie im Ticket gefordert.
- [x] Soll nach dem Login zu einer ursprünglich angefragten Seite zurückgeleitet werden? → Nein, immer `/dashboard`.
- [x] Wohin nach dem Abmelden? → `/login`.

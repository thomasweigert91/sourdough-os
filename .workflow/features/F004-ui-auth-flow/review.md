# Review F004: UI Auth-Flow (Login, Register, Session Provider)

<!-- Rolle: code-reviewer. Alle Platzhalter ersetzen. -->

**Status:** APPROVED
**Diff-Hash:** c7039c8c1328

## Akzeptanzkriterien
<!-- Eine Zeile pro AC aus dem Ticket. ✅ nur mit konkretem Nachweis. -->
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `src/components/auth/register-form.tsx:55-68` (signUp.email, dann `replace("/dashboard")`); Felder/Labels/autocomplete `register-form.tsx:78-110`; Tests "F004/AC-1 zeigt Felder Name, E-Mail, Passwort …", "F004/AC-1 legt bei gültigen Daten das Konto an …", "F004/AC-1 sendet auch per Enter …" (`register-form.test.tsx`), "F004/AC-1 /register zeigt … Registrierungsformular" (`auth-pages.test.tsx`). Better-Auth signalisiert `/sign-up/email` an den Session-Store (`node_modules/better-auth/dist/client/config.mjs:22`), Auto-Login ist Standard |
| AC-2 | ✅ | `src/lib/auth-form.ts:40-54` (Regeln inkl. 8/128); Fokus/kein Request `register-form.tsx:39-53`; Meldung unter dem Feld mit `aria-describedby` `text-field.tsx:42-54`; Tests "F004/AC-2 zeigt bei ungültigen Eingaben Feldmeldungen …", "… fokussiert das erste fehlerhafte Feld …", "… mehr als 128 Zeichen" (`register-form.test.tsx`) und Unit-Tests in `auth-form.test.ts:22-60` |
| AC-3 | ✅ | `auth-form.ts:67-74` (Code `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, real in `better-auth/dist/api/routes/sign-up.mjs:204`); `role="alert"` vor dem Button `register-form.tsx:111-115`; Test "F004/AC-3 zeigt bei bereits registrierter E-Mail die Meldung über dem Button …" prüft Text, DOM-Position, kein `replace`, Werte erhalten |
| AC-4 | ✅ | `login-form.tsx:51-68` (signIn.email, `replace("/dashboard")`); `dashboard.tsx:36-40` (Name, E-Mail); Tests "F004/AC-4 meldet mit gültigen Daten an …", "F004/AC-4 sendet auch per Enter …" (`login-form.test.tsx`), "F004/AC-4 zeigt Überschrift, Namen und E-Mail-Adresse …" (`dashboard.test.tsx`), "F004/AC-8 /dashboard zeigt angemeldeten Personen ihr Dashboard mit Namen" |
| AC-5 | ✅ | `auth-form.ts:56-65,76-81`; Passwort leeren und E-Mail behalten `login-form.tsx:57-65` (Code `INVALID_EMAIL_OR_PASSWORD` real in `sign-in.mjs:323-337`); Tests "F004/AC-5 zeigt bei falschen Zugangsdaten eine neutrale Meldung …", "… bei leeren Feldern Feldmeldungen ohne Server-Request …", "… bei ungültigem E-Mail-Format …", "… fokussiert das Passwortfeld, wenn nur das Passwort fehlt" |
| AC-6 | ✅ | `register-form.tsx:36,55-72,116-122`, `login-form.tsx:36,51-72,105-111` (Guard, `disabled`, "Bitte warten …", try/catch); Tests "F004/AC-6 deaktiviert den Button während der Anfrage …" (Klick + Enter, genau 1 Aufruf), "… Serverfehler (500) …", "… Netzwerkfehler …" in beiden Formular-Testdateien |
| AC-7 | ✅ | `dashboard.tsx:17-32` (signOut, `replace("/login")`, Fehlerpfad); `session-gate.tsx:19-28` leitet ohne Sitzung auf `/login`; Tests "F004/AC-7 beendet beim Klick auf „Abmelden“ die Sitzung …", "… fehlgeschlagenem Abmelden …", "… Netzwerkfehler beim Abmelden …" (`dashboard.test.tsx`), "F004/AC-7 leitet nach dem Abmelden (Sitzung wird null) auf /login um …" (`session-gate.test.tsx`) |
| AC-8 | ✅ | `session-gate.tsx:18-38` (Ladetext auch während Umleitung, kein Aufblitzen der Kinder); Seiten `src/app/{dashboard,login,register}/page.tsx`; Tests in `session-gate.test.tsx` (pending für user/guest, user±Sitzung, guest±Sitzung, Fehler) und `auth-pages.test.tsx` ("F004/AC-8 /dashboard zeigt beim Laden …", "… leitet nicht angemeldete Personen auf /login um", "/login …", "/register … auf /dashboard um") |
| AC-9 | ✅ | `login-form.tsx:114-116`, `register-form.tsx:125-127` (`next/link`); Tests "F004/AC-9 verlinkt mit „Noch kein Konto? Registrieren“ auf /register", "F004/AC-9 verlinkt mit „Schon ein Konto? Anmelden“ auf /login" |

## Befunde
<!--
Schwere: BLOCKER (muss), MAJOR (muss), MINOR (sollte), NIT (kann). Status: offen / behoben.
Offene BLOCKER/MAJOR sind mit APPROVED unvereinbar (prüft das Gate). Keine Befunde: nur die Kopfzeile stehen lassen.
-->
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MINOR | src/components/auth/text-field.tsx:50-54, src/components/auth/register-form.tsx:42-53 | Feldfehler werden nur über den Fokus auf das erste fehlerhafte Feld plus `aria-describedby` angekündigt. Hat dieses Feld den Fokus schon (Enter im Namensfeld bei leerem Namen, oder erneutes Absenden), ändert `focus()` nichts, und der Screenreader sagt nichts an. Die Vorgabe aus "UI & Barrierefreiheit" ("automatisch angekündigt") ist damit nicht in jedem Fall erfüllt. Fehler in weiteren Feldern werden erst beim Erreichen des Feldes vorgelesen. | Eine zusammenfassende Live-Region ergänzen (z. B. visuell verstecktes `role="status"` mit "Bitte prüfe deine Eingaben."), oder vor dem Fokussieren kurz `blur()` aufrufen. Test für den Fall "Enter im ersten fehlerhaften Feld" ergänzen. | offen |
| 2 | MINOR | src/components/auth/login-form.test.tsx:109-131 | Der Code fokussiert nach falschen Zugangsdaten das Passwortfeld (`login-form.tsx:63`), so steht es auch im Plan. Kein Test prüft das. | Im Test "F004/AC-5 zeigt bei falschen Zugangsdaten …" `expect(f.password).toHaveFocus()` ergänzen. | offen |
| 3 | NIT | src/app/dashboard/page.tsx:8 | Während "Lade Sitzung …" und während der Umleitung hat `/dashboard` keine `<h1>`, die Überschrift steckt nur in `Dashboard`. `/login` und `/register` haben dagegen immer eine Überschrift. | Optional die `<h1>Dashboard</h1>` in die Seite verschieben, so wie bei Login und Register. | offen |
| 4 | NIT | src/app/auth-pages.test.tsx:123-127 | Der `lang="de"`-Test liest den Quelltext per Regex. Das ist fragil (Formatierung, Kommentare), laut Plan aber wegen `next/font` bewusst so gewählt. | Akzeptabel. Alternativ `next/font/google` mocken und `RootLayout` rendern. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

## Fazit
Die Umsetzung folgt dem Plan genau: reine Validierung und Fehlerabbildung in `auth-form.ts`, kontrollierte Formulare mit Guard gegen doppeltes Absenden, und ein `SessionGate`, das während Laden und Umleitung nie die Kinder zeigt. Alle neun AC sind durch verhaltensorientierte Tests belegt (170/170 grün, `tsc` und `eslint` ohne Befund), die Better-Auth-Fehlercodes stimmen mit der installierten Version überein. Offen sind nur zwei MINOR-Punkte (Screenreader-Ansage, wenn das fehlerhafte Feld schon fokussiert ist; fehlende Fokus-Assertion nach falschem Login) und zwei NITs. Sie blockieren die Freigabe nicht.

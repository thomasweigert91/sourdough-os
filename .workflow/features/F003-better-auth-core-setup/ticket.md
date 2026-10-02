# F003: Better-Auth Core Setup und Auth-Schema

**Erstellt:** 2026-10-02

## Kontext
Die App hat bisher keine Identitätsprüfung und kein Rechtemanagement: Es gibt weder Nutzerkonten noch Sitzungen. Alle späteren Funktionen, die Daten einzelnen Personen zuordnen oder Bereiche schützen, brauchen dafür eine Grundlage. Dieses Ticket legt sie serverseitig: Better-Auth mit Drizzle-Adapter auf der bestehenden Neon-Datenbank, Anmeldung per E-Mail und Passwort, Sitzungen über Cookies. Betroffen sind die Entwicklung (Server, API, Client-Helper); eine sichtbare Oberfläche entsteht hier nicht.

Ausgangslage: Eine frühere Probe-Migration `0001` wurde zurückgenommen. Die Tabellen `user`, `session`, `account` und `verification` und der zugehörige Protokolleintrag wurden in Neon gelöscht, und die Dateien (SQL, `meta/0001_snapshot.json`, Journal-Eintrag) sind aus `drizzle/` entfernt. Es existiert nur die Migration `0000_init`. Die Migration für das Auth-Schema wird in der implement-Phase neu erzeugt (`npm run db:generate`) und in Neon eingespielt (`npm run db:migrate`); beides gehört zur Arbeit.

## Ziel
Die App stellt unter `/api/auth/*` eine funktionierende Better-Auth-Schnittstelle bereit: Eine Person kann sich mit E-Mail und Passwort registrieren und anmelden, die Sitzung wird in Neon gespeichert. Fehlende oder unbrauchbare Auth-Konfiguration fällt sofort mit einer klaren deutschen Meldung auf.

## Akzeptanzkriterien

### AC-1: Abhängigkeit better-auth
- **Angenommen** das Projekt ist ausgecheckt und `npm install` wurde ausgeführt
- **Wenn** `package.json` geprüft wird
- **Dann** steht `better-auth` unter `dependencies` (nicht unter `devDependencies`), und `package-lock.json` enthält denselben Eintrag.

### AC-2: Auth-Schema und neue Migration 0001
- **Angenommen** `drizzle/` enthält nur die Migration `0000_init` und die Tabellen `user`, `session`, `account`, `verification` existieren in Neon nicht
- **Wenn** `npm run db:generate` ausgeführt wird
- **Dann** entsteht genau eine neue Migration `0001_*.sql` (samt `meta/0001_snapshot.json` und Journal-Eintrag), die ausschließlich die vier Tabellen `user`, `session`, `account`, `verification` anlegt (Text-IDs, `timestamptz`, Cascade-Fremdschlüssel von `session` und `account` auf `user`, eindeutige `user.email` und `session.token`, Indizes auf `session.user_id`, `account.user_id` und `verification.identifier`). Nach `npm run db:migrate` existieren die vier Tabellen in Neon, und ein weiteres `npm run db:generate` meldet "No schema changes, nothing to migrate".
- Das Schema liegt unter `src/db/schema/auth.ts`. Der bisherige Inhalt (Tabelle `healthcheck`) bleibt erhalten und ist zusammen mit den Auth-Tabellen weiterhin über `@/db/schema` importierbar; `@/db` kennt `db.query.healthcheck`, `db.query.user`, `db.query.session`, `db.query.account` und `db.query.verification`. `drizzle.config.ts` verweist auf das neue Schema-Verzeichnis, und alle bisherigen Tests laufen weiterhin grün.

### AC-3: Registrierung per E-Mail und Passwort
- **Angenommen** die App läuft mit gültiger Konfiguration und es gibt noch kein Konto für `neu@example.com`
- **Wenn** ein `POST /api/auth/sign-up/email` mit `name`, `email: "neu@example.com"` und `password` (mindestens 8, höchstens 128 Zeichen) gesendet wird
- **Dann** antwortet die Schnittstelle mit Status 200, in `user` und `account` (mit `provider_id` = `credential`) entsteht je ein Eintrag, und das Passwort steht nur als Hash, nie im Klartext, in der Datenbank.

### AC-4: Anmeldung, Sitzung und Ablehnung falscher Zugangsdaten
- **Angenommen** ein Konto mit E-Mail und Passwort existiert
- **Wenn** ein `POST /api/auth/sign-in/email` mit den richtigen Zugangsdaten gesendet wird
- **Dann** antwortet die Schnittstelle mit Status 200 und setzt ein Sitzungs-Cookie, in `session` entsteht ein Eintrag mit `user_id` des Kontos, und `GET /api/auth/get-session` mit diesem Cookie liefert den Nutzer.
- **Wenn** stattdessen ein falsches Passwort gesendet wird, **dann** antwortet die Schnittstelle mit Status 401, setzt kein Sitzungs-Cookie und legt keinen `session`-Eintrag an.
- **Wenn** `GET /api/auth/get-session` ohne Cookie aufgerufen wird, **dann** enthält die Antwort keine Sitzung (`null`).

### AC-5: Doppelte E-Mail und zu kurzes Passwort werden abgelehnt
- **Angenommen** ein Konto für `neu@example.com` existiert bereits
- **Wenn** erneut mit derselben E-Mail registriert wird, **dann** antwortet die Schnittstelle mit einem Fehlerstatus (4xx) und es entsteht kein zweiter `user`-Eintrag.
- **Wenn** mit einem Passwort unter 8 Zeichen registriert wird, **dann** antwortet die Schnittstelle mit einem Fehlerstatus (4xx) und es entsteht weder `user` noch `account`.

### AC-6: OAuth-Slots vorbereitet, aber inaktiv ohne Zugangsdaten
- **Angenommen** für GitHub und Google sind in der Konfiguration Slots vorbereitet, die nur aktiv werden, wenn jeweils beide Variablen gesetzt sind (`GITHUB_CLIENT_ID` und `GITHUB_CLIENT_SECRET` bzw. `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET`)
- **Wenn** die App ohne diese Variablen startet
- **Dann** startet sie ohne Fehler, E-Mail/Passwort funktioniert, und es ist kein OAuth-Provider aktiv. Sind die zwei Variablen eines Providers gesetzt, ist genau dieser Provider aktiv; ist nur eine der beiden gesetzt, bleibt er inaktiv.

### AC-7: Umgebungsvariablen werden geprüft
- **Angenommen** die Auth-Konfiguration wird geladen
- **Wenn** `BETTER_AUTH_SECRET` fehlt oder leer ist, **dann** bricht das Laden mit der Meldung "BETTER_AUTH_SECRET ist nicht gesetzt. Bitte in .env.local eintragen." ab.
- **Wenn** `BETTER_AUTH_SECRET` weniger als 32 Zeichen hat, **dann** bricht das Laden mit der Meldung "BETTER_AUTH_SECRET ist zu kurz. Mindestens 32 Zeichen erforderlich." ab.
- **Wenn** `BETTER_AUTH_URL` fehlt oder leer ist, **dann** bricht das Laden mit der Meldung "BETTER_AUTH_URL ist nicht gesetzt. Bitte in .env.local eintragen." ab.
- **Wenn** `BETTER_AUTH_URL` keine gültige absolute http(s)-URL ist (z. B. `localhost:3000`), **dann** bricht das Laden mit der Meldung "BETTER_AUTH_URL ist keine gültige URL. Beispiel: http://localhost:3000" ab.
- **Wenn** `next build` ohne gesetztes `BETTER_AUTH_SECRET` oder `BETTER_AUTH_URL` ausgeführt wird, **dann** scheitert der Build mit der jeweiligen Meldung (wie bei `DATABASE_URL`); in CI müssen die Variablen gesetzt sein.
- Die Prüfung läuft zur Aufrufzeit (Muster wie `src/db/env.ts`), nicht beim Import der Env-Prüfdatei. Beide Variablen sind in `.env.example` mit Hinweistext aufgeführt (ohne echte Werte); `.env.local` bleibt ungetrackt.

### AC-8: Client-Helper nutzbar
- **Angenommen** `src/lib/auth-client.ts` existiert
- **Wenn** eine Client-Komponente oder ein Test es importiert
- **Dann** exportiert es eine mit `createAuthClient()` erzeugte Instanz, die `signUp.email`, `signIn.email`, `signOut` und `useSession` bereitstellt, ohne dass dafür serverseitige Umgebungsvariablen oder `@/db` geladen werden.

## UI & Barrierefreiheit
Keine Oberfläche in diesem Ticket. Es gibt keine Anmelde- oder Registrierungsseite.

## Nicht im Scope
- Anmelde-, Registrierungs- und Abmelde-Oberfläche (Seiten, Formulare, Fehlertexte im UI)
- Schutz von Seiten oder Routen (Middleware/Proxy, Weiterleitung auf eine Login-Seite)
- Rollen, Berechtigungen und Plugins (z. B. Admin, Organisationen, 2FA)
- E-Mail-Versand (Verifizierungs- und Passwort-zurücksetzen-Mails); `emailVerified` bleibt `false`, eine Verifizierung wird nicht verlangt
- Tatsächliche Einrichtung von OAuth-Apps bei GitHub oder Google
- Änderungen an der bestehenden Migration `0000_init` oder an der Tabelle `healthcheck`

## Annahmen
- OAuth-Slots: GitHub und Google.
- Mindestlänge `BETTER_AUTH_SECRET`: 32 Zeichen. Passwortlänge: Better-Auth-Standard (8 bis 128 Zeichen).
- `BETTER_AUTH_URL` wird als Basis-URL der App verwendet (lokal `http://localhost:3000`).
- Wie bei `@/db` darf die Env-Prüfung beim Laden von `src/lib/auth.ts` fehlschlagen; die Serverinstanz ist nur serverseitig importierbar.
- Das Schema-Verzeichnis `src/db/schema/` erhält eine `index.ts`, die `healthcheck` und die Auth-Tabellen gemeinsam exportiert, damit bestehende Importe über `@/db/schema` unverändert funktionieren.

## Offene Fragen
- [x] Soll `next build` ohne gesetzte `BETTER_AUTH_*`-Variablen (z. B. in CI) scheitern? → Ja, der Build scheitert (analog zu `DATABASE_URL`); die Variablen werden in CI gesetzt. Als Teil von AC-7 aufgenommen.
- [x] Migration `0001` → wurde vom Nutzer zurückgenommen (Tabellen und Protokolleintrag in Neon gelöscht, Dateien aus `drizzle/` entfernt) und gehört zur Arbeit: Sie wird in der implement-Phase neu erzeugt und eingespielt. Ticket und AC-2 entsprechend angepasst.

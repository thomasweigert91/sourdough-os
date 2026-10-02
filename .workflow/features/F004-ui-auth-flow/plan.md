# Plan F004: UI Auth-Flow (Login, Register, Session Provider)

## Ansatz
Drei neue App-Router-Seiten (`/register`, `/login`, `/dashboard`) als schlanke Server-Komponenten, die Client-Komponenten aus `src/components/auth/` rendern. Die Formulare sind kontrollierte React-Formulare (`useState`, `noValidate`), validieren vor dem Absenden mit reinen Funktionen aus `src/lib/auth-form.ts` (Meldungstexte, Validierung, Abbildung der Better-Auth-Fehlercodes auf deutsche Meldungen) und rufen die bestehenden Helfer `signUp.email`, `signIn.email`, `signOut` aus `@/lib/auth-client` auf. Sitzungszustand und Zugriffsschutz übernimmt eine Client-Komponente `SessionGate` auf Basis von `useSession()` (Better-Auth-Nanostore): Während `isPending` zeigt sie "Lade Sitzung …", sonst leitet sie per `router.replace` um oder rendert die Kinder. Einen eigenen React-Context-"Session Provider" braucht es nicht, weil `useSession()` bereits ein globaler Store ist, der sich nach `signIn`/`signUp`/`signOut` selbst aktualisiert; der Begriff aus dem Ticket-Titel wird durch `SessionGate` abgedeckt. `<html lang>` wird auf `"de"` gesetzt.

Verworfen: (a) **Zod** für die Validierung: steht nicht in `package.json` (nur transitiv über Better-Auth vorhanden, darauf darf man sich nicht stützen); für drei Felder mit festen Regeln reicht eine kleine reine Funktion, keine neue Abhängigkeit. (b) **Server Actions + `useActionState`**: bräuchte das `nextCookies()`-Plugin und serverseitige Fehlerabbildung, mehr Umbau als nötig; die Client-Helper aus F003 sind genau dafür vorgesehen. (c) **Proxy (früher Middleware) / serverseitige Prüfung mit `auth.api.getSession` + `redirect()`**: AC-8 verlangt ausdrücklich den sichtbaren Ladezustand "Lade Sitzung …" auf Client-Seite; ein Proxy ist laut Next-Docs (`02-guides/authentication.md`) nur ein optionaler optimistischer Vorfilter und wäre zusätzlicher Code ohne AC. Die Dashboard-Seite zeigt nur Daten der eigenen Sitzung, die vom Server ohnehin nur mit gültigem Cookie geliefert werden.

## Betroffene Dateien
| Pfad | Aktion | Zweck |
|---|---|---|
| src/app/layout.tsx | ändern | `lang="en"` → `lang="de"` (UI & Barrierefreiheit) |
| src/lib/auth-form.ts | neu | Meldungskonstanten, `validateRegister`, `validateLogin`, `isValidEmail`, `signUpErrorMessage`, `signInErrorMessage` (AC-2, AC-3, AC-5, AC-6) |
| src/components/auth/text-field.tsx | neu | Feld mit verknüpftem Label, Fehlertext, `aria-invalid`/`aria-describedby` (AC-2, AC-5) |
| src/components/auth/register-form.tsx | neu | `RegisterForm` (AC-1, AC-2, AC-3, AC-6, AC-9) |
| src/components/auth/login-form.tsx | neu | `LoginForm` (AC-4, AC-5, AC-6, AC-9) |
| src/components/auth/session-gate.tsx | neu | `SessionGate` mit Ladezustand und Umleitung (AC-7, AC-8) |
| src/components/auth/dashboard.tsx | neu | `Dashboard`: Überschrift, Name, E-Mail, Button "Abmelden" (AC-4, AC-7, AC-8) |
| src/app/register/page.tsx | neu | Seite `/register` (AC-1, AC-8) |
| src/app/login/page.tsx | neu | Seite `/login` (AC-4, AC-8) |
| src/app/dashboard/page.tsx | neu | Seite `/dashboard` (AC-4, AC-7, AC-8) |
| src/lib/auth-form.test.ts | neu | Unit-Tests Validierung und Fehlerabbildung |
| src/components/auth/register-form.test.tsx | neu | Komponententests Registrierung |
| src/components/auth/login-form.test.tsx | neu | Komponententests Anmeldung |
| src/components/auth/session-gate.test.tsx | neu | Komponententests Sitzungszustand/Umleitung |
| src/components/auth/dashboard.test.tsx | neu | Komponententests Dashboard/Abmelden |
| src/app/auth-pages.test.tsx | neu | Seiten-Zusammenbau (Gate + Formular), `lang="de"` im Layout |

Keine Änderung an `package.json` (keine neuen Abhängigkeiten), `src/lib/auth-client.ts`, `src/lib/auth.ts` oder der Route.

## Komponenten & Datenfluss

```
/register  src/app/register/page.tsx (Server)
             <main> <h1>Registrieren</h1>
               <SessionGate require="guest"> <RegisterForm /> </SessionGate>
/login     src/app/login/page.tsx (Server)
             <main> <h1>Anmelden</h1>
               <SessionGate require="guest"> <LoginForm /> </SessionGate>
/dashboard src/app/dashboard/page.tsx (Server)
             <main> <SessionGate require="user"> <Dashboard /> </SessionGate>

Client-Komponenten ("use client") -> @/lib/auth-client (signUp.email, signIn.email, signOut, useSession)
                                  -> /api/auth/* (F003, gleicher Ursprung)
Umleitungen ausschließlich über useRouter().replace(...) aus "next/navigation"
```

Alle Client-Komponenten importieren die **benannten Exporte** `signIn`, `signUp`, `signOut`, `useSession` aus `@/lib/auth-client` (nicht `authClient.xyz`), damit Tests sie per `vi.mock("@/lib/auth-client", ...)` ersetzen können. Navigation immer `useRouter()` aus `next/navigation`, immer `router.replace(...)` (nie `push`), damit "Zurück" nicht auf das Formular führt und Tests eindeutig prüfen können. Alle Komponenten sind benannte Exporte, Seiten `export default`.

### src/lib/auth-form.ts (rein, keine Imports aus React/Next/`@/`)
```ts
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const NAME_REQUIRED_MESSAGE = "Bitte gib deinen Namen ein.";
export const EMAIL_INVALID_MESSAGE = "Bitte gib eine gültige E-Mail-Adresse ein.";
export const PASSWORD_TOO_SHORT_MESSAGE = "Das Passwort muss mindestens 8 Zeichen lang sein.";
export const PASSWORD_TOO_LONG_MESSAGE = "Das Passwort darf höchstens 128 Zeichen lang sein.";
export const PASSWORD_REQUIRED_MESSAGE = "Bitte gib dein Passwort ein.";
export const EMAIL_TAKEN_MESSAGE = "Diese E-Mail-Adresse ist bereits registriert.";
export const INVALID_CREDENTIALS_MESSAGE = "E-Mail oder Passwort ist falsch.";
export const GENERIC_ERROR_MESSAGE = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
export const SUBMITTING_LABEL = "Bitte warten …";     // normales Leerzeichen + U+2026
export const SESSION_LOADING_MESSAGE = "Lade Sitzung …"; // normales Leerzeichen + U+2026

export interface RegisterValues { name: string; email: string; password: string }
export interface LoginValues { email: string; password: string }
export type FieldErrors<T> = Partial<Record<keyof T, string>>;
export interface AuthClientError { code?: string; status?: number; message?: string }

export function isValidEmail(value: string): boolean;
export function validateRegister(values: RegisterValues): FieldErrors<RegisterValues>;
export function validateLogin(values: LoginValues): FieldErrors<LoginValues>;
export function signUpErrorMessage(error: AuthClientError): string;
export function signInErrorMessage(error: AuthClientError): string;
```
Regeln:
- `isValidEmail`: Wert getrimmt, Muster `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. `"max@"`, `"max@example"`, `""` ungültig; `"max@example.com"` gültig.
- `validateRegister`: `name.trim() === ""` → `name: NAME_REQUIRED_MESSAGE`; E-Mail ungültig → `email: EMAIL_INVALID_MESSAGE`; `password.length < 8` (auch leer) → `PASSWORD_TOO_SHORT_MESSAGE`; `password.length > 128` → `PASSWORD_TOO_LONG_MESSAGE`. Passwort wird nicht getrimmt. Keine Fehler → `{}`.
- `validateLogin`: E-Mail ungültig/leer → `EMAIL_INVALID_MESSAGE`; `password === ""` → `PASSWORD_REQUIRED_MESSAGE`; keine Längenprüfung beim Login.
- `signUpErrorMessage`: `code` ist `"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"` oder `"USER_ALREADY_EXISTS"` → `EMAIL_TAKEN_MESSAGE`; alles andere → `GENERIC_ERROR_MESSAGE`. (Geprüft in `node_modules/better-auth/dist/api/routes/sign-up.mjs`: bei Standardkonfiguration 422 mit Code `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.)
- `signInErrorMessage`: `code === "INVALID_EMAIL_OR_PASSWORD"` oder `status === 401` → `INVALID_CREDENTIALS_MESSAGE`; sonst `GENERIC_ERROR_MESSAGE`.

### src/components/auth/text-field.tsx
```ts
export interface TextFieldProps {
  id: string;                          // z. B. "register-email"
  name: string;                        // "name" | "email" | "password"
  label: string;                       // "Name" | "E-Mail" | "Passwort"
  type: "text" | "email" | "password";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;   // React 19: ref als Prop
}
export function TextField(props: TextFieldProps): React.JSX.Element;
```
Rendert `<label htmlFor={id}>`, `<input id name type autoComplete value aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>` und bei Fehler `<p id={`${id}-error`}>{error}</p>` direkt unter dem Feld. Fehlertext ist sichtbarer Text (nicht nur Farbe), zusätzlich roter Rahmen am Feld. Die Ankündigung für Screenreader erfolgt über den Fokus auf das erste fehlerhafte Feld (Beschreibung über `aria-describedby` wird vorgelesen).

### src/components/auth/register-form.tsx
```ts
export function RegisterForm(): React.JSX.Element; // keine Props
```
- State (lokal): `values: RegisterValues`, `fieldErrors: FieldErrors<RegisterValues>`, `formError: string | null`, `isSubmitting: boolean`; Refs für die drei Inputs.
- Felder: `TextField` "Name" (`type="text"`, `autoComplete="name"`), "E-Mail" (`type="email"`, `autoComplete="email"`), "Passwort" (`type="password"`, `autoComplete="new-password"`); IDs `register-name`, `register-email`, `register-password`.
- `<form noValidate onSubmit>` (sonst blockiert die Browser-Prüfung von `type="email"` die eigenen Meldungen); Enter in jedem Feld sendet ab.
- Absenden: `preventDefault`; wenn `isSubmitting` → abbrechen. `formError` zurücksetzen, `validateRegister(values)`; bei Fehlern `fieldErrors` setzen, erstes fehlerhaftes Feld in Reihenfolge Name → E-Mail → Passwort fokussieren, **kein** Aufruf von `signUp.email`, Werte bleiben.
- Sonst `isSubmitting = true`, `const { error } = await signUp.email({ name: values.name.trim(), email: values.email.trim(), password: values.password })` in `try/catch`.
  - kein `error` → `router.replace("/dashboard")`; `isSubmitting` bleibt `true` bis zur Navigation (kein zweites Absenden).
  - `error` → `formError = signUpErrorMessage(error)`, `isSubmitting = false`, Werte bleiben.
  - Exception (Netzwerk) → `formError = GENERIC_ERROR_MESSAGE`, `isSubmitting = false`, Werte bleiben.
- Formularfehler: `<p role="alert">{formError}</p>` im DOM **direkt vor** dem Submit-Button.
- Button `type="submit"`, `disabled={isSubmitting}`, Text `isSubmitting ? SUBMITTING_LABEL : "Registrieren"`.
- Unter dem Formular `<Link href="/login">Schon ein Konto? Anmelden</Link>` (`next/link`).

### src/components/auth/login-form.tsx
```ts
export function LoginForm(): React.JSX.Element; // keine Props
```
Wie `RegisterForm`, mit Feldern "E-Mail" (`autoComplete="email"`, ID `login-email`) und "Passwort" (`autoComplete="current-password"`, ID `login-password`), Validierung `validateLogin`, Aufruf `signIn.email({ email: values.email.trim(), password: values.password })`, Button "Anmelden", Link `<Link href="/register">Noch kein Konto? Registrieren</Link>`.
- Bei `signInErrorMessage(error) === INVALID_CREDENTIALS_MESSAGE`: zusätzlich `password` auf `""` setzen und das Passwortfeld fokussieren; E-Mail bleibt. Bei Generik-Fehler/Exception bleiben beide Werte erhalten.

### src/components/auth/session-gate.tsx
```ts
export interface SessionGateProps {
  require: "user" | "guest";
  children: React.ReactNode;
}
export function SessionGate({ require, children }: SessionGateProps): React.JSX.Element;
```
- `const { data, isPending } = useSession(); const router = useRouter();`
- `isPending` → `<p role="status">Lade Sitzung …</p>` (nie die Kinder).
- `require === "user"` und `!data` → in `useEffect` `router.replace("/login")`, gerendert wird weiter der Ladetext (kein Aufblitzen).
- `require === "guest"` und `data` → in `useEffect` `router.replace("/dashboard")`, gerendert wird der Ladetext.
- sonst `children`. Ein `error` aus `useSession` mit `data === null` gilt als "nicht angemeldet".

### src/components/auth/dashboard.tsx
```ts
export function Dashboard(): React.JSX.Element;
```
- Liest `useSession().data.user` (`name`, `email`); ist `data` null → `null` rendern (wird nur innerhalb `SessionGate require="user"` verwendet).
- Rendert `<h1>Dashboard</h1>`, `<p>{user.name}</p>`, `<p>{user.email}</p>`, `<button type="button">Abmelden</button>`.
- Klick: `try { const { error } = await signOut(); }` → kein Fehler: `router.replace("/login")`; Fehler oder Exception: `<p role="alert">` mit `GENERIC_ERROR_MESSAGE`, keine Umleitung. Nach `signOut` setzt Better-Auth den Store auf `null`, sodass auch `SessionGate` auf `/login` umleitet; ein späterer Aufruf von `/dashboard` hat kein Sitzungs-Cookie mehr und landet über `SessionGate` auf `/login`.

### Seiten
`src/app/{register,login,dashboard}/page.tsx`: Server-Komponenten ohne `"use client"`, ohne Daten-Fetching, synchron, `export default function RegisterPage()` / `LoginPage()` / `DashboardPage()`. Layout-Wrapper im Stil der Startseite: `flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black`, Karte `w-full max-w-sm px-4` (funktioniert ab 320 px), Texte `text-zinc-950 dark:text-zinc-50`, Button `rounded-full bg-foreground text-background disabled:opacity-60`, Fehler `text-red-700 dark:text-red-400`. Kein `metadata`-Export nötig.

### Lade- und Fehlerzustände
Pro Formular: Ausgangszustand, Feldfehler (unter dem Feld, Fokus auf erstes Feld), Formularfehler (`role="alert"` über dem Button), Laden (Button deaktiviert, "Bitte warten …"). Sitzung: "Lade Sitzung …" (`role="status"`). Neue Abhängigkeiten: keine.

## Arbeitsschritte
1. `src/app/layout.tsx`: `lang="de"` setzen (UI & Barrierefreiheit, betrifft AC-1, AC-4)
2. `src/lib/auth-form.ts` mit Konstanten, `isValidEmail`, `validateRegister`, `validateLogin` (AC-2, AC-5)
3. In `src/lib/auth-form.ts` `signUpErrorMessage` und `signInErrorMessage` ergänzen (AC-3, AC-5, AC-6)
4. `src/components/auth/text-field.tsx` mit Label, Fehlertext und ARIA-Verknüpfung (AC-2, AC-5)
5. `src/components/auth/register-form.tsx`: Felder, Validierung mit Fokus, Aufruf `signUp.email`, Weiterleitung, Formularfehler, Ladezustand, Link zu `/login` (AC-1, AC-2, AC-3, AC-6, AC-9)
6. `src/components/auth/login-form.tsx`: Felder, Validierung, Aufruf `signIn.email`, Passwort leeren bei falschen Daten, Ladezustand, Link zu `/register` (AC-4, AC-5, AC-6, AC-9)
7. `src/components/auth/session-gate.tsx`: Ladetext, Umleitung für `user`/`guest` (AC-7, AC-8)
8. `src/components/auth/dashboard.tsx`: Name, E-Mail, "Abmelden" mit `signOut` und Umleitung auf `/login` (AC-4, AC-7)
9. Seiten `src/app/register/page.tsx`, `src/app/login/page.tsx` (Gate `guest`) und `src/app/dashboard/page.tsx` (Gate `user`) (AC-1, AC-4, AC-7, AC-8, AC-9)
10. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`; bestehende F002/F003-Tests bleiben grün (AC-1 bis AC-9)
11. Manueller Smoke-Test mit `npm run dev` gegen die echte DB: registrieren mit `@example.com`-Adresse (landet angemeldet auf `/dashboard`, Cookie gesetzt), doppelte Registrierung, Abmelden, `/dashboard` erneut aufrufen (→ `/login`), falsches und richtiges Passwort, `/login` angemeldet aufrufen (→ `/dashboard`), Tastaturbedienung, 320 px Breite, Hell/Dunkel; Testnutzer danach aus der DB löschen (AC-1, AC-3, AC-4, AC-5, AC-7, AC-8, AC-9)

## Teststrategie
Alle Tests sind Vitest-Tests in jsdom (Standard aus `vitest.config.mts`, `@testing-library/jest-dom` ist eingerichtet) mit `@testing-library/react` und `@testing-library/user-event`. Kein MSW, kein echter Server.

Gemeinsame Mocks in jeder Komponenten-/Seitendatei:
```ts
vi.mock("@/lib/auth-client", () => ({
  signUp: { email: vi.fn() },
  signIn: { email: vi.fn() },
  signOut: vi.fn(),
  useSession: vi.fn(),
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));
```
Erfolgsantwort `{ data: {...}, error: null }`, Fehlerantwort z. B. `{ data: null, error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", status: 422, message: "..." } }`. Sitzung: `useSession.mockReturnValue({ data: { user: { name: "Max Mustermann", email: "max@example.com" }, session: {} }, isPending: false, error: null })`. Ladezustand über ein manuell aufgelöstes Promise. Felder über `getByLabelText("Name" | "E-Mail" | "Passwort")`, Buttons über `getByRole("button", { name })`. Texte als Literale aus dem Ticket prüfen (die Konstanten aus `auth-form.ts` dürfen zusätzlich verwendet werden). `next/link` rendert in jsdom ein `<a href>`.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Komponente | src/components/auth/register-form.test.tsx | Felder "Name", "E-Mail", "Passwort" (Label-Klick fokussiert, `type` text/email/password, `autocomplete` name/email/new-password) und Button "Registrieren" vorhanden; gültige Eingabe + Klick → `signUp.email` genau einmal mit `{ name, email, password }`, danach `replace("/dashboard")`; Absenden per Enter im Passwortfeld funktioniert ebenso |
| AC-1 | Manuell | Schritt 11 | Konto wird angelegt, Sitzungs-Cookie gesetzt (Better-Auth `autoSignIn` Standard), Dashboard zeigt den Namen |
| AC-2 | Unit | src/lib/auth-form.test.ts | `validateRegister`: leerer bzw. nur Leerzeichen-Name, `"max@"`, `"max@example"`, leere E-Mail, Passwort mit 0/7 Zeichen, 129 Zeichen liefern exakt die Meldungen; 8 und 128 Zeichen gültig; gültige Werte → `{}`; `isValidEmail` für Grenzfälle |
| AC-2 | Komponente | src/components/auth/register-form.test.tsx | Leerer Name, `"max@"`, Passwort `"kurz"` → `signUp.email` nicht aufgerufen; jede Meldung steht unter ihrem Feld und ist dessen `accessibleDescription` (`toHaveAccessibleDescription`), Feld hat `aria-invalid="true"`; Fokus liegt auf dem Namensfeld (erstes fehlerhaftes Feld); 129-Zeichen-Passwort → "Das Passwort darf höchstens 128 Zeichen lang sein."; eingegebene Werte bleiben erhalten |
| AC-3 | Unit | src/lib/auth-form.test.ts | `signUpErrorMessage` liefert für `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` und `USER_ALREADY_EXISTS` "Diese E-Mail-Adresse ist bereits registriert.", für andere Codes die Generik-Meldung |
| AC-3 | Komponente | src/components/auth/register-form.test.tsx | `signUp.email` liefert Fehler mit Code `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` → `role="alert"` mit "Diese E-Mail-Adresse ist bereits registriert.", Element steht im DOM vor dem Button (`compareDocumentPosition`), kein `replace`, alle drei Werte erhalten |
| AC-4 | Komponente | src/components/auth/login-form.test.tsx | Felder "E-Mail" (`autocomplete="email"`), "Passwort" (`autocomplete="current-password"`), Button "Anmelden"; gültige Daten → `signIn.email` mit `{ email, password }`, danach `replace("/dashboard")` |
| AC-4 | Komponente | src/components/auth/dashboard.test.tsx | Mit Sitzung: Überschrift "Dashboard", Text "Max Mustermann" und "max@example.com" sichtbar, Button "Abmelden" vorhanden |
| AC-5 | Unit | src/lib/auth-form.test.ts | `validateLogin`: leere/ungültige E-Mail → "Bitte gib eine gültige E-Mail-Adresse ein.", leeres Passwort → "Bitte gib dein Passwort ein."; kurzes Passwort beim Login gültig; `signInErrorMessage` für Code `INVALID_EMAIL_OR_PASSWORD` und für `status: 401` → "E-Mail oder Passwort ist falsch.", sonst Generik |
| AC-5 | Komponente | src/components/auth/login-form.test.tsx | Fehler `INVALID_EMAIL_OR_PASSWORD` → Meldung "E-Mail oder Passwort ist falsch." als `role="alert"`, keine Feldmeldung an E-Mail oder Passwort, Passwortfeld leer, E-Mail-Wert erhalten, kein `replace`; leere Felder bzw. `"max@"` → Feldmeldungen, `signIn.email` nicht aufgerufen, Fokus auf erstem fehlerhaftem Feld |
| AC-6 | Komponente | src/components/auth/register-form.test.tsx, src/components/auth/login-form.test.tsx | Während offenem Promise: Button deaktiviert mit Namen "Bitte warten …", zweiter Klick und Enter lösen keinen zweiten Aufruf aus (genau 1 Aufruf); Auflösung mit `{ error: { status: 500 } }` und Ablehnung des Promises (`new TypeError("Failed to fetch")`) → "Etwas ist schiefgelaufen. Bitte versuche es erneut.", Button wieder aktiv mit ursprünglichem Text, alle Werte (auch Passwort) erhalten |
| AC-6 | Unit | src/lib/auth-form.test.ts | `signUpErrorMessage({ status: 500 })` und `signInErrorMessage({ status: 500 })` → Generik-Meldung |
| AC-7 | Komponente | src/components/auth/dashboard.test.tsx | Klick auf "Abmelden" → `signOut` einmal aufgerufen, danach `replace("/login")`; `signOut` mit Fehler oder Exception → Generik-Meldung, kein `replace` |
| AC-7 | Komponente | src/components/auth/session-gate.test.tsx | Nach Abmeldung (`useSession` liefert `data: null`) leitet `SessionGate require="user"` auf `/login` um und rendert die Kinder nicht (entspricht erneutem Aufruf von `/dashboard`) |
| AC-8 | Komponente | src/components/auth/session-gate.test.tsx | `isPending: true` → "Lade Sitzung …" (`role="status"`), Kinder nicht gerendert, kein `replace` (für `user` und `guest`); `user` + Sitzung → Kinder sichtbar, kein `replace`; `user` ohne Sitzung → `replace("/login")`, Kinder nie sichtbar; `guest` + Sitzung → `replace("/dashboard")`, Kinder nie sichtbar; `guest` ohne Sitzung → Kinder sichtbar |
| AC-8 | Komponente (Seite) | src/app/auth-pages.test.tsx | `DashboardPage` mit Sitzung zeigt "Max Mustermann", ohne Sitzung `replace("/login")`, beim Laden "Lade Sitzung …" und kein Name; `LoginPage` und `RegisterPage` mit Sitzung → `replace("/dashboard")` und kein Formular; ohne Sitzung jeweils Formular sichtbar; `src/app/layout.tsx` enthält `lang="de"` (Quelltext lesen, `next/font` lässt sich in jsdom nicht rendern) |
| AC-9 | Komponente | src/components/auth/login-form.test.tsx, src/components/auth/register-form.test.tsx | Link "Noch kein Konto? Registrieren" hat `href="/register"`; Link "Schon ein Konto? Anmelden" hat `href="/login"` |

## Risiken & Rollback
- **Client-seitiger Schutz**: `/dashboard` wird nur im Browser geschützt (`SessionGate`); das HTML der Seite selbst enthält keine Nutzerdaten, diese kommen erst über `get-session` mit gültigem Cookie. Für das Platzhalter-Dashboard ausreichend. Sobald das Dashboard serverseitige Daten lädt, braucht es eine Prüfung mit `auth.api.getSession` nahe an der Datenquelle (Data Access Layer laut Next-Docs) und ggf. einen Proxy. Das ist kein Teil dieses Tickets.
- **Better-Auth-Fehlercodes**: Die Abbildung hängt an `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` und `INVALID_EMAIL_OR_PASSWORD` (geprüft in 1.7.x). Wird später `requireEmailVerification` oder `autoSignIn: false` gesetzt, liefert Better-Auth bei doppelter E-Mail eine generische Erfolgsantwort und AC-3 greift nicht mehr. Ein Better-Auth-Update kann Codes umbenennen; die Unit-Tests von `auth-form.ts` decken nur die Abbildung ab, der Smoke-Test in Schritt 11 belegt das echte Verhalten.
- **Kurzes Aufblitzen**: Unmittelbar nach `signIn` kann `useSession` auf `/dashboard` kurz `isPending` sein; dann erscheint "Lade Sitzung …" (gewollt laut AC-8), nie die Anmeldeansicht. Nach `signIn` leitet zusätzlich das `guest`-Gate auf `/dashboard` um; doppeltes `replace` auf dasselbe Ziel ist harmlos.
- **Next 16**: `useRouter` stammt aus `next/navigation` (geprüft in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`); `middleware` heißt jetzt `proxy` und wird nicht verwendet. React Compiler ist aktiv (`reactCompiler: true`): keine manuelle Memoisierung nötig, Effekte und Refs bleiben regelkonform. `next/link` löst in Vitest auf die Pages-Variante auf und rendert ohne Router-Kontext ein `<a href>`; sollte das in Tests Probleme machen, darf der Test-Writer `next/link` auf ein einfaches `<a>` mocken.
- **Leere Platzhalter-Startseite**: `/` bleibt die Next-Vorlage ohne Links zu `/login` (Neugestaltung ist nicht im Scope).
- **Testnutzer in der echten DB**: Schritt 11 schreibt in die Neon-DB; nur `@example.com`-Adressen verwenden und danach löschen.
- **Rollback**: Commit revertieren. Es werden nur neue Dateien angelegt und eine Zeile im Layout geändert; keine Abhängigkeiten, keine Migration, kein Feature-Flag nötig.

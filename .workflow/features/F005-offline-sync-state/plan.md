# Plan F005: Global State und Offline-Sync Vorbereitung

<!-- Rolle: tech-planner. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Die Grundlage für den globalen Client-Zustand und den lokalen Cache ist **TanStack Query v5 mit `PersistQueryClientProvider`** (Vorgabe des Nutzers). Als Persister dient `createAsyncStoragePersister` mit `window.localStorage`, Schlüssel `sourdough-os:query-cache`, `buster: "v1"`, `maxAge` 7 Tage. Präferenzen (`["preferences"]`) und die aktive Teig-Session (`["dough-session", "active"]`) sind Queries. Nach dem Neuladen kommen sie aus dem wiederhergestellten Cache, danach holt die Präferenz-Query die Serverwerte nach (AC-4). Präferenz-Änderungen sind Mutationen mit `setMutationDefaults` (`mutationFn`, optimistisches `onMutate`, `retry` unbegrenzt, `retryDelay` exponentiell bis 5 min, `scope` für die Reihenfolge). Offline pausiert sie der `onlineManager`. Pausierte Mutationen werden persistiert und nach der Wiederherstellung mit `resumePausedMutations()` sowie bei `online` automatisch weitergeführt (AC-5, AC-6). Den `onlineManager` speisen `navigator.onLine` und die Events `online`/`offline`/`pageshow`/`visibilitychange`. Er ist zugleich die Quelle für den Offline-Hinweis im neuen `AppHeader` (AC-1 bis AC-3). Als Testfall speichert eine neue Tabelle `user_preference` die Temperatureinheit. Die Route `GET/PUT /api/preferences` setzt „letzte Änderung gewinnt“ um. Erst nach erfolgreichem `signOut()` leert `clearOfflineData` den Query-Client und den Speicher. Scheitert das Abmelden, weil das Gerät offline ist oder ein Netzwerkfehler auftritt, erscheint „Du bist offline. Abmelden ist nur mit Internetverbindung möglich.“ Bei anderen Fehlern erscheint die bestehende Generik-Meldung. In beiden Fehlerfällen bleiben die Daten erhalten, eine Warnung oder Bestätigung vorab gibt es nicht (AC-7).

Der Provider sitzt laut Next-Doku (`01-app/01-getting-started/05-server-and-client-components.md`, „Context providers“) in einer eigenen Client-Komponente, die nur `children` umschließt, und „so tief wie möglich“. Er umschließt daher den Inhalt der geschützten Seite `/dashboard`, nicht das Root-Layout. `/login` und `/register` brauchen keinen Cache, und die F004-Tests rendern `SessionGate`/`Dashboard` ohne Provider.

Verworfen: (a) **`createSyncStoragePersister`**: in 5.104 als `@deprecated` markiert (Quelle geprüft), Ersatz ist der Async-Persister. (b) **IndexedDB-Persister** (z. B. `idb-keyval`): eine zusätzliche Abhängigkeit und kein Vorteil bei wenigen Bytes. Die Wiederherstellung ist ohnehin asynchron, ein späterer Wechsel betrifft nur `createAppPersister`. (c) **Provider im Root-Layout**: widerspricht „so tief wie möglich“, lädt TanStack auch auf `/login`/`/register` und bricht die F004-Seitentests, die `DashboardPage` ohne Provider rendern. (d) **Präferenz als Better-Auth-`additionalFields`**: koppelt Fachdaten an Auth.

## Betroffene Dateien
| Pfad | Aktion | Zweck |
|---|---|---|
| package.json | ändern | `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister` (je `^5.104.1`) (AC-4, AC-5, AC-6) |
| package-lock.json | ändern | durch `npm install` (AC-4, AC-5, AC-6) |
| src/lib/preferences.ts | neu | Typen `TemperatureUnit`, `Preferences`, `PreferencesDto`, `DEFAULT_PREFERENCES`, `parsePreferencesInput` (Client und Server, keine Imports) (AC-4, AC-5, AC-6) |
| src/db/schema/preferences.ts | neu | Tabelle `user_preference` (AC-5) |
| src/db/schema/index.ts | ändern | `export * from "./preferences"` (AC-5) |
| drizzle/0002_user_preference.sql | neu | Migration per `npm run db:generate -- --name user_preference` (AC-5) |
| drizzle/meta/0002_snapshot.json | neu | von drizzle-kit (AC-5) |
| drizzle/meta/_journal.json | ändern | Eintrag `0002_user_preference` (AC-5) |
| src/app/api/preferences/route.ts | neu | `GET`/`PUT` Präferenzen der angemeldeten Person (AC-4, AC-5, AC-6) |
| src/lib/offline-messages.ts | neu | Alle Texte als Konstanten (AC-1, AC-6, AC-7) |
| src/lib/query/online.ts | neu | `onlineManager`-Anbindung, `syncOnlineManager`, `useOnlineStatus` (AC-1, AC-2, AC-3) |
| src/lib/query/sync-user.ts | neu | Bindung der Sync-Mutationen an den bestätigten Nutzer (AC-5, AC-7) |
| src/lib/query/query-client.ts | neu | Keys, Konstanten, `retryDelay`, `createAppQueryClient`, `createAppPersister`, `createPersistOptions`, `serializePersistedClient` (AC-4, AC-5, AC-6) |
| src/lib/query/preferences.ts | neu | `fetchPreferences`, `putPreferences`, Mutation-Defaults, `usePreferences`, `useUpdatePreferences` (AC-4, AC-5, AC-6) |
| src/lib/query/dough-session.ts | neu | `ActiveDoughSession`, `useActiveDoughSession`, `setActiveDoughSession` (nur lokal) (AC-4, AC-5) |
| src/lib/query/hooks.ts | neu | `useSyncStatus`, `useCachedUserId`, `useCurrentUserId` (AC-4, AC-6) |
| src/lib/query/clear-offline-data.ts | neu | `clearOfflineData` (AC-7) |
| src/components/app/query-provider.tsx | neu | `QueryProvider` (Client) mit `PersistQueryClientProvider` (AC-4, AC-5) |
| src/components/app/cached-session-gate.tsx | neu | `CachedSessionGate`: `SessionGate require="user"` plus Cache-Optimismus (AC-4) |
| src/components/app/app-header.tsx | neu | Kopfbereich mit Live-Region (AC-1, AC-2, AC-3, AC-6) |
| src/components/app/offline-sync.tsx | neu | `OfflineSync`: Nutzerbindung nach der Wiederherstellung (AC-4, AC-5) |
| src/components/app/temperature-unit-setting.tsx | neu | Radiogruppe °C/°F (AC-4, AC-5) |
| src/components/auth/session-gate.tsx | ändern | optionale Prop `showChildrenWhilePending` (AC-4) |
| src/components/auth/dashboard.tsx | ändern | `children`-Slot, Rendern ohne `data`, `clearOfflineData` nur nach erfolgreichem Abmelden, Offline-/Netzwerkfehler-Meldung (AC-7) |
| src/app/dashboard/page.tsx | ändern | `QueryProvider` → `CachedSessionGate` → `OfflineSync`, `AppHeader`, `main` mit `Dashboard` + `TemperatureUnitSetting` (AC-1, AC-4) |
| src/test/query-client.ts | neu | Test-Helfer: `createTestQueryClient`, `seedPersistedCache`, `readPersistedCache` |
| src/lib/preferences.test.ts | neu | Unit `parsePreferencesInput` |
| src/lib/preferences-route.test.ts | neu | Route gegen PGlite (Muster `auth-handler.test.ts`) |
| src/lib/query/online.test.ts | neu | Unit Online-Anbindung |
| src/lib/query/sync-user.test.ts | neu | Unit Nutzerbindung |
| src/lib/query/query-client.test.ts | neu | Unit Defaults, `retryDelay`, Persist-Optionen, Serialisierung |
| src/components/app/query-provider.test.tsx | neu | Wiederherstellung, Neuladen, maxAge, Resume |
| src/components/app/app-header.test.tsx | neu | Hinweise und Live-Region |
| src/components/app/offline-sync.test.tsx | neu | Bindung, Nachreichen nach Wiederverbindung |
| src/components/app/temperature-unit-setting.test.tsx | neu | Anzeige aus dem Cache, Serverabgleich, Offline-Änderung |
| src/components/app/cached-session-gate.test.tsx | neu | Optimistisches Rendern mit Cache |
| src/components/auth/session-gate.test.tsx | ändern | F005-Tests für `showChildrenWhilePending` |
| src/components/auth/dashboard.test.tsx | ändern | F005-Tests Abmelden |
| src/app/auth-pages.test.tsx | ändern | F005-Seitentests `/dashboard` |
| auth-setup.test.ts | ändern | F003-Journal-Test lockern (vom Nutzer genehmigt): `entries.length >= 2`, `entries[0].tag === "0000_init"`, `entries[1].tag` passt auf `/^0001_.+/`, sonst kollidiert er mit Migration 0002 (AC-5) |

Keine Änderung an `src/app/layout.tsx`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `/login`, `/register`.

## Komponenten & Datenfluss

```
/dashboard  src/app/dashboard/page.tsx (Server, synchron, export default DashboardPage)
  <QueryProvider>                                       (Client: PersistQueryClientProvider)
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <CachedSessionGate>                               (Client → <SessionGate require="user" showChildrenWhilePending={…}>)
        <OfflineSync />                                 (Client, rendert null)
        <AppHeader />                                   (Client, <header> = banner)
        <main className="flex flex-1 items-center justify-center py-16">
          <div className="w-full max-w-sm px-4">
            <Dashboard>                                 (Client, F004 + children-Slot)
              <TemperatureUnitSetting />                (Client)
            </Dashboard>

Cache:    QueryClient (je Provider-Instanz, in useState erzeugt) ⇄ localStorage "sourdough-os:query-cache"
          Queries:   ["preferences"] → Preferences   ["dough-session","active"] → ActiveDoughSession|null   ["offline-user"] → { id }
          Mutation:  ["preferences","update"]  (scope "preferences")
Online:   onlineManager (TanStack, global) ← navigator.onLine + online/offline/pageshow/visibilitychange
Server:   GET/PUT /api/preferences  (Route Handler, auth.api.getSession, Drizzle)
```

`AppHeader` liegt **innerhalb** des Gates. So gibt es während „Lade Sitzung …“ nur eine `role="status"`-Region, und der F004-Test bleibt eindeutig. Offline bleibt die Better-Auth-Sitzung erhalten: `data` wird nur bei 401 auf `null` gesetzt, Fokus-Refetch ist offline unterdrückt (geprüft in `node_modules/better-auth/dist/client/session-atom.mjs`, `session-refresh.mjs`).

Geprüftes Verhalten von TanStack 5.104.1 (Quellen per `npm pack` gesichtet):
- `PersistQueryClientProvider` stellt in einem Effekt asynchron wieder her. Solange `useIsRestoring()` `true` liefert, holen Queries nichts. Das Speichern abonniert er erst danach.
- `persistQueryClientRestore` verwirft bei `Date.now() - timestamp > maxAge` oder abweichendem `buster` den Speicher (`removeClient`).
- Standardmäßig werden nur Mutationen mit `state.isPaused` dehydriert, und `resumePausedMutations` setzt nur pausierte fort. Eine wiederhergestellte `pending`-Mutation läuft über `continue()` mit `execute(variables)` weiter, ohne erneutes `onMutate`, mit den Optionen aus `setMutationDefaults`.
- `QueryClient.mount()` ruft bei `online` und bei Fokus `resumePausedMutations()` und danach den Query-Refetch auf.
- `onlineManager` startet mit `true` und liest `navigator.onLine` nicht. Deshalb gibt es eine eigene `setEventListener`-Anbindung.

### src/lib/preferences.ts (rein, keine Imports)
```ts
export const TEMPERATURE_UNITS = ["C", "F"] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];
export interface Preferences { temperatureUnit: TemperatureUnit }
export interface PreferencesDto { temperatureUnit: TemperatureUnit; updatedAt: string | null } // ISO
export const DEFAULT_PREFERENCES: Preferences = { temperatureUnit: "C" };
/** PUT-Body { temperatureUnit, updatedAt: ISO }. Ungültig → null. */
export function parsePreferencesInput(body: unknown): { temperatureUnit: TemperatureUnit; updatedAt: Date } | null;
```
Ungültig: kein Objekt, `temperatureUnit` nicht exakt `"C"`/`"F"`, `updatedAt` fehlt, ist kein String oder ergibt `Invalid Date`.

### src/db/schema/preferences.ts (relative Importe wie `auth.ts`)
```ts
export const userPreference = pgTable("user_preference", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  temperatureUnit: text("temperature_unit").notNull().default("C"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),   // Änderungszeitpunkt vom Client
});
```
`createTestDb().reset()` leert die Tabelle über `TRUNCATE "user" CASCADE` mit.

### src/app/api/preferences/route.ts
```ts
export async function GET(request: Request): Promise<Response>;
export async function PUT(request: Request): Promise<Response>;
```
- Importiert `auth` aus `@/lib/auth` und `db` aus `@/db` (für `vi.doMock`).
- `auth.api.getSession({ headers: request.headers })`. Ohne Sitzung `401 { error: "UNAUTHORIZED" }`.
- `GET`: Zeile zu `session.user.id`. Fehlt sie, kommt `200 { temperatureUnit: "C", updatedAt: null }`, sonst `200 { temperatureUnit, updatedAt: ISO }`.
- `PUT`: `request.json()`, dann `parsePreferencesInput`. Ungültig oder Parse-Fehler ergibt `400 { error: "INVALID_INPUT" }`. Sonst `insert … onConflictDoUpdate({ target: userPreference.userId, set, setWhere: lt(userPreference.updatedAt, <eingehendes updatedAt>) })`, danach die gespeicherte Zeile lesen und als `200 PreferencesDto` zurückgeben (der Gewinner nach „letzte Änderung gewinnt“).

### src/lib/offline-messages.ts
```ts
export const OFFLINE_MESSAGE = "Offline – Änderungen werden lokal gespeichert";             // U+2013
export const SYNC_ERROR_MESSAGE = "Änderungen konnten nicht synchronisiert werden. Neuer Versuch läuft.";
export const OFFLINE_SIGN_OUT_MESSAGE = "Du bist offline. Abmelden ist nur mit Internetverbindung möglich.";
export const TEMPERATURE_UNIT_LEGEND = "Temperatureinheit";
export const TEMPERATURE_UNIT_LABELS = { C: "Celsius (°C)", F: "Fahrenheit (°F)" } as const;
export const PREFERENCES_LOADING_MESSAGE = "Lade Einstellungen …";                          // U+2026
export const APP_NAME = "Sourdough OS";
```

### src/lib/query/online.ts
```ts
export function getNavigatorOnline(): boolean;      // typeof navigator === "undefined" ? true : navigator.onLine
export function syncOnlineManager(): void;          // onlineManager.setOnline(getNavigatorOnline())
export function useOnlineStatus(): boolean;         // useSyncExternalStore(cb => onlineManager.subscribe(cb), () => onlineManager.isOnline(), () => true)
```
- Beim Import (nur bei `typeof window !== "undefined"`) wird einmalig `onlineManager.setEventListener(setOnline => { setOnline(getNavigatorOnline()); handler = () => setOnline(getNavigatorOnline()); window "online" | "offline" | "pageshow", document "visibilitychange" → handler; return cleanup })` aufgerufen.
- `QueryProvider` ruft `syncOnlineManager()` im `useState`-Initializer auf, also vor dem ersten Render der Kinder. So ist der erste Client-Render bei schon bestehendem Offline-Zustand korrekt (AC-3). Der Server-Snapshot ist `true`, auf dem Server wird nie „offline“ gerendert.
- `useOnlineStatus` braucht **keinen** Provider, `Dashboard` funktioniert also auch in den F004-Tests ohne Provider.

### src/lib/query/sync-user.ts
```ts
export class ForeignUserError extends Error {}
export function bindSyncUser(userId: string): void;
export function resetSyncUser(): void;
export function getSyncUserId(): string | null;
/** Löst auf, sobald userId gebunden ist; wirft ForeignUserError, wenn ein anderer Nutzer gebunden ist/wird. */
export function waitForSyncUser(userId: string): Promise<void>;
```
Zweck: Eine nach dem Neuladen fortgesetzte Mutation sendet erst, wenn `OfflineSync` die Sitzung bestätigt hat. Daten einer früheren Person gehen so nie an ein anderes Konto. Solange die Mutation wartet, gilt sie nicht als Fehlschlag (`failureCount` 0, kein Hinweis).

### src/lib/query/query-client.ts
```ts
export const QUERY_CACHE_KEY = "sourdough-os:query-cache";
export const CACHE_BUSTER = "v1";
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
export const PERSIST_THROTTLE_MS = 100;
export const PREFERENCES_QUERY_KEY = ["preferences"] as const;
export const PREFERENCES_MUTATION_KEY = ["preferences", "update"] as const;
export const ACTIVE_DOUGH_SESSION_QUERY_KEY = ["dough-session", "active"] as const;
export const OFFLINE_USER_QUERY_KEY = ["offline-user"] as const;

/** TanStack ruft mit failureCount 0, 1, 2 …: min(1000 · 2^failureCount, MAX_RETRY_DELAY_MS) → 1 s, 2 s, 4 s … 300 s */
export function retryDelay(failureCount: number): number;
export function createAppQueryClient(): QueryClient;
export function createAppPersister(storage?: AsyncStorage<string> | null): Persister; // Default: window.localStorage, auf dem Server null
export function createPersistOptions(persister: Persister): OmitKeyof<PersistQueryClientOptions, "queryClient">;
/** JSON.stringify, setzt aber für alle Mutationen mit status "pending" state.isPaused = true. */
export function serializePersistedClient(client: PersistedClient): string;
```
- `createAppQueryClient`: `defaultOptions.queries = { gcTime: CACHE_MAX_AGE_MS, staleTime: 0, retry: 1 }`. Ist `gcTime` kleiner als `maxAge`, gehen persistierte Queries verloren, deshalb gilt `gcTime ≥ maxAge`. Danach `registerPreferencesMutation(client)` (aus `./preferences`).
- `createAppPersister`: `createAsyncStoragePersister({ storage, key: QUERY_CACHE_KEY, throttleTime: PERSIST_THROTTLE_MS, serialize: serializePersistedClient })`.
- `createPersistOptions`: `{ persister, maxAge: CACHE_MAX_AGE_MS, buster: CACHE_BUSTER, dehydrateOptions: { shouldDehydrateMutation: m => m.state.status === "pending", shouldDehydrateQuery: q => q.state.status === "success" } }`. Persistiert werden also auch Mutationen, die online gerade im Retry-Backoff hängen (AC-6). Dank `serializePersistedClient` gelten sie nach dem Neuladen als pausiert und werden fortgesetzt.

### src/lib/query/preferences.ts
```ts
export interface UpdatePreferencesVariables { userId: string; temperatureUnit: TemperatureUnit; changedAt: string } // ISO
export async function fetchPreferences(): Promise<PreferencesDto>;                            // GET /api/preferences, wirft bei !ok
export async function putPreferences(v: UpdatePreferencesVariables): Promise<PreferencesDto>; // PUT, Body { temperatureUnit, updatedAt: changedAt }, wirft bei !ok
export function registerPreferencesMutation(client: QueryClient): void;
export function usePreferences(): UseQueryResult<Preferences>;
export function useUpdatePreferences(): UseMutationResult<PreferencesDto, Error, UpdatePreferencesVariables>;
```
- `registerPreferencesMutation` registriert `client.setMutationDefaults(PREFERENCES_MUTATION_KEY, {…})`:
  - `mutationFn: async v => { await waitForSyncUser(v.userId); return putPreferences(v); }`
  - `retry: (_count, error) => !(error instanceof ForeignUserError)` (sonst unbegrenzt), `retryDelay`, `scope: { id: "preferences" }`, `networkMode: "online"` (Default, offline pausiert).
  - `onMutate: async v => { await client.cancelQueries({ queryKey: PREFERENCES_QUERY_KEY }); client.setQueryData(PREFERENCES_QUERY_KEY, { temperatureUnit: v.temperatureUnit }); }` (optimistisch, sofort sichtbar und persistiert).
  - `onSuccess: dto => { if (client.isMutating({ mutationKey: PREFERENCES_MUTATION_KEY }) <= 1) client.setQueryData(PREFERENCES_QUERY_KEY, { temperatureUnit: dto.temperatureUnit }); }` (Gewinner vom Server, wenn keine neuere Änderung wartet).
- `usePreferences`: `useQuery({ queryKey: PREFERENCES_QUERY_KEY, enabled: Boolean(useCurrentUserId()), queryFn })`. `queryFn` holt `fetchPreferences()`. Gilt danach `client.isMutating({ mutationKey: PREFERENCES_MUTATION_KEY }) > 0`, wird der aktuelle Cache-Wert zurückgegeben (lokale Änderung gewinnt bis zur Übertragung), sonst `{ temperatureUnit: dto.temperatureUnit }`.
- `useUpdatePreferences`: `useMutation({ mutationKey: PREFERENCES_MUTATION_KEY })`, der Rest kommt aus den Defaults.

### src/lib/query/dough-session.ts (vorbereiteter Speicherbereich, ohne Oberfläche, ohne Server)
```ts
export type ActiveDoughSession = Record<string, unknown>;    // Platzhalter
export function useActiveDoughSession(): ActiveDoughSession | null;   // useQuery({ queryKey: ACTIVE_DOUGH_SESSION_QUERY_KEY, queryFn: skipToken, staleTime: Infinity }).data ?? null
export function setActiveDoughSession(client: QueryClient, session: ActiveDoughSession | null): void; // setQueryData → wird persistiert
```

### src/lib/query/hooks.ts
```ts
export type SyncStatus = "idle" | "pending" | "error";
/** useMutationState(PREFERENCES_MUTATION_KEY, status "pending"): keine → idle; eine mit failureCount > 0 → error; sonst pending */
export function useSyncStatus(): SyncStatus;
export function useCachedUserId(): string | null;   // useQuery({ queryKey: OFFLINE_USER_QUERY_KEY, queryFn: skipToken, staleTime: Infinity }).data?.id ?? null
export function useCurrentUserId(): string | null;  // useSession().data?.user?.id ?? useCachedUserId()
```

### src/lib/query/clear-offline-data.ts
```ts
/** resetSyncUser(); client?.cancelQueries(); client?.clear() (Queries + Mutationen); localStorage.removeItem(QUERY_CACHE_KEY) in try/catch */
export function clearOfflineData(client: QueryClient | undefined): void;
```
Ein nachlaufender, gedrosselter Speichervorgang kann danach höchstens einen **leeren** Cache schreiben (`queries: []`, `mutations: []`), aber keine Nutzerdaten.

### src/components/app/query-provider.tsx
```ts
"use client";
export interface QueryProviderProps { children: React.ReactNode; client?: QueryClient; persister?: Persister } // client/persister für Tests
export function QueryProvider({ children, client, persister }: QueryProviderProps): React.JSX.Element;
```
- `const [state] = useState(() => { syncOnlineManager(); const qc = client ?? createAppQueryClient(); return { qc, options: createPersistOptions(persister ?? createAppPersister()) }; })`. Pro Provider-Instanz gibt es einen Client, kein Modul-Singleton (SSR-sicher).
- `<PersistQueryClientProvider client={qc} persistOptions={options} onSuccess={() => qc.resumePausedMutations()}>{children}</PersistQueryClientProvider>`.

### src/components/app/cached-session-gate.tsx
```ts
export function CachedSessionGate({ children }: { children: React.ReactNode }): React.JSX.Element;
// <SessionGate require="user" showChildrenWhilePending={useCachedUserId() !== null}>{children}</SessionGate>
```
Der Baum bleibt stabil, es gibt keinen Remount, wenn die Sitzung eintrifft. Während der Wiederherstellung (ein paar Microtasks) ist `useCachedUserId()` noch `null`, dann erscheint wie bisher „Lade Sitzung …“.

### src/components/auth/session-gate.tsx (ändern)
```ts
export interface SessionGateProps {
  require: "user" | "guest";
  showChildrenWhilePending?: boolean;   // neu, Default false; wirkt nur bei require="user"
  children: ReactNode;
}
```
Neu: Gilt `isPending && require === "user" && showChildrenWhilePending`, werden die `children` gerendert. Sonst bleibt das F004-Verhalten unverändert, ohne Abhängigkeit von TanStack.

### src/components/app/offline-sync.tsx
```ts
export function OfflineSync(): null;
```
- `isRestoring = useIsRestoring()`, `client = useQueryClient()`, `userId = useSession().data?.user?.id`.
- `useEffect` auf `[isRestoring, userId]`: Bei `!isRestoring && userId` wird der Wert von `client.getQueryData(OFFLINE_USER_QUERY_KEY)` geprüft. Weicht seine `id` ab (andere Person), folgt `client.clear()`. Danach `client.setQueryData(OFFLINE_USER_QUERY_KEY, { id: userId })`, `bindSyncUser(userId)` und `void client.resumePausedMutations()`. Ohne `userId` passiert nichts (F004-Mocks haben keine `id`).
- Dass die Bindung erst nach der Wiederherstellung kommt, ist Pflicht. Sonst würde `hydrate` danach fremde Daten zurückspielen.

### src/components/app/app-header.tsx
```ts
export function AppHeader(): React.JSX.Element;
```
- `online = useOnlineStatus()`, `sync = useSyncStatus()`. Meldung: offline ergibt `OFFLINE_MESSAGE`, online mit `sync === "error"` ergibt `SYNC_ERROR_MESSAGE`, sonst keine. Es erscheint immer nur eine Meldung, offline hat Vorrang.
- `<header>` (banner) mit `APP_NAME` und einer **immer gerenderten** `<div role="status">` (polite). Darin steht die Meldung als `<p>`-Text oder nichts. Jede Änderung wird so einmal angesagt.
- Stil: normaler Fluss, nicht `fixed`/`sticky`, `flex flex-wrap`, `break-words`, lesbar ab 320 px. Container `border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950`. Offline-Text `bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50`, Sync-Fehler `text-red-700 dark:text-red-400`. Die Bedeutung trägt immer der Text.

### src/components/app/temperature-unit-setting.tsx
```ts
export function TemperatureUnitSetting(): React.JSX.Element | null;
```
- `isRestoring = useIsRestoring()`, `{ data } = usePreferences()`, `userId = useCurrentUserId()`, `{ mutate } = useUpdatePreferences()`.
- Während `isRestoring` wird `null` gerendert, keine Ladeanzeige. Danach ohne `data` `<p>Lade Einstellungen …</p>` (ohne `role`).
- Mit `data` folgt `<fieldset><legend>Temperatureinheit</legend>` mit zwei Radios `name="temperature-unit"`, Labels „Celsius (°C)“ und „Fahrenheit (°F)“, `checked` nach `data.temperatureUnit`. `onChange` ruft `mutate({ userId, temperatureUnit, changedAt: new Date().toISOString() })` auf, aber nur mit `userId`.

### src/components/auth/dashboard.tsx (ändern)
```ts
export interface DashboardProps { children?: React.ReactNode }   // Slot vor Fehlermeldung/Button
export function Dashboard({ children }: DashboardProps): React.JSX.Element;
```
- Ohne `data` wird nicht mehr `null` gerendert, sondern Überschrift, `children` und Button. Name und E-Mail erscheinen nur mit `data` (optimistische Phase).
- `const queryClient = useContext(QueryClientContext)`. Das ist optional, denn die F004-Tests rendern ohne Provider. `online = useOnlineStatus()`.
- Abmelden, ohne Warnung und ohne `window.confirm`:
  1. Gilt `!online`, erscheint direkt `OFFLINE_SIGN_OUT_MESSAGE` als `role="alert"`, ohne `signOut`-Aufruf. Der Cache bleibt.
  2. Sonst `signOut()` wie in F004. Bei Erfolg (kein `error`) folgen `clearOfflineData(queryClient)` und `router.replace("/login")`.
  3. Wirft `signOut()` eine Exception (Netzwerkfehler, z. B. `TypeError("Failed to fetch")`), erscheint `OFFLINE_SIGN_OUT_MESSAGE`. Liefert es eine Fehlerantwort (`error` gesetzt, etwa Status 500), erscheint `GENERIC_ERROR_MESSAGE`. In beiden Fällen gibt es keine Umleitung und kein Leeren, der Button ist wieder aktiv.
  - Der F004-Test „Netzwerkfehler beim Abmelden → Generik-Meldung“ widerspricht damit dem geänderten AC-7. Er wird auf die neue Offline-Meldung angepasst (siehe Teststrategie).

### Lade- und Fehlerzustände
- Sitzung: „Lade Sitzung …“ wie bisher. Mit wiederhergestelltem Cache-Nutzer entfällt der Text.
- Präferenzen: während der Wiederherstellung nichts, danach Cache-Wert oder ohne Cache „Lade Einstellungen …“. Query-Fehler lassen den Cache-Wert stehen.
- Sync: `useSyncStatus` `error` erzeugt den Header-Hinweis. Ist die Mutation erfolgreich, ist sie nicht mehr `pending`, der Hinweis verschwindet.
- Neue Abhängigkeiten: `@tanstack/react-query` (Cache, Mutationen, `onlineManager`), `@tanstack/react-query-persist-client` (`PersistQueryClientProvider`, `maxAge`, `buster`, Dehydrate-Optionen), `@tanstack/query-async-storage-persister` (`localStorage`-Persister, Nachfolger des veralteten Sync-Persisters). Kein Devtools-Paket.

## Arbeitsschritte
1. `npm install @tanstack/react-query@^5.104.1 @tanstack/react-query-persist-client@^5.104.1 @tanstack/query-async-storage-persister@^5.104.1` (AC-4, AC-5, AC-6)
2. `src/lib/preferences.ts` mit Typen und `parsePreferencesInput` (AC-5, AC-6)
3. `src/db/schema/preferences.ts`, Export in `index.ts`, Migration mit `npm run db:generate -- --name user_preference` erzeugen und sichten (AC-5)
4. `src/app/api/preferences/route.ts` mit `GET`, `PUT`, 401/400 und „letzte Änderung gewinnt“ (AC-4, AC-5, AC-6)
5. `src/lib/offline-messages.ts` (AC-1, AC-6, AC-7)
6. `src/lib/query/online.ts`: `setEventListener` mit `online`/`offline`/`pageshow`/`visibilitychange`, `syncOnlineManager`, `useOnlineStatus` (AC-1, AC-2, AC-3)
7. `src/lib/query/sync-user.ts` (AC-5, AC-7)
8. `src/lib/query/query-client.ts`: Keys, `retryDelay`, `createAppQueryClient`, `createAppPersister`, `createPersistOptions` (`maxAge` 7 Tage, `buster`, Dehydrate-Prädikate), `serializePersistedClient` (AC-4, AC-5, AC-6)
9. `src/lib/query/preferences.ts`: API-Funktionen, Mutation-Defaults (optimistisch, Retry bis 5 min, `scope`, `waitForSyncUser`), `usePreferences` mit Vorrang ausstehender Änderungen, `useUpdatePreferences` (AC-4, AC-5, AC-6)
10. `src/lib/query/dough-session.ts` als lokaler, persistierter Speicherbereich (AC-4, AC-5)
11. `src/lib/query/hooks.ts` (`useSyncStatus`, `useCachedUserId`, `useCurrentUserId`) (AC-4, AC-6)
12. `src/lib/query/clear-offline-data.ts` (AC-7)
13. `src/components/app/query-provider.tsx` mit `PersistQueryClientProvider` und `resumePausedMutations` nach der Wiederherstellung (AC-4, AC-5)
14. `SessionGate`: Prop `showChildrenWhilePending`, dazu `src/components/app/cached-session-gate.tsx` (AC-4)
15. `src/components/app/offline-sync.tsx` (Bindung nach der Wiederherstellung, Fremdnutzer verwerfen, fortsetzen) (AC-4, AC-5)
16. `src/components/app/app-header.tsx` mit Live-Region, Vorrang „offline“, Hell/Dunkel, 320 px (AC-1, AC-2, AC-3, AC-6)
17. `src/components/app/temperature-unit-setting.tsx` (AC-4, AC-5)
18. `Dashboard`: `children`-Slot, Rendern ohne `data`, `clearOfflineData` nur nach erfolgreichem `signOut`, Offline-/Netzwerkfehler-Meldung, sonst Generik-Meldung, Daten bleiben erhalten (AC-7)
19. `src/app/dashboard/page.tsx` zusammensetzen (AC-1, AC-4)
20. `auth-setup.test.ts` (F003): Journal-Test auf `length >= 2`, `entries[0]` = `0000_init`, `entries[1]` passend auf `0001_*` lockern (genehmigt) (AC-5)
21. `src/test/query-client.ts` (Test-Helfer) anlegen. Er wird vom Test-Writer zuerst gebraucht und gehört deshalb in die Testphase (AC-4, AC-5, AC-7)
22. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. F002–F004 bleiben grün (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7)
23. `npm run db:migrate` auf Neon, dann manueller Smoke-Test mit `npm run dev` und DevTools „Offline“: Hinweis an/aus (AC-1, AC-2), Tab-Wechsel und Zurück offline (AC-3), Neuladen mit gecachtem °F (AC-4), Änderung offline, dann online, DB-Zeile innerhalb 10 s (AC-5), `/api/preferences` per Request-Blocking sperren, Hinweis und Erholung (AC-6), Abmelden online und offline mit Blick in `localStorage` (AC-7), 320 px, Hell und Dunkel, Screenreader. Nur `@example.com`-Testnutzer, danach löschen

## Teststrategie
Vitest, jsdom, `@testing-library/react` und `user-event`. Der Route-Test läuft mit `// @vitest-environment node` gegen PGlite. Kein MSW. Tags `F005/AC-n` im Testnamen.

**Test-Helfer `src/test/query-client.ts`** (legt der Test-Writer an):
```ts
export function createTestQueryClient(): QueryClient;   // createAppQueryClient() mit queries.retry = false
export function seedPersistedCache(entries: Array<{ queryKey: readonly unknown[]; data: unknown }>, opts?: { timestamp?: number; buster?: string }): void;
// baut einen QueryClient, setQueryData je Eintrag, dehydrate, schreibt { buster: CACHE_BUSTER, timestamp: Date.now(), clientState } nach localStorage[QUERY_CACHE_KEY]
export function readPersistedCache(): PersistedClient | null;   // JSON aus localStorage[QUERY_CACHE_KEY] oder null
```
Weitere Regeln:
- Komponenten mit Cache in `<QueryProvider client={createTestQueryClient()}>` rendern. Auf die Wiederherstellung mit `findBy…`/`waitFor` warten. „Neuladen“ heißt `unmount()`, dann neuer Client und neuer Provider auf demselben `localStorage` (Persistenz abwarten: `await waitFor(() => expect(readPersistedCache()…))`).
- Online-Status: `vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)` und `act(() => window.dispatchEvent(new Event("offline")))` (bzw. `true` und `"online"`, `pageshow`, `document` `visibilitychange`). Alternativ `act(() => onlineManager.setOnline(false))`. In `afterEach` `onlineManager.setOnline(true)`, `localStorage.clear()`, `resetSyncUser()`, `vi.restoreAllMocks()`.
- Server: `vi.stubGlobal("fetch", vi.fn())` mit `new Response(JSON.stringify(dto), { status })`, für „antwortet noch nicht“ ein offenes Promise.
- Sitzung: `vi.mock("@/lib/auth-client", …)` wie F004, für F005 `user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }`.
- Retry-Zeiten: `vi.useFakeTimers({ shouldAdvanceTime: true })` plus `vi.advanceTimersByTimeAsync`.
- Texte als Literale aus dem Ticket.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/query/online.test.ts | Nach `offline`-Event (mit `onLine` `false`) liefert `onlineManager.isOnline()` `false`, ein `onlineManager.subscribe`-Listener wurde aufgerufen. `syncOnlineManager()` übernimmt `navigator.onLine` |
| AC-1 | Komponente | src/components/app/app-header.test.tsx | In `QueryProvider`: `banner` und leere `status`-Region vorhanden. Nach `offline` steht „Offline – Änderungen werden lokal gespeichert“ in **derselben** Region (gleiches Element), synchron ohne Timer, als sichtbarer Text, Header nicht `fixed`/`sticky` |
| AC-1 | Komponente (Seite) | src/app/auth-pages.test.tsx | `DashboardPage` mit Sitzung `id: "u1"` und `fetch`-Stub: Nach `offline` steht der Hinweis im `banner`. „Abmelden“ ist aktiv, Radio „Fahrenheit (°F)“ lässt sich anklicken und ist danach ausgewählt |
| AC-2 | Komponente | src/components/app/app-header.test.tsx | Offline, dann `online`: Hinweis weg, Region leer, keine „Wieder online“-Meldung |
| AC-2 | Unit | src/lib/query/online.test.ts | `offline` gefolgt von `online` ergibt `isOnline()` `true`. Der `setEventListener`-Cleanup entfernt alle vier Listener |
| AC-3 | Komponente | src/components/app/app-header.test.tsx | `onLine` schon vor `render` `false`: Hinweis im ersten Render (direkt nach `render`, ohne `waitFor`). Online gerendert: Hinweis nie im DOM, auch nicht nach `pageshow`/`visibilitychange`. Online gerendert, dann `onLine` `false` ohne `offline`-Event und `pageshow` bzw. `visibilitychange` auslösen: Hinweis erscheint |
| AC-3 | Unit | src/lib/query/online.test.ts | `pageshow` und `visibilitychange` übernehmen `navigator.onLine` in den `onlineManager` |
| AC-4 | Unit | src/lib/query/query-client.test.ts | `createPersistOptions`: `maxAge === 7 * 24 * 60 * 60 * 1000`, `buster === "v1"`, `shouldDehydrateMutation` `true` für `pending` (auch nicht pausiert) und `false` für `success`/`error`. `createAppQueryClient().getDefaultOptions().queries.gcTime >= maxAge` |
| AC-4 | Komponente | src/components/app/query-provider.test.tsx | `seedPersistedCache([{ queryKey: ["preferences"], data: { temperatureUnit: "F" } }])`: Nach der Wiederherstellung liefert `client.getQueryData(["preferences"])` „F“, ohne `fetch`-Aufruf während `isRestoring`. Mit `timestamp` älter als 7 Tage: Daten verworfen, `localStorage[QUERY_CACHE_KEY]` entfernt. Abweichender `buster` verwirft ebenso |
| AC-4 | Komponente | src/components/app/temperature-unit-setting.test.tsx | Cache „F“, Sitzung `u1`, `fetch` offen: „Fahrenheit (°F)“ ausgewählt, „Lade Einstellungen …“ nie sichtbar, kein „Lade …“-Text während der Wiederherstellung. `fetch` mit `{ temperatureUnit: "C" }` auflösen: „Celsius (°C)“ ausgewählt, ohne Interaktion. GET ging an `/api/preferences`. Ohne Cache: „Lade Einstellungen …“, bis der Server antwortet |
| AC-4 | Komponente | src/components/app/cached-session-gate.test.tsx | `useSession` `PENDING`, Cache mit `["offline-user"] = { id: "u1" }`: Kinder sichtbar (nach der Wiederherstellung), kein „Lade Sitzung …“ danach, kein `replace`. Ohne Cache-Nutzer: „Lade Sitzung …“. Danach `NO_SESSION`: `replace("/login")` |
| AC-4 | Komponente | src/components/auth/session-gate.test.tsx | `PENDING` mit `showChildrenWhilePending`: Kinder sichtbar, kein Ladetext. Bei `require="guest"` wirkt die Prop nicht. Ohne Prop F004-Verhalten |
| AC-4 | Komponente (Seite) | src/app/auth-pages.test.tsx | `DashboardPage` mit `PENDING` und Cache (`offline-user` `u1`, Präferenz „F“): Überschrift „Dashboard“ und „Fahrenheit (°F)“ ausgewählt, ohne „Lade Sitzung …“ und ohne „Lade Einstellungen …“ (nach der Wiederherstellung). Die F004-Tests der Datei bleiben unverändert grün |
| AC-4 | Integration (Route) | src/lib/preferences-route.test.ts | `vi.doMock("@/db")` (PGlite) und `vi.doMock("@/lib/auth", () => ({ auth: { api: { getSession } } }))`: `GET` ohne Zeile ergibt `200 { temperatureUnit: "C", updatedAt: null }`, ohne Sitzung `401` |
| AC-5 | Komponente | src/components/app/temperature-unit-setting.test.tsx | Offline: Klick auf „Fahrenheit (°F)“ wählt sofort aus, kein `fetch`. `readPersistedCache()` enthält die Query „F“ und eine Mutation mit `mutationKey ["preferences","update"]`, `state.isPaused === true`, `variables.temperatureUnit === "F"`. Nach „Neuladen“ (neuer Client und Provider) ist „F“ weiterhin ausgewählt |
| AC-5 | Komponente | src/components/app/offline-sync.test.tsx | Neuladen mit der persistierten pausierten Mutation und Sitzung `u1`, offline: kein `fetch`. `online`-Event: `fetch` mit `PUT /api/preferences`, Body `{ temperatureUnit: "F", updatedAt: <changedAt> }` innerhalb von 10 s ohne Interaktion. Danach ist keine Mutation mehr `pending`. Cache-Nutzer `u2` bei Sitzung `u1`: Cache und Mutationen werden verworfen, kein `PUT`. Vor der Bindung (Sitzung `PENDING`) wird nicht gesendet |
| AC-5 | Unit | src/lib/query/sync-user.test.ts | `waitForSyncUser("u1")` bleibt offen bis `bindSyncUser("u1")`, löst dann auf. `bindSyncUser("u2")` lässt es mit `ForeignUserError` scheitern. `resetSyncUser()` hebt die Bindung auf |
| AC-5 | Unit | src/lib/query/query-client.test.ts | `serializePersistedClient` setzt für `pending`-Mutationen `isPaused: true` und lässt Queries unverändert. Die Mutation-Defaults für `["preferences","update"]` haben `scope.id === "preferences"` und `retryDelay === retryDelay`. `setActiveDoughSession(client, { id: "s1" })` landet unter `["dough-session","active"]` und nach `dehydrate` im persistierten Zustand. `useActiveDoughSession` liest es nach dem Neuladen (über `renderHook` im Provider) |
| AC-5 | Integration (Route) | src/lib/preferences-route.test.ts | `PUT { "F", updatedAt }` ergibt 200 und eine Zeile, danach liefert `GET` „F“. Älteres `updatedAt` überschreibt nicht, Antwort ist der gespeicherte neuere Wert. Neueres überschreibt |
| AC-5 | Unit | src/lib/preferences.test.ts | `parsePreferencesInput` akzeptiert „C“/„F“ mit gültigem ISO-Datum und lehnt `"K"`, `"c"`, fehlendes oder ungültiges `updatedAt`, `null`, Strings ab |
| AC-6 | Unit | src/lib/query/query-client.test.ts | `retryDelay(0..)` ergibt 1000, 2000, 4000 …, ab `failureCount` 9 jeweils 300000, nie mehr. `retry` der Mutation-Defaults liefert `true` für `Error`/`TypeError` bei beliebig hohem `failureCount` (z. B. 1000) und `false` für `ForeignUserError` |
| AC-6 | Komponente | src/components/app/offline-sync.test.tsx | Online, Sitzung `u1`, `fetch` liefert 500 (bzw. wirft `TypeError`): Wert bleibt „F“ ausgewählt, `useSyncStatus` bzw. Header melden `error`, zweiter Versuch nach 1000 ms, dritter nach weiteren 2000 ms (Fake-Timer). Danach `fetch` 200: Mutation erledigt, Hinweis weg |
| AC-6 | Komponente | src/components/app/app-header.test.tsx | Online mit fehlschlagender Mutation (`failureCount > 0`): „Änderungen konnten nicht synchronisiert werden. Neuer Versuch läuft.“ in der `status`-Region, als Text, in Fehlerfarbe. Nach Erfolg weg. Offline mit Fehlerzustand: nur der Offline-Hinweis |
| AC-6 | Integration (Route) | src/lib/preferences-route.test.ts | Ungültiger Body ergibt 400 ohne DB-Änderung, ohne Sitzung 401 (beides im Client ein Fehlschlag mit Retry) |
| AC-7 | Unit | src/lib/query/query-client.test.ts | `clearOfflineData(client)` leert alle Queries und Mutationen des Clients, entfernt `localStorage[QUERY_CACHE_KEY]` und hebt die Sync-Bindung auf. `clearOfflineData(undefined)` entfernt nur den Speicher, ohne Fehler |
| AC-7 | Komponente | src/components/auth/dashboard.test.tsx | In `QueryProvider` mit Cache (Präferenz „F“ und pausierte Mutation). `window.confirm` wird in keinem Fall aufgerufen (Spy). Erfolgreiches `signOut`: einmal aufgerufen, danach enthält `readPersistedCache()` keine Query und keine Mutation (`null` oder leere Listen), dazu `replace("/login")`. Offline (`onLine` `false`): `role="alert"` mit „Du bist offline. Abmelden ist nur mit Internetverbindung möglich.“, kein `replace`, Cache samt Mutation unverändert. `signOut` wirft `TypeError("Failed to fetch")`: dieselbe Offline-Meldung, Cache unverändert. `signOut` mit Fehlerantwort (500): „Etwas ist schiefgelaufen. Bitte versuche es erneut.“, Cache unverändert. Der F004-Test „Netzwerkfehler → Generik-Meldung“ wird auf die Offline-Meldung angepasst, die übrigen F004-Tests ohne Provider bleiben unverändert |
| AC-5 | Unit (Anpassung) | auth-setup.test.ts | F003-Journal-Test gelockert: `entries.length >= 2`, `entries[0].tag === "0000_init"`, `entries[1].tag` passt auf `/^0001_.+/`. Damit bleibt er mit der Migration `0002_user_preference` grün |

## Risiken & Rollback
- **Widerspruch AC-5 „offline neu laden“:** Ohne Service Worker (nicht im Scope) zeigt der Browser beim Neuladen ohne Netz seine eigene Offline-Seite, die App startet nicht. Erfüllbar ist: Die Änderung ist samt pausierter Mutation persistiert, nach jedem Neuladen mit Netz sofort sichtbar und wird dann nachgereicht. Bei Tab-Wechsel oder bfcache-Rückkehr offline bleibt sie ohnehin erhalten. Die Tests simulieren das Neuladen über einen neuen Client und Provider. **Dem Hauptagenten gemeldet.**
- **AC-7 (geändert):** Offline ist Abmelden nicht möglich (`httpOnly`-Cookie). Es erscheint die eigene Offline-Meldung, Sitzung und Daten bleiben erhalten. Geleert wird nur nach erfolgreichem `signOut`. Unterschieden wird über `useOnlineStatus()` und die Art des Fehlers: Exception gilt als Netzwerkfehler, eine Fehlerantwort führt zur Generik-Meldung. Das F004-Verhalten „Netzwerkfehler → Generik-Meldung“ ändert sich dadurch bewusst, der zugehörige F004-Test wird angepasst.
- **F003-Journal-Test:** `auth-setup.test.ts` erwartete genau zwei Einträge. Er wird mit Genehmigung des Nutzers auf `>= 2` gelockert, die Reihenfolge `0000_init`/`0001_*` bleibt geprüft.
- **Teig-Sessions ohne Server-API:** Sie sind nur ein persistierter Query-Speicherbereich ohne Mutation und ohne Server. Der Server-Teil von AC-5 ist nur für Präferenzen prüfbar. Ein späteres Ticket ergänzt `setMutationDefaults` für die Teig-Session nach demselben Muster. **Dem Hauptagenten gemeldet.**
- **`maxAge` zählt ab dem letzten Speichern, nicht ab dem letzten Serverabruf.** Abgelaufene Caches verwirft TanStack beim Wiederherstellen unabhängig vom Online-Status, eine ältere pausierte Änderung (über 7 Tage) ginge dabei verloren. Das Ticket verlangt „beim nächsten Online-Laden verworfen“. Weil ein Laden offline ohne Service Worker nicht möglich ist, ist die Abweichung praktisch bedeutungslos.
- **Persistieren von `pending`-Mutationen über `serializePersistedClient`:** nutzt die öffentliche Form von `DehydratedState` (`mutations[].state.isPaused`), aber ein von TanStack nicht vorgesehenes Muster. Bei Major-Updates prüfen, der Unit-Test schlägt dann an. Die Versionen sind auf `^5.104.1` festgelegt.
- **Drosselung des Persisters (100 ms):** Ein Neuladen innerhalb von 100 ms nach einer Änderung kann sie verlieren. Bewusst kurz gewählt.
- **Kurzer Ladezustand:** Vor der Hydration zeigt das Server-HTML „Lade Sitzung …“ (`localStorage` ist dort nicht lesbar). Die Wiederherstellung selbst dauert einige Microtasks, dann erscheinen die Cache-Werte, bevor ein Server antwortet. Queries holen während `isRestoring` nichts.
- **`navigator.onLine`** meldet WLAN ohne Internet als „online“. Dann erscheint der AC-6-Hinweis statt des Offline-Hinweises.
- **`onlineManager` ist global:** Andere TanStack-Nutzer im Bundle würden die eigene Anbindung teilen. Tests müssen ihn in `afterEach` zurücksetzen.
- **Optimistisches Gate:** Bei abgelaufener Sitzung sieht die Person kurz ihre eigenen Cache-Daten, bevor sie auf `/login` umgeleitet wird. Fremde Daten sind über `OfflineSync` (Verwerfen bei anderer ID) und `waitForSyncUser` ausgeschlossen. Ohne Abmelden bleiben Daten bis zur nächsten Anmeldung auf dem Gerät.
- **Mehrere Tabs:** Kein Abgleich zwischen Tabs. Doppelte `PUT`s sind dank „letzte Änderung gewinnt“ harmlos.
- **`localStorage`:** Private Mode oder Quota können das Persistieren verhindern, der Cache läuft dann nur im Speicher. Better-Auth schreibt nur Broadcast-Nachrichten ohne Nutzerdaten in `localStorage`.
- **Bundle-Größe:** etwa 13–15 kB gzip zusätzlich, nur auf `/dashboard`.
- **Datenbank:** Die Migration `0002_user_preference` muss vor dem Deploy mit `npm run db:migrate` auf Neon laufen, sonst antwortet `/api/preferences` mit 500 (Client: Sync-Hinweis, kein Datenverlust).
- **F004-Tests:** `SessionGate` und `Dashboard` funktionieren weiterhin ohne Provider (`QueryClientContext` optional, `useOnlineStatus` ohne Provider). `DashboardPage` bringt ihren Provider selbst mit.
- **Rollback:** Commit revertieren, `npm install`. Der verwaiste `localStorage`-Schlüssel `sourdough-os:query-cache` ist harmlos. In der Datenbank `DROP TABLE "user_preference";`, den Journal-Eintrag entfernt der Revert. Kein Feature-Flag nötig.

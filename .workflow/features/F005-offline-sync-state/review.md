# Review F005: Global State und Offline-Sync Vorbereitung

<!-- Rolle: code-reviewer. Review-Runde 2. Alle Platzhalter ersetzt. -->

**Status:** APPROVED
**Diff-Hash:** f98ded8c2d55

## Akzeptanzkriterien
| AC | Erfüllt | Nachweis (Test / Code-Stelle) |
|---|---|---|
| AC-1 | ✅ | `src/lib/query/online.ts:14-29` (Anbindung an `online`/`offline`), `src/components/app/app-header.tsx:14-31` (immer gerenderte `role="status"`-Region, Header im normalen Fluss). Tests: app-header.test.tsx „F005/AC-1 zeigt nach Verbindungsverlust sofort den Offline-Hinweis in derselben Statusregion“, „F005/AC-1 der Rest der Seite bleibt offline bedienbar“; auth-pages.test.tsx „F005/AC-1 zeigt auf /dashboard bei Verbindungsverlust den Hinweis im Kopfbereich, die Seite bleibt bedienbar“; online.test.ts „F005/AC-1 nach einem offline-Event …“ |
| AC-2 | ✅ | `src/lib/query/online.ts:17-19`. Tests: app-header.test.tsx „F005/AC-2 entfernt den Hinweis nach Wiederverbindung, ohne „Wieder online“ zu melden“; online.test.ts „F005/AC-2 offline gefolgt von online ergibt wieder online“, „F005/AC-2 der Cleanup der Event-Anbindung entfernt alle vier Listener“ |
| AC-3 | ✅ | `src/components/app/query-provider.tsx:24-30` (`syncOnlineManager()` vor dem ersten Render), `online.ts:20-21` (`pageshow`/`visibilitychange`), `online.ts:39-41` (Server-Snapshot `true`). Tests: app-header.test.tsx „F005/AC-3 zeigt den Hinweis bereits im ersten Render …“, „… (pageshow) …“, „… (visibilitychange) …“, „F005/AC-3 online wird der Hinweis zu keinem Zeitpunkt angezeigt …“ |
| AC-4 | ✅ | `src/lib/query/query-client.ts:27-70` (gcTime ≥ maxAge, 7 Tage, buster), `src/components/app/temperature-unit-setting.tsx:15-28` (keine Ladeanzeige während der Wiederherstellung, Fremd-Cache ausgeblendet), `src/components/app/cached-session-gate.tsx:8-15`, `src/lib/query/preferences.ts:72-88` (Serverabgleich). Tests: temperature-unit-setting.test.tsx „F005/AC-4 zeigt die gespeicherte Einheit sofort und ohne Ladeanzeige …“, „F005/AC-4 aktualisiert die angezeigte Einheit ohne Zutun, wenn der Server abweicht“; query-provider.test.tsx „F005/AC-4 verwirft einen Cache, der älter als 7 Tage ist …“; auth-pages.test.tsx „F005/AC-4 zeigt auf /dashboard mit gespeichertem Cache sofort Dashboard und Einheit …“ |
| AC-5 | ✅ | `src/lib/query/preferences.ts:48-70` (optimistisches `onMutate`, `networkMode: "online"`, Scope), `query-client.ts:58-85` (pending-Mutationen persistiert und als pausiert serialisiert), `query-provider.tsx:36-38` und `offline-sync.tsx:18-38` (Fortsetzen, Bindung mit Cleanup), `src/app/api/preferences/route.ts:43-72` (letzte Änderung gewinnt). Tests: temperature-unit-setting.test.tsx „F005/AC-5 eine Offline-Änderung wird sofort angezeigt, lokal gespeichert und übersteht das Neuladen“; offline-sync.test.tsx „F005/AC-5 überträgt die Offline-Änderung nach dem Neuladen automatisch …“; offline-sync-binding.test.tsx „sendet nach Kontowechsel im selben Tab keine ausstehende Änderung der früheren Person“; preferences-route.test.ts „F005/AC-5 …“. Teig-Session wird laut Plan nur lokal persistiert (query-provider.test.tsx „F005/AC-5 eine aktive Teig-Session bleibt nach dem Neuladen erhalten“) |
| AC-6 | ✅ | `src/lib/query/hooks.ts:9-16` (`failureCount > 0` ergibt `error`), `preferences.ts:54-56` (unbegrenzte Wiederholung, `retryDelay` bis 5 min, `keys.ts:14-16`), `app-header.tsx:20-22`. Tests: offline-sync.test.tsx „F005/AC-6 hält die Änderung bei Serverfehler sichtbar, meldet den Fehler und wiederholt nach 1 s und 2 s“, „F005/AC-6 hält die Änderung bei nicht erreichbarem Server …“; app-header.test.tsx „F005/AC-6 zeigt online bei fehlgeschlagener Übertragung den Sync-Hinweis und entfernt ihn nach Erfolg“; query-client.test.ts „F005/AC-6 retryDelay wächst exponentiell ab 1 s und ist auf 5 Minuten begrenzt“ |
| AC-7 | ✅ | `src/components/auth/dashboard.tsx:26-50` (offline keine `signOut`-Anfrage, Exception ergibt Offline-Meldung, Fehlerantwort ergibt Generik-Meldung, Leeren nur nach Erfolg, kein `confirm`), `src/lib/query/clear-offline-data.ts:6-25`. Tests: dashboard.test.tsx „F005/AC-7 leert nach erfolgreichem Abmelden ohne Rückfrage den lokalen Speicher …“, „F005/AC-7 meldet offline …“, „F005/AC-7 zeigt bei Netzwerkfehler …“, „F005/AC-7 zeigt bei Fehlerantwort (500) …“; query-client.test.ts „F005/AC-7 clearOfflineData leert Queries, Mutationen, den Speicher und die Sync-Bindung“ |

## Befunde
| # | Schwere | Datei:Zeile | Befund | Empfehlung | Status |
|---|---|---|---|---|---|
| 1 | MAJOR | src/components/app/offline-sync.tsx:35-37, src/components/app/offline-sync-binding.test.tsx:60-88 | Runde 1: Die modulweite Nutzerbindung überlebte ein Sitzungsende ohne Abmelden. Jetzt hebt der Effekt-Cleanup die Bindung bei Unmount und bei Nutzerwechsel auf. Der Regressionstest bildet den Kontowechsel im selben Tab ab. | – | behoben |
| 2 | MINOR | src/app/api/preferences/route.ts:57-60, src/lib/preferences-route-clock.test.ts:141-162 | Runde 1: `updatedAt` aus der Zukunft blockierte spätere Änderungen. Jetzt wird es auf die Serverzeit begrenzt, mit Route-Test. | – | behoben |
| 3 | MINOR | src/lib/query/keys.ts:1-16 | Runde 1: zirkuläre Importe. Keys und `retryDelay` liegen jetzt in einem Modul ohne Importe. | – | behoben |
| 4 | NIT | src/components/app/query-provider.tsx:21-23 | Runde 1: Seiteneffekt im `useState`-Initializer. Begründung und Einschränkung stehen jetzt als Kommentar im Code. | – | behoben |
| 5 | NIT | src/lib/auth-form.ts | Runde 1: Formatierungsänderung außerhalb des Scopes. Sie ist nicht mehr im Diff. | – | behoben |
| 6 | NIT | src/lib/query/sync-user.ts:31-33 | `resetSyncUser()` setzt nur `boundUserId` zurück, die `waiters` bleiben stehen. Eine Mutation eines bereits ausgehängten Clients, die im Retry auf `waitForSyncUser("A")` wartet, wird später bei `bindSyncUser("A")` noch freigegeben und sendet einmal doppelt. Sie geht an dasselbe Konto, „letzte Änderung gewinnt“ macht das harmlos. Bei `bindSyncUser("B")` wird sie korrekt abgewiesen. | Optional: In `resetSyncUser` alle Waiter mit `ForeignUserError` abweisen, oder die Bindung pro `QueryClient` führen. | offen |
| 7 | NIT | src/components/app/offline-sync.tsx:26 | Im Fremd-Cache-Pfad wird `MutationCache.clear()` verwendet. `clear-offline-data.ts:10-16` beschreibt, dass genau das den Persister die Mutationen noch einmal schreiben lassen kann. Hier ist es unkritisch, weil `resetQueries`/`setQueryData` direkt danach einen neuen Speicherstand ohne die Mutationen auslösen (Throttle übernimmt die letzten Argumente). Das ist aber uneinheitlich. | Für Einheitlichkeit dieselbe Einzel-`remove()`-Schleife wie in `clearOfflineData` nutzen oder in einen Helfer auslagern. | offen |

## Prüfbereiche
- [x] Korrektheit & Randfälle (leer, Fehler, Laden, viele Daten)
- [x] React: Hook-Regeln, Effekt-Abhängigkeiten, stabile `key`s, State am richtigen Ort, unnötige Re-Renders
- [x] Sicherheit: kein `dangerouslySetInnerHTML` mit Nutzerdaten, keine Secrets im Client-Bundle (`VITE_*`, `NEXT_PUBLIC_*`), Eingaben validiert
- [x] Barrierefreiheit: semantisches HTML, Labels, Tastatur, Fokus, Kontrast
- [x] Tests: prüfen Verhalten statt Implementierung (`getByRole` & Co.), decken alle AC ab
- [x] Codequalität: Lesbarkeit, Benennung, Typen ohne `any`, keine toten Pfade
- [x] Scope: nur, was Ticket und Plan verlangen

## Fazit
Alle fünf Befunde aus Runde 1 sind behoben und, wo nötig, mit Regressionstests abgesichert. Das betrifft vor allem die Nutzerbindung beim Kontowechsel und die Begrenzung von Zeitstempeln aus der Zukunft. Alle sieben AC sind mit verhaltensnahen Tests belegt. `vitest` (258 Tests) und `tsc` laufen grün, `eslint` zeigt keinen Befund im Feature-Code. Offen sind nur zwei NITs ohne Auswirkung auf Verhalten oder Sicherheit, deshalb gebe ich das Feature frei.

// Vorbereiteter, lokal persistierter Speicherbereich für die aktive Teig-Session (F005).
// Ohne Oberfläche und ohne Server-API; ein späteres Ticket ergänzt die Synchronisation.
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { ACTIVE_DOUGH_SESSION_QUERY_KEY } from "./keys";

/** Platzhalter, bis das Datenmodell der Teig-Session feststeht. */
export type ActiveDoughSession = Record<string, unknown>;

/**
 * Liest die aktive Teig-Session direkt aus dem Query-Cache. Der Cache benachrichtigt synchron,
 * eine lokale Änderung ist also sofort sichtbar (ein useQuery-Observer meldet erst im nächsten Tick).
 */
export function useActiveDoughSession(): ActiveDoughSession | null {
  const client = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => client.getQueryCache().subscribe(onChange),
    [client],
  );
  const getSnapshot = useCallback(
    () => client.getQueryData<ActiveDoughSession | null>(ACTIVE_DOUGH_SESSION_QUERY_KEY) ?? null,
    [client],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setActiveDoughSession(client: QueryClient, session: ActiveDoughSession | null): void {
  client.setQueryData<ActiveDoughSession | null>(ACTIVE_DOUGH_SESSION_QUERY_KEY, session);
}

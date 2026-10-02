// Leert nach dem Abmelden alle lokal gespeicherten Nutzerdaten (F005, AC-7).
import type { QueryClient } from "@tanstack/react-query";
import { clearAccountCalculatorDraft } from "@/lib/calculator/local-draft";
import { QUERY_CACHE_KEY } from "./keys";
import { resetSyncUser } from "./sync-user";

export function clearOfflineData(client: QueryClient | undefined): void {
  resetSyncUser();
  if (client) {
    void client.cancelQueries();
    // Mutationen einzeln entfernen: MutationCache.clear() meldet "removed", solange die Mutationen
    // noch im Cache stehen, und der Persister schriebe sie dann erneut in den Speicher.
    // remove() löscht zuerst und meldet danach, der nächste Speichervorgang sieht also nichts mehr.
    const mutationCache = client.getMutationCache();
    for (const mutation of mutationCache.getAll()) {
      mutationCache.remove(mutation);
    }
    // QueryCache.clear() entfernt jede Query vor der Meldung; danach sind auch die Queries leer.
    client.clear();
  }
  try {
    window.localStorage.removeItem(QUERY_CACHE_KEY);
  } catch {
    // Speicher nicht verfügbar: es gibt nichts zu leeren.
  }
  // Lokal gemerkter Rechner-Stand (F010): nur ein Konto-Stand wird gelöscht, ein Gast-Stand bleibt.
  clearAccountCalculatorDraft();
}

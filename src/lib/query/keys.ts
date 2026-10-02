// Keys und Konstanten des Query-Caches (F005). Bewusst ohne Imports, damit kein Importzyklus entsteht.

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
export function retryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, MAX_RETRY_DELAY_MS);
}

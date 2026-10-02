// Hooks für Sync-Status und Nutzer-ID im Offline-Cache (F005, AC-4, AC-6).
import { skipToken, useMutationState, useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { OFFLINE_USER_QUERY_KEY, PREFERENCES_MUTATION_KEY } from "./keys";

export type SyncStatus = "idle" | "pending" | "error";

/** Keine ausstehende Übertragung → idle; eine mit failureCount > 0 → error; sonst pending. */
export function useSyncStatus(): SyncStatus {
  const failureCounts = useMutationState({
    filters: { mutationKey: PREFERENCES_MUTATION_KEY, status: "pending" },
    select: (mutation) => mutation.state.failureCount,
  });
  if (failureCounts.length === 0) return "idle";
  return failureCounts.some((count) => count > 0) ? "error" : "pending";
}

export function useCachedUserId(): string | null {
  const { data } = useQuery<{ id: string }>({
    queryKey: OFFLINE_USER_QUERY_KEY,
    queryFn: skipToken,
    staleTime: Infinity,
  });
  return data?.id ?? null;
}

/**
 * true, solange der wiederhergestellte Cache einer anderen Person gehört als die bestätigte Sitzung.
 * Dann dürfen Cache-Werte nicht angezeigt werden, bis OfflineSync sie verworfen hat.
 */
export function useIsForeignCache(): boolean {
  const sessionUserId = useSession().data?.user?.id ?? null;
  const cachedUserId = useCachedUserId();
  return sessionUserId !== null && cachedUserId !== null && sessionUserId !== cachedUserId;
}

export function useCurrentUserId(): string | null {
  const sessionUserId = useSession().data?.user?.id ?? null;
  const cachedUserId = useCachedUserId();
  return sessionUserId ?? cachedUserId;
}

"use client";

import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { OFFLINE_USER_QUERY_KEY } from "@/lib/query/keys";
import { bindSyncUser, resetSyncUser } from "@/lib/query/sync-user";

/**
 * Bindet den lokalen Cache an die bestätigte Sitzung, sobald die Wiederherstellung abgeschlossen ist.
 * Daten einer anderen Person werden verworfen; ausstehende Übertragungen werden fortgesetzt.
 */
export function OfflineSync(): null {
  const isRestoring = useIsRestoring();
  const client = useQueryClient();
  const userId = useSession().data?.user?.id;

  useEffect(() => {
    // Erst nach der Wiederherstellung binden, sonst spielt hydrate fremde Daten zurück.
    if (isRestoring || !userId) return;
    const cachedUser = client.getQueryData<{ id: string }>(OFFLINE_USER_QUERY_KEY);
    if (cachedUser && cachedUser.id !== userId) {
      // Daten einer anderen Person verwerfen. Nicht client.clear(): aktive Observer hingen danach an
      // entfernten Queries und zeigten weiter die fremden Werte. resetQueries leert die Daten
      // (nicht mehr persistiert, da nicht "success") und lädt aktive Queries neu.
      client.getMutationCache().clear();
      void client.resetQueries();
    }
    client.setQueryData<{ id: string }>(OFFLINE_USER_QUERY_KEY, { id: userId });
    bindSyncUser(userId);
    void client.resumePausedMutations();
    // Die Bindung gilt nur, solange diese Sitzung bestätigt und die Seite gemountet ist. Endet die
    // Sitzung ohne Abmelden (Ablauf, anderer Tab) oder wechselt die Person, wird sie aufgehoben.
    // Sonst würde ein später wiederhergestellter Cache der früheren Person sofort gesendet.
    return () => {
      resetSyncUser();
    };
  }, [client, isRestoring, userId]);

  return null;
}

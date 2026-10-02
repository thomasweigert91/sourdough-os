"use client";

import type { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, type Persister } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import { syncOnlineManager } from "@/lib/query/online";
import { createAppPersister, createAppQueryClient, createPersistOptions } from "@/lib/query/query-client";

export interface QueryProviderProps {
  children: ReactNode;
  /** Nur für Tests: vorgegebener Client. */
  client?: QueryClient;
  /** Nur für Tests: vorgegebener Persister. */
  persister?: Persister;
}

export function QueryProvider({ children, client, persister }: QueryProviderProps) {
  // Ein Client pro Provider-Instanz (kein Modul-Singleton, SSR-sicher). Der Online-Status wird vor
  // dem ersten Render der Kinder übernommen, damit ein bestehender Offline-Zustand sofort sichtbar ist
  // (AC-3: online wird der Hinweis nie kurz angezeigt).
  // Bewusster Seiteneffekt im Initializer: setOnline benachrichtigt Abonnenten synchron. Das ist
  // unkritisch, solange dieser Provider die Wurzel der Seite ist und vor ihm keine Komponente
  // useOnlineStatus nutzt. Unter StrictMode läuft der Initializer doppelt, setOnline ist idempotent.
  const [state] = useState(() => {
    syncOnlineManager();
    return {
      queryClient: client ?? createAppQueryClient(),
      options: createPersistOptions(persister ?? createAppPersister()),
    };
  });

  return (
    <PersistQueryClientProvider
      client={state.queryClient}
      persistOptions={state.options}
      onSuccess={() => {
        void state.queryClient.resumePausedMutations();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

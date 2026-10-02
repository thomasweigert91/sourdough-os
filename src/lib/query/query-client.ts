// QueryClient, Persister und Persist-Optionen für den lokalen Cache (F005, AC-4 bis AC-6).
import { QueryClient, type OmitKeyof } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type {
  AsyncStorage,
  PersistedClient,
  PersistQueryClientOptions,
  Persister,
} from "@tanstack/react-query-persist-client";
import { CACHE_BUSTER, CACHE_MAX_AGE_MS, PERSIST_THROTTLE_MS, QUERY_CACHE_KEY } from "./keys";
import { registerPreferencesMutation } from "./preferences";

// Keys und Konstanten liegen in ./keys (ohne Imports); hier für bestehende Importe weitergereicht.
export {
  ACTIVE_DOUGH_SESSION_QUERY_KEY,
  CACHE_BUSTER,
  CACHE_MAX_AGE_MS,
  MAX_RETRY_DELAY_MS,
  OFFLINE_USER_QUERY_KEY,
  PERSIST_THROTTLE_MS,
  PREFERENCES_MUTATION_KEY,
  PREFERENCES_QUERY_KEY,
  QUERY_CACHE_KEY,
  retryDelay,
} from "./keys";

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      // gcTime ≥ maxAge, sonst verfallen persistierte Queries vor dem Cache.
      queries: { gcTime: CACHE_MAX_AGE_MS, staleTime: 0, retry: 1 },
    },
  });
  registerPreferencesMutation(client);
  return client;
}

function getDefaultStorage(): AsyncStorage<string> | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Zugriff kann z. B. bei gesperrtem Speicher werfen; dann bleibt der Cache im Speicher.
    return null;
  }
}

/** Persister auf localStorage (Default), auf dem Server ohne Speicher. */
export function createAppPersister(storage: AsyncStorage<string> | null = getDefaultStorage()): Persister {
  return createAsyncStoragePersister({
    storage,
    key: QUERY_CACHE_KEY,
    throttleTime: PERSIST_THROTTLE_MS,
    serialize: serializePersistedClient,
  });
}

export function createPersistOptions(
  persister: Persister,
): OmitKeyof<PersistQueryClientOptions, "queryClient"> {
  return {
    persister,
    maxAge: CACHE_MAX_AGE_MS,
    buster: CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateMutation: (mutation) => mutation.state.status === "pending",
      shouldDehydrateQuery: (query) => query.state.status === "success",
    },
  };
}

/** JSON.stringify, setzt aber für alle Mutationen mit status "pending" state.isPaused = true. */
export function serializePersistedClient(client: PersistedClient): string {
  return JSON.stringify({
    ...client,
    clientState: {
      ...client.clientState,
      mutations: client.clientState.mutations.map((mutation) =>
        mutation.state.status === "pending"
          ? { ...mutation, state: { ...mutation.state, isPaused: true } }
          : mutation,
      ),
    },
  });
}

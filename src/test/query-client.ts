// Test-Helfer für F005: QueryClient für Tests und Zugriff auf den persistierten Cache in localStorage.
// Nur für Tests gedacht.
import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { CACHE_BUSTER, createAppQueryClient, QUERY_CACHE_KEY } from "@/lib/query/query-client";

/** createAppQueryClient() mit queries.retry = false (Mutation-Defaults bleiben unverändert). */
export function createTestQueryClient(): QueryClient {
  const client = createAppQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  return client;
}

/** Variablen einer offline entstandenen, noch nicht übertragenen Präferenz-Änderung. */
export interface PausedPreferenceChange {
  userId: string;
  temperatureUnit: "C" | "F";
  changedAt: string;
}

/** Schreibt einen persistierten Cache, wie ihn ein früherer Seitenbesuch hinterlassen hätte. */
export function seedPersistedCache(
  entries: Array<{ queryKey: readonly unknown[]; data: unknown }>,
  opts: { timestamp?: number; buster?: string; pausedPreferenceChanges?: PausedPreferenceChange[] } = {},
): void {
  const client = new QueryClient();
  for (const entry of entries) {
    client.setQueryData(entry.queryKey, entry.data);
  }
  const clientState = dehydrate(client);
  const persisted: PersistedClient = {
    buster: opts.buster ?? CACHE_BUSTER,
    timestamp: opts.timestamp ?? Date.now(),
    clientState: {
      ...clientState,
      mutations: (opts.pausedPreferenceChanges ?? []).map((variables) => ({
        mutationKey: ["preferences", "update"],
        scope: { id: "preferences" },
        state: {
          context: undefined,
          data: undefined,
          error: null,
          failureCount: 0,
          failureReason: null,
          isPaused: true,
          status: "pending" as const,
          variables,
          submittedAt: Date.parse(variables.changedAt),
        },
      })),
    },
  };
  window.localStorage.setItem(QUERY_CACHE_KEY, JSON.stringify(persisted));
  client.clear();
}

/** JSON aus localStorage[QUERY_CACHE_KEY] oder null. */
export function readPersistedCache(): PersistedClient | null {
  const raw = window.localStorage.getItem(QUERY_CACHE_KEY);
  return raw ? (JSON.parse(raw) as PersistedClient) : null;
}

/** Normalisierte fetch-Aufrufe eines vi.fn()-Stubs: URL, Methode, Body (geparst, falls JSON). */
export function fetchCalls(fetchMock: { mock: { calls: unknown[][] } }): Array<{
  url: string;
  method: string;
  body: unknown;
}> {
  return fetchMock.mock.calls.map(([input, init]) => {
    const requestInit = (init ?? {}) as RequestInit;
    let url: string;
    let method = requestInit.method;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else {
      const request = input as Request;
      url = request.url;
      method = method ?? request.method;
    }
    let body: unknown = requestInit.body ?? undefined;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // kein JSON, Rohtext behalten
      }
    }
    return { url, method: (method ?? "GET").toUpperCase(), body };
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

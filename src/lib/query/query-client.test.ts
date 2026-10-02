import { dehydrate, type Mutation, type Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOfflineData } from "@/lib/query/clear-offline-data";
import { setActiveDoughSession } from "@/lib/query/dough-session";
import {
  ACTIVE_DOUGH_SESSION_QUERY_KEY,
  CACHE_BUSTER,
  CACHE_MAX_AGE_MS,
  createAppQueryClient,
  createPersistOptions,
  MAX_RETRY_DELAY_MS,
  PREFERENCES_MUTATION_KEY,
  PREFERENCES_QUERY_KEY,
  QUERY_CACHE_KEY,
  retryDelay,
  serializePersistedClient,
} from "@/lib/query/query-client";
import { bindSyncUser, ForeignUserError, getSyncUserId, resetSyncUser } from "@/lib/query/sync-user";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const persister: Persister = {
  persistClient: vi.fn(),
  restoreClient: vi.fn(),
  removeClient: vi.fn(),
};

function fakeMutation(status: "idle" | "pending" | "success" | "error", isPaused = false) {
  return { state: { status, isPaused } } as unknown as Mutation;
}

function fakeQuery(status: "pending" | "success" | "error") {
  return { state: { status } } as unknown as Query;
}

afterEach(() => {
  localStorage.clear();
  resetSyncUser();
  vi.restoreAllMocks();
});

describe("F005 Persist-Optionen und Query-Client", () => {
  it("F005/AC-4 Persist-Optionen: maxAge 7 Tage, buster v1, Schlüssel sourdough-os:query-cache", () => {
    const options = createPersistOptions(persister);

    expect(options.persister).toBe(persister);
    expect(options.maxAge).toBe(SEVEN_DAYS_MS);
    expect(CACHE_MAX_AGE_MS).toBe(SEVEN_DAYS_MS);
    expect(options.buster).toBe("v1");
    expect(CACHE_BUSTER).toBe("v1");
    expect(QUERY_CACHE_KEY).toBe("sourdough-os:query-cache");
  });

  it("F005/AC-4 persistiert ausstehende Mutationen (auch nicht pausierte), aber keine erledigten", () => {
    const shouldDehydrateMutation = createPersistOptions(persister).dehydrateOptions?.shouldDehydrateMutation;
    expect(shouldDehydrateMutation).toBeTypeOf("function");

    expect(shouldDehydrateMutation?.(fakeMutation("pending", false))).toBe(true);
    expect(shouldDehydrateMutation?.(fakeMutation("pending", true))).toBe(true);
    expect(shouldDehydrateMutation?.(fakeMutation("success"))).toBe(false);
    expect(shouldDehydrateMutation?.(fakeMutation("error"))).toBe(false);
  });

  it("F005/AC-4 persistiert nur erfolgreich geladene Queries", () => {
    const shouldDehydrateQuery = createPersistOptions(persister).dehydrateOptions?.shouldDehydrateQuery;
    expect(shouldDehydrateQuery).toBeTypeOf("function");

    expect(shouldDehydrateQuery?.(fakeQuery("success"))).toBe(true);
    expect(shouldDehydrateQuery?.(fakeQuery("pending"))).toBe(false);
    expect(shouldDehydrateQuery?.(fakeQuery("error"))).toBe(false);
  });

  it("F005/AC-4 gcTime der Queries ist mindestens maxAge, damit persistierte Daten nicht verfallen", () => {
    const client = createAppQueryClient();
    const gcTime = client.getDefaultOptions().queries?.gcTime;

    expect(typeof gcTime).toBe("number");
    expect(gcTime as number).toBeGreaterThanOrEqual(SEVEN_DAYS_MS);
  });
});

describe("F005 Serialisierung und Speicherbereiche", () => {
  it("F005/AC-5 serializePersistedClient markiert ausstehende Mutationen als pausiert und lässt Queries unverändert", () => {
    const query = {
      queryKey: ["preferences"],
      queryHash: '["preferences"]',
      state: { status: "success", data: { temperatureUnit: "F" }, dataUpdatedAt: 1 },
    };
    const client = {
      buster: "v1",
      timestamp: 123,
      clientState: {
        queries: [query],
        mutations: [
          {
            mutationKey: ["preferences", "update"],
            scope: { id: "preferences" },
            state: { status: "pending", isPaused: false, failureCount: 2, variables: { temperatureUnit: "F" } },
          },
        ],
      },
    } as unknown as PersistedClient;

    const parsed = JSON.parse(serializePersistedClient(client)) as PersistedClient;

    expect(parsed.buster).toBe("v1");
    expect(parsed.timestamp).toBe(123);
    expect(parsed.clientState.queries).toEqual([query]);
    expect(parsed.clientState.mutations).toHaveLength(1);
    expect(parsed.clientState.mutations[0].state.isPaused).toBe(true);
    expect(parsed.clientState.mutations[0].state.status).toBe("pending");
    expect(parsed.clientState.mutations[0].state.variables).toEqual({ temperatureUnit: "F" });
  });

  it("F005/AC-5 Mutation-Defaults für Präferenzen: scope „preferences“ und exponentielles retryDelay", () => {
    const client = createAppQueryClient();
    const defaults = client.getMutationDefaults(PREFERENCES_MUTATION_KEY);

    expect(PREFERENCES_MUTATION_KEY).toEqual(["preferences", "update"]);
    expect(PREFERENCES_QUERY_KEY).toEqual(["preferences"]);
    expect(defaults.scope?.id).toBe("preferences");
    expect(defaults.retryDelay).toBe(retryDelay);
    expect(defaults.mutationFn).toBeTypeOf("function");
    expect(defaults.onMutate).toBeTypeOf("function");
  });

  it("F005/AC-5 eine aktive Teig-Session wird im Cache abgelegt und persistiert", () => {
    const client = createAppQueryClient();

    setActiveDoughSession(client, { id: "s1" });

    expect(ACTIVE_DOUGH_SESSION_QUERY_KEY).toEqual(["dough-session", "active"]);
    expect(client.getQueryData(["dough-session", "active"])).toEqual({ id: "s1" });
    const state = dehydrate(client, createPersistOptions(persister).dehydrateOptions);
    const dehydrated = state.queries.find(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(["dough-session", "active"]),
    );
    expect(dehydrated?.state.data).toEqual({ id: "s1" });
  });
});

describe("F005 Wiederholung fehlgeschlagener Synchronisation", () => {
  it("F005/AC-6 retryDelay wächst exponentiell ab 1 s und ist auf 5 Minuten begrenzt", () => {
    expect(MAX_RETRY_DELAY_MS).toBe(5 * 60 * 1000);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => retryDelay(n))).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000,
    ]);
    for (const n of [9, 10, 20, 100, 1000]) {
      expect(retryDelay(n)).toBe(300000);
    }
  });

  it("F005/AC-6 Übertragungen werden unbegrenzt wiederholt, außer bei fremdem Nutzer", () => {
    const client = createAppQueryClient();
    const retry = client.getMutationDefaults(PREFERENCES_MUTATION_KEY).retry;
    expect(retry).toBeTypeOf("function");
    const shouldRetry = retry as (failureCount: number, error: Error) => boolean;

    expect(shouldRetry(1, new Error("500"))).toBe(true);
    expect(shouldRetry(1000, new Error("500"))).toBe(true);
    expect(shouldRetry(1000, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(0, new ForeignUserError("fremd"))).toBe(false);
  });
});

describe("F005 Lokale Daten beim Abmelden leeren", () => {
  it("F005/AC-7 clearOfflineData leert Queries, Mutationen, den Speicher und die Sync-Bindung", () => {
    const client = createAppQueryClient();
    client.setQueryData(["preferences"], { temperatureUnit: "F" });
    client.setQueryData(["offline-user"], { id: "u1" });
    client.getMutationCache().build(client, { mutationKey: ["preferences", "update"] });
    localStorage.setItem(QUERY_CACHE_KEY, '{"buster":"v1"}');
    bindSyncUser("u1");

    clearOfflineData(client);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
    expect(getSyncUserId()).toBeNull();
  });

  it("F005/AC-7 clearOfflineData ohne Client entfernt nur den Speicher, ohne Fehler", () => {
    localStorage.setItem(QUERY_CACHE_KEY, '{"buster":"v1"}');
    localStorage.setItem("andere-app", "bleibt");

    expect(() => clearOfflineData(undefined)).not.toThrow();

    expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem("andere-app")).toBe("bleibt");
  });
});

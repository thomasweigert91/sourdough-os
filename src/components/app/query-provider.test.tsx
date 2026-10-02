import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { onlineManager, useIsRestoring, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: vi.fn() },
  signIn: { email: vi.fn() },
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));

import { QueryProvider } from "@/components/app/query-provider";
import { setActiveDoughSession, useActiveDoughSession } from "@/lib/query/dough-session";
import { usePreferences } from "@/lib/query/preferences";
import { QUERY_CACHE_KEY } from "@/lib/query/query-client";
import { resetSyncUser } from "@/lib/query/sync-user";
import { createTestQueryClient, readPersistedCache, seedPersistedCache } from "@/test/query-client";

const SESSION_U1 = {
  data: { user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.useSession.mockReturnValue(SESSION_U1);
  // Server antwortet noch nicht.
  fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  localStorage.clear();
  resetSyncUser();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function PreferencesProbe({ log }: { log: Array<{ restoring: boolean; fetches: number }> }) {
  const restoring = useIsRestoring();
  const { data } = usePreferences();
  log.push({ restoring, fetches: fetchMock.mock.calls.length });
  return <p>Einheit: {data?.temperatureUnit ?? "keine"}</p>;
}

describe("F005 QueryProvider: Wiederherstellung aus dem lokalen Speicher", () => {
  it("F005/AC-4 stellt gespeicherte Präferenzen wieder her, ohne während der Wiederherstellung den Server zu fragen", async () => {
    seedPersistedCache([{ queryKey: ["preferences"], data: { temperatureUnit: "F" } }]);
    const client = createTestQueryClient();
    const log: Array<{ restoring: boolean; fetches: number }> = [];

    render(
      <QueryProvider client={client}>
        <PreferencesProbe log={log} />
      </QueryProvider>,
    );

    expect(await screen.findByText("Einheit: F")).toBeInTheDocument();
    expect(client.getQueryData(["preferences"])).toEqual({ temperatureUnit: "F" });
    expect(log.some((entry) => entry.restoring)).toBe(true);
    expect(log.filter((entry) => entry.restoring).every((entry) => entry.fetches === 0)).toBe(true);
  });

  it("F005/AC-4 verwirft einen Cache, der älter als 7 Tage ist, und entfernt ihn aus dem Speicher", async () => {
    seedPersistedCache([{ queryKey: ["preferences"], data: { temperatureUnit: "F" } }], {
      timestamp: Date.now() - EIGHT_DAYS_MS,
    });
    const client = createTestQueryClient();

    render(
      <QueryProvider client={client}>
        <p>Inhalt</p>
      </QueryProvider>,
    );

    await waitFor(() => expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull());
    expect(client.getQueryData(["preferences"])).toBeUndefined();
  });

  it("F005/AC-4 verwirft einen Cache mit abweichendem buster", async () => {
    seedPersistedCache([{ queryKey: ["preferences"], data: { temperatureUnit: "F" } }], { buster: "v0" });
    const client = createTestQueryClient();

    render(
      <QueryProvider client={client}>
        <p>Inhalt</p>
      </QueryProvider>,
    );

    await waitFor(() => expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull());
    expect(client.getQueryData(["preferences"])).toBeUndefined();
  });

  it("F005/AC-4 jede Provider-Instanz ohne client-Prop erzeugt einen eigenen QueryClient", () => {
    const clients: unknown[] = [];
    function Capture() {
      clients.push(useQueryClient());
      return null;
    }

    render(
      <>
        <QueryProvider>
          <Capture />
        </QueryProvider>
        <QueryProvider>
          <Capture />
        </QueryProvider>
      </>,
    );

    const distinct = new Set(clients);
    expect(distinct.size).toBe(2);
  });

  it("F005/AC-5 eine aktive Teig-Session bleibt nach dem Neuladen erhalten", async () => {
    const firstClient = createTestQueryClient();
    const firstWrapper = ({ children }: { children: ReactNode }) => (
      <QueryProvider client={firstClient}>{children}</QueryProvider>
    );
    const first = renderHook(
      () => ({ session: useActiveDoughSession(), restoring: useIsRestoring() }),
      { wrapper: firstWrapper },
    );
    await waitFor(() => expect(first.result.current.restoring).toBe(false));
    expect(first.result.current.session).toBeNull();

    act(() => {
      setActiveDoughSession(firstClient, { id: "s1", stage: "Stockgare" });
    });

    expect(first.result.current.session).toEqual({ id: "s1", stage: "Stockgare" });
    await waitFor(() =>
      expect(
        readPersistedCache()?.clientState.queries.some(
          (q) => JSON.stringify(q.queryKey) === JSON.stringify(["dough-session", "active"]),
        ),
      ).toBe(true),
    );
    first.unmount();

    // Neuladen: neuer Client, neuer Provider, derselbe localStorage.
    const secondClient = createTestQueryClient();
    const secondWrapper = ({ children }: { children: ReactNode }) => (
      <QueryProvider client={secondClient}>{children}</QueryProvider>
    );
    const second = renderHook(() => useActiveDoughSession(), { wrapper: secondWrapper });

    await waitFor(() => expect(second.result.current).toEqual({ id: "s1", stage: "Stockgare" }));
  });
});

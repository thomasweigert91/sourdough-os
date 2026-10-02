// Review F005, Befund 1: Die Nutzerbindung darf ein Sitzungsende ohne Abmelden nicht überleben.
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
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

import { OfflineSync } from "@/components/app/offline-sync";
import { QueryProvider } from "@/components/app/query-provider";
import { getSyncUserId, resetSyncUser } from "@/lib/query/sync-user";
import { createTestQueryClient, fetchCalls, jsonResponse, seedPersistedCache } from "@/test/query-client";

function sessionFor(id: string) {
  return {
    data: { user: { id, name: `Person ${id}`, email: `${id}@example.com` }, session: {} },
    isPending: false,
    error: null,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

function renderPage(client: QueryClient) {
  return render(
    <QueryProvider client={client}>
      <OfflineSync />
    </QueryProvider>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse({ temperatureUnit: "F", updatedAt: null }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
  localStorage.clear();
  resetSyncUser();
});

describe("F005 OfflineSync: Bindung endet mit der Seite", () => {
  it("sendet nach Kontowechsel im selben Tab keine ausstehende Änderung der früheren Person", async () => {
    // Person u2 hat eine nicht übertragene Änderung; die Seite ist offline geöffnet und bindet u2.
    seedPersistedCache([{ queryKey: ["offline-user"], data: { id: "u2" } }], {
      pausedPreferenceChanges: [{ userId: "u2", temperatureUnit: "F", changedAt: "2026-10-02T08:00:00.000Z" }],
    });
    mocks.useSession.mockReturnValue(sessionFor("u2"));
    setNavigatorOnline(false);
    const firstClient = createTestQueryClient();
    const first = renderPage(firstClient);
    await waitFor(() => expect(getSyncUserId()).toBe("u2"));

    // Sitzung endet ohne Abmelden: Die Seite wird verlassen, der Cache bleibt im Speicher.
    first.unmount();
    expect(getSyncUserId()).toBeNull();

    // Person u1 meldet sich im selben Tab an, das Gerät ist online.
    mocks.useSession.mockReturnValue(sessionFor("u1"));
    setNavigatorOnline(true);
    act(() => {
      onlineManager.setOnline(true);
    });
    const secondClient = createTestQueryClient();
    renderPage(secondClient);

    await waitFor(() => expect(getSyncUserId()).toBe("u1"));
    await waitFor(() => expect(secondClient.isMutating()).toBe(0));
    expect(fetchCalls(fetchMock).filter((call) => call.method === "PUT")).toHaveLength(0);
    expect(secondClient.getQueryData(["offline-user"])).toEqual({ id: "u1" });
  });
});

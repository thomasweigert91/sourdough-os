import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

import { AppHeader } from "@/components/app/app-header";
import { OfflineSync } from "@/components/app/offline-sync";
import { QueryProvider } from "@/components/app/query-provider";
import { TemperatureUnitSetting } from "@/components/app/temperature-unit-setting";
import { resetSyncUser } from "@/lib/query/sync-user";
import {
  createTestQueryClient,
  fetchCalls,
  jsonResponse,
  readPersistedCache,
  seedPersistedCache,
} from "@/test/query-client";

const CELSIUS = "Celsius (°C)";
const FAHRENHEIT = "Fahrenheit (°F)";
const OFFLINE = "Offline – Änderungen werden lokal gespeichert";
const SYNC_ERROR = "Änderungen konnten nicht synchronisiert werden. Neuer Versuch läuft.";
const PENDING = { data: null, isPending: true, error: null };

function sessionFor(id: string) {
  return {
    data: { user: { id, name: `Person ${id}`, email: `${id}@example.com` }, session: {} },
    isPending: false,
    error: null,
  };
}

type PutMode = "ok" | "500" | "network";

/** Kleiner Fake-Server für /api/preferences: GET liefert den gespeicherten Stand, PUT speichert. */
function createFakeServer() {
  const server = {
    prefs: { temperatureUnit: "C", updatedAt: null as string | null },
    putMode: "ok" as PutMode,
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "PUT") {
        if (server.putMode === "network") throw new TypeError("Failed to fetch");
        if (server.putMode === "500") return jsonResponse({ error: "INTERNAL" }, 500);
        const body = JSON.parse(String(init?.body)) as { temperatureUnit: string; updatedAt: string };
        server.prefs = { temperatureUnit: body.temperatureUnit, updatedAt: body.updatedAt };
        return jsonResponse(server.prefs);
      }
      return jsonResponse(server.prefs);
    }),
  };
  return server;
}

let server: ReturnType<typeof createFakeServer>;

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

function goOnline() {
  setNavigatorOnline(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

function putCalls() {
  return fetchCalls(server.fetch).filter((call) => call.method === "PUT");
}

/**
 * Erster Seitenbesuch: Person `userId` ändert offline die Einheit auf °F.
 * Danach ist die Änderung samt pausierter Übertragung im localStorage. Gibt changedAt zurück.
 */
async function makeOfflineChange(userId: string): Promise<string> {
  const user = userEvent.setup();
  mocks.useSession.mockReturnValue(sessionFor(userId));
  seedPersistedCache([
    { queryKey: ["preferences"], data: { temperatureUnit: "C" } },
    { queryKey: ["offline-user"], data: { id: userId } },
  ]);
  setNavigatorOnline(false);
  const client = createTestQueryClient();
  const view = render(
    <QueryProvider client={client}>
      <TemperatureUnitSetting />
    </QueryProvider>,
  );
  await user.click(await screen.findByRole("radio", { name: FAHRENHEIT }));

  let changedAt = "";
  await waitFor(() => {
    const mutation = readPersistedCache()?.clientState.mutations.find(
      (m) => JSON.stringify(m.mutationKey) === JSON.stringify(["preferences", "update"]),
    );
    expect(mutation?.state.isPaused).toBe(true);
    changedAt = (mutation?.state.variables as { changedAt: string }).changedAt;
  });
  view.unmount();
  client.clear();
  expect(putCalls()).toHaveLength(0);
  return changedAt;
}

/** Neuladen: neuer Client und Provider auf demselben localStorage, wie auf /dashboard zusammengesetzt. */
function renderReloadedPage(client: QueryClient = createTestQueryClient()) {
  const view = render(
    <QueryProvider client={client}>
      <OfflineSync />
      <AppHeader />
      <TemperatureUnitSetting />
    </QueryProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  server = createFakeServer();
  vi.stubGlobal("fetch", server.fetch);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
  localStorage.clear();
  resetSyncUser();
});

describe("F005 OfflineSync: Offline-Änderung wird nachgereicht", () => {
  it("F005/AC-5 überträgt die Offline-Änderung nach dem Neuladen automatisch, sobald das Gerät wieder online ist", async () => {
    const changedAt = await makeOfflineChange("u1");
    mocks.useSession.mockReturnValue(sessionFor("u1"));
    setNavigatorOnline(false);

    const { client } = renderReloadedPage();

    expect(await screen.findByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(OFFLINE);
    expect(putCalls()).toHaveLength(0);

    goOnline();

    await waitFor(
      () =>
        expect(putCalls()).toEqual([
          expect.objectContaining({
            url: expect.stringMatching(/\/api\/preferences$/),
            body: { temperatureUnit: "F", updatedAt: changedAt },
          }),
        ]),
      { timeout: 10_000 },
    );
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(server.prefs).toEqual({ temperatureUnit: "F", updatedAt: changedAt });
    expect(screen.getByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
    expect(screen.queryByText(SYNC_ERROR)).not.toBeInTheDocument();
  });

  it("F005/AC-5 sendet erst, wenn die Sitzung bestätigt ist (nicht während die Sitzung noch lädt)", async () => {
    await makeOfflineChange("u1");
    mocks.useSession.mockReturnValue(PENDING);
    setNavigatorOnline(true);

    const { client, rerender } = renderReloadedPage();

    // Die Übertragung läuft an (nicht mehr pausiert), wartet aber auf die Bestätigung des Nutzers.
    await waitFor(() =>
      expect(
        client
          .getMutationCache()
          .getAll()
          .some((m) => m.state.status === "pending" && !m.state.isPaused),
      ).toBe(true),
    );
    expect(await screen.findByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    expect(putCalls()).toHaveLength(0);
    expect(screen.queryByText(SYNC_ERROR)).not.toBeInTheDocument();

    mocks.useSession.mockReturnValue(sessionFor("u1"));
    rerender(
      <QueryProvider client={client}>
        <OfflineSync />
        <AppHeader />
        <TemperatureUnitSetting />
      </QueryProvider>,
    );

    await waitFor(() => expect(putCalls()).toHaveLength(1), { timeout: 10_000 });
    expect(putCalls()[0].body).toMatchObject({ temperatureUnit: "F" });
  });

  it("F005/AC-5 verwirft Cache und Änderungen einer anderen Person und sendet sie nicht", async () => {
    await makeOfflineChange("u2");
    mocks.useSession.mockReturnValue(sessionFor("u1"));
    setNavigatorOnline(true);

    const { client } = renderReloadedPage();

    expect(await screen.findByRole("radio", { name: CELSIUS })).toBeChecked();
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(putCalls()).toHaveLength(0);
    expect(client.getQueryData(["offline-user"])).toEqual({ id: "u1" });
    expect(server.prefs.temperatureUnit).toBe("C");
  });
});

describe("F005 OfflineSync: Synchronisation schlägt fehl", () => {
  it("F005/AC-6 hält die Änderung bei Serverfehler sichtbar, meldet den Fehler und wiederholt nach 1 s und 2 s", async () => {
    await makeOfflineChange("u1");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.putMode = "500";
    mocks.useSession.mockReturnValue(sessionFor("u1"));
    setNavigatorOnline(true);

    const { client } = renderReloadedPage();

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    const status = within(screen.getByRole("banner")).getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent(SYNC_ERROR));
    expect(screen.getByRole("radio", { name: FAHRENHEIT })).toBeChecked();

    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(putCalls()).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(200));
    await waitFor(() => expect(putCalls()).toHaveLength(2));

    await act(() => vi.advanceTimersByTimeAsync(1800));
    expect(putCalls()).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(300));
    await waitFor(() => expect(putCalls()).toHaveLength(3));

    expect(screen.getByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    expect(status).toHaveTextContent(SYNC_ERROR);

    server.putMode = "ok";
    await act(() => vi.advanceTimersByTimeAsync(4100));

    await waitFor(() => expect(client.isMutating()).toBe(0));
    await waitFor(() => expect(screen.queryByText(SYNC_ERROR)).not.toBeInTheDocument());
    expect(server.prefs.temperatureUnit).toBe("F");
    expect(screen.getByRole("radio", { name: FAHRENHEIT })).toBeChecked();
  });

  it("F005/AC-6 hält die Änderung bei nicht erreichbarem Server und überträgt sie beim nächsten Versuch", async () => {
    await makeOfflineChange("u1");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.putMode = "network";
    mocks.useSession.mockReturnValue(sessionFor("u1"));
    setNavigatorOnline(true);

    const { client } = renderReloadedPage();

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    const status = within(screen.getByRole("banner")).getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent(SYNC_ERROR));
    expect(screen.getByRole("radio", { name: FAHRENHEIT })).toBeChecked();

    // Auch nach einem Neuladen wäre die Änderung noch da: sie ist weiterhin persistiert.
    await waitFor(() =>
      expect(
        readPersistedCache()?.clientState.mutations.some(
          (m) => JSON.stringify(m.mutationKey) === JSON.stringify(["preferences", "update"]),
        ),
      ).toBe(true),
    );

    server.putMode = "ok";
    await act(() => vi.advanceTimersByTimeAsync(1100));

    await waitFor(() => expect(client.isMutating()).toBe(0));
    await waitFor(() => expect(screen.queryByText(SYNC_ERROR)).not.toBeInTheDocument());
    expect(server.prefs.temperatureUnit).toBe("F");
  });
});

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
const LOADING = "Lade Einstellungen …";

const SESSION_U1 = {
  data: { user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

function goOffline() {
  setNavigatorOnline(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

function renderSetting(client: QueryClient = createTestQueryClient()) {
  const view = render(
    <QueryProvider client={client}>
      <TemperatureUnitSetting />
    </QueryProvider>,
  );
  return { ...view, client };
}

function watchForText(text: string) {
  const seen = { value: false };
  const observer = new MutationObserver(() => {
    if (document.body.textContent?.includes(text)) seen.value = true;
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
}

function openResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.useSession.mockReturnValue(SESSION_U1);
  fetchMock = vi.fn(() => new Promise<Response>(() => {}));
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

describe("F005 Temperatureinheit: gespeicherte Daten erscheinen vor der Serverantwort", () => {
  it("F005/AC-4 zeigt die gespeicherte Einheit sofort und ohne Ladeanzeige, solange der Server nicht antwortet", async () => {
    seedPersistedCache([{ queryKey: ["preferences"], data: { temperatureUnit: "F" } }]);
    const server = openResponse();
    fetchMock.mockImplementation(() => server.promise);
    const loadingWatcher = watchForText("Lade");

    renderSetting();

    expect(await screen.findByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    expect(screen.getByRole("radio", { name: CELSIUS })).not.toBeChecked();
    expect(screen.getByRole("group", { name: "Temperatureinheit" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    loadingWatcher.stop();
    expect(loadingWatcher.seen.value).toBe(false);
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
    expect(fetchCalls(fetchMock)[0]).toMatchObject({ method: "GET" });
    expect(fetchCalls(fetchMock)[0].url).toMatch(/\/api\/preferences$/);
  });

  it("F005/AC-4 aktualisiert die angezeigte Einheit ohne Zutun, wenn der Server abweicht", async () => {
    seedPersistedCache([{ queryKey: ["preferences"], data: { temperatureUnit: "F" } }]);
    const server = openResponse();
    fetchMock.mockImplementation(() => server.promise);
    renderSetting();
    expect(await screen.findByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await act(async () => {
      server.resolve(jsonResponse({ temperatureUnit: "C", updatedAt: "2026-10-01T10:00:00.000Z" }));
    });

    await waitFor(() => expect(screen.getByRole("radio", { name: CELSIUS })).toBeChecked());
    expect(screen.getByRole("radio", { name: FAHRENHEIT })).not.toBeChecked();
  });

  it("F005/AC-4 zeigt ohne gespeicherte Daten „Lade Einstellungen …“, bis der Server antwortet", async () => {
    const server = openResponse();
    fetchMock.mockImplementation(() => server.promise);
    renderSetting();

    expect(await screen.findByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await act(async () => {
      server.resolve(jsonResponse({ temperatureUnit: "C", updatedAt: null }));
    });

    expect(await screen.findByRole("radio", { name: CELSIUS })).toBeChecked();
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
  });
});

describe("F005 Temperatureinheit: Offline-Änderung bleibt erhalten", () => {
  it("F005/AC-5 eine Offline-Änderung wird sofort angezeigt, lokal gespeichert und übersteht das Neuladen", async () => {
    const user = userEvent.setup();
    seedPersistedCache([{ queryKey: ["preferences"], data: { temperatureUnit: "C" } }]);
    setNavigatorOnline(false);
    const first = renderSetting();
    expect(await screen.findByRole("radio", { name: CELSIUS })).toBeChecked();
    goOffline();

    await user.click(screen.getByRole("radio", { name: FAHRENHEIT }));

    expect(screen.getByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    expect(fetchCalls(fetchMock).filter((call) => call.method === "PUT")).toHaveLength(0);

    await waitFor(() => {
      const persisted = readPersistedCache();
      const query = persisted?.clientState.queries.find(
        (q) => JSON.stringify(q.queryKey) === JSON.stringify(["preferences"]),
      );
      expect(query?.state.data).toEqual({ temperatureUnit: "F" });
      const mutation = persisted?.clientState.mutations.find(
        (m) => JSON.stringify(m.mutationKey) === JSON.stringify(["preferences", "update"]),
      );
      expect(mutation?.state.isPaused).toBe(true);
      expect(mutation?.state.status).toBe("pending");
      expect(mutation?.state.variables).toMatchObject({ userId: "u1", temperatureUnit: "F" });
      expect(typeof (mutation?.state.variables as { changedAt?: unknown }).changedAt).toBe("string");
    });

    first.unmount();
    first.client.clear();

    // Neuladen: neuer Client, neuer Provider, derselbe localStorage.
    renderSetting(createTestQueryClient());

    expect(await screen.findByRole("radio", { name: FAHRENHEIT })).toBeChecked();
    expect(screen.getByRole("radio", { name: CELSIUS })).not.toBeChecked();
    expect(fetchCalls(fetchMock).filter((call) => call.method === "PUT")).toHaveLength(0);
  });
});

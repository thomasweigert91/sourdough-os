import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
import { QueryProvider } from "@/components/app/query-provider";
import { resetSyncUser } from "@/lib/query/sync-user";
import { createTestQueryClient } from "@/test/query-client";

const OFFLINE = "Offline – Änderungen werden lokal gespeichert";
const SYNC_ERROR = "Änderungen konnten nicht synchronisiert werden. Neuer Versuch läuft.";

const SESSION_U1 = {
  data: { user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

function goOffline() {
  setNavigatorOnline(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

function goOnline() {
  setNavigatorOnline(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

function renderHeader(client: QueryClient = createTestQueryClient()) {
  const view = render(
    <QueryProvider client={client}>
      <AppHeader />
      <button type="button">Weiter bedienbar</button>
    </QueryProvider>,
  );
  return { ...view, client };
}

/** Beobachtet das DOM und merkt sich, ob der Text jemals vorkam. */
function watchForText(text: string) {
  const seen = { value: document.body.textContent?.includes(text) ?? false };
  const observer = new MutationObserver(() => {
    if (document.body.textContent?.includes(text)) seen.value = true;
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Startet eine Präferenz-Übertragung, deren erster Versuch scheitert und deren zweiter offen bleibt. */
function startFailingSync(client: QueryClient) {
  const secondAttempt = deferred<{ temperatureUnit: "F"; updatedAt: string }>();
  const mutationFn = vi
    .fn()
    .mockRejectedValueOnce(new Error("500"))
    .mockImplementationOnce(() => secondAttempt.promise);
  const mutation = client.getMutationCache().build(client, {
    mutationKey: ["preferences", "update"],
    mutationFn,
    retryDelay: 1,
  });
  act(() => {
    mutation
      .execute({ userId: "u1", temperatureUnit: "F", changedAt: "2026-10-02T08:00:00.000Z" })
      .catch(() => {});
  });
  return { mutationFn, secondAttempt };
}

beforeEach(() => {
  mocks.useSession.mockReturnValue(SESSION_U1);
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
  localStorage.clear();
  resetSyncUser();
});

describe("F005 AppHeader: Hinweis bei Verbindungsverlust", () => {
  it("F005/AC-1 zeigt online einen Kopfbereich mit App-Namen und leerer Statusregion", () => {
    renderHeader();

    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("Sourdough OS")).toBeInTheDocument();
    const status = within(banner).getByRole("status");
    expect(status).toHaveTextContent("");
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
  });

  it("F005/AC-1 zeigt nach Verbindungsverlust sofort den Offline-Hinweis in derselben Statusregion", () => {
    renderHeader();
    const status = within(screen.getByRole("banner")).getByRole("status");

    goOffline();

    // Synchron, ohne Timer: der Hinweis steht direkt nach dem Event im DOM.
    expect(within(screen.getByRole("banner")).getByRole("status")).toBe(status);
    expect(status).toHaveTextContent(OFFLINE);
    expect(within(status).getByText(OFFLINE)).toBeVisible();
  });

  it("F005/AC-1 der Rest der Seite bleibt offline bedienbar", () => {
    renderHeader();

    goOffline();

    expect(screen.getByRole("button", { name: "Weiter bedienbar" })).toBeEnabled();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("F005 AppHeader: Hinweis verschwindet bei Wiederverbindung", () => {
  it("F005/AC-2 entfernt den Hinweis nach Wiederverbindung, ohne „Wieder online“ zu melden", () => {
    renderHeader();
    const status = within(screen.getByRole("banner")).getByRole("status");
    goOffline();
    expect(status).toHaveTextContent(OFFLINE);

    goOnline();

    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("");
    expect(screen.queryByText(/wieder online/i)).not.toBeInTheDocument();
  });
});

describe("F005 AppHeader: Gerät ist schon beim Öffnen offline", () => {
  it("F005/AC-3 zeigt den Hinweis bereits im ersten Render, wenn das Gerät offline ist", () => {
    setNavigatorOnline(false);

    renderHeader();

    expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(OFFLINE);
  });

  it("F005/AC-3 online wird der Hinweis zu keinem Zeitpunkt angezeigt, auch nicht nach pageshow oder visibilitychange", () => {
    setNavigatorOnline(true);
    const watcher = watchForText(OFFLINE);

    renderHeader();
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    watcher.stop();

    expect(watcher.seen.value).toBe(false);
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
  });

  it("F005/AC-3 zeigt den Hinweis bei Rückkehr zur Seite (pageshow), auch ohne offline-Event", () => {
    setNavigatorOnline(true);
    renderHeader();

    setNavigatorOnline(false);
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });

    expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(OFFLINE);
  });

  it("F005/AC-3 zeigt den Hinweis beim Zurückholen des Tabs (visibilitychange), auch ohne offline-Event", () => {
    setNavigatorOnline(true);
    renderHeader();

    setNavigatorOnline(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(OFFLINE);
  });
});

describe("F005 AppHeader: Synchronisation schlägt fehl", () => {
  it("F005/AC-6 zeigt online bei fehlgeschlagener Übertragung den Sync-Hinweis und entfernt ihn nach Erfolg", async () => {
    const { client } = renderHeader();
    const status = within(screen.getByRole("banner")).getByRole("status");

    const { mutationFn, secondAttempt } = startFailingSync(client);

    await waitFor(() => expect(status).toHaveTextContent(SYNC_ERROR));
    expect(within(status).getByText(SYNC_ERROR)).toBeVisible();
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondAttempt.resolve({ temperatureUnit: "F", updatedAt: "2026-10-02T08:00:00.000Z" });
    });

    await waitFor(() => expect(screen.queryByText(SYNC_ERROR)).not.toBeInTheDocument());
    expect(status).toHaveTextContent("");
  });

  it("F005/AC-6 zeigt offline trotz Sync-Fehler nur den Offline-Hinweis", async () => {
    const { client } = renderHeader();
    const status = within(screen.getByRole("banner")).getByRole("status");
    startFailingSync(client);
    await waitFor(() => expect(status).toHaveTextContent(SYNC_ERROR));

    goOffline();

    expect(status).toHaveTextContent(OFFLINE);
    expect(screen.queryByText(SYNC_ERROR)).not.toBeInTheDocument();
  });

  it("F005/AC-6 ohne ausstehende Übertragung erscheint kein Sync-Hinweis", () => {
    renderHeader();

    expect(screen.queryByText(SYNC_ERROR)).not.toBeInTheDocument();
  });
});

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: mocks.signUpEmail },
  signIn: { email: mocks.signInEmail },
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: vi.fn() }),
}));

import { onlineManager } from "@tanstack/react-query";
import { QueryProvider } from "@/components/app/query-provider";
import { Dashboard } from "@/components/auth/dashboard";
import { bindSyncUser, getSyncUserId, resetSyncUser } from "@/lib/query/sync-user";
import { createTestQueryClient, readPersistedCache, seedPersistedCache } from "@/test/query-client";

const OFFLINE_SIGN_OUT = "Du bist offline. Abmelden ist nur mit Internetverbindung möglich.";
const CHANGED_AT = "2026-10-02T08:00:00.000Z";
const SESSION_U1 = {
  data: { user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};

const GENERIC = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
const SESSION = {
  data: { user: { name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.useSession.mockReturnValue(SESSION);
});

afterEach(() => {
  cleanup();
});

describe("F004 Dashboard", () => {
  it("F004/AC-4 zeigt Überschrift, Namen und E-Mail-Adresse der angemeldeten Person", () => {
    render(<Dashboard />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("max@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
  });

  it("F004/AC-7 beendet beim Klick auf „Abmelden“ die Sitzung und leitet auf /login weiter", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("F004/AC-7 zeigt bei fehlgeschlagenem Abmelden (Fehlerantwort) die Generik-Meldung ohne Umleitung", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockResolvedValue({ data: null, error: { status: 500, message: "Internal Server Error" } });
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  // Seit F005/AC-7: Netzwerkfehler beim Abmelden zeigen die Offline-Meldung statt der Generik-Meldung.
  it("F004/AC-7 zeigt bei Netzwerkfehler beim Abmelden die Offline-Meldung ohne Umleitung", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(OFFLINE_SIGN_OUT);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
  });
});

describe("F005 Dashboard: lokaler Speicher beim Abmelden", () => {
  function setNavigatorOnline(value: boolean) {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
  }

  function hasNoUserData() {
    const persisted = readPersistedCache();
    return (
      persisted === null ||
      (persisted.clientState.queries.length === 0 && persisted.clientState.mutations.length === 0)
    );
  }

  /** Cache mit Präferenz „F“ und einer noch nicht übertragenen (pausierten) Änderung. */
  async function renderWithCache() {
    seedPersistedCache(
      [
        { queryKey: ["preferences"], data: { temperatureUnit: "F" } },
        { queryKey: ["offline-user"], data: { id: "u1" } },
      ],
      { pausedPreferenceChanges: [{ userId: "u1", temperatureUnit: "F", changedAt: CHANGED_AT }] },
    );
    const client = createTestQueryClient();
    render(
      <QueryProvider client={client}>
        <Dashboard />
      </QueryProvider>,
    );
    await waitFor(() => expect(client.getQueryData(["preferences"])).toEqual({ temperatureUnit: "F" }));
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(1));
    return client;
  }

  /** Lokale Daten samt nicht übertragener Änderung sind im Client und im Speicher unverändert. */
  async function expectLocalDataKept(client: ReturnType<typeof createTestQueryClient>) {
    expect(client.getQueryData(["preferences"])).toEqual({ temperatureUnit: "F" });
    expect(client.getMutationCache().getAll()).toHaveLength(1);
    expect(client.getMutationCache().getAll()[0].state.variables).toMatchObject({
      temperatureUnit: "F",
      changedAt: CHANGED_AT,
    });
    await waitFor(() => {
      const persisted = readPersistedCache();
      const query = persisted?.clientState.queries.find(
        (q) => JSON.stringify(q.queryKey) === JSON.stringify(["preferences"]),
      );
      expect(query?.state.data).toEqual({ temperatureUnit: "F" });
      const mutation = persisted?.clientState.mutations.find(
        (m) => JSON.stringify(m.mutationKey) === JSON.stringify(["preferences", "update"]),
      );
      expect(mutation?.state.variables).toMatchObject({ temperatureUnit: "F", changedAt: CHANGED_AT });
    });
  }

  beforeEach(() => {
    mocks.useSession.mockReturnValue(SESSION_U1);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    onlineManager.setOnline(true);
    localStorage.clear();
    resetSyncUser();
  });

  it("F005/AC-7 leert nach erfolgreichem Abmelden ohne Rückfrage den lokalen Speicher und leitet auf /login um", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
    const client = await renderWithCache();
    bindSyncUser("u1");

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(getSyncUserId()).toBeNull();
    await waitFor(() => expect(hasNoUserData()).toBe(true));
    expect(JSON.stringify(readPersistedCache() ?? {})).not.toContain("temperatureUnit");
  });

  it("F005/AC-7 meldet offline, dass Abmelden nur mit Internet möglich ist, ohne signOut und ohne Rückfrage; Daten bleiben", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    setNavigatorOnline(false);
    const client = await renderWithCache();

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(OFFLINE_SIGN_OUT);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
    await expectLocalDataKept(client);
  });

  it("F005/AC-7 zeigt bei Netzwerkfehler beim Abmelden die Offline-Meldung und behält die Daten", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    const client = await renderWithCache();

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(OFFLINE_SIGN_OUT);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
    await expectLocalDataKept(client);
  });

  it("F005/AC-7 zeigt bei Fehlerantwort (500) die Generik-Meldung und behält die Daten", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.signOut.mockResolvedValue({ data: null, error: { status: 500, message: "Internal Server Error" } });
    const client = await renderWithCache();

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(screen.queryByText(OFFLINE_SIGN_OUT)).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
    await expectLocalDataKept(client);
  });

  it("F005/AC-7 zeigt die eingebetteten Inhalte (children) und funktioniert ohne QueryProvider", () => {
    render(
      <Dashboard>
        <p>Einstellungen-Slot</p>
      </Dashboard>,
    );

    expect(screen.getByText("Einstellungen-Slot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
  });
});

describe("F010 Dashboard: Einstieg zum Rechner", () => {
  it("F010/AC-1 zeigt einen Link „Zum Rechner“ auf /calculator", () => {
    render(<Dashboard />);

    expect(screen.getByRole("link", { name: "Zum Rechner" })).toHaveAttribute("href", "/calculator");
  });
});

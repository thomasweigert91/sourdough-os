import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, useIsRestoring } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: vi.fn() },
  signIn: { email: vi.fn() },
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: vi.fn() }),
}));

import { CachedSessionGate } from "@/components/app/cached-session-gate";
import { QueryProvider } from "@/components/app/query-provider";
import { resetSyncUser } from "@/lib/query/sync-user";
import { createTestQueryClient, seedPersistedCache } from "@/test/query-client";

const PENDING = { data: null, isPending: true, error: null };
const NO_SESSION = { data: null, isPending: false, error: null };
const SESSION_U1 = {
  data: { user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};

function RestoreProbe() {
  return useIsRestoring() ? null : <span>Wiederherstellung fertig</span>;
}

function ui(client = createTestQueryClient()) {
  return (
    <QueryProvider client={client}>
      <CachedSessionGate>
        <p>Geschützter Inhalt</p>
      </CachedSessionGate>
    </QueryProvider>
  );
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.useSession.mockReset();
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  localStorage.clear();
  resetSyncUser();
  vi.restoreAllMocks();
});

describe("F005 CachedSessionGate", () => {
  it("F005/AC-4 zeigt mit gespeichertem Nutzer die Inhalte, während die Sitzung noch lädt", async () => {
    seedPersistedCache([{ queryKey: ["offline-user"], data: { id: "u1" } }]);
    mocks.useSession.mockReturnValue(PENDING);

    render(ui());

    expect(await screen.findByText("Geschützter Inhalt")).toBeInTheDocument();
    expect(screen.queryByText("Lade Sitzung …")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F005/AC-4 zeigt ohne gespeicherten Nutzer „Lade Sitzung …“ und keine Inhalte", async () => {
    mocks.useSession.mockReturnValue(PENDING);
    const client = createTestQueryClient();

    render(
      <QueryProvider client={client}>
        <RestoreProbe />
        <CachedSessionGate>
          <p>Geschützter Inhalt</p>
        </CachedSessionGate>
      </QueryProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Lade Sitzung …");
    // Auch nach abgeschlossener Wiederherstellung bleibt es beim Ladetext.
    expect(await screen.findByText("Wiederherstellung fertig")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Lade Sitzung …");
    expect(screen.queryByText("Geschützter Inhalt")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F005/AC-4 leitet trotz gespeichertem Nutzer auf /login um, wenn sich die Sitzung als ungültig erweist", async () => {
    seedPersistedCache([{ queryKey: ["offline-user"], data: { id: "u1" } }]);
    mocks.useSession.mockReturnValue(PENDING);
    const client = createTestQueryClient();
    const { rerender } = render(ui(client));
    expect(await screen.findByText("Geschützter Inhalt")).toBeInTheDocument();

    mocks.useSession.mockReturnValue(NO_SESSION);
    rerender(ui(client));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Geschützter Inhalt")).not.toBeInTheDocument();
  });

  it("F005/AC-4 behält die Inhalte ohne Neuaufbau, wenn die Sitzung bestätigt wird", async () => {
    seedPersistedCache([{ queryKey: ["offline-user"], data: { id: "u1" } }]);
    mocks.useSession.mockReturnValue(PENDING);
    const client = createTestQueryClient();
    const { rerender } = render(ui(client));
    const content = await screen.findByText("Geschützter Inhalt");

    mocks.useSession.mockReturnValue(SESSION_U1);
    rerender(ui(client));

    expect(screen.getByText("Geschützter Inhalt")).toBe(content);
    expect(screen.queryByText("Lade Sitzung …")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

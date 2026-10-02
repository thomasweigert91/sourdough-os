import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

import { SessionGate } from "@/components/auth/session-gate";

const SESSION = {
  data: { user: { name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};
const NO_SESSION = { data: null, isPending: false, error: null };
const PENDING = { data: null, isPending: true, error: null };

function Protected() {
  return <p>Geheimer Inhalt</p>;
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.useSession.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("F004 SessionGate", () => {
  it.each(["user", "guest"] as const)(
    "F004/AC-8 zeigt beim Laden „Lade Sitzung …“ und weder Kinder noch Umleitung (require=%s)",
    async (requireMode) => {
      mocks.useSession.mockReturnValue(PENDING);
      render(
        <SessionGate require={requireMode}>
          <Protected />
        </SessionGate>,
      );

      expect(screen.getByRole("status")).toHaveTextContent("Lade Sitzung …");
      expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
      // render() läuft in act(): Effekte sind bereits ausgeführt, eine fälschliche Umleitung fiele hier auf.
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );

  it("F004/AC-8 zeigt als angemeldete Person die Kinder ohne Umleitung (require=user)", async () => {
    mocks.useSession.mockReturnValue(SESSION);
    render(
      <SessionGate require="user">
        <Protected />
      </SessionGate>,
    );

    expect(screen.getByText("Geheimer Inhalt")).toBeInTheDocument();
    expect(screen.queryByText("Lade Sitzung …")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F004/AC-8 leitet nicht angemeldete Personen auf /login um, ohne die Kinder zu zeigen (require=user)", async () => {
    mocks.useSession.mockReturnValue(NO_SESSION);
    render(
      <SessionGate require="user">
        <Protected />
      </SessionGate>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("F004/AC-8 behandelt einen Sitzungsfehler ohne Daten als nicht angemeldet (require=user)", async () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: false, error: new Error("boom") });
    render(
      <SessionGate require="user">
        <Protected />
      </SessionGate>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
  });

  it("F004/AC-8 leitet angemeldete Personen von Gast-Seiten auf /dashboard um, ohne die Kinder zu zeigen (require=guest)", async () => {
    mocks.useSession.mockReturnValue(SESSION);
    render(
      <SessionGate require="guest">
        <Protected />
      </SessionGate>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("F004/AC-8 zeigt nicht angemeldeten Personen die Gast-Inhalte ohne Umleitung (require=guest)", async () => {
    mocks.useSession.mockReturnValue(NO_SESSION);
    render(
      <SessionGate require="guest">
        <Protected />
      </SessionGate>,
    );

    expect(screen.getByText("Geheimer Inhalt")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F004/AC-7 leitet nach dem Abmelden (Sitzung wird null) auf /login um und blendet die Kinder aus", async () => {
    mocks.useSession.mockReturnValue(SESSION);
    const { rerender } = render(
      <SessionGate require="user">
        <Protected />
      </SessionGate>,
    );
    expect(screen.getByText("Geheimer Inhalt")).toBeInTheDocument();

    mocks.useSession.mockReturnValue(NO_SESSION);
    rerender(
      <SessionGate require="user">
        <Protected />
      </SessionGate>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
  });
});

describe("F005 SessionGate showChildrenWhilePending", () => {
  it("F005/AC-4 zeigt mit showChildrenWhilePending die Kinder schon während die Sitzung lädt (require=user)", () => {
    mocks.useSession.mockReturnValue(PENDING);
    render(
      <SessionGate require="user" showChildrenWhilePending>
        <Protected />
      </SessionGate>,
    );

    expect(screen.getByText("Geheimer Inhalt")).toBeInTheDocument();
    expect(screen.queryByText("Lade Sitzung …")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F005/AC-4 showChildrenWhilePending wirkt nicht bei require=guest", () => {
    mocks.useSession.mockReturnValue(PENDING);
    render(
      <SessionGate require="guest" showChildrenWhilePending>
        <Protected />
      </SessionGate>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Lade Sitzung …");
    expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
  });

  it("F005/AC-4 mit showChildrenWhilePending={false} bleibt es beim Ladetext", () => {
    mocks.useSession.mockReturnValue(PENDING);
    render(
      <SessionGate require="user" showChildrenWhilePending={false}>
        <Protected />
      </SessionGate>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Lade Sitzung …");
    expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
  });

  it("F005/AC-4 leitet trotz showChildrenWhilePending ohne Sitzung auf /login um", async () => {
    mocks.useSession.mockReturnValue(NO_SESSION);
    render(
      <SessionGate require="user" showChildrenWhilePending>
        <Protected />
      </SessionGate>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Geheimer Inhalt")).not.toBeInTheDocument();
  });
});

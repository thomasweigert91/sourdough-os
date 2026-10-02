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

import { Dashboard } from "@/components/auth/dashboard";

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

  it("F004/AC-7 zeigt bei Netzwerkfehler beim Abmelden die Generik-Meldung ohne Umleitung", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

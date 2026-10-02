import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSyncUser } from "@/lib/query/sync-user";
import { jsonResponse, seedPersistedCache } from "@/test/query-client";

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

import DashboardPage from "@/app/dashboard/page";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));

const SESSION = {
  data: { user: { name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};
const NO_SESSION = { data: null, isPending: false, error: null };
const PENDING = { data: null, isPending: true, error: null };

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.useSession.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
  localStorage.clear();
  resetSyncUser();
});

describe("F004 Seiten /dashboard, /login, /register", () => {
  it("F004/AC-8 /dashboard zeigt beim Laden „Lade Sitzung …“ und keine Nutzerdaten", () => {
    mocks.useSession.mockReturnValue(PENDING);
    render(<DashboardPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Lade Sitzung …");
    expect(screen.queryByText("Max Mustermann")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abmelden" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Passwort")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F004/AC-8 /dashboard zeigt angemeldeten Personen ihr Dashboard mit Namen", () => {
    mocks.useSession.mockReturnValue(SESSION);
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("max@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F004/AC-8 /dashboard leitet nicht angemeldete Personen auf /login um", async () => {
    mocks.useSession.mockReturnValue(NO_SESSION);
    render(<DashboardPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("button", { name: "Abmelden" })).not.toBeInTheDocument();
  });

  it("F004/AC-8 /login leitet angemeldete Personen auf /dashboard um und zeigt kein Formular", async () => {
    mocks.useSession.mockReturnValue(SESSION);
    render(<LoginPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByLabelText("E-Mail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anmelden" })).not.toBeInTheDocument();
  });

  it("F004/AC-8 /register leitet angemeldete Personen auf /dashboard um und zeigt kein Formular", async () => {
    mocks.useSession.mockReturnValue(SESSION);
    render(<RegisterPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrieren" })).not.toBeInTheDocument();
  });

  it("F004/AC-4 /login zeigt nicht angemeldeten Personen das Anmeldeformular", () => {
    mocks.useSession.mockReturnValue(NO_SESSION);
    render(<LoginPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Anmelden" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-Mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Passwort")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F004/AC-1 /register zeigt nicht angemeldeten Personen das Registrierungsformular", () => {
    mocks.useSession.mockReturnValue(NO_SESSION);
    render(<RegisterPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Registrieren" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("E-Mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Passwort")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrieren" })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F004/AC-1 das Root-Layout setzt <html lang=\"de\">", () => {
    const source = fs.readFileSync(path.join(APP_DIR, "layout.tsx"), "utf8");
    expect(source).toMatch(/<html[\s\S]*?lang="de"/);
    expect(source).not.toMatch(/lang="en"/);
  });
});

describe("F005 Seite /dashboard: Offline-Hinweis und lokaler Cache", () => {
  const OFFLINE = "Offline – Änderungen werden lokal gespeichert";
  const SESSION_U1 = {
    data: { user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }, session: {} },
    isPending: false,
    error: null,
  };

  it("F005/AC-1 zeigt auf /dashboard bei Verbindungsverlust den Hinweis im Kopfbereich, die Seite bleibt bedienbar", async () => {
    const user = userEvent.setup();
    mocks.useSession.mockReturnValue(SESSION_U1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ temperatureUnit: "C", updatedAt: null })),
    );
    render(<DashboardPage />);
    expect(await screen.findByRole("radio", { name: "Celsius (°C)" })).toBeChecked();
    const banner = screen.getByRole("banner");
    expect(within(banner).queryByText(OFFLINE)).not.toBeInTheDocument();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(OFFLINE);
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
    await user.click(screen.getByRole("radio", { name: "Fahrenheit (°F)" }));
    expect(screen.getByRole("radio", { name: "Fahrenheit (°F)" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("F005/AC-4 zeigt auf /dashboard mit gespeichertem Cache sofort Dashboard und Einheit, bevor Sitzung und Server antworten", async () => {
    seedPersistedCache([
      { queryKey: ["offline-user"], data: { id: "u1" } },
      { queryKey: ["preferences"], data: { temperatureUnit: "F" } },
    ]);
    mocks.useSession.mockReturnValue(PENDING);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "Fahrenheit (°F)" })).toBeChecked();
    expect(screen.queryByText("Lade Sitzung …")).not.toBeInTheDocument();
    expect(screen.queryByText("Lade Einstellungen …")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

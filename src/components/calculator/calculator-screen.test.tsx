import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, useIsRestoring } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  saveRecipe: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: vi.fn() },
  signIn: { email: vi.fn() },
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: vi.fn() }),
  usePathname: () => "/calculator",
}));

vi.mock("@/app/calculator/actions", () => ({ saveRecipe: mocks.saveRecipe }));

import CalculatorRoute from "@/app/calculator/page";
import { QueryProvider } from "@/components/app/query-provider";
import { CalculatorScreen } from "@/components/calculator/calculator-screen";
import { DEFAULT_DDT_STATE } from "@/lib/calculator/ddt-state";
import { saveCalculatorDraft } from "@/lib/calculator/local-draft";
import { createReferenceRecipe, setBasisMode, setBasisValue } from "@/lib/calculator/recipe-state";
import { resetSyncUser } from "@/lib/query/sync-user";
import { createTestQueryClient, seedPersistedCache } from "@/test/query-client";

const PENDING = { data: null, isPending: true, error: null };
const NO_SESSION = { data: null, isPending: false, error: null };
const SESSION_ERROR = { data: null, isPending: false, error: { status: 0, message: "Failed to fetch" } };
const SESSION_U1 = {
  data: { user: { id: "u1", name: "Max Mustermann", email: "max@example.com" }, session: {} },
  isPending: false,
  error: null,
};

const SIGN_IN_HINT = "Melde dich an, um Rezepte in deinem Konto zu speichern.";
const OFFLINE_MESSAGE = "Offline – Änderungen werden lokal gespeichert";

function RestoreProbe() {
  return useIsRestoring() ? null : <span>Wiederherstellung fertig</span>;
}

function renderScreen() {
  const client = createTestQueryClient();
  return render(
    <QueryProvider client={client}>
      <RestoreProbe />
      <CalculatorScreen />
    </QueryProvider>,
  );
}

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.useSession.mockReset();
  mocks.saveRecipe.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  localStorage.clear();
  resetSyncUser();
});

describe("F010 CalculatorScreen: Besitzer ermitteln", () => {
  it("F010/AC-10 zeigt Gästen den Rechner ohne Umleitung mit Anmelde-Hinweis und „Lokal merken“", async () => {
    mocks.useSession.mockReturnValue(NO_SESSION);

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Hydratations-Rechner" })).toBeInTheDocument();
    expect(screen.getByText(SIGN_IN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Als Rezept speichern" })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("F010/AC-10 zeigt angemeldeten Personen online „Als Rezept speichern“ statt „Lokal merken“", async () => {
    mocks.useSession.mockReturnValue(SESSION_U1);

    renderScreen();

    expect(await screen.findByRole("button", { name: "Als Rezept speichern" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Rezeptname" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lokal merken" })).not.toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
  });

  it("F010/AC-10 erkennt offline die angemeldete Person über den Cache und stellt ihren gemerkten Stand wieder her", async () => {
    setNavigatorOnline(false);
    mocks.useSession.mockReturnValue(SESSION_ERROR);
    seedPersistedCache([{ queryKey: ["offline-user"], data: { id: "u1" } }]);
    saveCalculatorDraft(
      { kind: "user", userId: "u1" },
      {
        recipe: setBasisValue(setBasisMode(createReferenceRecipe(), "dough"), 960),
        ddt: { ...DEFAULT_DDT_STATE, desiredDoughTemperature: 26 },
      },
    );

    renderScreen();

    expect(await screen.findByRole("textbox", { name: "Ziel-Teiggewicht (g)" })).toHaveValue("960");
    expect(screen.getByRole("radio", { name: "Basis: Ziel-Teiggewicht" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Ziel-Teigtemperatur (DDT)" })).toHaveValue("26,0");
    expect(screen.getByRole("button", { name: "Lokal merken" })).toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Als Rezept speichern" })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("F010/AC-10 stellt offline ohne Cache-Nutzer keinen Konto-Stand wieder her (Person gilt als Gast)", async () => {
    setNavigatorOnline(false);
    mocks.useSession.mockReturnValue(SESSION_ERROR);
    saveCalculatorDraft(
      { kind: "user", userId: "u1" },
      { recipe: setBasisValue(setBasisMode(createReferenceRecipe(), "dough"), 960), ddt: DEFAULT_DDT_STATE },
    );

    renderScreen();

    expect(await screen.findByText(SIGN_IN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Gesamtmehl (g)" })).toHaveValue("1000");
    expect(screen.queryByRole("textbox", { name: "Ziel-Teiggewicht (g)" })).not.toBeInTheDocument();
  });

  it("F010/AC-10 zeigt „Lade Sitzung …“, solange die Sitzung lädt", async () => {
    mocks.useSession.mockReturnValue(PENDING);

    renderScreen();

    expect(screen.getByText("Lade Sitzung …")).toBeInTheDocument();
    expect(await screen.findByText("Wiederherstellung fertig")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Lade Sitzung …");
    expect(screen.queryByRole("heading", { name: "Hydratations-Rechner" })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("F010 Seite /calculator", () => {
  it("F010/AC-10 ist ohne Anmeldung erreichbar und zeigt Überschrift und Rechner", async () => {
    mocks.useSession.mockReturnValue(NO_SESSION);

    render(<CalculatorRoute />);

    expect(screen.getByRole("heading", { level: 1, name: "Rechner" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Hydratations-Rechner" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "DDT-Rechner" })).toBeInTheDocument();
    expect(screen.getByText(SIGN_IN_HINT)).toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).not.toHaveBeenCalled());
  });

  it("F010/AC-10 zeigt offline den Offline-Hinweis der Kopfzeile und „Lokal merken“", async () => {
    setNavigatorOnline(false);
    mocks.useSession.mockReturnValue(SESSION_ERROR);
    seedPersistedCache([{ queryKey: ["offline-user"], data: { id: "u1" } }]);

    render(<CalculatorRoute />);

    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Lokal merken" })).toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Als Rezept speichern" })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

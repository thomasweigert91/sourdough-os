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

import { LoginForm } from "@/components/auth/login-form";

const GENERIC = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
const EMAIL_INVALID = "Bitte gib eine gültige E-Mail-Adresse ein.";
const PASSWORD_REQUIRED = "Bitte gib dein Passwort ein.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fields() {
  return {
    email: screen.getByLabelText("E-Mail") as HTMLInputElement,
    password: screen.getByLabelText("Passwort") as HTMLInputElement,
  };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  const f = fields();
  await user.type(f.email, "max@example.com");
  await user.type(f.password, "geheim123");
  return f;
}

beforeEach(() => {
  mocks.signInEmail.mockReset();
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.useSession.mockReturnValue({ data: null, isPending: false, error: null });
});

afterEach(() => {
  cleanup();
});

describe("F004 LoginForm", () => {
  it("F004/AC-4 zeigt Felder E-Mail und Passwort mit verknüpften Labels und den Button „Anmelden“", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const f = fields();

    expect(f.email).toHaveAttribute("type", "email");
    expect(f.email).toHaveAttribute("autocomplete", "email");
    expect(f.password).toHaveAttribute("type", "password");
    expect(f.password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeEnabled();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    await user.click(screen.getByText("Passwort", { selector: "label" }));
    expect(f.password).toHaveFocus();
  });

  it("F004/AC-4 meldet mit gültigen Daten an und leitet auf /dashboard weiter", async () => {
    const user = userEvent.setup();
    mocks.signInEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    render(<LoginForm />);
    await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signInEmail).toHaveBeenCalledTimes(1);
    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "max@example.com", password: "geheim123" }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("F004/AC-4 sendet auch per Enter im E-Mail-Feld ab", async () => {
    const user = userEvent.setup();
    mocks.signInEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    render(<LoginForm />);
    const f = await fillValid(user);

    await user.type(f.email, "{Enter}");

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signInEmail).toHaveBeenCalledTimes(1);
  });

  it("F004/AC-5 zeigt bei falschen Zugangsdaten eine neutrale Meldung, leert das Passwort und behält die E-Mail", async () => {
    const user = userEvent.setup();
    mocks.signInEmail.mockResolvedValue({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401, message: "Invalid email or password" },
    });
    render(<LoginForm />);
    const f = await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("E-Mail oder Passwort ist falsch.");
    expect(alert.compareDocumentPosition(screen.getByRole("button", { name: "Anmelden" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(f.password).toHaveValue(""));
    expect(f.email).toHaveValue("max@example.com");
    expect(f.email).not.toHaveAttribute("aria-invalid", "true");
    expect(f.password).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(EMAIL_INVALID)).not.toBeInTheDocument();
    expect(screen.queryByText(PASSWORD_REQUIRED)).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeEnabled();
  });

  it("F004/AC-5 zeigt bei leeren Feldern Feldmeldungen ohne Server-Request und fokussiert das erste Feld", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const f = fields();

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText(EMAIL_INVALID)).toBeInTheDocument();
    expect(screen.getByText(PASSWORD_REQUIRED)).toBeInTheDocument();
    expect(f.email).toHaveAccessibleDescription(EMAIL_INVALID);
    expect(f.password).toHaveAccessibleDescription(PASSWORD_REQUIRED);
    expect(f.email).toHaveAttribute("aria-invalid", "true");
    expect(f.password).toHaveAttribute("aria-invalid", "true");
    expect(f.email).toHaveFocus();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("F004/AC-5 zeigt bei ungültigem E-Mail-Format die Feldmeldung ohne Server-Request und behält die Werte", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const f = fields();
    await user.type(f.email, "max@");
    await user.type(f.password, "geheim123");

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText(EMAIL_INVALID)).toBeInTheDocument();
    expect(f.email).toHaveAccessibleDescription(EMAIL_INVALID);
    expect(f.email).toHaveFocus();
    expect(screen.queryByText(PASSWORD_REQUIRED)).not.toBeInTheDocument();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(f.email).toHaveValue("max@");
    expect(f.password).toHaveValue("geheim123");
  });

  it("F004/AC-5 fokussiert das Passwortfeld, wenn nur das Passwort fehlt", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const f = fields();
    await user.type(f.email, "max@example.com");

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText(PASSWORD_REQUIRED)).toBeInTheDocument();
    expect(f.password).toHaveFocus();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("F004/AC-6 deaktiviert den Button während der Anfrage, zeigt „Bitte warten …“ und verhindert zweites Absenden", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ data: unknown; error: unknown }>();
    mocks.signInEmail.mockReturnValue(pending.promise);
    render(<LoginForm />);
    const f = await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    const busy = await screen.findByRole("button", { name: "Bitte warten …" });
    expect(busy).toBeDisabled();

    await user.click(busy);
    await user.type(f.password, "{Enter}");
    expect(mocks.signInEmail).toHaveBeenCalledTimes(1);

    pending.resolve({ data: { user: { id: "1" } }, error: null });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signInEmail).toHaveBeenCalledTimes(1);
  });

  it("F004/AC-6 zeigt bei Serverfehler (500) die Generik-Meldung, Button wieder aktiv, Werte erhalten", async () => {
    const user = userEvent.setup();
    mocks.signInEmail.mockResolvedValue({ data: null, error: { status: 500, message: "Internal Server Error" } });
    render(<LoginForm />);
    const f = await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(f.email).toHaveValue("max@example.com");
    expect(f.password).toHaveValue("geheim123");
  });

  it("F004/AC-6 zeigt bei Netzwerkfehler die Generik-Meldung, Button wieder aktiv, Werte erhalten", async () => {
    const user = userEvent.setup();
    mocks.signInEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginForm />);
    const f = await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(f.email).toHaveValue("max@example.com");
    expect(f.password).toHaveValue("geheim123");
  });

  it("F004/AC-9 verlinkt mit „Noch kein Konto? Registrieren“ auf /register", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "Noch kein Konto? Registrieren" })).toHaveAttribute("href", "/register");
  });
});

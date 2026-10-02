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

import { RegisterForm } from "@/components/auth/register-form";

const GENERIC = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fields() {
  return {
    name: screen.getByLabelText("Name") as HTMLInputElement,
    email: screen.getByLabelText("E-Mail") as HTMLInputElement,
    password: screen.getByLabelText("Passwort") as HTMLInputElement,
  };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>, email = "neu@example.com") {
  const f = fields();
  await user.type(f.name, "Max Mustermann");
  await user.type(f.email, email);
  await user.type(f.password, "geheim123");
  return f;
}

beforeEach(() => {
  mocks.signUpEmail.mockReset();
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.useSession.mockReturnValue({ data: null, isPending: false, error: null });
});

afterEach(() => {
  cleanup();
});

describe("F004 RegisterForm", () => {
  it("F004/AC-1 zeigt Felder Name, E-Mail, Passwort mit verknüpften Labels und den Button „Registrieren“", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const f = fields();

    expect(f.name).toHaveAttribute("type", "text");
    expect(f.name).toHaveAttribute("autocomplete", "name");
    expect(f.email).toHaveAttribute("type", "email");
    expect(f.email).toHaveAttribute("autocomplete", "email");
    expect(f.password).toHaveAttribute("type", "password");
    expect(f.password).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: "Registrieren" })).toBeEnabled();

    await user.click(screen.getByText("E-Mail", { selector: "label" }));
    expect(f.email).toHaveFocus();
    await user.click(screen.getByText("Passwort", { selector: "label" }));
    expect(f.password).toHaveFocus();
    await user.click(screen.getByText("Name", { selector: "label" }));
    expect(f.name).toHaveFocus();
  });

  it("F004/AC-1 legt bei gültigen Daten das Konto an und leitet auf /dashboard weiter", async () => {
    const user = userEvent.setup();
    mocks.signUpEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    render(<RegisterForm />);
    await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signUpEmail).toHaveBeenCalledTimes(1);
    expect(mocks.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Max Mustermann", email: "neu@example.com", password: "geheim123" }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("F004/AC-1 sendet auch per Enter im Passwortfeld ab", async () => {
    const user = userEvent.setup();
    mocks.signUpEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    render(<RegisterForm />);
    const f = await fillValid(user);

    await user.type(f.password, "{Enter}");

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signUpEmail).toHaveBeenCalledTimes(1);
  });

  it("F004/AC-2 zeigt bei ungültigen Eingaben Feldmeldungen unter den Feldern, sendet nichts und behält die Werte", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const f = fields();
    await user.type(f.email, "max@");
    await user.type(f.password, "kurz");

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    const nameError = await screen.findByText("Bitte gib deinen Namen ein.");
    const emailError = screen.getByText("Bitte gib eine gültige E-Mail-Adresse ein.");
    const passwordError = screen.getByText("Das Passwort muss mindestens 8 Zeichen lang sein.");

    expect(f.name).toHaveAccessibleDescription("Bitte gib deinen Namen ein.");
    expect(f.email).toHaveAccessibleDescription("Bitte gib eine gültige E-Mail-Adresse ein.");
    expect(f.password).toHaveAccessibleDescription("Das Passwort muss mindestens 8 Zeichen lang sein.");
    expect(f.name).toHaveAttribute("aria-invalid", "true");
    expect(f.email).toHaveAttribute("aria-invalid", "true");
    expect(f.password).toHaveAttribute("aria-invalid", "true");

    // Meldung steht jeweils nach ihrem Feld und vor dem nächsten Feld
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(f.name.compareDocumentPosition(nameError) & following).toBeTruthy();
    expect(nameError.compareDocumentPosition(f.email) & following).toBeTruthy();
    expect(f.email.compareDocumentPosition(emailError) & following).toBeTruthy();
    expect(emailError.compareDocumentPosition(f.password) & following).toBeTruthy();
    expect(f.password.compareDocumentPosition(passwordError) & following).toBeTruthy();

    expect(f.name).toHaveFocus();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(f.name).toHaveValue("");
    expect(f.email).toHaveValue("max@");
    expect(f.password).toHaveValue("kurz");
  });

  it("F004/AC-2 fokussiert das erste fehlerhafte Feld (E-Mail, wenn der Name gültig ist)", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const f = fields();
    await user.type(f.name, "Max");
    await user.type(f.email, "max@");
    await user.type(f.password, "geheim123");

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText("Bitte gib eine gültige E-Mail-Adresse ein.")).toBeInTheDocument();
    expect(f.email).toHaveFocus();
    expect(f.name).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Bitte gib deinen Namen ein.")).not.toBeInTheDocument();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("F004/AC-2 meldet ein Passwort mit mehr als 128 Zeichen", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const f = fields();
    const longPassword = "a".repeat(129);
    await user.type(f.name, "Max");
    await user.type(f.email, "max@example.com");
    await user.click(f.password);
    await user.paste(longPassword);

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText("Das Passwort darf höchstens 128 Zeichen lang sein.")).toBeInTheDocument();
    expect(f.password).toHaveAccessibleDescription("Das Passwort darf höchstens 128 Zeichen lang sein.");
    expect(f.password).toHaveFocus();
    expect(f.password).toHaveValue(longPassword);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("F004/AC-3 zeigt bei bereits registrierter E-Mail die Meldung über dem Button und behält die Eingaben", async () => {
    const user = userEvent.setup();
    mocks.signUpEmail.mockResolvedValue({
      data: null,
      error: {
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        status: 422,
        message: "User already exists. Use another email.",
      },
    });
    render(<RegisterForm />);
    const f = await fillValid(user, "max@example.com");

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Diese E-Mail-Adresse ist bereits registriert.");
    const button = screen.getByRole("button", { name: "Registrieren" });
    expect(alert.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(f.name).toHaveValue("Max Mustermann");
    expect(f.email).toHaveValue("max@example.com");
    expect(f.password).toHaveValue("geheim123");
    expect(button).toBeEnabled();
  });

  it("F004/AC-6 deaktiviert den Button während der Anfrage, zeigt „Bitte warten …“ und verhindert zweites Absenden", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ data: unknown; error: unknown }>();
    mocks.signUpEmail.mockReturnValue(pending.promise);
    render(<RegisterForm />);
    const f = await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    const busy = await screen.findByRole("button", { name: "Bitte warten …" });
    expect(busy).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Registrieren" })).not.toBeInTheDocument();

    await user.click(busy);
    await user.type(f.password, "{Enter}");
    expect(mocks.signUpEmail).toHaveBeenCalledTimes(1);

    pending.resolve({ data: { user: { id: "1" } }, error: null });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signUpEmail).toHaveBeenCalledTimes(1);
  });

  it("F004/AC-6 zeigt bei Serverfehler (500) die Generik-Meldung, Button wieder aktiv, Werte erhalten", async () => {
    const user = userEvent.setup();
    mocks.signUpEmail.mockResolvedValue({ data: null, error: { status: 500, message: "Internal Server Error" } });
    render(<RegisterForm />);
    const f = await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(screen.getByRole("button", { name: "Registrieren" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(f.name).toHaveValue("Max Mustermann");
    expect(f.email).toHaveValue("neu@example.com");
    expect(f.password).toHaveValue("geheim123");
  });

  it("F004/AC-6 zeigt bei Netzwerkfehler die Generik-Meldung, Button wieder aktiv, Werte erhalten", async () => {
    const user = userEvent.setup();
    mocks.signUpEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<RegisterForm />);
    const f = await fillValid(user);

    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(screen.getByRole("button", { name: "Registrieren" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(f.name).toHaveValue("Max Mustermann");
    expect(f.email).toHaveValue("neu@example.com");
    expect(f.password).toHaveValue("geheim123");
  });

  it("F004/AC-9 verlinkt mit „Schon ein Konto? Anmelden“ auf /login", () => {
    render(<RegisterForm />);
    expect(screen.getByRole("link", { name: "Schon ein Konto? Anmelden" })).toHaveAttribute("href", "/login");
  });
});

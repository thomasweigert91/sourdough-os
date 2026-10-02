import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  signInErrorMessage,
  signUpErrorMessage,
  validateLogin,
  validateRegister,
} from "@/lib/auth-form";

const NAME_REQUIRED = "Bitte gib deinen Namen ein.";
const EMAIL_INVALID = "Bitte gib eine gültige E-Mail-Adresse ein.";
const PASSWORD_TOO_SHORT = "Das Passwort muss mindestens 8 Zeichen lang sein.";
const PASSWORD_TOO_LONG = "Das Passwort darf höchstens 128 Zeichen lang sein.";
const PASSWORD_REQUIRED = "Bitte gib dein Passwort ein.";
const EMAIL_TAKEN = "Diese E-Mail-Adresse ist bereits registriert.";
const INVALID_CREDENTIALS = "E-Mail oder Passwort ist falsch.";
const GENERIC = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

const validRegister = { name: "Max Mustermann", email: "max@example.com", password: "geheim123" };

describe("F004 Validierung und Fehlerabbildung (src/lib/auth-form.ts)", () => {
  it("F004/AC-2 isValidEmail erkennt ungültige und gültige Formate", () => {
    expect(isValidEmail("max@")).toBe(false);
    expect(isValidEmail("max@example")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("max example@x.de")).toBe(false);
    expect(isValidEmail("max@example.com")).toBe(true);
    expect(isValidEmail("  max@example.com  ")).toBe(true);
  });

  it("F004/AC-2 validateRegister liefert für gültige Werte keine Fehler (8 und 128 Zeichen sind gültig)", () => {
    expect(validateRegister(validRegister)).toEqual({});
    expect(validateRegister({ ...validRegister, password: "a".repeat(8) })).toEqual({});
    expect(validateRegister({ ...validRegister, password: "a".repeat(128) })).toEqual({});
  });

  it("F004/AC-2 validateRegister meldet leeren bzw. nur aus Leerzeichen bestehenden Namen", () => {
    expect(validateRegister({ ...validRegister, name: "" })).toEqual({ name: NAME_REQUIRED });
    expect(validateRegister({ ...validRegister, name: "   " })).toEqual({ name: NAME_REQUIRED });
  });

  it("F004/AC-2 validateRegister meldet ungültige und leere E-Mail-Adressen", () => {
    expect(validateRegister({ ...validRegister, email: "max@" })).toEqual({ email: EMAIL_INVALID });
    expect(validateRegister({ ...validRegister, email: "max@example" })).toEqual({ email: EMAIL_INVALID });
    expect(validateRegister({ ...validRegister, email: "" })).toEqual({ email: EMAIL_INVALID });
  });

  it("F004/AC-2 validateRegister meldet zu kurze (0/7) und zu lange (129) Passwörter", () => {
    expect(validateRegister({ ...validRegister, password: "" })).toEqual({ password: PASSWORD_TOO_SHORT });
    expect(validateRegister({ ...validRegister, password: "a".repeat(7) })).toEqual({ password: PASSWORD_TOO_SHORT });
    expect(validateRegister({ ...validRegister, password: "a".repeat(129) })).toEqual({ password: PASSWORD_TOO_LONG });
  });

  it("F004/AC-2 validateRegister meldet alle fehlerhaften Felder gleichzeitig", () => {
    expect(validateRegister({ name: "", email: "max@", password: "kurz" })).toEqual({
      name: NAME_REQUIRED,
      email: EMAIL_INVALID,
      password: PASSWORD_TOO_SHORT,
    });
  });

  it("F004/AC-3 signUpErrorMessage bildet bereits vergebene E-Mail auf die deutsche Meldung ab", () => {
    expect(signUpErrorMessage({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", status: 422 })).toBe(EMAIL_TAKEN);
    expect(signUpErrorMessage({ code: "USER_ALREADY_EXISTS", status: 422 })).toBe(EMAIL_TAKEN);
    expect(signUpErrorMessage({ code: "SOMETHING_ELSE", status: 400 })).toBe(GENERIC);
  });

  it("F004/AC-5 validateLogin meldet leere/ungültige E-Mail und leeres Passwort, prüft keine Länge", () => {
    expect(validateLogin({ email: "", password: "x" })).toEqual({ email: EMAIL_INVALID });
    expect(validateLogin({ email: "max@", password: "x" })).toEqual({ email: EMAIL_INVALID });
    expect(validateLogin({ email: "max@example.com", password: "" })).toEqual({ password: PASSWORD_REQUIRED });
    expect(validateLogin({ email: "", password: "" })).toEqual({ email: EMAIL_INVALID, password: PASSWORD_REQUIRED });
    expect(validateLogin({ email: "max@example.com", password: "kurz" })).toEqual({});
  });

  it("F004/AC-5 signInErrorMessage bildet falsche Zugangsdaten auf die deutsche Meldung ab", () => {
    expect(signInErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe(INVALID_CREDENTIALS);
    expect(signInErrorMessage({ status: 401 })).toBe(INVALID_CREDENTIALS);
    expect(signInErrorMessage({ code: "SOMETHING_ELSE", status: 400 })).toBe(GENERIC);
  });

  it("F004/AC-6 Serverfehler (500) ergeben bei Registrierung und Anmeldung die Generik-Meldung", () => {
    expect(signUpErrorMessage({ status: 500 })).toBe(GENERIC);
    expect(signInErrorMessage({ status: 500 })).toBe(GENERIC);
  });
});

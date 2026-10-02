export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const NAME_REQUIRED_MESSAGE = "Bitte gib deinen Namen ein.";
export const EMAIL_INVALID_MESSAGE = "Bitte gib eine gültige E-Mail-Adresse ein.";
export const PASSWORD_TOO_SHORT_MESSAGE = "Das Passwort muss mindestens 8 Zeichen lang sein.";
export const PASSWORD_TOO_LONG_MESSAGE = "Das Passwort darf höchstens 128 Zeichen lang sein.";
export const PASSWORD_REQUIRED_MESSAGE = "Bitte gib dein Passwort ein.";
export const EMAIL_TAKEN_MESSAGE = "Diese E-Mail-Adresse ist bereits registriert.";
export const INVALID_CREDENTIALS_MESSAGE = "E-Mail oder Passwort ist falsch.";
export const GENERIC_ERROR_MESSAGE = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
export const SUBMITTING_LABEL = "Bitte warten …";
export const SESSION_LOADING_MESSAGE = "Lade Sitzung …";

export interface RegisterValues {
  name: string;
  email: string;
  password: string;
}

export interface LoginValues {
  email: string;
  password: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export interface AuthClientError {
  code?: string;
  status?: number;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function validateRegister(values: RegisterValues): FieldErrors<RegisterValues> {
  const errors: FieldErrors<RegisterValues> = {};
  if (values.name.trim() === "") {
    errors.name = NAME_REQUIRED_MESSAGE;
  }
  if (!isValidEmail(values.email)) {
    errors.email = EMAIL_INVALID_MESSAGE;
  }
  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = PASSWORD_TOO_SHORT_MESSAGE;
  } else if (values.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = PASSWORD_TOO_LONG_MESSAGE;
  }
  return errors;
}

export function validateLogin(values: LoginValues): FieldErrors<LoginValues> {
  const errors: FieldErrors<LoginValues> = {};
  if (!isValidEmail(values.email)) {
    errors.email = EMAIL_INVALID_MESSAGE;
  }
  if (values.password === "") {
    errors.password = PASSWORD_REQUIRED_MESSAGE;
  }
  return errors;
}

const EMAIL_TAKEN_CODES = new Set(["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "USER_ALREADY_EXISTS"]);

export function signUpErrorMessage(error: AuthClientError): string {
  if (error.code !== undefined && EMAIL_TAKEN_CODES.has(error.code)) {
    return EMAIL_TAKEN_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

export function signInErrorMessage(error: AuthClientError): string {
  if (error.code === "INVALID_EMAIL_OR_PASSWORD" || error.status === 401) {
    return INVALID_CREDENTIALS_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

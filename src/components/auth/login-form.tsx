"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth-client";
import {
  GENERIC_ERROR_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  SUBMITTING_LABEL,
  signInErrorMessage,
  validateLogin,
  type FieldErrors,
  type LoginValues,
} from "@/lib/auth-form";
import { TextField } from "./text-field";

const INITIAL_VALUES: LoginValues = { email: "", password: "" };

export function LoginForm() {
  const router = useRouter();
  const [values, setValues] = useState<LoginValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function updateField(field: keyof LoginValues) {
    return (value: string) => setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    const errors = validateLogin(values);
    setFieldErrors(errors);

    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await signIn.email({
        email: values.email.trim(),
        password: values.password,
      });
      if (error) {
        const message = signInErrorMessage(error);
        setFormError(message);
        setIsSubmitting(false);
        if (message === INVALID_CREDENTIALS_MESSAGE) {
          setValues((current) => ({ ...current, password: "" }));
          passwordRef.current?.focus();
        }
        return;
      }
      // isSubmitting bleibt true bis zur Navigation, damit kein zweites Absenden möglich ist.
      router.replace("/dashboard");
    } catch {
      setFormError(GENERIC_ERROR_MESSAGE);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          ref={emailRef}
          id="login-email"
          name="email"
          label="E-Mail"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={updateField("email")}
          error={fieldErrors.email}
        />
        <TextField
          ref={passwordRef}
          id="login-password"
          name="password"
          label="Passwort"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={updateField("password")}
          error={fieldErrors.password}
        />
        {formError ? (
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-11 rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {isSubmitting ? SUBMITTING_LABEL : "Anmelden"}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/register" className="underline underline-offset-4">
          Noch kein Konto? Registrieren
        </Link>
      </p>
    </div>
  );
}

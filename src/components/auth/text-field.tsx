import type { Ref } from "react";

export interface TextFieldProps {
  id: string;
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  id,
  name,
  label,
  type,
  autoComplete,
  value,
  onChange,
  error,
  ref,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={`w-full rounded-md border bg-white px-3 py-2 text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-900 dark:text-zinc-50 ${
          hasError
            ? "border-red-700 dark:border-red-400"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      />
      {hasError ? (
        <p id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

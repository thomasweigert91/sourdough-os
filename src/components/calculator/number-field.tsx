"use client";

import { useState, type Ref } from "react";
import { formatDecimal, isIncompleteDecimal, parseDecimal } from "@/lib/calculator/format";

export const INPUT_CLASS_NAME =
  "w-full min-w-0 rounded-md border bg-white px-3 py-2 text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-900 dark:text-zinc-50";
export const INPUT_BORDER_CLASS_NAME = "border-zinc-300 dark:border-zinc-700";
export const INPUT_ERROR_BORDER_CLASS_NAME = "border-red-700 dark:border-red-400";
export const LABEL_CLASS_NAME = "text-sm font-medium text-zinc-950 dark:text-zinc-50";

export interface NumberFieldProps {
  /** <label id={`${id}-label`} htmlFor={id}> */
  id: string;
  /** sichtbar */
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  fractionDigits: number;
  /** Wert für leeres Feld (Zutaten und Basis: 0). Ohne Angabe NaN. */
  emptyValue?: number;
  /** Einheit sichtbar neben dem Feld, z. B. "g", "%", "°C" (aria-hidden; zugänglich über Label oder describeUnit). */
  unit?: string;
  /**
   * Einheit zusätzlich als Beschreibung des Felds (aria-describedby), wenn sie weder im Label noch im
   * Wert steht, z. B. bei den Temperaturfeldern.
   */
  describeUnit?: boolean;
  invalid?: boolean;
  /** IDs für aria-describedby (Feldmeldung, Mehlanteil-Meldung). */
  describedBy?: string[];
  ref?: Ref<HTMLInputElement>;
}

interface Draft {
  text: string;
  value: number;
}

function sameNumber(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

/**
 * Zahlenfeld mit Komma- und Punkteingabe. Während des Fokus bleibt der eingetippte Rohtext stehen
 * (z. B. „2,“), solange er zum Wert im Zustand passt; sonst und nach dem Verlassen wird der Wert
 * formatiert angezeigt.
 */
export function NumberField({
  id,
  label,
  value,
  onValueChange,
  fractionDigits,
  emptyValue,
  unit,
  describeUnit = false,
  invalid = false,
  describedBy,
  ref,
}: NumberFieldProps) {
  // Rohtext während des Fokus und der Wert, zu dem er gehört.
  const [draft, setDraft] = useState<Draft | null>(null);

  function toValue(text: string): number {
    return parseDecimal(text) ?? emptyValue ?? Number.NaN;
  }

  // Ändert sich der Wert von außen (z. B. über den Slider), gilt der neue Wert statt des Entwurfs.
  const draftIsCurrent = draft !== null && sameNumber(draft.value, value);
  const display = draftIsCurrent ? draft.text : formatDecimal(value, fractionDigits);
  const unitId = `${id}-unit`;
  const describedByList = [...(unit && describeUnit ? [unitId] : []), ...(describedBy ?? [])];
  const describedByIds = describedByList.length > 0 ? describedByList.join(" ") : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label id={`${id}-label`} htmlFor={id} className={LABEL_CLASS_NAME}>
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={display}
          onChange={(event) => {
            const text = event.target.value;
            if (isIncompleteDecimal(text)) {
              // „-“ oder „,“ vor der ersten Ziffer: noch kein Wert, also auch keine Meldung.
              setDraft({ text, value });
              return;
            }
            const next = toValue(text);
            setDraft({ text, value: next });
            onValueChange(next);
          }}
          onBlur={() => {
            // Bleibt die Eingabe unvollständig, zählt sie wie ein leeres Feld (Q7).
            if (draftIsCurrent && isIncompleteDecimal(draft.text)) onValueChange(emptyValue ?? Number.NaN);
            setDraft(null);
          }}
          aria-invalid={invalid}
          aria-describedby={describedByIds}
          className={`${INPUT_CLASS_NAME} ${invalid ? INPUT_ERROR_BORDER_CLASS_NAME : INPUT_BORDER_CLASS_NAME}`}
        />
        {unit ? (
          <span id={unitId} aria-hidden="true" className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export interface FieldMessageProps {
  id: string;
  message: string | null | undefined;
}

/** Immer gerenderter höflicher Live-Bereich, damit jede Meldung genau einmal angesagt wird. */
export function FieldMessage({ id, message }: FieldMessageProps) {
  return (
    <div aria-live="polite">
      {message ? (
        <p id={id} className="text-sm text-red-700 dark:text-red-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}

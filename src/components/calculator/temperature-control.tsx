"use client";

import { formatDecimal } from "@/lib/calculator/format";
import { FieldMessage, NumberField } from "./number-field";

export interface TemperatureControlProps {
  id: string;
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  error?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Slider und Eingabefeld mit gemeinsamem Label und Wert. Werte außerhalb des Bereichs nur im Feld. */
export function TemperatureControl({
  id,
  label,
  value,
  onValueChange,
  min,
  max,
  step,
  error,
}: TemperatureControlProps) {
  const errorId = `${id}-error`;
  const sliderValue = Number.isFinite(value) ? clamp(value, min, max) : min;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <NumberField
        id={id}
        label={label}
        value={value}
        onValueChange={onValueChange}
        fractionDigits={1}
        unit="°C"
        describeUnit
        invalid={Boolean(error)}
        describedBy={error ? [errorId] : undefined}
      />
      <input
        type="range"
        aria-labelledby={`${id}-label`}
        aria-valuetext={Number.isFinite(value) ? `${formatDecimal(value, 1)} °C` : undefined}
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className="w-full min-w-0 accent-zinc-900 dark:accent-zinc-100"
      />
      <FieldMessage id={errorId} message={error} />
    </div>
  );
}

"use client";

import type { KneadingMethod } from "@/lib/baking-engine/ddt";
import {
  AMBIENT_SLIDER_RANGE,
  DDT_SLIDER_RANGE,
  KNEADING_METHOD_OPTIONS,
  type DdtEvaluation,
  type DdtField,
  type DdtState,
} from "@/lib/calculator/ddt-state";
import { formatDecimal } from "@/lib/calculator/format";
import {
  CUSTOM_FRICTION_LABEL,
  DDT_LABEL,
  DDT_SECTION_TITLE,
  FLOUR_TEMPERATURE_LABEL,
  KNEADING_METHOD_LABEL,
  NO_VALUE,
  ROOM_TEMPERATURE_LABEL,
  STARTER_TEMPERATURE_LABEL,
  WARNING_LABELS,
  WATER_TEMPERATURE_LABEL,
} from "@/lib/calculator/messages";
import {
  FieldMessage,
  INPUT_BORDER_CLASS_NAME,
  INPUT_CLASS_NAME,
  LABEL_CLASS_NAME,
  NumberField,
} from "./number-field";
import { TemperatureControl } from "./temperature-control";

export interface DdtCalculatorProps {
  state: DdtState;
  evaluation: DdtEvaluation;
  onChange: (next: DdtState) => void;
}

type TemperatureField = Exclude<DdtField, "customFriction">;

const TEMPERATURE_CONTROLS: ReadonlyArray<{
  field: TemperatureField;
  id: string;
  label: string;
  range: { min: number; max: number; step: number };
}> = [
  { field: "desiredDoughTemperature", id: "ddt", label: DDT_LABEL, range: DDT_SLIDER_RANGE },
  { field: "roomTemperature", id: "room-temperature", label: ROOM_TEMPERATURE_LABEL, range: AMBIENT_SLIDER_RANGE },
  { field: "flourTemperature", id: "flour-temperature", label: FLOUR_TEMPERATURE_LABEL, range: AMBIENT_SLIDER_RANGE },
  {
    field: "starterTemperature",
    id: "starter-temperature",
    label: STARTER_TEMPERATURE_LABEL,
    range: AMBIENT_SLIDER_RANGE,
  },
];

const WARNING_CLASS_NAMES = {
  cold_warning: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  heat_warning: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
} as const;

const WARNING_KINDS = { cold_warning: "cold", heat_warning: "heat" } as const;

function findKneadingMethod(value: string): KneadingMethod | undefined {
  return KNEADING_METHOD_OPTIONS.find((option) => option.value === value)?.value;
}

export function DdtCalculator({ state, evaluation, onChange }: DdtCalculatorProps) {
  const { result, errors } = evaluation;
  const water = result ? `${formatDecimal(result.waterTemperature, 1)} °C` : NO_VALUE;
  const warningStatus = result && result.status !== "ok" ? result.status : null;
  const frictionErrorId = "custom-friction-error";

  return (
    <section aria-labelledby="ddt-heading" className="flex min-w-0 flex-col gap-4">
      <h2 id="ddt-heading" className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        {DDT_SECTION_TITLE}
      </h2>

      {TEMPERATURE_CONTROLS.map((control) => (
        <TemperatureControl
          key={control.id}
          id={control.id}
          label={control.label}
          value={state[control.field]}
          onValueChange={(value) => onChange({ ...state, [control.field]: value })}
          min={control.range.min}
          max={control.range.max}
          step={control.range.step}
          error={errors[control.field]}
        />
      ))}

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="kneading-method" className={LABEL_CLASS_NAME}>
          {KNEADING_METHOD_LABEL}
        </label>
        <select
          id="kneading-method"
          value={state.kneadingMethod}
          onChange={(event) => {
            const method = findKneadingMethod(event.target.value);
            if (method) onChange({ ...state, kneadingMethod: method });
          }}
          className={`${INPUT_CLASS_NAME} ${INPUT_BORDER_CLASS_NAME}`}
        >
          {KNEADING_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {state.kneadingMethod === "custom" ? (
        <div className="flex min-w-0 flex-col gap-1">
          <NumberField
            id="custom-friction"
            label={CUSTOM_FRICTION_LABEL}
            value={state.customFriction}
            onValueChange={(value) => onChange({ ...state, customFriction: value })}
            fractionDigits={1}
            unit="°C"
            invalid={Boolean(errors.customFriction)}
            describedBy={errors.customFriction ? [frictionErrorId] : undefined}
          />
          <FieldMessage id={frictionErrorId} message={errors.customFriction} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {/* Wert bewusst ohne Live-Bereich: kein Vorlesen bei jedem Zwischenschritt des Sliders. */}
        <dl className="flex flex-col gap-1">
          <dt id="water-temperature-label" className="text-sm text-zinc-600 dark:text-zinc-400">
            {WATER_TEMPERATURE_LABEL}
          </dt>
          <dd
            aria-labelledby="water-temperature-label"
            className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50"
          >
            {water}
          </dd>
        </dl>
        {/* Immer gerendert, damit jede Warnung genau einmal höflich angesagt wird. */}
        <div role="status" aria-live="polite">
          {warningStatus && result?.message ? (
            <p
              data-warning={WARNING_KINDS[warningStatus]}
              className={`rounded-md px-3 py-2 text-sm font-medium ${WARNING_CLASS_NAMES[warningStatus]}`}
            >
              <span className="font-semibold">{WARNING_LABELS[warningStatus]}:</span>{" "}
              <span>{result.message}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

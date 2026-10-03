"use client";

import { useRef } from "react";
import { flushSync } from "react-dom";
import { formatDecimal } from "@/lib/calculator/format";
import {
  ADD_FLOUR_LABEL,
  ADD_INGREDIENT_LABEL,
  ADJUST_WATER_ON_FLOUR_SWAP_LABEL,
  BASIS_DOUGH_LABEL,
  BASIS_FLOUR_LABEL,
  BASIS_LEGEND,
  DOUGH_WEIGHT_LABEL,
  DOUGH_YIELD_LABEL,
  FLOUR_BASIS_LABEL,
  HYDRATION_SECTION_TITLE,
  INGREDIENT_LIST_LABEL,
  NET_HYDRATION_LABEL,
  NO_VALUE,
} from "@/lib/calculator/messages";
import {
  addAdditiveRow,
  addFlourRow,
  canRemoveRow,
  removeRow,
  setAdjustWaterOnFlourSwap,
  setBasisMode,
  setBasisValue,
  setRowFlourType,
  setRowGrams,
  setRowName,
  setRowPercent,
  setRowType,
  setStarterHydration,
  type BasisMode,
  type RecipeEvaluation,
  type RecipeState,
} from "@/lib/calculator/recipe-state";
import { IngredientRow } from "./ingredient-row";
import { FieldMessage, LABEL_CLASS_NAME, NumberField } from "./number-field";

export interface HydrationCalculatorProps {
  state: RecipeState;
  evaluation: RecipeEvaluation;
  onChange: (next: RecipeState) => void;
}

const FLOUR_SUM_ERROR_ID = "flour-sum-error";
const BASIS_ERROR_ID = "basis-error";

export const SECONDARY_BUTTON_CLASS_NAME =
  "h-11 rounded-full border border-zinc-300 px-5 font-medium text-zinc-950 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800";

const BASIS_OPTIONS: ReadonlyArray<{ value: BasisMode; label: string }> = [
  { value: "flour", label: BASIS_FLOUR_LABEL },
  { value: "dough", label: BASIS_DOUGH_LABEL },
];

function Metric({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt id={id} className="text-sm text-zinc-600 dark:text-zinc-400">
        {label}
      </dt>
      <dd aria-labelledby={id} className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </dd>
    </div>
  );
}

export function HydrationCalculator({ state, evaluation, onChange }: HydrationCalculatorProps) {
  // Auswahl „Mehltyp“ je Mehlzeile, damit „Mehl hinzufügen“ den Fokus auf die neue Zeile setzen kann.
  const flourTypeRefs = useRef(new Map<string, HTMLSelectElement>());

  function handleAddFlour() {
    const { state: next, rowId } = addFlourRow(state);
    flushSync(() => onChange(next));
    flourTypeRefs.current.get(rowId)?.focus();
  }

  const isFlourBasis = state.basis === "flour";
  const basisId = isFlourBasis ? "flour-basis" : "dough-weight";
  const hydration = evaluation.netHydration === null ? NO_VALUE : `${formatDecimal(evaluation.netHydration, 1)} %`;
  const doughYield = evaluation.doughYield === null ? NO_VALUE : formatDecimal(evaluation.doughYield, 1);

  return (
    <section aria-labelledby="hydration-heading" className="flex min-w-0 flex-col gap-4">
      <h2 id="hydration-heading" className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        {HYDRATION_SECTION_TITLE}
      </h2>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${LABEL_CLASS_NAME} mb-2`}>{BASIS_LEGEND}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {BASIS_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50">
              <input
                type="radio"
                name="calculator-basis"
                value={option.value}
                checked={state.basis === option.value}
                onChange={() => onChange(setBasisMode(state, option.value))}
                className="size-4 accent-zinc-900 dark:accent-zinc-100"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <NumberField
          // Eigene Instanz je Modus, damit kein Entwurfstext ins andere Basisfeld übernommen wird.
          key={basisId}
          id={basisId}
          label={isFlourBasis ? FLOUR_BASIS_LABEL : DOUGH_WEIGHT_LABEL}
          value={isFlourBasis ? state.flourBasis : state.doughWeight}
          onValueChange={(value) => onChange(setBasisValue(state, value))}
          fractionDigits={0}
          emptyValue={0}
          unit="g"
          invalid={evaluation.basisError !== null}
          describedBy={evaluation.basisError ? [BASIS_ERROR_ID] : undefined}
        />
        <FieldMessage id={BASIS_ERROR_ID} message={evaluation.basisError} />
      </div>

      <label className="flex items-start gap-2 text-zinc-950 dark:text-zinc-50">
        <input
          type="checkbox"
          role="switch"
          id="adjust-water-on-flour-swap"
          checked={state.adjustWaterOnFlourSwap}
          onChange={(event) => onChange(setAdjustWaterOnFlourSwap(state, event.target.checked))}
          className="mt-1 size-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
        />
        {ADJUST_WATER_ON_FLOUR_SWAP_LABEL}
      </label>

      <ul aria-label={INGREDIENT_LIST_LABEL} className="flex flex-col gap-3">
        {state.rows.map((row) => (
          <li key={row.id}>
            <IngredientRow
              row={row}
              error={evaluation.rowErrors[row.id]}
              flourSumErrorId={row.type === "flour" && evaluation.flourSumError ? FLOUR_SUM_ERROR_ID : undefined}
              canRemove={canRemoveRow(state, row.id)}
              onGramsChange={(grams) => onChange(setRowGrams(state, row.id, grams))}
              onPercentChange={(percent) => onChange(setRowPercent(state, row.id, percent))}
              onStarterHydrationChange={(value) => onChange(setStarterHydration(state, row.id, value))}
              onNameChange={(name) => onChange(setRowName(state, row.id, name))}
              onTypeChange={(type) => onChange(setRowType(state, row.id, type))}
              onFlourTypeChange={(flourType) => onChange(setRowFlourType(state, row.id, flourType))}
              onRemove={() => onChange(removeRow(state, row.id))}
              flourTypeSelectRef={(element) => {
                if (element) flourTypeRefs.current.set(row.id, element);
                else flourTypeRefs.current.delete(row.id);
              }}
            />
          </li>
        ))}
      </ul>
      <FieldMessage id={FLOUR_SUM_ERROR_ID} message={evaluation.flourSumError} />

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={handleAddFlour} className={SECONDARY_BUTTON_CLASS_NAME}>
          {ADD_FLOUR_LABEL}
        </button>
        <button
          type="button"
          onClick={() => onChange(addAdditiveRow(state).state)}
          className={SECONDARY_BUTTON_CLASS_NAME}
        >
          {ADD_INGREDIENT_LABEL}
        </button>
      </div>

      {/* Kennzahlen bewusst ohne Live-Bereich: kein Vorlesen bei jedem Zwischenschritt. */}
      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <Metric id="net-hydration-label" label={NET_HYDRATION_LABEL} value={hydration} />
        <Metric id="dough-yield-label" label={DOUGH_YIELD_LABEL} value={doughYield} />
      </dl>
    </section>
  );
}

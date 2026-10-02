"use client";

import type { Ref } from "react";
import {
  ADDITIVE_TYPE_LABELS,
  GRAMS_LABEL,
  NAME_LABEL,
  PERCENT_LABEL,
  REMOVE_LABEL,
  STARTER_HYDRATION_LABEL,
  TYPE_LABEL,
  removeIngredientLabel,
} from "@/lib/calculator/messages";
import { ingredientDisplayName, type AdditiveType, type RecipeRow } from "@/lib/calculator/recipe-state";
import {
  FieldMessage,
  INPUT_BORDER_CLASS_NAME,
  INPUT_CLASS_NAME,
  LABEL_CLASS_NAME,
  NumberField,
} from "./number-field";

export interface IngredientRowProps {
  row: RecipeRow;
  error?: string;
  /** zusätzliche describedBy-ID für Prozentfelder von Mehlen (Mehlanteil-Meldung) */
  flourSumErrorId?: string;
  canRemove: boolean;
  onGramsChange: (grams: number) => void;
  onPercentChange: (percent: number) => void;
  onStarterHydrationChange: (value: number) => void;
  onNameChange: (name: string) => void;
  onTypeChange: (type: AdditiveType) => void;
  onRemove: () => void;
  nameInputRef?: Ref<HTMLInputElement>;
}

const ADDITIVE_TYPES = ["salt", "other"] as const satisfies readonly AdditiveType[];
/** Obergrenze der Server Action saveRecipe für Namen. */
const INGREDIENT_NAME_MAX_LENGTH = 200;

function isAdditiveType(value: string): value is AdditiveType {
  return (ADDITIVE_TYPES as readonly string[]).includes(value);
}

function isInvalidNumber(value: number): boolean {
  return !Number.isFinite(value) || value < 0;
}

type RowField = "grams" | "percent" | "starterHydration";

/** Feld, zu dem die Zeilenmeldung gehört (gleiche Reihenfolge wie evaluateRecipe). */
function errorField(row: RecipeRow): RowField | null {
  if (isInvalidNumber(row.grams)) return "grams";
  if (isInvalidNumber(row.percent)) return "percent";
  if (row.type === "starter" && isInvalidNumber(row.starterHydration)) return "starterHydration";
  return null;
}

export function IngredientRow({
  row,
  error,
  flourSumErrorId,
  canRemove,
  onGramsChange,
  onPercentChange,
  onStarterHydrationChange,
  onNameChange,
  onTypeChange,
  onRemove,
  nameInputRef,
}: IngredientRowProps) {
  const displayName = ingredientDisplayName(row);
  const errorId = `${row.id}-error`;
  const invalidField = error ? errorField(row) : null;
  const hasName = row.type === "flour" || row.type === "salt" || row.type === "other";
  const isAdditive = row.type === "salt" || row.type === "other";

  function describedBy(field: RowField, extra?: string): string[] {
    const ids: string[] = [];
    if (invalidField === field) ids.push(errorId);
    if (extra) ids.push(extra);
    return ids;
  }

  return (
    <div
      role="group"
      aria-label={displayName}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-wrap items-end gap-3">
        {hasName ? (
          <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
            <label htmlFor={`${row.id}-name`} className={LABEL_CLASS_NAME}>
              {NAME_LABEL}
            </label>
            <input
              ref={nameInputRef}
              id={`${row.id}-name`}
              type="text"
              autoComplete="off"
              maxLength={INGREDIENT_NAME_MAX_LENGTH}
              value={row.name}
              onChange={(event) => onNameChange(event.target.value)}
              className={`${INPUT_CLASS_NAME} ${INPUT_BORDER_CLASS_NAME}`}
            />
          </div>
        ) : (
          <p className="min-w-0 flex-1 basis-40 font-medium text-zinc-950 dark:text-zinc-50">
            {displayName}
          </p>
        )}
        {isAdditive ? (
          <div className="flex min-w-0 basis-32 flex-col gap-1">
            <label htmlFor={`${row.id}-type`} className={LABEL_CLASS_NAME}>
              {TYPE_LABEL}
            </label>
            <select
              id={`${row.id}-type`}
              value={row.type}
              onChange={(event) => {
                if (isAdditiveType(event.target.value)) onTypeChange(event.target.value);
              }}
              className={`${INPUT_CLASS_NAME} ${INPUT_BORDER_CLASS_NAME}`}
            >
              {ADDITIVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ADDITIVE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {hasName ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label={removeIngredientLabel(displayName)}
            className="h-11 shrink-0 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 disabled:opacity-60 disabled:hover:bg-transparent dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            {REMOVE_LABEL}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <NumberField
          id={`${row.id}-grams`}
          label={GRAMS_LABEL}
          value={row.grams}
          onValueChange={onGramsChange}
          fractionDigits={0}
          emptyValue={0}
          unit="g"
          invalid={invalidField === "grams"}
          describedBy={describedBy("grams")}
        />
        <NumberField
          id={`${row.id}-percent`}
          label={PERCENT_LABEL}
          value={row.percent}
          onValueChange={onPercentChange}
          fractionDigits={1}
          emptyValue={0}
          unit="%"
          invalid={invalidField === "percent" || Boolean(flourSumErrorId)}
          describedBy={describedBy("percent", flourSumErrorId)}
        />
        {row.type === "starter" ? (
          <NumberField
            id={`${row.id}-starter-hydration`}
            label={STARTER_HYDRATION_LABEL}
            value={row.starterHydration}
            onValueChange={onStarterHydrationChange}
            fractionDigits={1}
            unit="%"
            invalid={invalidField === "starterHydration"}
            describedBy={describedBy("starterHydration")}
          />
        ) : null}
      </div>
      <FieldMessage id={errorId} message={error} />
    </div>
  );
}

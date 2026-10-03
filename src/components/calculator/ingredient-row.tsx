"use client";

import type { Ref } from "react";
import {
  FLOUR_TYPES,
  OTHER_FLOUR_TYPE_ID,
  isFlourTypeId,
  type FlourGroup,
  type FlourType,
  type FlourTypeId,
} from "@/lib/baking-engine/flour-types";
import {
  ADDITIVE_TYPE_LABELS,
  FLOUR_GROUP_LABELS,
  FLOUR_TYPE_LABEL,
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
  onFlourTypeChange: (flourType: FlourTypeId) => void;
  onRemove: () => void;
  /** Auswahl „Mehltyp“ (nur Mehlzeilen), damit „Mehl hinzufügen“ den Fokus setzen kann. */
  flourTypeSelectRef?: Ref<HTMLSelectElement>;
}

const ADDITIVE_TYPES = ["salt", "other"] as const satisfies readonly AdditiveType[];
/** Reihenfolge der Gruppen in der Auswahl „Mehltyp“; „other“ folgt danach ohne Gruppe. */
const FLOUR_GROUP_ORDER = ["wheat", "spelt", "rye", "special"] as const satisfies readonly Exclude<
  FlourGroup,
  "other"
>[];
const FLOUR_TYPE_GROUPS = FLOUR_GROUP_ORDER.map((group) => ({
  group,
  label: FLOUR_GROUP_LABELS[group],
  flours: FLOUR_TYPES.filter((flour) => flour.group === group),
}));
const UNGROUPED_FLOUR_TYPES = FLOUR_TYPES.filter((flour) => flour.group === "other");

function FlourTypeOption({ flour }: { flour: FlourType }) {
  return <option value={flour.id}>{flour.name}</option>;
}
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
  onFlourTypeChange,
  onRemove,
  flourTypeSelectRef,
}: IngredientRowProps) {
  const displayName = ingredientDisplayName(row);
  const errorId = `${row.id}-error`;
  const invalidField = error ? errorField(row) : null;
  const isFlour = row.type === "flour";
  const isAdditive = row.type === "salt" || row.type === "other";
  const canBeRemoved = isFlour || isAdditive;
  // Freier Name: Salz/Sonstiges wie F010, bei Mehlen nur „Sonstiges Mehl“ (AC-10).
  const hasName = isAdditive || (isFlour && (row.flourType === OTHER_FLOUR_TYPE_ID || row.flourType === null));

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
        {isFlour ? (
          <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
            <label htmlFor={`${row.id}-flour-type`} className={LABEL_CLASS_NAME}>
              {FLOUR_TYPE_LABEL}
            </label>
            <select
              ref={flourTypeSelectRef}
              id={`${row.id}-flour-type`}
              value={row.flourType ?? OTHER_FLOUR_TYPE_ID}
              onChange={(event) => {
                if (isFlourTypeId(event.target.value)) onFlourTypeChange(event.target.value);
              }}
              className={`${INPUT_CLASS_NAME} ${INPUT_BORDER_CLASS_NAME}`}
            >
              {FLOUR_TYPE_GROUPS.map(({ group, label, flours }) => (
                <optgroup key={group} label={label}>
                  {flours.map((flour) => (
                    <FlourTypeOption key={flour.id} flour={flour} />
                  ))}
                </optgroup>
              ))}
              {UNGROUPED_FLOUR_TYPES.map((flour) => (
                <FlourTypeOption key={flour.id} flour={flour} />
              ))}
            </select>
          </div>
        ) : null}
        {hasName ? (
          <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
            <label htmlFor={`${row.id}-name`} className={LABEL_CLASS_NAME}>
              {NAME_LABEL}
            </label>
            <input
              id={`${row.id}-name`}
              type="text"
              autoComplete="off"
              maxLength={INGREDIENT_NAME_MAX_LENGTH}
              value={row.name}
              onChange={(event) => onNameChange(event.target.value)}
              className={`${INPUT_CLASS_NAME} ${INPUT_BORDER_CLASS_NAME}`}
            />
          </div>
        ) : isFlour ? null : (
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
        {canBeRemoved ? (
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

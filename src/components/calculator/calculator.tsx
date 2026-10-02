"use client";

import { useState } from "react";
import { DEFAULT_DDT_STATE, evaluateDdt } from "@/lib/calculator/ddt-state";
import { loadCalculatorDraft, type CalculatorDraft, type CalculatorOwner } from "@/lib/calculator/local-draft";
import { createReferenceRecipe, evaluateRecipe } from "@/lib/calculator/recipe-state";
import { DdtCalculator } from "./ddt-calculator";
import { HydrationCalculator } from "./hydration-calculator";
import { SavePanel } from "./save-panel";

export interface CalculatorProps {
  owner: CalculatorOwner;
}

export function createDefaultDraft(): CalculatorDraft {
  return { recipe: createReferenceRecipe(), ddt: { ...DEFAULT_DDT_STATE } };
}

/** Hält den gesamten Rechner-Zustand; Auswertungen sind rein und werden bei jedem Render berechnet. */
export function Calculator({ owner }: CalculatorProps) {
  // Nur im Client gerendert (CalculatorScreen wartet auf die Besitzer-Ermittlung), localStorage ist da.
  const [draft, setDraft] = useState<CalculatorDraft>(() => loadCalculatorDraft(owner) ?? createDefaultDraft());
  const recipeEvaluation = evaluateRecipe(draft.recipe);
  const ddtEvaluation = evaluateDdt(draft.ddt);

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <div className="grid min-w-0 gap-8 md:grid-cols-2">
        <HydrationCalculator
          state={draft.recipe}
          evaluation={recipeEvaluation}
          onChange={(recipe) => setDraft((current) => ({ ...current, recipe }))}
        />
        <DdtCalculator
          state={draft.ddt}
          evaluation={ddtEvaluation}
          onChange={(ddt) => setDraft((current) => ({ ...current, ddt }))}
        />
      </div>
      <SavePanel
        owner={owner}
        draft={draft}
        recipeEvaluation={recipeEvaluation}
        ddtEvaluation={ddtEvaluation}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { saveRecipe } from "@/app/calculator/actions";
import { TextField } from "@/components/auth/text-field";
import { GENERIC_ERROR_MESSAGE } from "@/lib/auth-form";
import type { DdtEvaluation } from "@/lib/calculator/ddt-state";
import { saveCalculatorDraft, type CalculatorDraft, type CalculatorOwner } from "@/lib/calculator/local-draft";
import {
  RECIPE_NAME_LABEL,
  RECIPE_NAME_REQUIRED_MESSAGE,
  SAVE_FAILED_MESSAGE,
  SAVE_LOCAL_LABEL,
  SAVE_RECIPE_LABEL,
  SAVE_SECTION_TITLE,
  SAVED_LOCAL_MESSAGE,
  SAVING_LABEL,
  SIGN_IN_HINT,
  SIGN_IN_LINK_LABEL,
  recipeSavedMessage,
} from "@/lib/calculator/messages";
import type { RecipeEvaluation } from "@/lib/calculator/recipe-state";
import {
  SAVE_TIMEOUT_MS,
  buildSaveRecipeInput,
  resolveSaveRecipeId,
  withTimeout,
  type SaveAttempt,
} from "@/lib/calculator/save-recipe";
import { useOnlineStatus } from "@/lib/query/online";

export interface SavePanelProps {
  owner: CalculatorOwner;
  draft: CalculatorDraft;
  recipeEvaluation: RecipeEvaluation;
  ddtEvaluation: DdtEvaluation;
}

interface Feedback {
  kind: "success" | "error";
  text: string;
  /** Neu je Rückmeldung: gleicher Text wird als neuer Knoten erneut angesagt. */
  id: number;
  /** Stand, auf den sich eine Erfolgsmeldung bezieht; nach Änderungen ist sie veraltet. */
  draft: CalculatorDraft;
  /** Nur beim Speichern im Konto: der gespeicherte Name. */
  recipeName?: string;
}

const PRIMARY_BUTTON_CLASS_NAME =
  "h-11 rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]";

export function SavePanel({ owner, draft, recipeEvaluation, ddtEvaluation }: SavePanelProps) {
  const online = useOnlineStatus();
  const accountMode = owner.kind === "user" && online;

  const [recipeName, setRecipeName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Sperrt einen zweiten Aufruf, bevor der deaktivierte Button gerendert ist.
  const savingRef = useRef(false);
  // Letzter Versuch: gleiche Rezept-ID bei unverändertem Inhalt (Idempotenzschlüssel).
  const attemptRef = useRef<SaveAttempt | null>(null);
  const feedbackIdRef = useRef(0);

  function showFeedback(kind: Feedback["kind"], text: string, savedDraft: CalculatorDraft, savedName?: string) {
    feedbackIdRef.current += 1;
    setFeedback({ kind, text, id: feedbackIdRef.current, draft: savedDraft, recipeName: savedName });
  }

  // Erfolgsmeldungen gelten nur für den gespeicherten Stand (und Namen). Fehlermeldungen bleiben
  // stehen, weil der Stand dann weiterhin nicht gespeichert ist.
  const visibleFeedback =
    feedback &&
    (feedback.kind === "error" ||
      (feedback.draft === draft && (feedback.recipeName === undefined || feedback.recipeName === recipeName.trim())))
      ? feedback
      : null;

  async function handleSaveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    const name = recipeName.trim();
    if (name === "") {
      setNameError(RECIPE_NAME_REQUIRED_MESSAGE);
      setFeedback(null);
      nameInputRef.current?.focus();
      return;
    }
    if (!recipeEvaluation.isValid) return;

    setNameError(undefined);
    savingRef.current = true;
    setIsSaving(true);
    setFeedback(null);
    const savedDraft = draft;
    try {
      const payload = buildSaveRecipeInput(savedDraft.recipe, name);
      const attempt = resolveSaveRecipeId(attemptRef.current, payload, () => crypto.randomUUID());
      attemptRef.current = attempt;
      const result = await withTimeout(saveRecipe({ ...payload, recipeId: attempt.recipeId }), SAVE_TIMEOUT_MS);
      if (result.ok) {
        showFeedback("success", recipeSavedMessage(name), savedDraft, name);
      } else {
        showFeedback("error", SAVE_FAILED_MESSAGE, savedDraft);
      }
    } catch {
      // Netzwerkfehler, Timeout oder Fehler beim Aufbau des Payloads.
      showFeedback("error", SAVE_FAILED_MESSAGE, savedDraft);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function handleSaveLocal() {
    const saved = saveCalculatorDraft(owner, draft);
    if (saved) {
      showFeedback("success", SAVED_LOCAL_MESSAGE, draft);
    } else {
      showFeedback("error", GENERIC_ERROR_MESSAGE, draft);
    }
  }

  const canSaveLocal = recipeEvaluation.isValid && ddtEvaluation.result !== null;

  return (
    <section aria-labelledby="save-heading" className="flex min-w-0 flex-col gap-4">
      <h2 id="save-heading" className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        {SAVE_SECTION_TITLE}
      </h2>

      {accountMode ? (
        <form noValidate onSubmit={handleSaveRecipe} className="flex max-w-md flex-col gap-4">
          <TextField
            ref={nameInputRef}
            id="recipe-name"
            name="recipeName"
            label={RECIPE_NAME_LABEL}
            type="text"
            autoComplete="off"
            value={recipeName}
            onChange={(value) => {
              setRecipeName(value);
              if (nameError && value.trim() !== "") setNameError(undefined);
            }}
            error={nameError}
          />
          <button
            type="submit"
            disabled={!recipeEvaluation.isValid || isSaving}
            className={PRIMARY_BUTTON_CLASS_NAME}
          >
            {isSaving ? SAVING_LABEL : SAVE_RECIPE_LABEL}
          </button>
        </form>
      ) : (
        <div className="flex max-w-md flex-col gap-4">
          {owner.kind === "guest" ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {SIGN_IN_HINT}{" "}
              <Link href="/login" className="underline underline-offset-4">
                {SIGN_IN_LINK_LABEL}
              </Link>
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleSaveLocal}
            disabled={!canSaveLocal}
            className={PRIMARY_BUTTON_CLASS_NAME}
          >
            {SAVE_LOCAL_LABEL}
          </button>
        </div>
      )}

      {/* Immer gerendert, damit jede Rückmeldung genau einmal höflich angesagt wird. */}
      <div role="status" aria-live="polite" className="text-sm">
        {visibleFeedback ? (
          <p
            key={visibleFeedback.id}
            className={
              visibleFeedback.kind === "error"
                ? "font-medium text-red-700 dark:text-red-400"
                : "font-medium text-zinc-950 dark:text-zinc-50"
            }
          >
            {visibleFeedback.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}

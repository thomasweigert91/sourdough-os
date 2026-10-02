"use client";

import { SESSION_LOADING_MESSAGE } from "@/lib/auth-form";
import { ownerKey } from "@/lib/calculator/local-draft";
import { useCalculatorOwner } from "@/lib/calculator/use-calculator-owner";
import { Calculator } from "./calculator";

/** Client-Einstieg von /calculator: ohne Anmeldepflicht, der Rechner wird je Person neu gemountet. */
export function CalculatorScreen() {
  const owner = useCalculatorOwner();

  if (!owner) {
    return (
      <p role="status" className="text-center text-zinc-600 dark:text-zinc-400">
        {SESSION_LOADING_MESSAGE}
      </p>
    );
  }

  return <Calculator key={ownerKey(owner)} owner={owner} />;
}

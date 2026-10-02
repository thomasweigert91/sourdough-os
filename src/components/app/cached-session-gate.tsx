"use client";

import type { ReactNode } from "react";
import { SessionGate } from "@/components/auth/session-gate";
import { useCachedUserId } from "@/lib/query/hooks";

/** SessionGate für geschützte Seiten: Mit gespeichertem Nutzer erscheinen die Inhalte schon, während die Sitzung lädt. */
export function CachedSessionGate({ children }: { children: ReactNode }) {
  const cachedUserId = useCachedUserId();
  return (
    <SessionGate require="user" showChildrenWhilePending={cachedUserId !== null}>
      {children}
    </SessionGate>
  );
}

"use client";

import { QueryClientContext } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useState, type ReactNode } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { GENERIC_ERROR_MESSAGE } from "@/lib/auth-form";
import { CALCULATOR_LINK_LABEL } from "@/lib/calculator/messages";
import { OFFLINE_SIGN_OUT_MESSAGE } from "@/lib/offline-messages";
import { clearOfflineData } from "@/lib/query/clear-offline-data";
import { useOnlineStatus } from "@/lib/query/online";

export interface DashboardProps {
  /** Slot vor Fehlermeldung und Abmelden-Button. */
  children?: ReactNode;
}

export function Dashboard({ children }: DashboardProps) {
  const { data } = useSession();
  const router = useRouter();
  // Optional: Dashboard funktioniert auch ohne QueryProvider.
  const queryClient = useContext(QueryClientContext);
  const online = useOnlineStatus();
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (!online) {
      // Offline erreicht signOut den Server nicht (httpOnly-Cookie): Sitzung und Daten bleiben.
      setError(OFFLINE_SIGN_OUT_MESSAGE);
      return;
    }

    setError(null);
    setIsSigningOut(true);
    try {
      const { error: signOutError } = await signOut();
      if (signOutError) {
        setError(GENERIC_ERROR_MESSAGE);
        setIsSigningOut(false);
        return;
      }
      // Lokale Daten erst leeren, wenn die Sitzung wirklich beendet ist.
      clearOfflineData(queryClient);
      router.replace("/login");
    } catch {
      // Exception = Netzwerkfehler: wie offline behandeln, Daten bleiben erhalten.
      setError(OFFLINE_SIGN_OUT_MESSAGE);
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Dashboard
      </h1>
      {data ? (
        <>
          <p className="text-lg text-zinc-950 dark:text-zinc-50">{data.user.name}</p>
          <p className="break-all text-zinc-600 dark:text-zinc-400">{data.user.email}</p>
        </>
      ) : null}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/calculator" className="underline underline-offset-4">
          {CALCULATOR_LINK_LABEL}
        </Link>
      </p>
      {children}
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="h-11 rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        Abmelden
      </button>
    </div>
  );
}

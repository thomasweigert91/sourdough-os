"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { GENERIC_ERROR_MESSAGE } from "@/lib/auth-form";

export function Dashboard() {
  const { data } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!data) return null;
  const { user } = data;

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      const { error: signOutError } = await signOut();
      if (signOutError) {
        setError(GENERIC_ERROR_MESSAGE);
        setIsSigningOut(false);
        return;
      }
      router.replace("/login");
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Dashboard
      </h1>
      <p className="text-lg text-zinc-950 dark:text-zinc-50">{user.name}</p>
      <p className="break-all text-zinc-600 dark:text-zinc-400">{user.email}</p>
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

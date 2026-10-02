"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/auth-client";
import { SESSION_LOADING_MESSAGE } from "@/lib/auth-form";

export interface SessionGateProps {
  require: "user" | "guest";
  children: ReactNode;
}

export function SessionGate({ require, children }: SessionGateProps) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const isSignedIn = Boolean(data);

  let redirectTo: string | null = null;
  if (!isPending) {
    if (require === "user" && !isSignedIn) redirectTo = "/login";
    if (require === "guest" && isSignedIn) redirectTo = "/dashboard";
  }

  useEffect(() => {
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  if (isPending || redirectTo) {
    return (
      <p role="status" className="text-center text-zinc-600 dark:text-zinc-400">
        {SESSION_LOADING_MESSAGE}
      </p>
    );
  }

  return <>{children}</>;
}

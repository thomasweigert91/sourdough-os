// Aktuelle Person des Rechners (F010, AC-10): Gast, Konto-ID oder null, solange sie noch lädt.
import { useIsRestoring } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { useCachedUserId } from "@/lib/query/hooks";
import { useOnlineStatus } from "@/lib/query/online";
import type { CalculatorOwner } from "./local-draft";

export function useCalculatorOwner(): CalculatorOwner | null {
  const { data, isPending } = useSession();
  // Auf dem Server und beim ersten Client-Render true: kein Hydration-Unterschied.
  const isRestoring = useIsRestoring();
  const online = useOnlineStatus();
  const cachedUserId = useCachedUserId();

  if (isRestoring) return null;
  const sessionUserId = data?.user?.id;
  if (sessionUserId) return { kind: "user", userId: sessionUserId };
  if (isPending) return null;
  // Offline scheitert der Sitzungsabruf; die angemeldete Person bleibt über den F005-Cache erkennbar.
  if (!online && cachedUserId) return { kind: "user", userId: cachedUserId };
  return { kind: "guest" };
}

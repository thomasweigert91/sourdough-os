"use client";

import { APP_NAME, OFFLINE_MESSAGE, SYNC_ERROR_MESSAGE } from "@/lib/offline-messages";
import { useSyncStatus } from "@/lib/query/hooks";
import { useOnlineStatus } from "@/lib/query/online";

/** Kopfbereich geschützter Seiten mit Offline- und Sync-Hinweis (F005, AC-1 bis AC-3, AC-6). */
export function AppHeader() {
  const online = useOnlineStatus();
  const sync = useSyncStatus();

  // Immer nur eine Meldung, offline hat Vorrang.
  let notice: { text: string; className: string } | null = null;
  if (!online) {
    notice = {
      text: OFFLINE_MESSAGE,
      className:
        "rounded-md bg-zinc-100 px-3 py-1 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50",
    };
  } else if (sync === "error") {
    notice = { text: SYNC_ERROR_MESSAGE, className: "text-red-700 dark:text-red-400" };
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <p className="font-semibold text-zinc-950 dark:text-zinc-50">{APP_NAME}</p>
        {/* Immer gerendert, damit jeder Zustandswechsel genau einmal höflich angesagt wird. */}
        <div role="status" aria-live="polite" className="min-w-0 max-w-full text-sm break-words">
          {notice ? <p className={`font-medium ${notice.className}`}>{notice.text}</p> : null}
        </div>
      </div>
    </header>
  );
}

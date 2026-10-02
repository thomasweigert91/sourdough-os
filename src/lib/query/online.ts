// Anbindung des TanStack-onlineManagers an navigator.onLine (F005, AC-1 bis AC-3).
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export function getNavigatorOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Übernimmt den aktuellen navigator.onLine-Wert in den onlineManager. */
export function syncOnlineManager(): void {
  onlineManager.setOnline(getNavigatorOnline());
}

if (typeof window !== "undefined") {
  onlineManager.setEventListener((setOnline) => {
    setOnline(getNavigatorOnline());
    const handler = () => setOnline(getNavigatorOnline());
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    window.addEventListener("pageshow", handler);
    document.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
      window.removeEventListener("pageshow", handler);
      document.removeEventListener("visibilitychange", handler);
    };
  });
}

function subscribe(callback: () => void): () => void {
  return onlineManager.subscribe(callback);
}

function getSnapshot(): boolean {
  return onlineManager.isOnline();
}

function getServerSnapshot(): boolean {
  return true;
}

/** Online-Status des Geräts. Braucht keinen QueryClientProvider. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

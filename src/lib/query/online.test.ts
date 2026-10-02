import { act, cleanup, renderHook } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNavigatorOnline, syncOnlineManager, useOnlineStatus } from "@/lib/query/online";

// Der onlineManager hört nur auf Events, solange er Abonnenten hat (wie in der App über
// QueryClient und useOnlineStatus). Deshalb abonniert jeder Test einen Listener.
const unsubscribers: Array<() => void> = [];

function subscribe() {
  const listener = vi.fn();
  unsubscribers.push(onlineManager.subscribe(listener));
  return listener;
}

function setNavigatorOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  cleanup();
  while (unsubscribers.length) unsubscribers.pop()?.();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe("F005 Online-Anbindung", () => {
  it("F005/AC-1 nach einem offline-Event ist der onlineManager offline und benachrichtigt Abonnenten", () => {
    const listener = subscribe();
    setNavigatorOnline(false);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(onlineManager.isOnline()).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it("F005/AC-1 syncOnlineManager übernimmt navigator.onLine", () => {
    setNavigatorOnline(false);
    syncOnlineManager();
    expect(onlineManager.isOnline()).toBe(false);

    setNavigatorOnline(true);
    syncOnlineManager();
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("F005/AC-1 getNavigatorOnline liest navigator.onLine", () => {
    setNavigatorOnline(false);
    expect(getNavigatorOnline()).toBe(false);
    setNavigatorOnline(true);
    expect(getNavigatorOnline()).toBe(true);
  });

  it("F005/AC-1 useOnlineStatus liefert ohne Provider den aktuellen Status und folgt dem Wechsel", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    setNavigatorOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(false);
  });

  it("F005/AC-2 offline gefolgt von online ergibt wieder online", () => {
    subscribe();
    setNavigatorOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(onlineManager.isOnline()).toBe(false);

    setNavigatorOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(onlineManager.isOnline()).toBe(true);
  });

  it("F005/AC-3 pageshow übernimmt navigator.onLine in den onlineManager", () => {
    subscribe();
    setNavigatorOnline(false);

    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(onlineManager.isOnline()).toBe(false);

    setNavigatorOnline(true);
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("F005/AC-3 visibilitychange übernimmt navigator.onLine in den onlineManager", () => {
    subscribe();
    setNavigatorOnline(false);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onlineManager.isOnline()).toBe(false);

    setNavigatorOnline(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("F005/AC-2 der Cleanup der Event-Anbindung entfernt alle vier Listener", () => {
    const unsubscribe = onlineManager.subscribe(() => {});
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");

    // Letzter Abonnent meldet sich ab → onlineManager ruft den Cleanup der Anbindung auf.
    unsubscribe();

    const windowEvents = windowRemove.mock.calls.map(([type]) => type);
    const documentEvents = documentRemove.mock.calls.map(([type]) => type);
    expect(windowEvents).toEqual(expect.arrayContaining(["online", "offline", "pageshow"]));
    expect(documentEvents).toContain("visibilitychange");

    // Ohne Anbindung ändert ein offline-Event nichts mehr.
    setNavigatorOnline(false);
    window.dispatchEvent(new Event("offline"));
    expect(onlineManager.isOnline()).toBe(true);
  });
});

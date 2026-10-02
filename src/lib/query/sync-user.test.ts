import { afterEach, describe, expect, it } from "vitest";
import {
  bindSyncUser,
  ForeignUserError,
  getSyncUserId,
  resetSyncUser,
  waitForSyncUser,
} from "@/lib/query/sync-user";

async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function track(promise: Promise<void>) {
  const state: { settled: "open" | "resolved" | "rejected"; error: unknown } = {
    settled: "open",
    error: undefined,
  };
  promise.then(
    () => {
      state.settled = "resolved";
    },
    (error: unknown) => {
      state.settled = "rejected";
      state.error = error;
    },
  );
  return state;
}

afterEach(() => {
  resetSyncUser();
});

describe("F005 Bindung der Synchronisation an den bestätigten Nutzer", () => {
  it("F005/AC-5 waitForSyncUser bleibt offen, bis derselbe Nutzer gebunden wird, und löst dann auf", async () => {
    const state = track(waitForSyncUser("u1"));

    await flushMicrotasks();
    expect(state.settled).toBe("open");

    bindSyncUser("u1");
    await flushMicrotasks();

    expect(state.settled).toBe("resolved");
    expect(getSyncUserId()).toBe("u1");
  });

  it("F005/AC-5 waitForSyncUser löst sofort auf, wenn der Nutzer schon gebunden ist", async () => {
    bindSyncUser("u1");

    await expect(waitForSyncUser("u1")).resolves.toBeUndefined();
  });

  it("F005/AC-5 die Bindung eines anderen Nutzers lässt eine wartende Übertragung mit ForeignUserError scheitern", async () => {
    const state = track(waitForSyncUser("u1"));

    bindSyncUser("u2");
    await flushMicrotasks();

    expect(state.settled).toBe("rejected");
    expect(state.error).toBeInstanceOf(ForeignUserError);
    expect(state.error).toBeInstanceOf(Error);
  });

  it("F005/AC-5 ist bereits ein anderer Nutzer gebunden, scheitert waitForSyncUser mit ForeignUserError", async () => {
    bindSyncUser("u2");

    await expect(waitForSyncUser("u1")).rejects.toBeInstanceOf(ForeignUserError);
  });

  it("F005/AC-5 resetSyncUser hebt die Bindung auf, danach wartet waitForSyncUser wieder", async () => {
    bindSyncUser("u1");
    expect(getSyncUserId()).toBe("u1");

    resetSyncUser();

    expect(getSyncUserId()).toBeNull();
    const state = track(waitForSyncUser("u1"));
    await flushMicrotasks();
    expect(state.settled).toBe("open");

    bindSyncUser("u1");
    await flushMicrotasks();
    expect(state.settled).toBe("resolved");
  });
});

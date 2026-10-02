// Bindung der Sync-Mutationen an den bestätigten Nutzer (F005, AC-5, AC-7).
// Eine nach dem Neuladen fortgesetzte Übertragung sendet erst, wenn die Sitzung bestätigt ist,
// und niemals an das Konto einer anderen Person.

export class ForeignUserError extends Error {
  constructor(message = "Die Änderung gehört zu einer anderen Person.") {
    super(message);
    this.name = "ForeignUserError";
  }
}

interface Waiter {
  userId: string;
  resolve: () => void;
  reject: (error: ForeignUserError) => void;
}

let boundUserId: string | null = null;
let waiters: Waiter[] = [];

export function bindSyncUser(userId: string): void {
  boundUserId = userId;
  const pending = waiters;
  waiters = [];
  for (const waiter of pending) {
    if (waiter.userId === userId) waiter.resolve();
    else waiter.reject(new ForeignUserError());
  }
}

export function resetSyncUser(): void {
  boundUserId = null;
}

export function getSyncUserId(): string | null {
  return boundUserId;
}

/** Löst auf, sobald userId gebunden ist; wirft ForeignUserError, wenn ein anderer Nutzer gebunden ist/wird. */
export function waitForSyncUser(userId: string): Promise<void> {
  if (boundUserId === userId) return Promise.resolve();
  if (boundUserId !== null) return Promise.reject(new ForeignUserError());
  return new Promise<void>((resolve, reject) => {
    waiters.push({ userId, resolve, reject });
  });
}

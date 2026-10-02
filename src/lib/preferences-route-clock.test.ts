// @vitest-environment node
// Review F005, Befund 2: Zeitstempel aus der Zukunft dürfen spätere Änderungen nicht blockieren.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { user, userPreference } from "@/db/schema";
import { createTestDb } from "@/test/pglite-db";

const BASE_URL = "http://localhost:3000";
const SETUP_TIMEOUT_MS = 60_000;
const USER_ID = "u1";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
type RouteHandler = (request: Request) => Promise<Response>;

const getSession = vi.fn();
let testDb: TestDb;
let PUT: RouteHandler;

function putRequest(body: unknown) {
  return new Request(`${BASE_URL}/api/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: "x=1", origin: BASE_URL },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  testDb = await createTestDb();
  vi.resetModules();
  vi.doMock("@/db", () => ({ db: testDb.db }));
  vi.doMock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
  const route = await import("@/app/api/preferences/route");
  PUT = route.PUT as RouteHandler;
}, SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await testDb.reset();
  getSession.mockReset();
  getSession.mockResolvedValue({
    user: { id: USER_ID, name: "Max Mustermann", email: "max@example.com" },
    session: { id: "s-u1", userId: USER_ID },
  });
  await testDb.db.insert(user).values({ id: USER_ID, name: "Max Mustermann", email: "max@example.com" });
});

afterAll(async () => {
  vi.doUnmock("@/db");
  vi.doUnmock("@/lib/auth");
  await testDb?.close();
});

describe("F005 PUT /api/preferences: Zeitstempel aus der Zukunft", () => {
  it("begrenzt updatedAt auf die Serverzeit, eine spätere Änderung überschreibt danach", async () => {
    const before = Date.now();

    const future = await PUT(putRequest({ temperatureUnit: "F", updatedAt: "9999-01-01T00:00:00.000Z" }));

    expect(future.status).toBe(200);
    const stored = (await future.json()) as { temperatureUnit: string; updatedAt: string };
    expect(stored.temperatureUnit).toBe("F");
    expect(Date.parse(stored.updatedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(stored.updatedAt)).toBeLessThanOrEqual(Date.now());

    // Echte spätere Änderung: nach dem gespeicherten Zeitpunkt, aber nicht in der Zukunft.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const later = new Date().toISOString();
    const response = await PUT(putRequest({ temperatureUnit: "C", updatedAt: later }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ temperatureUnit: "C" });
    const [row] = await testDb.db.select().from(userPreference).where(eq(userPreference.userId, USER_ID));
    expect(row.temperatureUnit).toBe("C");
  });
});

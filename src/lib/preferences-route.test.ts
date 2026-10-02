// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { user, userPreference } from "@/db/schema";
import { createTestDb } from "@/test/pglite-db";

// Route /api/preferences gegen PGlite mit den echten Migrationen. Die Sitzung wird über
// einen Mock von auth.api.getSession gesteuert. Testdaten nur mit @example.com-Adressen.
const BASE_URL = "http://localhost:3000";
const SETUP_TIMEOUT_MS = 60_000;
const USER_ID = "u1";
const OTHER_USER_ID = "u2";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
type RouteHandler = (request: Request) => Promise<Response>;

const getSession = vi.fn();
let testDb: TestDb;
let GET: RouteHandler;
let PUT: RouteHandler;

function signedInAs(id: string) {
  getSession.mockResolvedValue({
    user: { id, name: "Max Mustermann", email: `${id}@example.com` },
    session: { id: `s-${id}`, userId: id },
  });
}

function getRequest() {
  return new Request(`${BASE_URL}/api/preferences`, { method: "GET", headers: { cookie: "x=1" } });
}

function putRequest(body: unknown) {
  return new Request(`${BASE_URL}/api/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: "x=1", origin: BASE_URL },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  testDb = await createTestDb();

  vi.resetModules();
  vi.doMock("@/db", () => ({ db: testDb.db }));
  vi.doMock("@/lib/auth", () => ({ auth: { api: { getSession } } }));

  const route = await import("@/app/api/preferences/route");
  GET = route.GET as RouteHandler;
  PUT = route.PUT as RouteHandler;
}, SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await testDb.reset();
  getSession.mockReset();
  await testDb.db.insert(user).values([
    { id: USER_ID, name: "Max Mustermann", email: "max@example.com" },
    { id: OTHER_USER_ID, name: "Erika Musterfrau", email: "erika@example.com" },
  ]);
});

afterAll(async () => {
  vi.doUnmock("@/db");
  vi.doUnmock("@/lib/auth");
  await testDb?.close();
});

describe("F005 GET /api/preferences", () => {
  it("F005/AC-4 liefert ohne gespeicherte Zeile die Standardwerte { C, updatedAt: null }", async () => {
    signedInAs(USER_ID);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ temperatureUnit: "C", updatedAt: null });
  });

  it("F005/AC-4 antwortet ohne Sitzung mit 401", async () => {
    getSession.mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
  });
});

describe("F005 PUT /api/preferences (letzte Änderung gewinnt)", () => {
  it("F005/AC-5 speichert eine Änderung, danach liefert GET den gespeicherten Wert", async () => {
    signedInAs(USER_ID);
    const updatedAt = "2026-10-02T08:00:00.000Z";

    const response = await PUT(putRequest({ temperatureUnit: "F", updatedAt }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ temperatureUnit: "F", updatedAt });

    const rows = await testDb.db.select().from(userPreference).where(eq(userPreference.userId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].temperatureUnit).toBe("F");

    const read = await GET(getRequest());
    expect(await read.json()).toEqual({ temperatureUnit: "F", updatedAt });
  });

  it("F005/AC-5 eine ältere Änderung überschreibt nicht, Antwort ist der gespeicherte neuere Wert", async () => {
    signedInAs(USER_ID);
    const newer = "2026-10-02T09:00:00.000Z";
    const older = "2026-10-02T07:00:00.000Z";
    await PUT(putRequest({ temperatureUnit: "F", updatedAt: newer }));

    const response = await PUT(putRequest({ temperatureUnit: "C", updatedAt: older }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ temperatureUnit: "F", updatedAt: newer });
    const [row] = await testDb.db.select().from(userPreference).where(eq(userPreference.userId, USER_ID));
    expect(row.temperatureUnit).toBe("F");
  });

  it("F005/AC-5 eine neuere Änderung überschreibt", async () => {
    signedInAs(USER_ID);
    const older = "2026-10-02T07:00:00.000Z";
    const newer = "2026-10-02T09:00:00.000Z";
    await PUT(putRequest({ temperatureUnit: "F", updatedAt: older }));

    const response = await PUT(putRequest({ temperatureUnit: "C", updatedAt: newer }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ temperatureUnit: "C", updatedAt: newer });
    const [row] = await testDb.db.select().from(userPreference).where(eq(userPreference.userId, USER_ID));
    expect(row.temperatureUnit).toBe("C");
  });

  it("F005/AC-5 speichert nur für die angemeldete Person", async () => {
    signedInAs(OTHER_USER_ID);
    await PUT(putRequest({ temperatureUnit: "F", updatedAt: "2026-10-02T08:00:00.000Z" }));

    signedInAs(USER_ID);
    const response = await GET(getRequest());

    expect(await response.json()).toEqual({ temperatureUnit: "C", updatedAt: null });
  });

  it.each([
    ["unbekannte Einheit", { temperatureUnit: "K", updatedAt: "2026-10-02T08:00:00.000Z" }],
    ["fehlendes updatedAt", { temperatureUnit: "F" }],
    ["kein JSON", "{kaputt"],
  ])("F005/AC-6 lehnt einen ungültigen Body mit 400 ohne DB-Änderung ab (%s)", async (_label, body) => {
    signedInAs(USER_ID);

    const response = await PUT(putRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_INPUT" });
    expect(await testDb.db.select().from(userPreference)).toHaveLength(0);
  });

  it("F005/AC-6 lehnt PUT ohne Sitzung mit 401 ohne DB-Änderung ab", async () => {
    getSession.mockResolvedValue(null);

    const response = await PUT(putRequest({ temperatureUnit: "F", updatedAt: "2026-10-02T08:00:00.000Z" }));

    expect(response.status).toBe(401);
    expect(await testDb.db.select().from(userPreference)).toHaveLength(0);
  });
});

// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { account, session, user } from "@/db/schema";
import { createTestDb } from "@/test/pglite-db";

// Die Tests laufen gegen eine In-Memory-Datenbank (PGlite) mit den echten Migrationen,
// nicht gegen Neon. Testdaten verwenden ausschließlich @example.com-Adressen.
const BASE_URL = "http://localhost:3000";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const EMAIL = "neu@example.com";
const NAME = "Neue Person";
const PASSWORD = "korrektes-passwort-123";
const SETUP_TIMEOUT_MS = 60_000;

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
type RouteHandler = (request: Request) => Promise<Response>;

let testDb: TestDb;
let POST: RouteHandler;
let GET: RouteHandler;

function jsonRequest(pathname: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE_URL}/api/auth/${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL, ...headers },
    body: JSON.stringify(body),
  });
}

function signUp(overrides: Partial<{ name: string; email: string; password: string }> = {}) {
  return POST(
    jsonRequest("sign-up/email", { name: NAME, email: EMAIL, password: PASSWORD, ...overrides }),
  );
}

function signIn(password: string) {
  return POST(jsonRequest("sign-in/email", { email: EMAIL, password }));
}

function getSession(cookie?: string) {
  return GET(
    new Request(`${BASE_URL}/api/auth/get-session`, {
      method: "GET",
      headers: cookie ? { cookie } : {},
    }),
  );
}

/** Wandelt set-cookie-Header einer Antwort in einen cookie-Header für Folgeanfragen um. */
function toCookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
}

beforeAll(async () => {
  testDb = await createTestDb();

  vi.resetModules();
  vi.doMock("@/db", () => ({ db: testDb.db }));
  vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
  vi.stubEnv("BETTER_AUTH_URL", BASE_URL);
  for (const name of [
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]) {
    vi.stubEnv(name, undefined);
  }

  const route = await import("@/app/api/auth/[...all]/route");
  POST = route.POST as RouteHandler;
  GET = route.GET as RouteHandler;
}, SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await testDb.reset();
});

afterAll(async () => {
  vi.doUnmock("@/db");
  vi.unstubAllEnvs();
  await testDb?.close();
});

describe("F003 Registrierung per E-Mail und Passwort", () => {
  it("F003/AC-3 antwortet bei der Registrierung mit Status 200 und legt user und account an", async () => {
    const response = await signUp();

    expect(response.status).toBe(200);

    const users = await testDb.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: EMAIL, name: NAME });

    const accounts = await testDb.db.select().from(account);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ userId: users[0].id, providerId: "credential" });
  });

  it("F003/AC-3 speichert das Passwort nur als Hash und nie im Klartext", async () => {
    await signUp();

    const [credential] = await testDb.db.select().from(account);

    expect(credential.password).toEqual(expect.any(String));
    expect(credential.password).not.toBe("");
    expect(credential.password).not.toBe(PASSWORD);
    expect(credential.password).not.toContain(PASSWORD);
  });

  it("F003/AC-3 setzt emailVerified bei der Registrierung auf false", async () => {
    await signUp();

    const [created] = await testDb.db.select().from(user);

    expect(created.emailVerified).toBe(false);
  });
});

describe("F003 Anmeldung, Sitzung und Ablehnung falscher Zugangsdaten", () => {
  it("F003/AC-4 meldet mit richtigen Zugangsdaten an, setzt ein Sitzungs-Cookie und legt eine session an", async () => {
    await signUp();
    await testDb.db.delete(session);

    const response = await signIn(PASSWORD);

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("\n")).toMatch(/session_token=/);

    const [created] = await testDb.db.select().from(user).where(eq(user.email, EMAIL));
    const sessions = await testDb.db.select().from(session);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(created.id);
  });

  it("F003/AC-4 get-session liefert mit dem Sitzungs-Cookie den angemeldeten Nutzer", async () => {
    await signUp();
    const signInResponse = await signIn(PASSWORD);
    expect(signInResponse.status).toBe(200);

    const response = await getSession(toCookieHeader(signInResponse));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe(EMAIL);
  });

  it("F003/AC-4 lehnt ein falsches Passwort mit Status 401 ab, ohne Cookie und ohne session-Eintrag", async () => {
    await signUp();
    await testDb.db.delete(session);

    const response = await signIn("falsches-passwort-999");

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await testDb.db.select().from(session)).toHaveLength(0);
  });

  it("F003/AC-4 lehnt eine unbekannte E-Mail mit Status 401 ab", async () => {
    const response = await POST(
      jsonRequest("sign-in/email", { email: "unbekannt@example.com", password: PASSWORD }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("F003/AC-4 get-session ohne Cookie enthält keine Sitzung (null)", async () => {
    const response = await getSession();

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});

describe("F003 Doppelte E-Mail und zu kurzes Passwort", () => {
  it("F003/AC-5 lehnt eine zweite Registrierung mit derselben E-Mail mit 4xx ab", async () => {
    const first = await signUp();
    expect(first.status).toBe(200);

    const second = await signUp({ name: "Andere Person" });

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(second.status).toBeLessThan(500);
    expect(await testDb.db.select().from(user)).toHaveLength(1);
  });

  it("F003/AC-5 lehnt ein Passwort mit weniger als 8 Zeichen mit 4xx ab und legt weder user noch account an", async () => {
    const response = await signUp({ password: "kurz123" });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await testDb.db.select().from(user)).toHaveLength(0);
    expect(await testDb.db.select().from(account)).toHaveLength(0);
  });

  it("F003/AC-5 lehnt ein Passwort mit mehr als 128 Zeichen mit 4xx ab", async () => {
    const response = await signUp({ password: "a".repeat(129) });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await testDb.db.select().from(user)).toHaveLength(0);
  });
});

describe("F003 OAuth-Slots ohne Zugangsdaten", () => {
  it("F003/AC-6 lehnt eine Anmeldung über GitHub ohne Zugangsdaten mit 4xx ab", async () => {
    const response = await POST(
      jsonRequest("sign-in/social", { provider: "github", callbackURL: BASE_URL }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("F003/AC-6 E-Mail und Passwort funktionieren, obwohl kein OAuth-Provider aktiv ist", async () => {
    const signUpResponse = await signUp();
    const signInResponse = await signIn(PASSWORD);

    expect(signUpResponse.status).toBe(200);
    expect(signInResponse.status).toBe(200);
  });
});

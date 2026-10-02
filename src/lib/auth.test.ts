// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MISSING_SECRET = "BETTER_AUTH_SECRET ist nicht gesetzt. Bitte in .env.local eintragen.";
const SHORT_SECRET = "BETTER_AUTH_SECRET ist zu kurz. Mindestens 32 Zeichen erforderlich.";
const MISSING_URL = "BETTER_AUTH_URL ist nicht gesetzt. Bitte in .env.local eintragen.";
const INVALID_URL = "BETTER_AUTH_URL ist keine gültige URL. Beispiel: http://localhost:3000";

// Dummy-Werte, keine echten Geheimnisse.
const VALID_SECRET = "0123456789abcdef0123456789abcdef";
const VALID_URL = "http://localhost:3000";
const ROUTE_MODULE = "@/app/api/auth/[...all]/route";

const OAUTH_VARIABLES = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

function stubValidAuthEnv() {
  vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);
  vi.stubEnv("BETTER_AUTH_URL", VALID_URL);
}

describe("F003 Serverinstanz (@/lib/auth) und Routenmodul", () => {
  beforeEach(() => {
    vi.resetModules();
    // Die Datenbank wird ersetzt: Es entsteht weder Netzwerk noch ein Zugriff auf Neon.
    vi.doMock("@/db", () => ({ db: {} }));
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    vi.stubEnv("DATABASE_URL", undefined);
    for (const name of OAUTH_VARIABLES) vi.stubEnv(name, undefined);
  });

  afterEach(() => {
    vi.doUnmock("@/db");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("Umgebungsprüfung beim Laden", () => {
    it("F003/AC-7 bricht den Import von @/lib/auth ohne BETTER_AUTH_SECRET mit der Meldung ab", async () => {
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);

      await expect(import("@/lib/auth")).rejects.toThrow(MISSING_SECRET);
    });

    it("F003/AC-7 bricht den Import von @/lib/auth bei leerem BETTER_AUTH_SECRET mit der Meldung ab", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", "");
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);

      await expect(import("@/lib/auth")).rejects.toThrow(MISSING_SECRET);
    });

    it("F003/AC-7 bricht den Import von @/lib/auth bei zu kurzem BETTER_AUTH_SECRET mit der Meldung ab", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(31));
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);

      await expect(import("@/lib/auth")).rejects.toThrow(SHORT_SECRET);
    });

    it("F003/AC-7 bricht den Import von @/lib/auth ohne BETTER_AUTH_URL mit der Meldung ab", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);

      await expect(import("@/lib/auth")).rejects.toThrow(MISSING_URL);
    });

    it("F003/AC-7 bricht den Import von @/lib/auth bei ungültiger BETTER_AUTH_URL mit der Meldung ab", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);
      vi.stubEnv("BETTER_AUTH_URL", "localhost:3000");

      await expect(import("@/lib/auth")).rejects.toThrow(INVALID_URL);
    });

    it("F003/AC-7 bricht das Laden des Routenmoduls ohne BETTER_AUTH_SECRET mit der Meldung ab (wie next build)", async () => {
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);

      await expect(import(ROUTE_MODULE)).rejects.toThrow(MISSING_SECRET);
    });

    it("F003/AC-7 bricht das Laden des Routenmoduls ohne BETTER_AUTH_URL mit der Meldung ab (wie next build)", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);

      await expect(import(ROUTE_MODULE)).rejects.toThrow(MISSING_URL);
    });

    it("F003/AC-7 lädt @/lib/auth und das Routenmodul mit gültigen Variablen", async () => {
      stubValidAuthEnv();

      const authModule = await import("@/lib/auth");
      const route = await import(ROUTE_MODULE);

      expect(authModule.auth).toBeDefined();
      expect(typeof authModule.auth.handler).toBe("function");
      expect(typeof route.GET).toBe("function");
      expect(typeof route.POST).toBe("function");
    });
  });

  describe("OAuth-Slots", () => {
    it("F003/AC-6 lädt ohne OAuth-Variablen fehlerfrei und aktiviert keinen Provider", async () => {
      stubValidAuthEnv();

      const { auth } = await import("@/lib/auth");

      expect(auth.options.emailAndPassword?.enabled).toBe(true);
      expect(Object.keys(auth.options.socialProviders ?? {})).toEqual([]);
    });

    it("F003/AC-6 aktiviert genau GitHub, wenn GITHUB_CLIENT_ID und GITHUB_CLIENT_SECRET gesetzt sind", async () => {
      stubValidAuthEnv();
      vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");

      const { auth } = await import("@/lib/auth");

      expect(Object.keys(auth.options.socialProviders ?? {})).toEqual(["github"]);
    });

    it("F003/AC-6 aktiviert genau Google, wenn GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET gesetzt sind", async () => {
      stubValidAuthEnv();
      vi.stubEnv("GOOGLE_CLIENT_ID", "go-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "go-secret");

      const { auth } = await import("@/lib/auth");

      expect(Object.keys(auth.options.socialProviders ?? {})).toEqual(["google"]);
    });

    it("F003/AC-6 lässt einen Provider inaktiv, wenn nur eine seiner beiden Variablen gesetzt ist", async () => {
      stubValidAuthEnv();
      vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "go-secret");

      const { auth } = await import("@/lib/auth");

      expect(Object.keys(auth.options.socialProviders ?? {})).toEqual([]);
    });
  });
});

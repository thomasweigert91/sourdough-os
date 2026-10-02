// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MISSING_SECRET = "BETTER_AUTH_SECRET ist nicht gesetzt. Bitte in .env.local eintragen.";
const SHORT_SECRET = "BETTER_AUTH_SECRET ist zu kurz. Mindestens 32 Zeichen erforderlich.";
const MISSING_URL = "BETTER_AUTH_URL ist nicht gesetzt. Bitte in .env.local eintragen.";
const INVALID_URL = "BETTER_AUTH_URL ist keine gültige URL. Beispiel: http://localhost:3000";

// Dummy-Werte, keine echten Geheimnisse.
const VALID_SECRET = "0123456789abcdef0123456789abcdef";
const VALID_URL = "http://localhost:3000";

const OAUTH_VARIABLES = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

async function loadEnvModule() {
  return await import("@/lib/auth-env");
}

describe("F003 Auth-Umgebung (@/lib/auth-env)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    for (const name of OAUTH_VARIABLES) vi.stubEnv(name, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("getAuthEnv", () => {
    it("F003/AC-7 der Import der Prüfdatei wirft ohne Variablen nicht (Prüfung zur Aufrufzeit)", async () => {
      const mod = await loadEnvModule();

      expect(typeof mod.getAuthEnv).toBe("function");
      expect(typeof mod.getSocialProviders).toBe("function");
    });

    it("F003/AC-7 wirft ohne BETTER_AUTH_SECRET die Meldung zum fehlenden Secret", async () => {
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);
      const { getAuthEnv } = await loadEnvModule();

      expect(() => getAuthEnv()).toThrow(MISSING_SECRET);
    });

    it("F003/AC-7 wirft bei leerem BETTER_AUTH_SECRET die Meldung zum fehlenden Secret", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", "");
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);
      const { getAuthEnv } = await loadEnvModule();

      expect(() => getAuthEnv()).toThrow(MISSING_SECRET);
    });

    it("F003/AC-7 wirft bei BETTER_AUTH_SECRET mit 31 Zeichen die Meldung zum zu kurzen Secret", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(31));
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);
      const { getAuthEnv } = await loadEnvModule();

      expect(() => getAuthEnv()).toThrow(SHORT_SECRET);
    });

    it("F003/AC-7 nennt den Secret-Wert nicht in der Fehlermeldung", async () => {
      const secret = "geheim-und-zu-kurz";
      vi.stubEnv("BETTER_AUTH_SECRET", secret);
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);
      const { getAuthEnv } = await loadEnvModule();

      expect(() => getAuthEnv()).toThrow(SHORT_SECRET);
      expect(() => getAuthEnv()).not.toThrow(new RegExp(secret));
    });

    it("F003/AC-7 wirft ohne BETTER_AUTH_URL die Meldung zur fehlenden URL", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);
      const { getAuthEnv } = await loadEnvModule();

      expect(() => getAuthEnv()).toThrow(MISSING_URL);
    });

    it("F003/AC-7 wirft bei leerer BETTER_AUTH_URL die Meldung zur fehlenden URL", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);
      vi.stubEnv("BETTER_AUTH_URL", "");
      const { getAuthEnv } = await loadEnvModule();

      expect(() => getAuthEnv()).toThrow(MISSING_URL);
    });

    it.each(["localhost:3000", "ftp://example.com", "nicht-eine-url"])(
      "F003/AC-7 wirft bei BETTER_AUTH_URL=%s die Meldung zur ungültigen URL",
      async (value) => {
        vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);
        vi.stubEnv("BETTER_AUTH_URL", value);
        const { getAuthEnv } = await loadEnvModule();

        expect(() => getAuthEnv()).toThrow(INVALID_URL);
      },
    );

    it("F003/AC-7 liefert bei gültigen Werten secret und url", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);
      const { getAuthEnv } = await loadEnvModule();

      expect(getAuthEnv()).toEqual({ secret: VALID_SECRET, url: VALID_URL });
    });

    it("F003/AC-7 akzeptiert https-URLs und ein Secret mit genau 32 Zeichen", async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
      vi.stubEnv("BETTER_AUTH_URL", "https://sourdough.example.com");
      const { getAuthEnv } = await loadEnvModule();

      expect(getAuthEnv()).toEqual({
        secret: "a".repeat(32),
        url: "https://sourdough.example.com",
      });
    });

    it("F003/AC-7 prüft bei jedem Aufruf neu und nicht nur beim Import", async () => {
      const { getAuthEnv } = await loadEnvModule();

      expect(() => getAuthEnv()).toThrow(MISSING_SECRET);

      vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);
      vi.stubEnv("BETTER_AUTH_URL", VALID_URL);
      expect(getAuthEnv()).toEqual({ secret: VALID_SECRET, url: VALID_URL });
    });
  });

  describe("getSocialProviders", () => {
    it("F003/AC-6 liefert ohne OAuth-Variablen keinen Provider und wirft nicht", async () => {
      const { getSocialProviders } = await loadEnvModule();

      expect(getSocialProviders()).toEqual({});
    });

    it("F003/AC-6 aktiviert GitHub nur, wenn Client-ID und Secret gesetzt sind", async () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");
      const { getSocialProviders } = await loadEnvModule();

      expect(getSocialProviders()).toEqual({
        github: { clientId: "gh-id", clientSecret: "gh-secret" },
      });
    });

    it("F003/AC-6 aktiviert Google nur, wenn Client-ID und Secret gesetzt sind", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "go-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "go-secret");
      const { getSocialProviders } = await loadEnvModule();

      expect(getSocialProviders()).toEqual({
        google: { clientId: "go-id", clientSecret: "go-secret" },
      });
    });

    it("F003/AC-6 aktiviert beide Provider, wenn beide vollständig konfiguriert sind", async () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");
      vi.stubEnv("GOOGLE_CLIENT_ID", "go-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "go-secret");
      const { getSocialProviders } = await loadEnvModule();

      expect(getSocialProviders()).toEqual({
        github: { clientId: "gh-id", clientSecret: "gh-secret" },
        google: { clientId: "go-id", clientSecret: "go-secret" },
      });
    });

    it.each([
      ["GITHUB_CLIENT_ID", "github"],
      ["GITHUB_CLIENT_SECRET", "github"],
      ["GOOGLE_CLIENT_ID", "google"],
      ["GOOGLE_CLIENT_SECRET", "google"],
    ])("F003/AC-6 lässt den Provider inaktiv, wenn nur %s gesetzt ist", async (variable, provider) => {
      vi.stubEnv(variable, "nur-eine-variable");
      const { getSocialProviders } = await loadEnvModule();

      const result = getSocialProviders();
      expect(result).toEqual({});
      expect(result).not.toHaveProperty(provider);
    });

    it("F003/AC-6 behandelt leere oder nur aus Leerraum bestehende Werte als nicht gesetzt", async () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "");
      vi.stubEnv("GOOGLE_CLIENT_ID", "   ");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "go-secret");
      const { getSocialProviders } = await loadEnvModule();

      expect(getSocialProviders()).toEqual({});
    });

    it("F003/AC-6 aktiviert genau den vollständig konfigurierten Provider, wenn der andere unvollständig ist", async () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");
      vi.stubEnv("GOOGLE_CLIENT_ID", "go-id");
      const { getSocialProviders } = await loadEnvModule();

      expect(getSocialProviders()).toEqual({
        github: { clientId: "gh-id", clientSecret: "gh-secret" },
      });
    });
  });
});

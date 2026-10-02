import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CLIENT_SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "auth-client.ts");

describe("F003 Client-Helper (@/lib/auth-client)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    vi.stubEnv("DATABASE_URL", undefined);
    // Würde der Client serverseitige Module laden, würde der Import an diesen Factories scheitern.
    vi.doMock("@/db", () => {
      throw new Error("@/db darf vom Client-Helper nicht geladen werden");
    });
    vi.doMock("@/lib/auth", () => {
      throw new Error("@/lib/auth darf vom Client-Helper nicht geladen werden");
    });
  });

  afterEach(() => {
    vi.doUnmock("@/db");
    vi.doUnmock("@/lib/auth");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("F003/AC-8 lässt sich ohne BETTER_AUTH_*, DATABASE_URL und ohne @/db oder @/lib/auth importieren", async () => {
    const mod = await import("@/lib/auth-client");

    expect(mod.authClient).toBeDefined();
  });

  it("F003/AC-8 stellt signUp.email, signIn.email, signOut und useSession an der Instanz bereit", async () => {
    const { authClient } = await import("@/lib/auth-client");

    expect(typeof authClient.signUp.email).toBe("function");
    expect(typeof authClient.signIn.email).toBe("function");
    expect(typeof authClient.signOut).toBe("function");
    expect(typeof authClient.useSession).toBe("function");
  });

  it("F003/AC-8 exportiert signIn, signUp, signOut und useSession auch als benannte Exporte", async () => {
    const mod = await import("@/lib/auth-client");

    expect(typeof mod.signUp.email).toBe("function");
    expect(typeof mod.signIn.email).toBe("function");
    expect(typeof mod.signOut).toBe("function");
    expect(typeof mod.useSession).toBe("function");
  });

  it("F003/AC-8 enthält im Quelltext keine Server-Importe und keinen Zugriff auf process.env", () => {
    const source = fs.readFileSync(CLIENT_SOURCE, "utf8");

    expect(source).toMatch(/createAuthClient/);
    expect(source).not.toMatch(/from\s+["']@\/db(\/[^"']*)?["']/);
    expect(source).not.toMatch(/from\s+["']@\/lib\/auth["']/);
    expect(source).not.toMatch(/["']server-only["']/);
    expect(source).not.toMatch(/process\.env/);
  });
});

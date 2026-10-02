// Bricht den Build ab, sobald eine Client-Komponente @/lib/auth importiert.
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { getAuthEnv, getSocialProviders } from "./auth-env";

// getAuthEnv() läuft beim Laden des Moduls: Ohne gültige BETTER_AUTH_*-Variablen scheitert schon der Import.
const { secret, url } = getAuthEnv();
const { github, google } = getSocialProviders();

export const auth = betterAuth({
  secret,
  baseURL: url,
  // neon-http kennt keine Transaktionen; der Adapter läuft mit dem Standard (transaction: false).
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    ...(github && { github }),
    ...(google && { google }),
  },
});

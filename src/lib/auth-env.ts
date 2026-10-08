// Keine Imports aus "@/"-Pfaden und kein "server-only": Die Datei ist direkt testbar.
// Beim Import passiert nichts; geprüft wird erst beim Aufruf.

export const MISSING_SECRET_MESSAGE =
  "BETTER_AUTH_SECRET ist nicht gesetzt. Bitte in .env.local eintragen.";
export const SHORT_SECRET_MESSAGE =
  "BETTER_AUTH_SECRET ist zu kurz. Mindestens 32 Zeichen erforderlich.";
export const MISSING_URL_MESSAGE =
  "BETTER_AUTH_URL ist nicht gesetzt. Bitte in .env.local eintragen.";
export const INVALID_URL_MESSAGE =
  "BETTER_AUTH_URL ist keine gültige URL. Beispiel: http://localhost:3000";
export const MIN_SECRET_LENGTH = 32;

export interface AuthEnv {
  secret: string;
  url: string;
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface SocialProviderCredentials {
  github?: OAuthCredentials;
  google?: OAuthCredentials;
}

function readNonEmpty(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Liest BETTER_AUTH_SECRET und BETTER_AUTH_URL zur Aufrufzeit.
 * Prüfreihenfolge: Secret fehlt, Secret zu kurz, URL fehlt, URL ungültig.
 */
export function getAuthEnv(): AuthEnv {
  const secret = readNonEmpty("BETTER_AUTH_SECRET");
  if (secret === undefined) {
    throw new Error(MISSING_SECRET_MESSAGE);
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(SHORT_SECRET_MESSAGE);
  }

  const url = readNonEmpty("BETTER_AUTH_URL");
  if (url === undefined) {
    throw new Error(MISSING_URL_MESSAGE);
  }
  if (!isHttpUrl(url)) {
    throw new Error(INVALID_URL_MESSAGE);
  }

  return { secret, url };
}

function toOrigin(value: string): string | undefined {
  // Vercel liefert VERCEL_URL und VERCEL_BRANCH_URL ohne Protokoll.
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return undefined;
  }
}

/**
 * Weitere erlaubte Origins neben BETTER_AUTH_URL: die Adressen des aktuellen
 * Vercel-Deployments (VERCEL_URL, VERCEL_BRANCH_URL) und optional
 * BETTER_AUTH_TRUSTED_ORIGINS (kommagetrennt). Ungültige Einträge entfallen. Wirft nie.
 */
export function getTrustedOrigins(): string[] {
  const candidates = [
    readNonEmpty("VERCEL_URL"),
    readNonEmpty("VERCEL_BRANCH_URL"),
    ...(readNonEmpty("BETTER_AUTH_TRUSTED_ORIGINS")?.split(",") ?? []),
  ];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    const origin = trimmed ? toOrigin(trimmed) : undefined;
    if (origin !== undefined) origins.add(origin);
  }
  return [...origins];
}

function readCredentials(
  idName: string,
  secretName: string,
): OAuthCredentials | undefined {
  const clientId = readNonEmpty(idName);
  const clientSecret = readNonEmpty(secretName);
  if (clientId === undefined || clientSecret === undefined) {
    return undefined;
  }
  return { clientId, clientSecret };
}

/** Ein Provider ist nur enthalten, wenn Client-ID und Secret gesetzt sind. Wirft nie. */
export function getSocialProviders(): SocialProviderCredentials {
  const github = readCredentials("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
  const google = readCredentials("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  return {
    ...(github && { github }),
    ...(google && { google }),
  };
}

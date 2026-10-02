// Keine Imports aus "@/"-Pfaden: drizzle-kit lädt diese Datei über drizzle.config.ts.

export const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL ist nicht gesetzt. Bitte in .env.local eintragen.";

function readNonEmpty(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/** Liest DATABASE_URL zur Aufrufzeit. Wirft, wenn die Variable fehlt oder leer ist. */
export function getDatabaseUrl(): string {
  const url = readNonEmpty("DATABASE_URL");
  if (url === undefined) {
    throw new Error(MISSING_DATABASE_URL_MESSAGE);
  }
  return url;
}

/**
 * URL für Migrationen (drizzle-kit): bevorzugt die direkte Verbindung
 * DATABASE_URL_UNPOOLED, sonst DATABASE_URL. DATABASE_URL ist immer Pflicht.
 */
export function getMigrationDatabaseUrl(): string {
  const pooledUrl = getDatabaseUrl();
  return readNonEmpty("DATABASE_URL_UNPOOLED") ?? pooledUrl;
}

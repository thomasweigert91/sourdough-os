// Bricht den Build ab, sobald eine Client-Komponente @/db importiert.
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseUrl } from "./env";
import * as schema from "./schema";

// getDatabaseUrl() läuft beim Laden des Moduls: Ohne DATABASE_URL scheitert schon der Import.
// neon() baut keine Verbindung auf; Netzwerk entsteht erst bei der ersten Query.
export const db = drizzle({ client: neon(getDatabaseUrl()), schema });

export type Database = typeof db;

import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { userPreference } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  DEFAULT_PREFERENCES,
  parsePreferencesInput,
  TEMPERATURE_UNITS,
  type PreferencesDto,
  type TemperatureUnit,
} from "@/lib/preferences";

function unauthorized(): Response {
  return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function invalidInput(): Response {
  return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
}

function toTemperatureUnit(value: string): TemperatureUnit {
  return (TEMPERATURE_UNITS as readonly string[]).includes(value)
    ? (value as TemperatureUnit)
    : DEFAULT_PREFERENCES.temperatureUnit;
}

async function readPreferences(userId: string): Promise<PreferencesDto> {
  const [row] = await db
    .select()
    .from(userPreference)
    .where(eq(userPreference.userId, userId))
    .limit(1);
  if (!row) return { temperatureUnit: DEFAULT_PREFERENCES.temperatureUnit, updatedAt: null };
  return { temperatureUnit: toTemperatureUnit(row.temperatureUnit), updatedAt: row.updatedAt.toISOString() };
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return unauthorized();
  return Response.json(await readPreferences(session.user.id));
}

export async function PUT(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidInput();
  }
  const input = parsePreferencesInput(body);
  if (!input) return invalidInput();

  const userId = session.user.id;
  // Der Zeitstempel kommt von der Client-Uhr. Zeitpunkte in der Zukunft (falsch gestellte Uhr,
  // manipulierter Request) auf die Serverzeit begrenzen, sonst blockierten sie jede spätere Änderung.
  const now = new Date();
  const updatedAt = input.updatedAt > now ? now : input.updatedAt;
  // Letzte Änderung gewinnt: bestehende Zeile nur überschreiben, wenn sie älter ist.
  await db
    .insert(userPreference)
    .values({ userId, temperatureUnit: input.temperatureUnit, updatedAt })
    .onConflictDoUpdate({
      target: userPreference.userId,
      set: { temperatureUnit: input.temperatureUnit, updatedAt },
      setWhere: lt(userPreference.updatedAt, updatedAt),
    });

  return Response.json(await readPreferences(userId));
}

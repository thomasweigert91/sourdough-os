// Nutzer-Präferenzen (F005). Nur relative Importe: drizzle-kit löst den "@/"-Alias nicht auf.
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const userPreference = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  temperatureUnit: text("temperature_unit").notNull().default("C"),
  // Änderungszeitpunkt vom Client ("letzte Änderung gewinnt").
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

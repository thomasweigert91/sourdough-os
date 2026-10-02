import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

// Platzhalter-Tabelle für die erste Migration (Connection-Test).
// Wird in einem späteren Ticket durch das echte Datenmodell ersetzt.
export const healthcheck = pgTable("healthcheck", {
  id: serial("id").primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

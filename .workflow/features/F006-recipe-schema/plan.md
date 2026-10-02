# Plan F006: Drizzle Schema für Rezepte und Zutaten

<!-- Rolle: tech-planner. Alle Platzhalter ersetzt. Jede AC aus dem Ticket kommt in Arbeitsschritten UND Teststrategie vor. -->

## Ansatz
Eine neue Schema-Datei `src/db/schema/recipes.ts` legt den Postgres-Enum `ingredient_type`, die Tabellen `recipes` und `recipe_ingredients` sowie die Drizzle-Relationen (`user` → `recipes` → `ingredients`) an. Sie folgt dem Muster von `auth.ts`/`preferences.ts`: nur relative Importe, `timestamptz`, Cascade-Fremdschlüssel, Indizes über den dritten `pgTable`-Parameter. Die Regeln aus den beantworteten Fragen setzt die Datenbank selbst durch: UUID-Primärschlüssel mit `defaultRandom()`, `numeric(…, 2)` im Modus `"number"`, Check-Constraints für Werte ≥ 0 und gegen leere oder nur aus Leerzeichen bestehende Namen (`length(trim(name)) > 0`), `position` mit Default 0 und `updated_at` mit `defaultNow()` ohne `$onUpdate`. Die Migration erzeugt `npm run db:generate -- --name recipes` (`drizzle/0003_recipes.sql`), genau wie bei F005. Getestet wird das Verhalten gegen PGlite mit den echten Migrationen über den bestehenden Helfer `createTestDb`. Verworfene Alternativen: (a) `text` mit Check-Constraint für den Zutatentyp. Er wäre leichter erweiterbar, aber `pgEnum` gibt einen TS-Union-Typ und eine DB-Prüfung ohne eigenes SQL. (b) `numeric` im Standardmodus `string`. Er hätte keine Rundungsgefahr, verlangt aber bei jedem späteren Lesen ein `Number(...)`. Bei zwei Nachkommastellen ist `mode: "number"` exakt genug für AC-6. (c) `real`/`double precision`. Sie verletzen AC-6 durch Gleitkomma-Rundung.

## Betroffene Dateien
| Pfad | Aktion | Zweck |
|---|---|---|
| src/db/schema/recipes.ts | neu | Enum `ingredientTypeEnum`, Tabellen `recipes`/`recipeIngredients`, Relationen, abgeleitete Typen (AC-1 bis AC-8) |
| src/db/schema/index.ts | ändern | `export * from "./recipes"` (AC-7) |
| drizzle/0003_recipes.sql | neu | Migration, erzeugt per `npm run db:generate -- --name recipes` (AC-7) |
| drizzle/meta/0003_snapshot.json | neu | Snapshot, von drizzle-kit erzeugt (AC-7) |
| drizzle/meta/_journal.json | ändern | Eintrag `idx 3`, `tag "0003_recipes"`, von drizzle-kit erzeugt (AC-7) |
| src/db/recipes-schema.test.ts | neu | Verhaltenstests gegen PGlite und Export-/Relations-Prüfung (AC-1 bis AC-8) |
| recipes-setup.test.ts | neu | Migrationsdateien, Journal und Drift-Prüfung per drizzle-kit (AC-7) |

Nicht geändert wird `src/test/pglite-db.ts`: `reset()` leert `"user"` per `TRUNCATE … CASCADE`, und das leert `recipes` und `recipe_ingredients` über die Fremdschlüssel mit. Auch `src/db/schema/auth.ts` bleibt unverändert, die Relation von `user` zu den Rezepten steht in `recipes.ts`.

## Komponenten & Datenfluss
Keine UI, keine Komponenten, kein Client-State und keine API-Aufrufe. Lade- und Fehlerzustände entfallen. Es gibt keine neuen Abhängigkeiten: `drizzle-orm` 0.45.3 bringt `pgEnum`, `check`, `uuid`, `numeric({ mode: "number" })` und `relations` mit, PGlite ist bereits Dev-Abhängigkeit.

### src/db/schema/recipes.ts (nur relative Importe, Kommentar wie in `auth.ts`)
```ts
import { relations, sql } from "drizzle-orm";
import { check, index, integer, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const INGREDIENT_TYPES = ["flour", "water", "starter", "salt", "other"] as const;
export const ingredientTypeEnum = pgEnum("ingredient_type", INGREDIENT_TYPES);
export type IngredientType = (typeof INGREDIENT_TYPES)[number];

export const recipes = pgTable("recipes", {
  id:                uuid("id").primaryKey().defaultRandom(),                       // Client-UUID wird akzeptiert
  userId:            text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name:              text("name").notNull(),
  description:       text("description"),                                           // null = leer
  targetDoughWeight: integer("target_dough_weight"),                                // Gramm, null = leer
  targetHydration:   numeric("target_hydration", { precision: 6, scale: 2, mode: "number" }),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Vom Client gesetzt ("letzte Änderung gewinnt"), bewusst KEIN $onUpdate.
  updatedAt:         timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("recipes_user_id_idx").on(t.userId),
  check("recipes_name_not_blank_check", sql`length(trim(${t.name})) > 0`),
  check("recipes_target_dough_weight_check", sql`${t.targetDoughWeight} >= 0`),
  check("recipes_target_hydration_check", sql`${t.targetHydration} >= 0`),
]);

export const recipeIngredients = pgTable("recipe_ingredients", {
  id:               uuid("id").primaryKey().defaultRandom(),
  recipeId:         uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  name:             text("name").notNull(),
  type:             ingredientTypeEnum("type").notNull(),
  amountGrams:      numeric("amount_grams", { precision: 10, scale: 2, mode: "number" }).notNull(),
  bakersPercent:    numeric("bakers_percent", { precision: 6, scale: 2, mode: "number" }).notNull(),
  starterHydration: numeric("starter_hydration", { precision: 6, scale: 2, mode: "number" }).notNull().default(100),
  position:         integer("position").notNull().default(0),
}, (t) => [
  index("recipe_ingredients_recipe_id_idx").on(t.recipeId),
  check("recipe_ingredients_name_not_blank_check", sql`length(trim(${t.name})) > 0`),
  check("recipe_ingredients_amount_grams_check", sql`${t.amountGrams} >= 0`),
  check("recipe_ingredients_bakers_percent_check", sql`${t.bakersPercent} >= 0`),
  check("recipe_ingredients_starter_hydration_check", sql`${t.starterHydration} >= 0`),
]);

// Einzige Relationsdefinition für "user". Weitere user-Relationen später hier ergänzen (nur ein relations() pro Tabelle).
export const userRelations = relations(user, ({ many }) => ({ recipes: many(recipes) }));
export const recipesRelations = relations(recipes, ({ one, many }) => ({
  user: one(user, { fields: [recipes.userId], references: [user.id] }),
  ingredients: many(recipeIngredients),
}));
export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
}));

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
```
Die Signaturen oben sind verbindlich für den Test-Writer: Exportnamen, TS-Feldnamen, SQL-Spalten- und Tabellennamen sowie die Relationsnamen `user.recipes`, `recipes.user`, `recipes.ingredients` und `recipeIngredients.recipe`. Die Namen der Constraints und Indizes sind Vorgabe, Tests sollen aber nur auf die Ablehnung prüfen (Insert wirft), nicht auf Fehlertexte.

### Datenfluss
`@/db/schema` (index) exportiert alles weiter. `src/db/index.ts` (`drizzle({ schema })`) und `src/test/pglite-db.ts` übernehmen Tabellen und Relationen automatisch, also gibt es `db.query.recipes` und `db.query.recipeIngredients`, und `db.query.user.findFirst({ with: { recipes: { with: { ingredients: true } } } })` funktioniert. Werte `NULL` erfüllen die Check-Constraints. Optionale Felder bleiben also leer erlaubt, nur negative Werte schlagen fehl.

### Hinweise für Tests (PGlite)
- Ungültige Werte, die TypeScript nicht zulässt (fehlender Name, unbekannter Enum-Wert, fehlende Pflichtzahl), per `db.execute(sql\`INSERT …\`)` oder mit `as never`-Cast einfügen. Erwartet wird `rejects.toThrow()`, danach ist die Tabelle leer.
- Zeitstempel: `updatedAt` vom Client, z. B. `new Date("2026-01-01T00:00:00.000Z")`. Zurückgelesen wird mit `toEqual` auf das `Date`.

## Arbeitsschritte
1. `src/db/schema/recipes.ts` anlegen: `INGREDIENT_TYPES`, `ingredientTypeEnum`, Tabelle `recipes` mit UUID-ID per `defaultRandom()`, `user_id`-FK mit Cascade, `name` als not null mit Check `recipes_name_not_blank_check` (`length(trim(name)) > 0`), optionalen Feldern, `created_at`/`updated_at` mit `defaultNow()` ohne `$onUpdate`, Index auf `user_id` sowie Checks ≥ 0 für Zielteiggewicht und Zielhydration (AC-1, AC-2, AC-5, AC-6, AC-8)
2. In derselben Datei die Tabelle `recipe_ingredients` anlegen: `recipe_id`-FK mit Cascade, `name` als not null mit Check `recipe_ingredients_name_not_blank_check` (`length(trim(name)) > 0`), Enum-Typ, `numeric(…,2)` mit `mode: "number"` für Menge, Bäckerprozent und Starter-Hydration (Default 100), `position` als not null mit Default 0, Index auf `recipe_id` sowie drei Checks ≥ 0 (AC-3, AC-4, AC-5, AC-6, AC-8)
3. Relationen `userRelations`, `recipesRelations`, `recipeIngredientsRelations` und die Typen `Recipe`, `NewRecipe`, `RecipeIngredient`, `NewRecipeIngredient`, `IngredientType` exportieren (AC-7)
4. `src/db/schema/index.ts` um `export * from "./recipes"` ergänzen (AC-7)
5. `npm run db:generate -- --name recipes` ausführen. Prüfen, dass genau `drizzle/0003_recipes.sql`, `drizzle/meta/0003_snapshot.json` und der Journal-Eintrag entstehen und das SQL `CREATE TYPE "public"."ingredient_type"`, beide Tabellen, beide Indizes, sieben `CHECK`s (fünf ≥ 0, zwei gegen leere Namen) und zwei `ON DELETE cascade` enthält. Ein zweites `db:generate` darf keine Datei erzeugen (AC-7)
6. Tests in `src/db/recipes-schema.test.ts` und `recipes-setup.test.ts` grün machen (sie werden vorher geschrieben). Danach `npm test` komplett und `npm run lint` ausführen. Die Bestandstests (`auth-setup.test.ts`, `db-setup.test.ts`, `auth-schema.test.ts`) bleiben unverändert grün (AC-1 bis AC-8)
7. `npm run db:migrate` gegen Neon ausführen (braucht `.env.local` und läuft manuell durch die Person) und das fehlerfreie Ergebnis im Review festhalten (AC-7)

## Teststrategie
Die Tests entstehen vor dem Code. Alle DB-Tests laufen mit `// @vitest-environment node` gegen `createTestDb()` aus `@/test/pglite-db` (echte Migrationen, keine Verbindung zu Neon), mit `beforeAll`-Timeout von 60 s wie in `preferences-route.test.ts`, `reset()` in `beforeEach` und Testpersonen mit `@example.com`-Adressen. Testnamen beginnen mit `F006/AC-n`.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Integration (PGlite) | src/db/recipes-schema.test.ts | Insert nur mit `{ userId, name: "Landbrot" }` liefert genau eine Zeile. `id` passt auf UUID-Regex, `description`, `targetDoughWeight` und `targetHydration` sind `null`, `createdAt` und `updatedAt` sind `Date` |
| AC-2 | Integration (PGlite) | src/db/recipes-schema.test.ts | `it.each` mit diesen Fällen: ohne `name` (Raw-SQL bzw. Cast), `name: ""`, `name: "   "` (nur Leerzeichen), `userId: "gibt-es-nicht"` (FK). Jeder Fall wirft, danach ist `recipes` leer. Gegenprobe: `name: " Landbrot "` wird gespeichert |
| AC-3 | Integration (PGlite) | src/db/recipes-schema.test.ts | Zwei Zutaten (`flour` mit 500 und 100, `starter` mit 100 und 20, ohne `starterHydration`). Gelesen über `db.query.recipes.findFirst({ with: { ingredients: true } })`: beide Zutaten hängen am Rezept, `amountGrams`/`bakersPercent` sind exakt `500`/`100` und `100`/`20` (Typ `number`), `starterHydration` ist bei beiden `100` |
| AC-4 | Integration (PGlite) | src/db/recipes-schema.test.ts | `it.each` mit diesen Fällen: ohne `name` (Raw-SQL bzw. Cast), `name: ""`, `name: "   "` (nur Leerzeichen), Typ `"yeast"`, ohne `amountGrams`, ohne `bakersPercent`, `amountGrams: -1`, `bakersPercent: -1`, `starterHydration: -1`, nicht existierende `recipeId` (zufällige UUID). Jeder Fall wirft, danach ist `recipe_ingredients` leer |
| AC-5 | Integration (PGlite) | src/db/recipes-schema.test.ts | (a) Rezept mit zwei Zutaten löschen, danach sind 0 Zutaten übrig. (b) Zwei Personen mit je einem Rezept und Zutaten, `user` von Person A löschen: Rezept und Zutaten von A sind weg, Rezept und Zutaten von B unverändert |
| AC-6 | Integration (PGlite) | src/db/recipes-schema.test.ts | `targetHydration: 75.5`, Zutat mit `amountGrams: 12.5`, `bakersPercent: 2.5`, `starterHydration: 80`. Zurückgelesen per `toBe` exakt `75.5`, `12.5`, `2.5`, `80` |
| AC-7 | Unit (Schema-Metadaten) | src/db/recipes-schema.test.ts | `@/db/schema` exportiert `recipes`, `recipeIngredients`, `ingredientTypeEnum`, `userRelations`, `recipesRelations`, `recipeIngredientsRelations`. Tabellennamen `recipes`/`recipe_ingredients`, `ingredientTypeEnum.enumValues` gleich den fünf Typen, Indizes auf `user_id` bzw. `recipe_id` (`getTableConfig`), Cascade-FKs. `db.query.recipes` und `db.query.recipeIngredients` aus `@/db` mit Dummy-URL sind definiert (Muster `auth-schema.test.ts`). Relationale Query `db.query.user.findFirst({ with: { recipes: { with: { ingredients: true } } } })` auf PGlite liefert die verschachtelten Daten |
| AC-7 | Unit (Dateisystem und CLI) | recipes-setup.test.ts | Journal: `entries[3].tag === "0003_recipes"`, genau eine Datei `drizzle/0003_*.sql` sowie `meta/0003_snapshot.json` vorhanden. Das SQL enthält `CREATE TABLE "recipes"`, `CREATE TABLE "recipe_ingredients"`, `CREATE TYPE "public"."ingredient_type"` und je einen FK mit `ON DELETE cascade`. Drift-Prüfung: `drizzle/` in ein Temp-Verzeichnis kopieren und `node node_modules/drizzle-kit/bin.cjs generate --dialect=postgresql --schema=<ROOT>/src/db/schema --out=<tmp>` per `spawnSync` ausführen (ohne `--config`, deshalb ohne DB-URL und ohne dotenv). Erwartet: Exit 0, die Dateiliste im Temp-Ordner ist unverändert. Timeout 60 s, Temp-Ordner in `finally` löschen |
| AC-7 | Manuell | – | `npm run db:migrate` gegen Neon läuft fehlerfrei (Schritt 7, Ergebnis im Review dokumentiert) |
| AC-8 | Integration (PGlite) | src/db/recipes-schema.test.ts | Insert mit `id: crypto.randomUUID()` und `updatedAt: new Date("2026-01-01T00:00:00.000Z")`: beide Werte kommen unverändert zurück. Drei Zutaten mit `position` 2, 1 und ohne Angabe: die ohne Angabe hat `0`, `orderBy: asc(position)` liefert 0, 1, 2. Insert mit `targetDoughWeight: -1` und mit `targetHydration: -0.5` wirft jeweils |

## Risiken & Rollback
- **Tabellennamen im Plural** (`recipes`, `recipe_ingredients`): Das Ticket gibt sie vor, die bestehenden Tabellen sind aber singular (`user`, `user_preference`). Der Plan folgt bewusst dem Ticket.
- **`relations(user, …)` liegt in `recipes.ts`**: Drizzle (v1-Relations) erwartet pro Tabelle eine Relationsdefinition. Spätere Features mit weiteren `user`-Relationen müssen `userRelations` erweitern statt eine zweite anzulegen.
- **Check-Constraints mit `${t.col}`**: drizzle-kit 0.31 schreibt die Spalte eventuell tabellenqualifiziert (`"recipes"."target_hydration"`). Postgres akzeptiert das in `CREATE TABLE`. Falls die Migration auf PGlite oder Neon scheitert, auf unqualifizierte Spalten umstellen (z. B. `sql\`"target_hydration" >= 0\``, `sql\`length(trim("name")) > 0\``) und neu generieren.
- **Enum-Erweiterung**: Neue Zutatentypen brauchen später `ALTER TYPE … ADD VALUE` (drizzle-kit erzeugt das). Werte entfernen ist aufwendig.
- **Genauigkeit**: `numeric(6,2)` begrenzt Bäckerprozent, Hydration und Starter-Hydration auf 9999.99, `numeric(10,2)` die Menge auf 99 999 999.99 g. Größere Werte wirft die DB als Überlauf ab. Fachlich genügt das.
- **AC-7 „gegen Neon“** ist nicht automatisiert testbar (keine Zugangsdaten in Tests), deshalb manueller Schritt 7.
- **Bestandstests**: `auth-setup.test.ts` und `db-setup.test.ts` prüfen nur 0000/0001 bzw. erlauben weitere Einträge, eine Anpassung ist nicht nötig.
- **Rollback**: Keine Daten betroffen, beide Tabellen sind neu und leer. Lokal: `drizzle/0003_recipes.sql`, `drizzle/meta/0003_snapshot.json`, den Journal-Eintrag, `src/db/schema/recipes.ts` und die Export-Zeile entfernen. Auf Neon zusätzlich `DROP TABLE "recipe_ingredients"; DROP TABLE "recipes"; DROP TYPE "ingredient_type";` und die Zeile für 0003 aus `drizzle.__drizzle_migrations` löschen. Alternativ: Commit revertieren und einen Neon-Branch vor der Migration wiederherstellen.

// Rezepte und Zutaten (F006). Nur relative Importe: drizzle-kit löst den "@/"-Alias nicht auf.
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const INGREDIENT_TYPES = ["flour", "water", "starter", "salt", "other"] as const;
export const ingredientTypeEnum = pgEnum("ingredient_type", INGREDIENT_TYPES);
export type IngredientType = (typeof INGREDIENT_TYPES)[number];

export const recipes = pgTable(
  "recipes",
  {
    // DB-erzeugte UUID; eine vom Client mitgegebene UUID wird ebenfalls akzeptiert.
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // null = leer
    description: text("description"),
    // Gramm, null = leer
    targetDoughWeight: integer("target_dough_weight"),
    targetHydration: numeric("target_hydration", { precision: 6, scale: 2, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Vom Client gesetzt ("letzte Änderung gewinnt"), bewusst KEIN $onUpdate.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("recipes_user_id_idx").on(t.userId),
    check("recipes_name_not_blank_check", sql`length(trim(${t.name})) > 0`),
    check("recipes_target_dough_weight_check", sql`${t.targetDoughWeight} >= 0`),
    check("recipes_target_hydration_check", sql`${t.targetHydration} >= 0`),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: ingredientTypeEnum("type").notNull(),
    amountGrams: numeric("amount_grams", { precision: 10, scale: 2, mode: "number" }).notNull(),
    bakersPercent: numeric("bakers_percent", { precision: 6, scale: 2, mode: "number" }).notNull(),
    // Fachlich nur bei type = "starter" ausgewertet.
    starterHydration: numeric("starter_hydration", { precision: 6, scale: 2, mode: "number" })
      .notNull()
      .default(100),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("recipe_ingredients_recipe_id_idx").on(t.recipeId),
    check("recipe_ingredients_name_not_blank_check", sql`length(trim(${t.name})) > 0`),
    check("recipe_ingredients_amount_grams_check", sql`${t.amountGrams} >= 0`),
    check("recipe_ingredients_bakers_percent_check", sql`${t.bakersPercent} >= 0`),
    check("recipe_ingredients_starter_hydration_check", sql`${t.starterHydration} >= 0`),
  ],
);

// Einzige Relationsdefinition für "user". Weitere user-Relationen später hier ergänzen
// (nur ein relations() pro Tabelle).
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

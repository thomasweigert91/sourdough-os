CREATE TYPE "public"."ingredient_type" AS ENUM('flour', 'water', 'starter', 'salt', 'other');--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "ingredient_type" NOT NULL,
	"amount_grams" numeric(10, 2) NOT NULL,
	"bakers_percent" numeric(6, 2) NOT NULL,
	"starter_hydration" numeric(6, 2) DEFAULT 100 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipe_ingredients_name_not_blank_check" CHECK (length(trim("recipe_ingredients"."name")) > 0),
	CONSTRAINT "recipe_ingredients_amount_grams_check" CHECK ("recipe_ingredients"."amount_grams" >= 0),
	CONSTRAINT "recipe_ingredients_bakers_percent_check" CHECK ("recipe_ingredients"."bakers_percent" >= 0),
	CONSTRAINT "recipe_ingredients_starter_hydration_check" CHECK ("recipe_ingredients"."starter_hydration" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_dough_weight" integer,
	"target_hydration" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_name_not_blank_check" CHECK (length(trim("recipes"."name")) > 0),
	CONSTRAINT "recipes_target_dough_weight_check" CHECK ("recipes"."target_dough_weight" >= 0),
	CONSTRAINT "recipes_target_hydration_check" CHECK ("recipes"."target_hydration" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipes_user_id_idx" ON "recipes" USING btree ("user_id");
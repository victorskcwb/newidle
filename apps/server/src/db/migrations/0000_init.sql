CREATE TYPE "public"."account_mode" AS ENUM('normal', 'self_sufficient', 'hardcore');--> statement-breakpoint
CREATE TYPE "public"."account_role" AS ENUM('player', 'admin');--> statement-breakpoint
CREATE TYPE "public"."equip_slot" AS ENUM('head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring', 'tool');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('starter', 'action', 'combat', 'death', 'equip', 'market', 'shop', 'admin');--> statement-breakpoint
CREATE TYPE "public"."slot_id" AS ENUM('main', 'secondary');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"mode" "account_mode" DEFAULT 'normal' NOT NULL,
	"role" "account_role" DEFAULT 'player' NOT NULL,
	"subscription_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"banned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_items" (
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"qty" bigint NOT NULL,
	"tab" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "bank_items_character_id_item_id_pk" PRIMARY KEY("character_id","item_id"),
	CONSTRAINT "bank_items_qty_pos" CHECK ("bank_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "bestiary" (
	"character_id" uuid NOT NULL,
	"monster_id" text NOT NULL,
	"kills" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "bestiary_character_id_monster_id_pk" PRIMARY KEY("character_id","monster_id")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"region_id" text DEFAULT 'brumaporto' NOT NULL,
	"hp" integer NOT NULL,
	"appearance" jsonb NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_coins_nonneg" CHECK ("characters"."coins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"character_id" uuid NOT NULL,
	"slot" "equip_slot" NOT NULL,
	"item_id" text NOT NULL,
	CONSTRAINT "equipment_character_id_slot_pk" PRIMARY KEY("character_id","slot")
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid,
	"character_id" uuid,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"delta" bigint NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_ledger_delta_nonzero" CHECK ("item_ledger"."delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "mastery" (
	"character_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mastery_character_id_action_id_pk" PRIMARY KEY("character_id","action_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"character_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"xp_tenths" integer DEFAULT 0 NOT NULL,
	"echo_stars" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "skills_character_id_skill_id_pk" PRIMARY KEY("character_id","skill_id"),
	CONSTRAINT "skills_xp_nonneg" CHECK ("skills"."xp_tenths" >= 0)
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"character_id" uuid NOT NULL,
	"slot" "slot_id" NOT NULL,
	"state" jsonb NOT NULL,
	"resolved_tick" integer NOT NULL,
	"seed" integer[] NOT NULL,
	"restarts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_character_id_slot_pk" PRIMARY KEY("character_id","slot")
);
--> statement-breakpoint
ALTER TABLE "bank_items" ADD CONSTRAINT "bank_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bestiary" ADD CONSTRAINT "bestiary_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_ledger" ADD CONSTRAINT "item_ledger_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery" ADD CONSTRAINT "mastery_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_account_key" ON "characters" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_name_key" ON "characters" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "event_log_character_idx" ON "event_log" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE INDEX "item_ledger_character_item_idx" ON "item_ledger" USING btree ("character_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");
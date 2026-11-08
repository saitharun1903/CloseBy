CREATE TYPE "public"."media_kind" AS ENUM('file', 'url');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('host', 'guest');--> statement-breakpoint
CREATE TYPE "public"."playback_status" AS ENUM('playing', 'paused');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('open', 'ended');--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text NOT NULL,
	"role" "participant_role" NOT NULL,
	"display_name" text NOT NULL,
	"avatar_hue" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playback_states" (
	"room_id" text PRIMARY KEY NOT NULL,
	"media_id" uuid,
	"status" "playback_status" DEFAULT 'paused' NOT NULL,
	"position_sec" double precision DEFAULT 0 NOT NULL,
	"rate" double precision DEFAULT 1 NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "queue_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"file_name" text,
	"file_size" bigint,
	"duration_sec" double precision,
	"sort_key" double precision NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "room_status" DEFAULT 'open' NOT NULL,
	"invite_token_hash" text NOT NULL,
	"invite_token_enc" text NOT NULL,
	"pin_hash" text,
	"max_participants" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_states" ADD CONSTRAINT "playback_states_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participants_room_active_idx" ON "participants" USING btree ("room_id") WHERE "participants"."released_at" is null;--> statement-breakpoint
CREATE INDEX "queue_items_room_sort_idx" ON "queue_items" USING btree ("room_id","sort_key");--> statement-breakpoint
CREATE INDEX "rooms_expires_at_idx" ON "rooms" USING btree ("expires_at");
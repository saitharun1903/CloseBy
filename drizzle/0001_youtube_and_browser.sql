ALTER TYPE "public"."media_kind" ADD VALUE 'youtube';--> statement-breakpoint
ALTER TABLE "queue_items" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "queue_items" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "browser_session_id" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "browser_embed_enc" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "browser_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "browser_started_by" uuid;
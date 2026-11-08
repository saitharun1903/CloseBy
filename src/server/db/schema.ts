import { sql } from "drizzle-orm";
import {
  bigint,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const roomStatus = pgEnum("room_status", ["open", "ended"]);
export const participantRole = pgEnum("participant_role", ["host", "guest"]);
export const mediaKind = pgEnum("media_kind", ["file", "url"]);
export const playbackStatus = pgEnum("playback_status", ["playing", "paused"]);

/**
 * A private room. Secrets are never stored in plaintext:
 *  - invite_token_hash: SHA-256 of the invite token (for verification)
 *  - invite_token_enc:  AES-256-GCM ciphertext so the *host* can re-copy the link
 *  - pin_hash:          scrypt hash of the optional PIN
 */
export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    status: roomStatus("status").notNull().default("open"),
    inviteTokenHash: text("invite_token_hash").notNull(),
    inviteTokenEnc: text("invite_token_enc").notNull(),
    pinHash: text("pin_hash"),
    maxParticipants: integer("max_participants").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("rooms_expires_at_idx").on(t.expiresAt)],
);

/** A seat in a room. A seat survives refreshes (cookie-bound) until released. */
export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    role: participantRole("role").notNull(),
    displayName: text("display_name").notNull(),
    avatarHue: integer("avatar_hue").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [index("participants_room_active_idx").on(t.roomId).where(sql`${t.releasedAt} is null`)],
);

/** Shared watchlist. Local files are stored as metadata only (name/size/duration) — never uploaded. */
export const queueItems = pgTable(
  "queue_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    fileName: text("file_name"),
    fileSize: bigint("file_size", { mode: "number" }),
    durationSec: doublePrecision("duration_sec"),
    sortKey: doublePrecision("sort_key").notNull(),
    addedBy: uuid("added_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("queue_items_room_sort_idx").on(t.roomId, t.sortKey)],
);

/**
 * The authoritative playback state for a room. Clients send *intents*; the
 * server serialises them, stamps them with server time and a version, and
 * broadcasts the result. Position is defined at `updated_at_ms`.
 */
export const playbackStates = pgTable("playback_states", {
  roomId: text("room_id")
    .primaryKey()
    .references(() => rooms.id, { onDelete: "cascade" }),
  mediaId: uuid("media_id"),
  status: playbackStatus("status").notNull().default("paused"),
  positionSec: doublePrecision("position_sec").notNull().default(0),
  rate: doublePrecision("rate").notNull().default(1),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  version: integer("version").notNull().default(0),
  updatedBy: uuid("updated_by"),
});

export type Room = typeof rooms.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type QueueItem = typeof queueItems.$inferSelect;
export type PlaybackStateRow = typeof playbackStates.$inferSelect;

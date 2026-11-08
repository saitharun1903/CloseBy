import { z } from "zod";
import type { PlaybackState } from "./playback";

/* ─────────────────────────── API shapes ─────────────────────────── */

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Please enter a name")
  .max(32, "Keep it under 32 characters")
  .refine((s) => !/[\u0000-\u001f\u007f<>]/.test(s), "That name has characters we can’t display");

export const pinSchema = z.string().regex(/^\d{4,8}$/, "PIN must be 4–8 digits");

export const createRoomBody = z.object({
  displayName: displayNameSchema,
  pin: pinSchema.optional(),
});

export const previewRoomBody = z.object({ inviteToken: z.string().min(20).max(128) });

export const joinRoomBody = z.object({
  inviteToken: z.string().min(20).max(128),
  displayName: displayNameSchema,
  pin: z.string().max(8).optional(),
});

export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url("That doesn’t look like a link")
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) links are supported");

export const playbackIntentBody = z.object({
  baseVersion: z.number().int().min(0),
  intent: z.discriminatedUnion("type", [
    z.object({ type: z.literal("play"), positionSec: z.number().min(0).max(1e6) }),
    z.object({ type: z.literal("pause"), positionSec: z.number().min(0).max(1e6) }),
    z.object({ type: z.literal("seek"), positionSec: z.number().min(0).max(1e6) }),
    z.object({ type: z.literal("rate"), rate: z.number().min(0.5).max(2) }),
    z.object({ type: z.literal("load"), mediaId: z.string().uuid().nullable() }),
  ]),
});

export const addQueueItemBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("url"),
    url: httpUrlSchema,
    title: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    kind: z.literal("file"),
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().min(0).max(2 ** 46),
    durationSec: z.number().min(0).max(1e6).nullable().optional(),
    title: z.string().trim().min(1).max(120).optional(),
  }),
]);

export const reorderQueueBody = z.object({ orderedIds: z.array(z.string().uuid()).max(200) });

export interface ParticipantDTO {
  id: string;
  role: "host" | "guest";
  displayName: string;
  avatarHue: number;
}

export interface QueueItemDTO {
  id: string;
  kind: "file" | "url";
  title: string;
  url: string | null;
  fileName: string | null;
  fileSize: number | null;
  durationSec: number | null;
  addedBy: string | null;
}

export interface RoomStateDTO {
  room: { id: string; expiresAt: string; hasPin: boolean; maxParticipants: number };
  me: ParticipantDTO;
  participants: ParticipantDTO[];
  playback: PlaybackState;
  queue: QueueItemDTO[];
  serverNowMs: number;
  /** Only present for the host. */
  inviteUrl?: string;
}

export interface ApiError {
  error: { code: string; message: string };
}

/* ───────────────────────── Realtime messages ───────────────────────── */

/** Server → clients (sent with no participant; clients must reject these topics from peers). */
export const SERVER_TOPIC = "cb.server";
export type ServerMessage =
  | { kind: "playback"; state: PlaybackState }
  | { kind: "queue"; items: QueueItemDTO[] }
  | { kind: "participants"; participants: ParticipantDTO[] }
  | { kind: "room-ended" };

/** Peer ↔ peer topics. */
export const PEER_TOPICS = {
  chat: "cb.chat",
  chatHistory: "cb.chat.history",
  reaction: "cb.react",
  ping: "cb.ping",
  media: "cb.media",
} as const;

export const REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🍿"] as const;

export const chatMessageSchema = z.object({
  id: z.string().min(8).max(64),
  text: z.string().min(1).max(1000),
  sentAt: z.number(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema> & { from: string; mine: boolean };

export const chatHistorySchema = z.object({
  messages: z.array(chatMessageSchema.extend({ from: z.string().max(64) })).max(200),
});

export const reactionSchema = z.object({ emoji: z.enum(REACTIONS) });
export const pingSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const mediaReadySchema = z.object({
  mediaId: z.string().nullable(),
  ready: z.boolean(),
  fileName: z.string().max(255).nullable(),
  fileSize: z.number().nullable(),
  durationSec: z.number().nullable(),
});
export type MediaReady = z.infer<typeof mediaReadySchema>;

"use client";
import { create } from "zustand";
import type { PlaybackState } from "@/lib/playback";
import type { BrowserStateDTO, ChatMessage, MediaReady, ParticipantDTO, QueueItemDTO, RoomStateDTO } from "@/lib/protocol";
import { loadSoundPrefs, saveSoundPrefs, type SoundPrefs } from "@/lib/prefs";

export type ConnState = "connecting" | "connected" | "reconnecting" | "disconnected" | "ended";
export type SyncState = "idle" | "synced" | "correcting" | "buffering" | "waiting-file";
export type LayoutPref = "auto" | "cinema" | "face" | "screen" | "compact";
export type Panel = "chat" | "queue" | null;

export interface EndInfo {
  title: string;
  body: string;
  canRejoin: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  mine: boolean;
  x: number;
}
export interface Ping {
  id: string;
  x: number;
  y: number;
  mine: boolean;
}

export interface RoomStore {
  roomId: string;
  me: ParticipantDTO;
  participants: ParticipantDTO[];
  playback: PlaybackState;
  queue: QueueItemDTO[];
  inviteUrl?: string;
  expiresAt: string;
  hasPin: boolean;
  browser: BrowserStateDTO;
  features: { youtubeSearch: boolean; sharedBrowser: boolean };
  /** The "Watch together" picker. */
  watchOpen: boolean;
  /** The full-screen YouTube home. */
  ytOpen: boolean;

  conn: ConnState;
  end?: EndInfo;
  /** Bumped on any LiveKit change so track-rendering components re-read the Room. */
  lk: number;
  clockOffsetMs: number;
  clockReady: boolean;

  chat: ChatMessage[];
  unread: number;
  panel: Panel;
  reactions: FloatingReaction[];
  pings: Ping[];
  partnerMedia: MediaReady | null;
  /** Someone is talking right now (drives auto-lowering of the film). */
  talking: boolean;
  /** Shared sleep timer (server-time deadline) and who set it. */
  sleepTimer: { endsAt: number; minutes: number; byMe: boolean } | null;
  sync: SyncState;
  layoutPref: LayoutPref;
  sound: SoundPrefs;
  mediaMuted: boolean;
  audioBlocked: boolean;
  /** Whether *my* screen share carries audio. */
  myShareAudio: "none" | "with-audio" | "no-audio";
  controlsVisible: boolean;
  /** Local files picked per queue item (in memory only — never uploaded). */
  localFiles: Record<string, File>;
}

export const useRoom = create<RoomStore>(() => ({}) as RoomStore);

export function initRoomStore(s: RoomStateDTO) {
  useRoom.setState(
    {
      roomId: s.room.id,
      me: s.me,
      participants: s.participants,
      playback: s.playback,
      queue: s.queue,
      inviteUrl: s.inviteUrl,
      expiresAt: s.room.expiresAt,
      hasPin: s.room.hasPin,
      browser: s.browser,
      features: s.features,
      watchOpen: false,
      ytOpen: false,
      conn: "connecting",
      end: undefined,
      lk: 0,
      clockOffsetMs: s.serverNowMs - Date.now(),
      clockReady: false,
      chat: [],
      unread: 0,
      panel: null,
      reactions: [],
      pings: [],
      partnerMedia: null,
      talking: false,
      sleepTimer: null,
      sync: "idle",
      layoutPref: "auto",
      sound: loadSoundPrefs(),
      mediaMuted: false,
      audioBlocked: false,
      myShareAudio: "none",
      controlsVisible: true,
      localFiles: {},
    },
    true,
  );
}

export function setSound(patch: Partial<SoundPrefs>) {
  const sound = { ...useRoom.getState().sound, ...patch };
  saveSoundPrefs(sound);
  useRoom.setState({ sound });
}

export const serverNow = () => Date.now() + useRoom.getState().clockOffsetMs;

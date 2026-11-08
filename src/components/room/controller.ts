"use client";
import {
  ConnectionState,
  DisconnectReason,
  LocalAudioTrack,
  LocalVideoTrack,
  type RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type Participant, AudioPresets } from "livekit-client";
import { toast } from "@/components/toaster";
import { api, ApiRequestError } from "@/lib/api";
import { estimateClockOffset, isNewer, type ClockSample, type PlaybackIntent, type PlaybackState } from "@/lib/playback";
import {
  chatHistorySchema,
  chatMessageSchema,
  mediaReadySchema,
  PEER_TOPICS,
  pingSchema,
  reactionSchema,
  SERVER_TOPIC,
  type ChatMessage,
  type MediaReady,
  type QueueItemDTO,
  type RoomStateDTO,
  type ServerMessage,
} from "@/lib/protocol";
import { useRoom } from "./store";
import { takeToken } from "./token-cache";
import { browserProfile, nearestBrowserRegion } from "./browser-profile";

const enc = new TextEncoder();
const dec = new TextDecoder();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export interface InitialMedia {
  audio?: LocalAudioTrack;
  video?: LocalVideoTrack;
  micOn: boolean;
  camOn: boolean;
  audioInput?: string;
  videoInput?: string;
  audioOutput?: string;
}

/** Chat messages live only in the two browsers, and fade out after this long. */
export const CHAT_TTL_MS = 60 * 60_000;

function makeRoom(audioOutput?: string) {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    audioOutput: audioOutput ? { deviceId: audioOutput } : undefined,
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
      // Higher-bitrate Opus: clearer voices, especially over film sound.
      audioPreset: AudioPresets.musicHighQuality,
      dtx: true,
      red: true,
    },
  });
}

/**
 * Owns the LiveKit Room and all realtime plumbing for one room page.
 * React components read state from the zustand store and call methods here.
 */
export class RoomController {
  room: Room;
  readonly roomId: string;
  private disposed = false;
  private clockTimer?: ReturnType<typeof setInterval>;
  private chatTimer?: ReturnType<typeof setInterval>;
  private stateTimer?: ReturnType<typeof setInterval>;
  private retry = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private lastMediaReady: MediaReady | null = null;

  constructor(roomId: string, private initial: InitialMedia) {
    this.roomId = roomId;
    this.room = makeRoom(initial.audioOutput);
  }

  /* ───────────── lifecycle ───────────── */

  async start() {
    // Test-only handle so E2E tests can inspect real WebRTC stats. Never set in production builds.
    if (process.env.NEXT_PUBLIC_E2E === "1") Object.assign(window, { __cb: this, __cbStore: useRoom });
    this.wire(this.room);
    void this.syncClock();
    this.clockTimer = setInterval(() => void this.syncClock(), 60_000);
    this.chatTimer = setInterval(() => this.expireChat(), 30_000);
    // Safety net: server broadcasts are best-effort, so re-sync periodically. Playback merges by
    // version, so this can never roll state back.
    this.stateTimer = setInterval(() => {
      if (useRoom.getState().conn === "connected" && document.visibilityState === "visible") void this.refreshState();
    }, 10_000);
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("online", this.onOnline);
    await this.connect(true);
  }

  private onVisible = () => {
    if (document.visibilityState === "visible" && useRoom.getState().conn === "connected") void this.refreshState();
  };

  private onOnline = () => {
    if (useRoom.getState().conn === "disconnected" && useRoom.getState().end?.canRejoin) void this.rejoin();
  };

  private async connect(first: boolean) {
    useRoom.setState({ conn: "connecting", end: undefined });
    let token: { token: string; url: string };
    try {
      token = (first && takeToken(this.roomId)) || (await api("/api/rooms/" + this.roomId + "/token", { method: "POST", body: {} }));
    } catch (e) {
      this.handleApiFatal(e);
      return;
    }
    try {
      await this.room.connect(token.url, token.token, { autoSubscribe: true });
    } catch (e) {
      console.warn("[room] connect failed", e);
      this.setDisconnected({
        title: "Couldn’t connect to the call",
        body: "The media server didn’t answer. Check your connection — we’ll keep trying.",
        canRejoin: true,
      });
      this.scheduleRetry();
      return;
    }
    this.retry = 0;
    void this.refreshState();
    await this.publishInitial(first);
    this.bump();
  }

  private async publishInitial(first: boolean) {
    const lp = this.room.localParticipant;
    const { audio, video, micOn, camOn } = this.initial;
    // Mic and camera publish in parallel — each negotiates separately.
    await Promise.all([
      (async () => {
        try {
          if (first && audio) {
            // Mute before publishing so not a single frame of audio leaves when the mic is "off".
            if (!micOn) await audio.mute();
            await lp.publishTrack(audio, { source: Track.Source.Microphone });
          } else if (micOn) await lp.setMicrophoneEnabled(true, this.initial.audioInput ? { deviceId: this.initial.audioInput } : undefined);
        } catch (e) {
          this.mediaError("microphone", e);
        }
      })(),
      (async () => {
        try {
          if (first && video && camOn) await lp.publishTrack(video, { source: Track.Source.Camera });
          else if (camOn) await lp.setCameraEnabled(true, this.initial.videoInput ? { deviceId: this.initial.videoInput } : undefined);
        } catch (e) {
          this.mediaError("camera", e);
        }
        if (first && video && !camOn) video.stop();
      })(),
    ]);
  }

  async rejoin() {
    clearTimeout(this.retryTimer);
    // Remember current device state so the rejoin feels seamless.
    const lp = this.room.localParticipant;
    this.initial = { ...this.initial, micOn: lp.isMicrophoneEnabled || this.initial.micOn, camOn: lp.isCameraEnabled || this.initial.camOn, audio: undefined, video: undefined };
    try {
      await this.room.disconnect(true);
    } catch {
      /* ignore */
    }
    this.room.removeAllListeners();
    this.room = makeRoom(this.initial.audioOutput);
    this.wire(this.room);
    this.bump();
    await this.connect(false);
  }

  private scheduleRetry() {
    if (this.disposed) return;
    clearTimeout(this.retryTimer);
    const delay = Math.min(30_000, 2_000 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => {
      if (navigator.onLine !== false) void this.rejoin();
      else this.scheduleRetry();
    }, delay);
  }

  async leave(opts: { releaseSeat: boolean }) {
    if (opts.releaseSeat) {
      await api(`/api/rooms/${this.roomId}/leave`, { method: "POST", body: {} }).catch(() => {});
    }
    await this.dispose();
  }

  async endForEveryone() {
    await api(`/api/rooms/${this.roomId}/end`, { method: "POST", body: {} });
    useRoom.setState({ conn: "ended", end: { title: "You ended the room", body: "The link no longer works. Thanks for watching together.", canRejoin: false } });
    await this.dispose();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.clockTimer);
    clearInterval(this.chatTimer);
    clearInterval(this.stateTimer);
    document.removeEventListener("visibilitychange", this.onVisible);
    clearTimeout(this.retryTimer);
    window.removeEventListener("online", this.onOnline);
    for (const pub of this.room.localParticipant.trackPublications.values()) pub.track?.stop();
    this.initial.audio?.stop();
    this.initial.video?.stop();
    await this.room.disconnect(true).catch(() => {});
    this.room.removeAllListeners();
  }

  /* ───────────── state sync ───────────── */

  bump = () => useRoom.setState((s) => ({ lk: s.lk + 1 }));

  async refreshState() {
    try {
      const s = await api<RoomStateDTO>(`/api/rooms/${this.roomId}/state`);
      const cur = useRoom.getState();
      useRoom.setState({
        participants: s.participants,
        queue: s.queue,
        inviteUrl: s.inviteUrl ?? cur.inviteUrl,
        browser: s.browser,
        features: s.features,
        playback: isNewer(s.playback, cur.playback) ? s.playback : cur.playback,
      });
    } catch (e) {
      this.handleApiFatal(e);
    }
  }

  private async syncClock() {
    const samples: ClockSample[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const wall0 = Date.now();
      try {
        const r = await api<{ now: number }>("/api/time");
        const t1 = performance.now();
        samples.push({ t0: wall0, t1: wall0 + (t1 - t0), server: r.now });
      } catch {
        /* skip */
      }
    }
    const est = estimateClockOffset(samples);
    if (est) useRoom.setState({ clockOffsetMs: est.offsetMs, clockReady: true });
  }

  private applyServer(msg: ServerMessage) {
    const s = useRoom.getState();
    switch (msg.kind) {
      case "playback":
        if (isNewer(msg.state, s.playback)) {
          const switched = msg.state.mediaId && msg.state.mediaId !== s.playback.mediaId && msg.state.updatedBy && msg.state.updatedBy !== s.me.id;
          useRoom.setState({ playback: msg.state });
          if (switched) {
            const title = useRoom.getState().queue.find((q) => q.id === msg.state.mediaId)?.title;
            toast({ title: `${this.partnerName() ?? "Your partner"} started something`, body: title });
          }
        }
        break;
      case "queue":
        useRoom.setState({ queue: msg.items });
        break;
      case "participants":
        useRoom.setState({ participants: msg.participants });
        break;
      case "browser":
        useRoom.setState({ browser: msg.browser });
        break;
      case "room-ended":
        useRoom.setState({
          conn: "ended",
          end: s.me.role === "host"
            ? { title: "The room has ended", body: "This room is closed and the link no longer works.", canRejoin: false }
            : { title: `${this.hostName()} ended the room`, body: "Thanks for watching together. The link no longer works.", canRejoin: false },
        });
        void this.dispose();
        break;
    }
  }

  private hostName() {
    return useRoom.getState().participants.find((p) => p.role === "host")?.displayName ?? "The host";
  }

  /* ───────────── playback ───────────── */

  async sendIntent(intent: PlaybackIntent): Promise<PlaybackState | null> {
    const base = useRoom.getState().playback.version;
    try {
      const r = await api<{ accepted: boolean; state: PlaybackState }>(`/api/rooms/${this.roomId}/playback`, {
        body: { baseVersion: base, intent },
      });
      if (isNewer(r.state, useRoom.getState().playback)) useRoom.setState({ playback: r.state });
      return r.state;
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        // Conflict: someone else acted at the same moment. Adopt their state.
        const body = e.body as { state?: PlaybackState; reason?: string } | undefined;
        if (body?.state) useRoom.setState({ playback: body.state });
        if (body?.reason === "conflict") toast({ title: `${this.partnerName() ?? "Your partner"} got there first`, body: "Following their change." });
        return body?.state ?? null;
      }
      this.handleApiError(e, "Couldn’t update playback");
      return null;
    }
  }

  async startBrowser(startUrl?: string) {
    type R = { embedUrl: string; browser: import("@/lib/protocol").BrowserStateDTO; profileId: string | null };
    let profile = browserProfile.wanted();
    const region = await nearestBrowserRegion();
    let r: R;
    try {
      r = await api<R>(`/api/rooms/${this.roomId}/browser`, { body: { startUrl, profile, region } });
    } catch (e) {
      // A saved profile can expire on the provider's side: start a fresh one instead.
      if (!profile || profile === "new") throw e;
      browserProfile.save("");
      profile = "new";
      r = await api<R>(`/api/rooms/${this.roomId}/browser`, { body: { startUrl, profile, region } });
    }
    if (profile && r.profileId) browserProfile.save(r.profileId);
    useRoom.setState({ browser: r.browser, playback: { ...useRoom.getState().playback } });
    void this.refreshState();
    return r.embedUrl;
  }

  async getBrowserEmbed(): Promise<string | null> {
    const r = await api<{ embedUrl: string | null; browser: import("@/lib/protocol").BrowserStateDTO }>(`/api/rooms/${this.roomId}/browser`);
    useRoom.setState({ browser: r.browser });
    return r.embedUrl;
  }

  async stopBrowser() {
    const r = await api<{ browser: import("@/lib/protocol").BrowserStateDTO }>(`/api/rooms/${this.roomId}/browser`, { method: "DELETE" });
    useRoom.setState({ browser: r.browser });
  }

  async addToQueue(body: { kind: "url"; url: string; title?: string } | { kind: "youtube"; url: string } | { kind: "file"; fileName: string; fileSize: number; durationSec?: number | null }) {
    const r = await api<{ item: QueueItemDTO; items: QueueItemDTO[] }>(`/api/rooms/${this.roomId}/queue`, { body });
    useRoom.setState({ queue: r.items });
    return r.item;
  }

  async removeFromQueue(id: string) {
    const r = await api<{ items: QueueItemDTO[] }>(`/api/rooms/${this.roomId}/queue/${id}`, { method: "DELETE" });
    useRoom.setState({ queue: r.items });
  }

  async reorderQueue(orderedIds: string[]) {
    useRoom.setState((s) => ({ queue: orderedIds.map((id) => s.queue.find((q) => q.id === id)!).filter(Boolean) }));
    try {
      const r = await api<{ items: QueueItemDTO[] }>(`/api/rooms/${this.roomId}/queue`, { method: "PATCH", body: { orderedIds } });
      useRoom.setState({ queue: r.items });
    } catch (e) {
      this.handleApiError(e, "Couldn’t reorder");
      void this.refreshState();
    }
  }

  /* ───────────── peer messages ───────────── */

  private async publish(topic: string, payload: unknown, opts: { reliable?: boolean; to?: string[] } = {}) {
    if (this.room.state !== ConnectionState.Connected) return false;
    try {
      await this.room.localParticipant.publishData(enc.encode(JSON.stringify(payload)), {
        reliable: opts.reliable ?? true,
        topic,
        destinationIdentities: opts.to,
      });
      return true;
    } catch (e) {
      console.warn("[room] publishData failed", e);
      return false;
    }
  }

  partner(): RemoteParticipant | undefined {
    return [...this.room.remoteParticipants.values()][0];
  }

  partnerName() {
    const me = useRoom.getState().me;
    return useRoom.getState().participants.find((p) => p.id !== me.id)?.displayName;
  }

  async sendChat(text: string) {
    const msg = { id: uid(), text: text.slice(0, 1000), sentAt: Date.now() };
    const me = useRoom.getState().me;
    useRoom.setState((s) => ({ chat: [...s.chat, { ...msg, from: me.id, mine: true }].slice(-200) }));
    const ok = await this.publish(PEER_TOPICS.chat, msg);
    if (!ok) toast({ tone: "error", title: "Message not sent", body: "You’re offline right now. It will stay here on your side." });
  }

  sendReaction(emoji: string) {
    this.showReaction(emoji, true);
    void this.publish(PEER_TOPICS.reaction, { emoji }, { reliable: false });
  }

  sendPing(x: number, y: number) {
    this.showPing(x, y, true);
    void this.publish(PEER_TOPICS.ping, { x, y }, { reliable: false });
  }

  announceMedia(m: MediaReady) {
    this.lastMediaReady = m;
    void this.publish(PEER_TOPICS.media, m);
  }

  private showReaction(emoji: string, mine: boolean) {
    const r = { id: uid(), emoji, mine, x: 0.15 + Math.random() * 0.7 };
    useRoom.setState((s) => ({ reactions: [...s.reactions, r].slice(-12) }));
    setTimeout(() => useRoom.setState((s) => ({ reactions: s.reactions.filter((x) => x.id !== r.id) })), 2600);
  }

  private showPing(x: number, y: number, mine: boolean) {
    const p = { id: uid(), x, y, mine };
    useRoom.setState((s) => ({ pings: [...s.pings, p].slice(-6) }));
    setTimeout(() => useRoom.setState((s) => ({ pings: s.pings.filter((q) => q.id !== p.id) })), 1800);
  }

  private expireChat() {
    const cutoff = Date.now() - CHAT_TTL_MS;
    const chat = useRoom.getState().chat;
    if (chat.some((m) => m.sentAt < cutoff)) useRoom.setState({ chat: chat.filter((m) => m.sentAt >= cutoff) });
  }

  private onData = (payload: Uint8Array, participant?: Participant, _kind?: unknown, topic?: string) => {
    let data: unknown;
    try {
      data = JSON.parse(dec.decode(payload));
    } catch {
      return;
    }
    // Server messages have no sending participant. Peers can't forge this topic.
    if (topic === SERVER_TOPIC) {
      if (!participant) this.applyServer(data as ServerMessage);
      return;
    }
    if (!participant) return;
    const me = useRoom.getState().me;
    switch (topic) {
      case PEER_TOPICS.chat: {
        const m = chatMessageSchema.safeParse(data);
        if (!m.success) return;
        const s = useRoom.getState();
        if (s.chat.some((c) => c.id === m.data.id)) return;
        const open = s.panel === "chat";
        useRoom.setState({ chat: [...s.chat, { ...m.data, from: participant.identity, mine: false }].slice(-200), unread: open ? 0 : s.unread + 1 });
        break;
      }
      case PEER_TOPICS.chatHistory: {
        const h = chatHistorySchema.safeParse(data);
        if (!h.success) return;
        const s = useRoom.getState();
        const known = new Set(s.chat.map((c) => c.id));
        // Only accept messages authored by me or by the sender.
        const incoming = h.data.messages
          .filter((m) => !known.has(m.id) && (m.from === me.id || m.from === participant.identity))
          .map((m) => ({ ...m, mine: m.from === me.id }));
        if (incoming.length) useRoom.setState({ chat: [...s.chat, ...incoming].sort((a, b) => a.sentAt - b.sentAt).slice(-200) });
        break;
      }
      case PEER_TOPICS.reaction: {
        const r = reactionSchema.safeParse(data);
        if (r.success) this.showReaction(r.data.emoji, false);
        break;
      }
      case PEER_TOPICS.ping: {
        const p = pingSchema.safeParse(data);
        if (p.success) this.showPing(p.data.x, p.data.y, false);
        break;
      }
      case PEER_TOPICS.media: {
        const m = mediaReadySchema.safeParse(data);
        if (m.success) useRoom.setState({ partnerMedia: m.data });
        break;
      }
    }
  };

  /* ───────────── LiveKit events ───────────── */

  private wire(room: Room) {
    room
      .on(RoomEvent.Connected, () => useRoom.setState({ conn: "connected", end: undefined }))
      .on(RoomEvent.Reconnecting, () => useRoom.setState({ conn: "reconnecting" }))
      .on(RoomEvent.SignalReconnecting, () => useRoom.setState({ conn: "reconnecting" }))
      .on(RoomEvent.Reconnected, () => {
        useRoom.setState({ conn: "connected" });
        // We may have missed server broadcasts while away.
        void this.refreshState();
        void this.syncClock();
        if (this.lastMediaReady) this.announceMedia(this.lastMediaReady);
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => this.onDisconnected(reason))
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        this.bump();
        void this.refreshState();
        // Hand my copy of the chat to my partner (history lives only in our two browsers).
        const chat = useRoom.getState().chat.map(({ id, text, sentAt, from }) => ({ id, text, sentAt, from }));
        if (chat.length) void this.publish(PEER_TOPICS.chatHistory, { messages: chat }, { to: [p.identity] });
        if (this.lastMediaReady) void this.publish(PEER_TOPICS.media, this.lastMediaReady, { to: [p.identity] });
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        useRoom.setState({ partnerMedia: null });
        this.bump();
      })
      .on(RoomEvent.TrackSubscribed, this.bump)
      .on(RoomEvent.TrackUnsubscribed, this.bump)
      .on(RoomEvent.TrackMuted, this.bump)
      .on(RoomEvent.TrackUnmuted, this.bump)
      .on(RoomEvent.TrackPublished, this.bump)
      .on(RoomEvent.TrackUnpublished, this.bump)
      .on(RoomEvent.LocalTrackPublished, this.bump)
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) useRoom.setState({ myShareAudio: "none" });
        this.bump();
      })
      .on(RoomEvent.ActiveSpeakersChanged, this.bump)
      .on(RoomEvent.ConnectionQualityChanged, this.bump)
      .on(RoomEvent.ActiveDeviceChanged, this.bump)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => useRoom.setState({ audioBlocked: !room.canPlaybackAudio }))
      .on(RoomEvent.MediaDevicesChanged, () => void this.checkDevices())
      .on(RoomEvent.MediaDevicesError, (e: Error) => this.mediaError("device", e))
      .on(RoomEvent.DataReceived, this.onData);
  }

  private async checkDevices() {
    this.bump();
    const lp = this.room.localParticipant;
    const checks: [Track.Source, MediaDeviceKind, string][] = [
      [Track.Source.Microphone, "audioinput", "microphone"],
      [Track.Source.Camera, "videoinput", "camera"],
    ];
    for (const [source, kind, label] of checks) {
      const track = lp.getTrackPublication(source)?.track;
      const id = track?.mediaStreamTrack?.getSettings().deviceId;
      if (!track || !id) continue;
      const devices = await Room.getLocalDevices(kind, false).catch(() => []);
      if (devices.length && !devices.some((d) => d.deviceId === id)) {
        toast({ tone: "error", title: `Your ${label} was disconnected`, body: devices.length ? "Switched to another one." : `No other ${label} is available.` });
        if (devices[0]) await this.room.switchActiveDevice(kind, devices[0].deviceId).catch(() => {});
      }
    }
  }

  private onDisconnected(reason?: DisconnectReason) {
    if (this.disposed || useRoom.getState().conn === "ended") return;
    this.bump();
    switch (reason) {
      case DisconnectReason.DUPLICATE_IDENTITY:
        this.setDisconnected({
          title: "Opened somewhere else",
          body: "This room is open in another tab or window, so we disconnected this one.",
          canRejoin: true,
        });
        return;
      case DisconnectReason.ROOM_DELETED:
        this.applyServer({ kind: "room-ended" });
        return;
      case DisconnectReason.PARTICIPANT_REMOVED:
        this.setDisconnected({ title: "You left the room", body: "Your seat was released.", canRejoin: false });
        return;
      case DisconnectReason.CLIENT_INITIATED:
        return;
      default:
        // Network loss after LiveKit's own resume attempts — keep retrying with backoff.
        this.setDisconnected({
          title: "Connection lost",
          body: navigator.onLine === false ? "You appear to be offline. We’ll reconnect as soon as you’re back." : "Trying to reconnect…",
          canRejoin: true,
        });
        this.scheduleRetry();
    }
  }

  private setDisconnected(end: { title: string; body: string; canRejoin: boolean }) {
    useRoom.setState({ conn: "disconnected", end });
  }

  private handleApiFatal(e: unknown) {
    if (!(e instanceof ApiRequestError)) return;
    const map: Record<string, { title: string; body: string }> = {
      room_ended: { title: "This room has ended", body: "The link no longer works." },
      room_expired: { title: "This room has expired", body: "Rooms close after 12 hours. Start a new one any time." },
      seat_released: { title: "Your seat was released", body: "You left this room, or someone else took the second seat after you’d been away." },
      unauthorized: { title: "You’re not in this room", body: "Ask for a fresh invite link." },
      not_found: { title: "Room not found", body: "It may have expired." },
    };
    const m = map[e.code];
    if (m) {
      useRoom.setState({ conn: "ended", end: { ...m, canRejoin: false } });
      void this.dispose();
    } else if (e.code === "network" || e.status >= 500) {
      this.setDisconnected({ title: "Can’t reach Closeby", body: "Check your connection — we’ll keep trying.", canRejoin: true });
      this.scheduleRetry();
    } else {
      toast({ tone: "error", title: e.message });
    }
  }

  handleApiError(e: unknown, title: string) {
    if (e instanceof ApiRequestError && ["room_ended", "room_expired", "seat_released", "unauthorized"].includes(e.code)) {
      this.handleApiFatal(e);
      return;
    }
    toast({ tone: "error", title, body: e instanceof Error ? e.message : undefined });
  }

  mediaError(what: string, e: unknown) {
    const err = e as DOMException;
    const name = err?.name ?? "";
    let body = err?.message ?? "Something went wrong.";
    if (name === "NotAllowedError") body = `Your browser blocked the ${what}. Allow it from the address bar’s site settings, then try again.`;
    else if (name === "NotFoundError" || name === "OverconstrainedError") body = `No ${what} was found. Plug one in or pick another in Settings.`;
    else if (name === "NotReadableError") body = `Your ${what} is being used by another app. Close it there and try again.`;
    toast({ tone: "error", title: `Couldn’t start your ${what}`, body, durationMs: 7000 });
  }

  /* ───────────── devices & tracks ───────────── */

  async toggleMic() {
    const lp = this.room.localParticipant;
    try {
      await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
    } catch (e) {
      this.mediaError("microphone", e);
    }
    this.bump();
  }

  async toggleCamera() {
    const lp = this.room.localParticipant;
    try {
      await lp.setCameraEnabled(!lp.isCameraEnabled);
    } catch (e) {
      this.mediaError("camera", e);
    }
    this.bump();
  }

  async switchDevice(kind: MediaDeviceKind, deviceId: string) {
    try {
      await this.room.switchActiveDevice(kind, deviceId);
      if (kind === "audioinput") this.initial.audioInput = deviceId;
      if (kind === "videoinput") this.initial.videoInput = deviceId;
      if (kind === "audiooutput") this.initial.audioOutput = deviceId;
    } catch (e) {
      this.mediaError(kind === "audiooutput" ? "speaker" : kind === "audioinput" ? "microphone" : "camera", e);
    }
    this.bump();
  }

  /** Must be called from a user gesture. */
  async startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast({ tone: "error", title: "Screen sharing isn’t available here", body: "This browser doesn’t support it. Most mobile browsers can’t share their screen." });
      return;
    }
    const partner = this.partner();
    if (partner?.isScreenShareEnabled) {
      toast({ title: `${partner.name || "Your partner"} is already sharing`, body: "Ask them to stop first — one share at a time keeps things clear." });
      return;
    }
    try {
      await this.room.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          systemAudio: "include",
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
          suppressLocalAudioPlayback: false,
          contentHint: "motion",
          resolution: ScreenSharePresets.h1080fps30.resolution,
        },
        { screenShareEncoding: ScreenSharePresets.h1080fps30.encoding },
      );
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "AbortError") {
        toast({ title: "Screen sharing cancelled", body: "Nothing was shared." });
      } else {
        toast({ tone: "error", title: "Couldn’t start screen sharing", body: (e as Error)?.message });
      }
      return;
    }
    const audio = !!this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track;
    useRoom.setState({ myShareAudio: audio ? "with-audio" : "no-audio" });
    this.bump();
  }

  async stopScreenShare() {
    await this.room.localParticipant.setScreenShareEnabled(false).catch(() => {});
    useRoom.setState({ myShareAudio: "none" });
    this.bump();
  }

  async startAudio() {
    await this.room.startAudio().catch(() => {});
    useRoom.setState({ audioBlocked: !this.room.canPlaybackAudio });
  }
}

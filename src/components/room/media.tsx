"use client";
import { ConnectionQuality, type Participant, type RemoteParticipant, Track, type VideoTrack } from "livekit-client";
import { MicOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useLk } from "./context";
import { useRoom } from "./store";

export function TrackVideo({ track, mirror, fit = "cover", className, testId }: { track: VideoTrack; mirror?: boolean; fit?: "cover" | "contain"; className?: string; testId?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      data-testid={testId}
      muted
      playsInline
      autoPlay
      className={cn("h-full w-full bg-ink-900", fit === "cover" ? "object-cover" : "object-contain", mirror && "-scale-x-100", className)}
    />
  );
}

export function participantHue(p: Participant): number {
  try {
    return (JSON.parse(p.metadata || "{}") as { hue?: number }).hue ?? 24;
  } catch {
    return 24;
  }
}

export function cameraTrack(p?: Participant): VideoTrack | undefined {
  const pub = p?.getTrackPublication(Track.Source.Camera);
  return pub && !pub.isMuted && pub.track ? (pub.track as VideoTrack) : undefined;
}

export function screenTrack(p?: Participant): VideoTrack | undefined {
  const pub = p?.getTrackPublication(Track.Source.ScreenShare);
  return pub && !pub.isMuted && pub.track ? (pub.track as VideoTrack) : undefined;
}

export function QualityBars({ q, className }: { q: ConnectionQuality; className?: string }) {
  const n = q === ConnectionQuality.Excellent ? 3 : q === ConnectionQuality.Good ? 2 : q === ConnectionQuality.Poor ? 1 : 0;
  const label = q === ConnectionQuality.Unknown ? "Connection quality unknown" : q === ConnectionQuality.Lost ? "Connection lost" : `Connection ${q}`;
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex items-end gap-[2px]", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-[1px]", i < n ? (n === 1 ? "bg-danger" : n === 2 ? "bg-caution" : "bg-ok") : "bg-white/25")}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  );
}

/** Camera tile: video if available, otherwise an initial on the participant's hue. */
export function ParticipantTile({
  participant,
  isLocal,
  className,
  compact,
  name,
}: {
  participant: Participant;
  isLocal: boolean;
  className?: string;
  compact?: boolean;
  name?: string;
}) {
  const mirror = useRoom((s) => s.sound.mirrorSelf);
  const track = cameraTrack(participant);
  const hue = participantHue(participant);
  const display = name ?? participant.name ?? "Guest";
  const micMuted = !participant.isMicrophoneEnabled;
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-ink-850 transition-shadow duration-200",
        participant.isSpeaking && !micMuted ? "shadow-[inset_0_0_0_3px_var(--color-ok)]" : "",
        className,
      )}
      data-testid={isLocal ? "tile-local" : "tile-remote"}
      data-has-video={!!track}
      data-speaking={participant.isSpeaking}
    >
      {track ? (
        <TrackVideo track={track} mirror={isLocal && mirror} testId={isLocal ? "video-local" : "video-remote"} />
      ) : (
        <div className="grid h-full w-full place-items-center" style={{ background: `radial-gradient(120% 100% at 50% 20%, hsl(${hue} 30% 20%), #0c0c0e)` }}>
          <span
            className={cn("grid place-items-center rounded-full font-semibold text-white", compact ? "size-11 text-[18px]" : "size-[min(32%,112px)] text-[clamp(20px,4vw,44px)]")}
            style={{ background: `hsl(${hue} 45% 40%)`, aspectRatio: "1" }}
            aria-hidden
          >
            {display.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 backdrop-blur-md">
        {micMuted && <MicOff className="size-3.5 shrink-0 text-white" aria-label="Microphone off" />}
        <span className="truncate text-[12px] font-semibold text-white">{isLocal ? "You" : display}</span>
        {!isLocal && <QualityBars q={participant.connectionQuality} />}
      </div>
    </div>
  );
}

/**
 * Plays the partner's microphone and screen-share audio through separate
 * elements so each has its own volume. The local film never goes through
 * WebRTC — each person's browser plays its own copy — so there is no
 * double playback or loop.
 */
export function PartnerAudio() {
  const room = useLk();
  const partner = [...room.remoteParticipants.values()][0] as RemoteParticipant | undefined;
  const voice = useRoom((s) => s.sound.voiceVolume);
  const media = useRoom((s) => s.sound.mediaVolume);
  const mediaMuted = useRoom((s) => s.mediaMuted);
  const mic = partner?.getTrackPublication(Track.Source.Microphone)?.track;
  const share = partner?.getTrackPublication(Track.Source.ScreenShareAudio)?.track;

  useEffect(() => {
    if (!partner) return;
    partner.setVolume(voice, Track.Source.Microphone);
  }, [partner, voice, mic]);
  useEffect(() => {
    if (!partner) return;
    partner.setVolume(mediaMuted ? 0 : media, Track.Source.ScreenShareAudio);
  }, [partner, media, mediaMuted, share]);

  return (
    <>
      {mic && <AttachedAudio track={mic} />}
      {share && <AttachedAudio track={share} />}
    </>
  );
}

function AttachedAudio({ track }: { track: Track }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <audio ref={ref} autoPlay className="hidden" />;
}

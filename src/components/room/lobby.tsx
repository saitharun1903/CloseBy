"use client";
import { createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack, Room, VideoPresets } from "livekit-client";
import { ArrowRight, Headphones, Mic, MicOff, RefreshCw, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { loadDevicePrefs, saveDevicePrefs } from "@/lib/prefs";
import type { RoomStateDTO } from "@/lib/protocol";
import type { InitialMedia } from "./controller";
import { MicMeter } from "./mic-meter";
import { prefetchToken } from "./token-cache";

type DevState = { status: "off" | "starting" | "on" | "error"; error?: string };

export function describeMediaError(e: unknown, what: "camera" | "microphone"): string {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return `Your browser is blocking the ${what}. Click the ${what} icon in the address bar (or your browser’s site settings), allow it, then try again.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No ${what} found. Connect one, or join without it.`;
  if (name === "NotReadableError" || name === "AbortError") return `Your ${what} is busy — another app may be using it. Close that app and try again.`;
  if (!window.isSecureContext) return "Camera and microphone need a secure (https) connection.";
  return `We couldn’t start your ${what}.`;
}

export function Lobby({ state, onJoin }: { state: RoomStateDTO; onJoin: (m: InitialMedia) => void }) {
  const prefs = useRef(loadDevicePrefs());
  const [micOn, setMicOn] = useState(prefs.current.micOn);
  const [camOn, setCamOn] = useState(prefs.current.camOn);
  const [audio, setAudio] = useState<LocalAudioTrack | null>(null);
  const [video, setVideo] = useState<LocalVideoTrack | null>(null);
  // Start as "starting" (not "off"): devices are acquired on mount, and Join must stay
  // disabled until then, or a quick click would join with no microphone.
  const [mic, setMic] = useState<DevState>({ status: "starting" });
  const [cam, setCam] = useState<DevState>({ status: prefs.current.camOn ? "starting" : "off" });
  const [devices, setDevices] = useState<{ audioinput: MediaDeviceInfo[]; videoinput: MediaDeviceInfo[]; audiooutput: MediaDeviceInfo[] }>({
    audioinput: [],
    videoinput: [],
    audiooutput: [],
  });
  const [sel, setSel] = useState({ audioinput: prefs.current.audioInput, videoinput: prefs.current.videoInput, audiooutput: prefs.current.audioOutput });
  const videoEl = useRef<HTMLVideoElement>(null);
  const handedOff = useRef(false);
  const tracks = useRef<{ audio: LocalAudioTrack | null; video: LocalVideoTrack | null }>({ audio: null, video: null });
  tracks.current = { audio, video };

  const refreshDevices = useCallback(async () => {
    const [ai, vi, ao] = await Promise.all([
      Room.getLocalDevices("audioinput", false).catch(() => []),
      Room.getLocalDevices("videoinput", false).catch(() => []),
      Room.getLocalDevices("audiooutput", false).catch(() => []),
    ]);
    setDevices({ audioinput: ai, videoinput: vi, audiooutput: ao });
  }, []);

  const startMic = useCallback(
    async (deviceId?: string) => {
      setMic({ status: "starting" });
      tracks.current.audio?.stop();
      try {
        const t = await createLocalAudioTrack({ deviceId, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
        setAudio(t);
        setMic({ status: "on" });
        void refreshDevices();
      } catch (e) {
        setAudio(null);
        setMic({ status: "error", error: describeMediaError(e, "microphone") });
      }
    },
    [refreshDevices],
  );

  const startCam = useCallback(
    async (deviceId?: string) => {
      setCam({ status: "starting" });
      tracks.current.video?.stop();
      try {
        const t = await createLocalVideoTrack({ deviceId, resolution: VideoPresets.h720.resolution });
        setVideo(t);
        setCam({ status: "on" });
        void refreshDevices();
      } catch (e) {
        setVideo(null);
        setCam({ status: "error", error: describeMediaError(e, "camera") });
      }
    },
    [refreshDevices],
  );

  // Get the call token and warm up the connection while the user checks their camera.
  useEffect(() => {
    prefetchToken(state.room.id);
  }, [state.room.id]);

  // Acquire devices once on mount; release them unless handed to the room.
  useEffect(() => {
    void startMic(prefs.current.audioInput);
    if (prefs.current.camOn) void startCam(prefs.current.videoInput);
    else setCam({ status: "off" });
    return () => {
      if (!handedOff.current) {
        tracks.current.audio?.stop();
        tracks.current.video?.stop();
      }
    };
  }, [startMic, startCam]);

  useEffect(() => {
    const el = videoEl.current;
    if (!el || !video) return;
    video.attach(el);
    return () => {
      video.detach(el);
    };
  }, [video]);

  function toggleCam() {
    if (camOn) {
      video?.stop();
      setVideo(null);
      setCam({ status: "off" });
      setCamOn(false);
    } else {
      setCamOn(true);
      void startCam(sel.videoinput);
    }
  }

  function join() {
    handedOff.current = true;
    const p = { micOn: micOn && !!audio, camOn: camOn && !!video, audioInput: sel.audioinput, videoInput: sel.videoinput, audioOutput: sel.audiooutput };
    saveDevicePrefs({ ...p, micOn, camOn });
    onJoin({ audio: audio ?? undefined, video: camOn ? (video ?? undefined) : undefined, ...p });
  }

  const partner = state.participants.find((p) => p.id !== state.me.id);
  const heading =
    state.me.role === "host" ? (partner ? `Ready to rejoin ${partner.displayName}?` : "Your room is ready") : `Join ${partner?.displayName ?? "the room"}`;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Full-screen camera preview */}
      <div className="absolute inset-0">
        {video && camOn ? (
          <video ref={videoEl} muted playsInline autoPlay className="h-full w-full -scale-x-100 object-cover" aria-label="Your camera preview" />
        ) : (
          <div className="grid h-full place-items-center" style={{ background: `radial-gradient(90% 70% at 50% 30%, hsl(${state.me.avatarHue} 35% 18%), #000)` }}>
            <div className="max-w-[320px] px-6 text-center">
              <span className="mx-auto grid size-24 place-items-center rounded-full text-[40px] font-semibold text-white" style={{ background: `hsl(${state.me.avatarHue} 45% 40%)` }}>
                {state.me.displayName.slice(0, 1).toUpperCase()}
              </span>
              <p className="mt-4 text-[14px] text-white/70">{cam.status === "starting" ? "Starting camera…" : cam.status === "error" ? cam.error : "Camera is off"}</p>
              {cam.status === "error" && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => void startCam(sel.videoinput)}>
                  <RefreshCw /> Try again
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/40" />
      </div>

      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-[calc(var(--safe-top)+18px)]">
        <a href="/" aria-label="Closeby home" className="text-white">
          <span className="inline-flex items-center gap-2">
            <svg viewBox="0 0 40 24" aria-hidden className="h-5 w-auto">
              <circle cx="13" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <circle cx="27" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <path d="M20 5.95a9.25 9.25 0 0 1 0 12.1a9.25 9.25 0 0 1 0-12.1z" fill="var(--color-ok)" />
            </svg>
            <span className="text-[17px] font-semibold tracking-[-0.03em]">Closeby</span>
          </span>
        </a>
        <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium text-white">
          {mic.status === "on" && micOn ? <MicMeter track={audio?.mediaStreamTrack} /> : <MicOff className="size-3.5" />}
          {state.me.displayName}
        </span>
      </header>

      {/* Bottom card */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[calc(var(--safe-bottom)+20px)]">
        <div className="glass w-full max-w-[520px] animate-fade-in rounded-[28px] p-6 sm:p-7">
          <h1 className="text-center font-serif text-[32px] font-normal leading-none tracking-[-0.01em] text-paper sm:text-[38px]">{heading}</h1>
          <p className="mt-1 text-center text-[14px] text-white/65">Nobody sees or hears you until you join.</p>

          <div className="mt-5 flex items-center justify-center gap-3">
            <RoundToggle on={micOn && mic.status === "on"} disabled={mic.status !== "on"} onClick={() => setMicOn((v) => !v)} label={micOn ? "Turn microphone off" : "Turn microphone on"}>
              {micOn && mic.status === "on" ? <Mic /> : <MicOff />}
            </RoundToggle>
            <RoundToggle on={camOn && cam.status === "on"} onClick={toggleCam} label={camOn ? "Turn camera off" : "Turn camera on"}>
              {camOn && cam.status !== "error" ? <Video /> : <VideoOff />}
            </RoundToggle>
          </div>

          {mic.status === "error" && (
            <p role="alert" className="mt-4 text-center text-[13px] text-[#ffb4ae]">
              {mic.error}{" "}
              <button className="font-semibold underline underline-offset-2" onClick={() => void startMic(sel.audioinput)}>
                Try again
              </button>
            </p>
          )}

          <details className="group mt-5 rounded-2xl bg-white/[0.06] px-4 py-3 text-[13px] text-white/80">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
              Camera, microphone & speaker
              <span className="text-white/50 transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="mt-3 space-y-2.5">
              <DeviceSelect
                label="Microphone"
                devices={devices.audioinput}
                value={sel.audioinput}
                disabled={mic.status !== "on"}
                onChange={(id) => {
                  setSel((s) => ({ ...s, audioinput: id }));
                  void startMic(id);
                }}
              />
              <DeviceSelect
                label="Camera"
                devices={devices.videoinput}
                value={sel.videoinput}
                disabled={!camOn || cam.status !== "on"}
                onChange={(id) => {
                  setSel((s) => ({ ...s, videoinput: id }));
                  void startCam(id);
                }}
              />
              {devices.audiooutput.length > 0 && "setSinkId" in HTMLMediaElement.prototype && (
                <DeviceSelect label="Speaker" devices={devices.audiooutput} value={sel.audiooutput} onChange={(id) => setSel((s) => ({ ...s, audiooutput: id }))} />
              )}
              <p className="flex items-start gap-2 pt-1 text-[12px] leading-relaxed text-white/55">
                <Headphones className="mt-0.5 size-3.5 shrink-0" /> Headphones are the surest way to avoid echo while something plays.
              </p>
            </div>
          </details>

          <Button variant="primary" size="lg" className="mt-5 w-full" onClick={join} disabled={mic.status === "starting" || cam.status === "starting"} data-testid="lobby-join">
            Join <ArrowRight />
          </Button>
          {mic.status === "error" && cam.status !== "on" && <p className="mt-2 text-center text-[12px] text-white/50">You can still join to watch and chat without camera or mic.</p>}
        </div>
      </div>
    </div>
  );
}

function RoundToggle({ on, disabled, onClick, label, children }: { on: boolean; disabled?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-14 place-items-center rounded-full transition-colors [&_svg]:size-6",
        on ? "bg-white/[0.16] text-white hover:bg-white/25" : "bg-white text-black hover:bg-white/90",
        disabled && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function DeviceSelect({
  label,
  devices,
  value,
  onChange,
  disabled,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const id = `dev-${label.toLowerCase()}`;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-[13px] text-white/60">
        {label}
      </label>
      <select
        id={id}
        disabled={disabled || devices.length === 0}
        value={value && devices.some((d) => d.deviceId === value) ? value : (devices[0]?.deviceId ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 flex-1 truncate rounded-lg bg-white/[0.08] px-3 text-[13px] text-white outline-none focus:ring-2 focus:ring-lamp disabled:opacity-50"
      >
        {devices.length === 0 && <option value="">Not available</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

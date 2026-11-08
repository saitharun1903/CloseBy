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
import { Screen } from "./screens";

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
  const [mic, setMic] = useState<DevState>({ status: "off" });
  const [cam, setCam] = useState<DevState>({ status: "off" });
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
    state.me.role === "host" ? (partner ? `${partner.displayName} has a seat` : "Your room is ready") : `You’re joining ${partner?.displayName ?? "the room"}`;

  return (
    <Screen wide>
      <div className="grid animate-fade-in items-center gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-12">
        {/* Preview */}
        <div className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink-850 shadow-float ring-1 ring-[var(--line)] sm:aspect-[16/10]">
            {video && camOn ? (
              <video ref={videoEl} muted playsInline autoPlay className="h-full w-full -scale-x-100 object-cover" aria-label="Your camera preview" />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div className="max-w-[320px]">
                  <span
                    className="mx-auto grid size-20 place-items-center rounded-full font-display text-[36px] text-paper"
                    style={{ background: `hsl(${state.me.avatarHue} 22% 26%)` }}
                  >
                    {state.me.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <p className="mt-4 text-sm text-paper-dim">
                    {cam.status === "starting" ? "Starting camera…" : cam.status === "error" ? cam.error : "Camera is off"}
                  </p>
                  {cam.status === "error" && (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => void startCam(sel.videoinput)}>
                      <RefreshCw /> Try again
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/55 to-transparent p-4 pt-10">
              <RoundToggle on={micOn && mic.status === "on"} disabled={mic.status !== "on"} onClick={() => setMicOn((v) => !v)} label={micOn ? "Turn microphone off" : "Turn microphone on"}>
                {micOn && mic.status === "on" ? <Mic /> : <MicOff />}
              </RoundToggle>
              <RoundToggle on={camOn && cam.status === "on"} onClick={toggleCam} label={camOn ? "Turn camera off" : "Turn camera on"}>
                {camOn && cam.status !== "error" ? <Video /> : <VideoOff />}
              </RoundToggle>
            </div>
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/45 px-2.5 py-1 text-[12px] text-white/90 backdrop-blur">
              {mic.status === "on" && micOn ? <MicMeter track={audio?.mediaStreamTrack} /> : <MicOff className="size-3.5" />}
              <span>{state.me.displayName}</span>
            </div>
          </div>
          {mic.status === "error" && (
            <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-danger">
              <MicOff className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {mic.error}{" "}
                <button className="underline underline-offset-2 hover:text-paper" onClick={() => void startMic(sel.audioinput)}>
                  Try again
                </button>
              </span>
            </p>
          )}
        </div>

        {/* Setup */}
        <div>
          <h1 className="font-display text-[40px] leading-[1.04] tracking-[-0.015em]">{heading}</h1>
          <p className="mt-2 text-paper-dim">Check how you look and sound. Nobody sees or hears you until you join.</p>

          <div className="mt-7 space-y-3">
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
          </div>

          <p className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-paper-faint">
            <Headphones className="mt-0.5 size-4 shrink-0" />
            Headphones are the surest way to avoid echo while a film is playing. Echo cancellation is on, but it can’t catch everything on every device.
          </p>

          <Button variant="primary" size="lg" className="mt-7 w-full" onClick={join} disabled={mic.status === "starting" || cam.status === "starting"} data-testid="lobby-join">
            Join room <ArrowRight />
          </Button>
          {mic.status === "error" && cam.status !== "on" && (
            <p className="mt-2 text-center text-[12px] text-paper-faint">You can still join to watch and chat without camera or mic.</p>
          )}
        </div>
      </div>
    </Screen>
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
        "grid size-12 place-items-center rounded-full transition-colors [&_svg]:size-5",
        on ? "bg-white/15 text-white hover:bg-white/25" : "bg-danger text-ink-950 hover:bg-[#e8806a]",
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
      <label htmlFor={id} className="w-24 shrink-0 text-[13px] text-paper-dim">
        {label}
      </label>
      <select
        id={id}
        disabled={disabled || devices.length === 0}
        value={value && devices.some((d) => d.deviceId === value) ? value : (devices[0]?.deviceId ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 min-w-0 flex-1 truncate rounded-md border hairline-strong bg-ink-900 px-3 text-sm text-paper outline-none focus:border-lamp/60 disabled:opacity-50"
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

"use client";
import { Room, Track } from "livekit-client";
import {
  Loader,
  Moon,
  Columns2,
  Ellipsis,
  Headphones,
  Heart,
  LayoutGrid,
  ListVideo,
  LogOut,
  Maximize,
  MessageSquare,
  Mic,
  MicOff,
  Minimize,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  PictureInPicture2,
  Play,
  Power,
  Rows2,
  Tv,
  Video,
  VideoOff,
} from "lucide-react";
import { forwardRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { REACTIONS } from "@/lib/protocol";
import { useController, useLk } from "./context";
import { MicMeter } from "./mic-meter";
import { serverNow, setSound, useRoom, type LayoutPref } from "./store";
import { toast } from "@/components/toaster";
import { canPopOut, popOutPartner } from "./pip";
import { SLEEP_TIMER_MINUTES } from "@/lib/protocol";

type CtlProps = {
  label: string;
  /** Pressed/"on" state shown as a white button (e.g. sharing). */
  active?: boolean;
  /** Device turned off — FaceTime shows these as white with a dark glyph. */
  off?: boolean;
  danger?: boolean;
  badge?: number | boolean;
  testId?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const CtlButtonBase = forwardRef<HTMLButtonElement, CtlProps>(function CtlButtonBase({ label, active, off, danger, badge, className, testId, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95 disabled:opacity-40 sm:size-[52px] [&_svg]:size-5 sm:[&_svg]:size-[22px]",
        danger
          ? "bg-danger text-white hover:bg-[#ff5a50]"
          : off || active
            ? "bg-white text-black hover:bg-white/90"
            : "bg-white/[0.14] text-white hover:bg-white/[0.22] data-[state=open]:bg-white/[0.28]",
        className,
      )}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-lamp px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-black/40" aria-label={typeof badge === "number" ? `${badge} unread` : "New"}>
          {typeof badge === "number" ? (badge > 9 ? "9+" : badge) : ""}
        </span>
      ) : null}
    </button>
  );
});

export function CtlButton({ shortcut, ...props }: CtlProps & { shortcut?: string }) {
  return (
    <Tooltip label={props.label} shortcut={shortcut}>
      <CtlButtonBase {...props} />
    </Tooltip>
  );
}

function PopoverCtl({ label, testId, children, content, open, onOpenChange, contentClass }: { label: string; testId: string; children: React.ReactNode; content: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void; contentClass?: string }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip label={label}>
        <PopoverTrigger asChild>
          <CtlButtonBase label={label} testId={testId}>
            {children}
          </CtlButtonBase>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" sideOffset={14} className={contentClass}>
        {content}
      </PopoverContent>
    </Popover>
  );
}

const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Opens the real youtube.com in the shared cloud browser (both of you see,
 * hear and control it, and can sign in with Google). Without a browser
 * service it falls back to the built-in YouTube browser.
 */
function YouTubeButton({ disabled }: { disabled: boolean }) {
  const c = useController();
  const real = useRoom((s) => s.features.sharedBrowser);
  const active = useRoom((s) => s.browser.active);
  const [busy, setBusy] = useState(false);
  async function open() {
    if (!real) return useRoom.setState({ ytOpen: true });
    if (active) return useRoom.setState({ panel: null, layoutPref: "auto" });
    setBusy(true);
    try {
      await c.startBrowser("https://www.youtube.com");
      useRoom.setState({ panel: null, layoutPref: "auto" });
    } catch (e) {
      toast({ title: "Couldn’t open YouTube", body: (e as Error).message || "Showing the built-in YouTube instead." });
      useRoom.setState({ ytOpen: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <CtlButton label="YouTube" onClick={() => void open()} disabled={busy || (real && disabled)} testId="ctl-youtube" className="!bg-[#ff0033] !text-white hover:!bg-[#ff1a47]">
      {busy ? <Loader className="animate-spin" /> : <Play className="fill-current" />}
    </CtlButton>
  );
}

export function ControlBar({ immersive, onToggleImmersive, onLeave }: { immersive: boolean; onToggleImmersive: () => void; onLeave: () => void }) {
  const c = useController();
  const room = useLk();
  const lp = room.localParticipant;
  const panel = useRoom((s) => s.panel);
  const unread = useRoom((s) => s.unread);
  const conn = useRoom((s) => s.conn);
  const watching = useRoom((s) => !!s.playback.mediaId || s.browser.active);
  const [shareOk, setShareOk] = useState(false);
  useEffect(() => setShareOk(canShareScreen()), []);

  const micOn = lp.isMicrophoneEnabled;
  const camOn = lp.isCameraEnabled;
  const sharing = lp.isScreenShareEnabled;
  const disabled = conn !== "connected";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        void c.toggleMic();
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        void c.toggleCamera();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [c]);

  const togglePanel = (p: "chat" | "queue") => useRoom.setState((s) => ({ panel: s.panel === p ? null : p, unread: p === "chat" ? 0 : s.unread }));

  return (
    <div className="glass mx-auto flex w-fit max-w-full items-center gap-1.5 overflow-x-auto rounded-full p-1.5 scrollbar-quiet sm:gap-2.5 sm:p-2.5" role="toolbar" aria-label="Call controls">
      <CtlButton label={micOn ? "Mute" : "Unmute"} shortcut="⌘D" off={!micOn} onClick={() => void c.toggleMic()} disabled={disabled} testId="ctl-mic">
        {micOn ? <Mic /> : <MicOff />}
      </CtlButton>
      <CtlButton label={camOn ? "Turn camera off" : "Turn camera on"} shortcut="⌘E" off={!camOn} onClick={() => void c.toggleCamera()} disabled={disabled} testId="ctl-cam">
        {camOn ? <Video /> : <VideoOff />}
      </CtlButton>
      <CtlButton label="Watch together" active={watching} onClick={() => useRoom.setState({ watchOpen: true })} testId="ctl-watch">
        <Tv />
      </CtlButton>
      <YouTubeButton disabled={disabled} />
      {shareOk && (
        <CtlButton label={sharing ? "Stop sharing" : "Share screen"} active={sharing} onClick={() => void (sharing ? c.stopScreenShare() : c.startScreenShare())} disabled={disabled} testId="ctl-share" className="max-sm:hidden">
          {sharing ? <MonitorOff /> : <MonitorUp />}
        </CtlButton>
      )}
      <ReactionsButton />
      <CtlButton label="Chat" active={panel === "chat"} badge={panel !== "chat" && unread > 0 ? unread : undefined} onClick={() => togglePanel("chat")} testId="ctl-chat">
        <MessageSquare />
      </CtlButton>
      <MoreButton immersive={immersive} onToggleImmersive={onToggleImmersive} onQueue={() => togglePanel("queue")} />
      <CtlButton label="Leave" danger onClick={onLeave} testId="ctl-leave">
        <PhoneOff />
      </CtlButton>
    </div>
  );
}

/** "Thinking of you": hearts for both, and your partner's phone buzzes. */
function NudgeButton({ wide }: { wide?: boolean }) {
  const c = useController();
  const hasPartner = useLk().remoteParticipants.size > 0;
  return (
    <button
      onClick={() => c.sendNudge()}
      disabled={!hasPartner}
      className={cn(
        "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#ff2d55] px-4 text-[13px] font-semibold text-white transition-transform hover:bg-[#ff4d6d] active:scale-95 disabled:opacity-40",
        wide && "w-full",
      )}
      title="Send a nudge: hearts on both screens, and their phone buzzes"
      data-testid="nudge"
    >
      <Heart className="size-4 fill-current" /> Nudge
    </button>
  );
}

function ReactionsButton() {
  const c = useController();
  return (
    <span className="contents max-[400px]:hidden">
    <PopoverCtl
      label="React"
      testId="ctl-react"
      contentClass="flex items-center gap-1 rounded-full p-1.5"
      content={
        <>
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => c.sendReaction(e)} className="grid size-11 place-items-center rounded-full text-[24px] transition-transform hover:scale-110 hover:bg-white/10 active:scale-95" aria-label={`Send ${e}`}>
              {e}
            </button>
          ))}
          <NudgeButton />
        </>
      }
    >
      <Heart />
    </PopoverCtl>
    </span>
  );
}

const LAYOUTS: { id: LayoutPref; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "auto", label: "Automatic", icon: LayoutGrid },
  { id: "cinema", label: "Cinema", icon: PictureInPicture2 },
  { id: "face", label: "Face to face", icon: Columns2 },
  { id: "screen", label: "Screen share", icon: MonitorUp },
  { id: "compact", label: "Compact", icon: Rows2 },
];

function MoreButton({ immersive, onToggleImmersive, onQueue }: { immersive: boolean; onToggleImmersive: () => void; onQueue: () => void }) {
  const c = useController();
  const room = useLk();
  const pref = useRoom((s) => s.layoutPref);
  const sound = useRoom((s) => s.sound);
  const mediaMuted = useRoom((s) => s.mediaMuted);
  const partnerName = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName ?? "Partner");
  const [open, setOpen] = useState(false);
  const [popOutOk, setPopOutOk] = useState(false);
  useEffect(() => setPopOutOk(canPopOut()), []);
  const hasPartnerVideo = [...room.remoteParticipants.values()].some((p) => p.isCameraEnabled);
  const [devices, setDevices] = useState<Record<MediaDeviceKind, MediaDeviceInfo[]>>({ audioinput: [], videoinput: [], audiooutput: [] });

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      Room.getLocalDevices("audioinput").catch(() => []),
      Room.getLocalDevices("videoinput").catch(() => []),
      Room.getLocalDevices("audiooutput").catch(() => []),
    ]).then(([a, v, o]) => setDevices({ audioinput: a, videoinput: v, audiooutput: o }));
  }, [open]);

  const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
  const active = (k: MediaDeviceKind) => room.getActiveDevice(k);
  const sinkOk = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  return (
    <PopoverCtl
      label="More"
      testId="ctl-more"
      open={open}
      onOpenChange={setOpen}
      contentClass="w-[340px] max-h-[70dvh] overflow-y-auto p-0 scrollbar-quiet"
      content={
        <div className="divide-y divide-white/[0.07]">
          <section className="space-y-2 p-3 min-[401px]:hidden" aria-label="Reactions">
            <div className="flex justify-between">
              {REACTIONS.map((e) => (
                <button key={e} onClick={() => c.sendReaction(e)} className="grid size-10 place-items-center rounded-full text-[22px] hover:bg-white/10" aria-label={`Send ${e}`}>
                  {e}
                </button>
              ))}
            </div>
            <NudgeButton wide />
          </section>
          <section className="p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-paper-faint">Volume · only what you hear</h3>
            <VolumeRow label="Video & shared sound" value={mediaMuted ? 0 : sound.mediaVolume} onChange={(v) => { setSound({ mediaVolume: v }); useRoom.setState({ mediaMuted: false }); }} testId="vol-media" />
            <VolumeRow label={`${partnerName}’s voice`} value={sound.voiceVolume} onChange={(v) => setSound({ voiceVolume: v })} testId="vol-voice" />
            <label className="-mx-2 mt-2 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-[14px] hover:bg-white/10">
              <span className="flex-1">
                Lower the video when someone talks
                <span className="block text-[12px] text-paper-faint">Comes back up when you stop</span>
              </span>
              <Switch checked={sound.autoDuck !== false} onCheckedChange={(v) => setSound({ autoDuck: v })} aria-label="Lower the video when someone talks" data-testid="auto-duck" />
            </label>
          </section>
          <SleepTimerSection />
          <section className="p-2">
            <h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-paper-faint">Layout</h3>
            <div className="grid grid-cols-5 gap-1">
              {LAYOUTS.map((l) => (
                <PopoverClose asChild key={l.id}>
                  <button
                    onClick={() => useRoom.setState({ layoutPref: l.id })}
                    className={cn("flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium hover:bg-white/10", pref === l.id ? "bg-white/[0.12] text-white" : "text-paper-dim")}
                    aria-pressed={pref === l.id}
                    data-testid={`layout-${l.id}`}
                  >
                    <l.icon className="size-5" />
                    {l.label}
                  </button>
                </PopoverClose>
              ))}
            </div>
            <PopoverClose asChild>
              <button onClick={onToggleImmersive} className="mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-[14px] hover:bg-white/10" data-testid="ctl-cinema-mode">
                {immersive ? <Minimize className="size-5 text-paper-dim" /> : <Maximize className="size-5 text-paper-dim" />}
                {immersive ? "Exit full screen" : "Full screen"}
                <kbd className="ml-auto font-mono text-[11px] text-paper-faint">F</kbd>
              </button>
            </PopoverClose>
            <PopoverClose asChild>
              <button onClick={onQueue} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-[14px] hover:bg-white/10" data-testid="ctl-queue">
                <ListVideo className="size-5 text-paper-dim" /> Up next
              </button>
            </PopoverClose>
            {popOutOk && hasPartnerVideo && (
              <PopoverClose asChild>
                <button
                  onClick={() => void popOutPartner().then((r) => r !== "ok" && toast({ title: "Couldn’t pop out the camera", body: "Your browser doesn’t allow it here." }))}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-[14px] hover:bg-white/10"
                  data-testid="pop-out"
                >
                  <PictureInPicture2 className="size-5 text-paper-dim" />
                  <span className="flex-1">
                    Pop out {partnerName}’s camera
                    <span className="block text-[12px] text-paper-faint">Keep seeing them in other apps and tabs</span>
                  </span>
                </button>
              </PopoverClose>
            )}
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-[14px] hover:bg-white/10">
              <span className="flex-1">Show my camera</span>
              <Switch checked={!sound.hideSelf} onCheckedChange={(v) => setSound({ hideSelf: !v })} aria-label="Show my camera" />
            </label>
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-[14px] hover:bg-white/10">
              <span className="flex-1">Mirror my camera</span>
              <Switch checked={sound.mirrorSelf} onCheckedChange={(v) => setSound({ mirrorSelf: v })} aria-label="Mirror my camera" />
            </label>
          </section>
          <section className="space-y-2 p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-paper-faint">Devices</h3>
            <DeviceRow label="Microphone" devices={devices.audioinput} value={active("audioinput")} onChange={(id) => void c.switchDevice("audioinput", id)} extra={room.localParticipant.isMicrophoneEnabled ? <MicMeter track={micTrack} bars={4} /> : null} />
            <DeviceRow label="Camera" devices={devices.videoinput} value={active("videoinput")} onChange={(id) => void c.switchDevice("videoinput", id)} />
            {sinkOk && devices.audiooutput.length > 0 && <DeviceRow label="Speaker" devices={devices.audiooutput} value={active("audiooutput")} onChange={(id) => void c.switchDevice("audiooutput", id)} />}
            <p className="flex gap-2 pt-1 text-[12px] leading-snug text-paper-faint">
              <Headphones className="mt-px size-3.5 shrink-0" />
              Hearing an echo? Headphones fix it. Echo cancellation is on where your browser supports it.
            </p>
          </section>
        </div>
      }
    >
      <Ellipsis />
    </PopoverCtl>
  );
}

function VolumeRow({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId?: string }) {
  return (
    <div className="mt-3" data-testid={testId}>
      <div className="mb-1 flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="font-mono text-[12px] text-paper-faint tabular">{Math.round(value * 100)}%</span>
      </div>
      <Slider aria-label={label} min={0} max={1} step={0.01} value={[value]} onValueChange={([v]) => onChange(v ?? 0)} />
    </div>
  );
}

function DeviceRow({ label, devices, value, onChange, extra }: { label: string; devices: MediaDeviceInfo[]; value?: string; onChange: (id: string) => void; extra?: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <span className="w-[80px] shrink-0 text-paper-dim">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={devices.length === 0} className="h-9 min-w-0 flex-1 truncate rounded-lg bg-white/[0.08] px-2 text-[13px] outline-none focus:ring-2 focus:ring-lamp disabled:opacity-50">
        {devices.length === 0 && <option value="">Not available</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
      {extra}
    </label>
  );
}

export function LeaveDialog({ open, onOpenChange, isHost, onLeave, onEnd }: { open: boolean; onOpenChange: (o: boolean) => void; isHost: boolean; onLeave: () => void; onEnd: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isHost ? "Leave or end the room?" : "Leave the room?"}
        description={isHost ? "If you just leave, your guest can stay and you can come back. Ending closes the room for both of you and deletes it." : "You’ll free your seat. You can rejoin with the invite link while there’s space."}
      >
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="lg" onClick={onLeave} data-testid="confirm-leave">
            <LogOut /> {isHost ? "Leave for now" : "Leave"}
          </Button>
          {isHost && (
            <Button variant="danger" size="lg" onClick={onEnd} data-testid="confirm-end">
              <Power /> End room for both
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="ghost">Stay</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Sleep timer for both of you: pauses playback when it runs out. */
function SleepTimerSection() {
  const c = useController();
  const timer = useRoom((s) => s.sleepTimer);
  const watching = useRoom((s) => !!s.playback.mediaId || s.browser.active);
  return (
    <section className="p-4" aria-label="Sleep timer">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-paper-faint">
        <Moon className="size-3.5" /> Sleep timer · for both of you
      </h3>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {SLEEP_TIMER_MINUTES.map((m) => (
          <button
            key={m}
            onClick={() => c.setSleepTimer(m)}
            className={cn(
              "h-8 rounded-full px-3 text-[13px] font-semibold transition-colors",
              timer?.minutes === m ? "bg-white text-black" : "bg-white/[0.08] text-paper hover:bg-white/[0.14]",
            )}
            data-testid={`sleep-${m}`}
          >
            {m < 60 ? `${m} min` : `${m / 60} h`.replace("1.5 h", "1½ h")}
          </button>
        ))}
        {timer && (
          <button onClick={() => c.setSleepTimer(null)} className="h-8 rounded-full px-3 text-[13px] font-semibold text-danger hover:bg-white/[0.08]" data-testid="sleep-off">
            Off
          </button>
        )}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-paper-faint">
        {timer ? <SleepCountdown endsAt={timer.endsAt} /> : watching ? "Pauses the video for both of you when time’s up." : "Start something to watch, then set a timer to fall asleep together."}
      </p>
    </section>
  );
}

export function SleepCountdown({ endsAt, short }: { endsAt: number; short?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, endsAt - serverNow());
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const clock = `${m}:${String(s).padStart(2, "0")}`;
  return <>{short ? clock : `Pausing for both of you in ${clock}`}</>;
}

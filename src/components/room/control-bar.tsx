"use client";
import { Track } from "livekit-client";
import {
  Columns2,
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
  Power,
  Rows2,
  Settings2,
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
import { Room } from "livekit-client";
import { useController, useLk } from "./context";
import { MicMeter } from "./mic-meter";
import { setSound, useRoom, type LayoutPref } from "./store";

type CtlProps = {
  label: string;
  active?: boolean;
  danger?: boolean;
  off?: boolean;
  badge?: number | boolean;
  testId?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** Round call-control button. forwardRef so Radix triggers can compose onto it. */
export const CtlButtonBase = forwardRef<HTMLButtonElement, CtlProps>(function CtlButtonBase(
  { label, active, danger, off, badge, className, testId, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95 disabled:opacity-40 sm:size-12 [&_svg]:size-5",
        danger
          ? "bg-danger text-ink-950 hover:bg-[#e8806a]"
          : off
            ? "bg-[#3a2420] text-danger hover:bg-[#462a25]"
            : active
              ? "bg-paper text-ink-950 hover:bg-white"
              : "bg-ink-800 text-paper hover:bg-ink-750 data-[state=open]:bg-ink-700",
        className,
      )}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="absolute right-1.5 top-1.5 grid min-w-[16px] place-items-center rounded-full bg-lamp px-1 text-[10px] font-semibold leading-4 text-lamp-ink" aria-label={typeof badge === "number" ? `${badge} unread` : "New"}>
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

/** A control that opens a popover, with a tooltip. */
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
      <PopoverContent side="top" className={contentClass}>
        {content}
      </PopoverContent>
    </Popover>
  );
}

const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function ControlBar({ immersive, onToggleImmersive, onLeave }: { immersive: boolean; onToggleImmersive: () => void; onLeave: () => void }) {
  const c = useController();
  const room = useLk();
  const lp = room.localParticipant;
  const panel = useRoom((s) => s.panel);
  const unread = useRoom((s) => s.unread);
  const conn = useRoom((s) => s.conn);
  const [shareOk, setShareOk] = useState(false);
  useEffect(() => setShareOk(canShareScreen()), []);

  const micOn = lp.isMicrophoneEnabled;
  const camOn = lp.isCameraEnabled;
  const sharing = lp.isScreenShareEnabled;
  const disabled = conn !== "connected";

  // Shortcuts: ⌘/Ctrl+D mic, ⌘/Ctrl+E camera (common in call apps).
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
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" role="toolbar" aria-label="Call controls">
      <div className="flex items-center gap-2 sm:gap-2.5">
        <div>
          <CtlButton label={micOn ? "Mute microphone" : "Unmute microphone"} shortcut="⌘D" off={!micOn} onClick={() => void c.toggleMic()} disabled={disabled} testId="ctl-mic">
            {micOn ? <Mic /> : <MicOff />}
          </CtlButton>
        </div>
        <CtlButton label={camOn ? "Turn camera off" : "Turn camera on"} shortcut="⌘E" off={!camOn} onClick={() => void c.toggleCamera()} disabled={disabled} testId="ctl-cam">
          {camOn ? <Video /> : <VideoOff />}
        </CtlButton>
        {shareOk && (
          <CtlButton
            label={sharing ? "Stop sharing" : "Share a tab, window or screen"}
            active={sharing}
            onClick={() => void (sharing ? c.stopScreenShare() : c.startScreenShare())}
            disabled={disabled}
            testId="ctl-share"
          >
            {sharing ? <MonitorOff /> : <MonitorUp />}
          </CtlButton>
        )}
      </div>

      <span className="mx-0.5 h-6 w-px bg-[var(--line-strong)] max-sm:hidden" aria-hidden />

      <div className="flex items-center gap-2 sm:gap-2.5">
        <ReactionsButton />
        <CtlButton label="Chat" active={panel === "chat"} badge={panel !== "chat" && unread > 0 ? unread : undefined} onClick={() => togglePanel("chat")} testId="ctl-chat">
          <MessageSquare />
        </CtlButton>
        <CtlButton label="Watchlist" active={panel === "queue"} onClick={() => togglePanel("queue")} className="max-sm:hidden" testId="ctl-queue">
          <ListVideo />
        </CtlButton>
        <LayoutButton immersive={immersive} onToggleImmersive={onToggleImmersive} />
        <SettingsButton />
      </div>

      <span className="mx-0.5 h-6 w-px bg-[var(--line-strong)] max-sm:hidden" aria-hidden />
      <CtlButton label="Leave" danger onClick={onLeave} testId="ctl-leave" className="w-14 sm:w-16">
        <PhoneOff />
      </CtlButton>
    </div>
  );
}

function ReactionsButton() {
  const c = useController();
  return (
    <PopoverCtl
      label="React"
      testId="ctl-react"
      contentClass="flex gap-0.5 rounded-full p-1"
      content={REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => c.sendReaction(e)}
            className="grid size-10 place-items-center rounded-full text-[20px] transition-transform hover:scale-110 hover:bg-ink-750 active:scale-95"
            aria-label={`Send ${e}`}
          >
            {e}
          </button>
        ))}
    >
      <Heart />
    </PopoverCtl>
  );
}

const LAYOUTS: { id: LayoutPref; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "auto", label: "Automatic", hint: "Follows what you’re doing", icon: LayoutGrid },
  { id: "cinema", label: "Cinema", hint: "Film large, cameras floating", icon: PictureInPicture2 },
  { id: "face", label: "Face to face", hint: "Two equal cameras", icon: Columns2 },
  { id: "screen", label: "Screen share", hint: "Shared screen large", icon: MonitorUp },
  { id: "compact", label: "Compact", hint: "Stacked, for small windows", icon: Rows2 },
];

function LayoutButton({ immersive, onToggleImmersive }: { immersive: boolean; onToggleImmersive: () => void }) {
  const pref = useRoom((s) => s.layoutPref);
  const hideSelf = useRoom((s) => s.sound.hideSelf);
  return (
    <PopoverCtl
      label="Layout"
      testId="ctl-layout"
      contentClass="w-64 p-1.5"
      content={
      <>
        <p className="px-2 pb-1.5 pt-1 text-[11px] uppercase tracking-wider text-paper-faint">Layout · only on your screen</p>
        {LAYOUTS.map((l) => (
          <PopoverClose asChild key={l.id}>
            <button
              onClick={() => useRoom.setState({ layoutPref: l.id })}
              className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-ink-750", pref === l.id && "bg-ink-800")}
              aria-pressed={pref === l.id}
              data-testid={`layout-${l.id}`}
            >
              <l.icon className={cn("size-4", pref === l.id ? "text-lamp" : "text-paper-dim")} />
              <span>
                <span className="block text-[13px] text-paper">{l.label}</span>
                <span className="block text-[12px] text-paper-faint">{l.hint}</span>
              </span>
            </button>
          </PopoverClose>
        ))}
        <div className="my-1.5 h-px bg-[var(--line)]" />
        <PopoverClose asChild>
          <button onClick={onToggleImmersive} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[13px] hover:bg-ink-750" data-testid="ctl-cinema-mode">
            {immersive ? <Minimize className="size-4 text-paper-dim" /> : <Maximize className="size-4 text-paper-dim" />}
            {immersive ? "Exit cinema mode" : "Cinema mode (full screen)"}
            <kbd className="ml-auto font-mono text-[11px] text-paper-faint">F</kbd>
          </button>
        </PopoverClose>
        <label className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[13px] hover:bg-ink-750">
          <span className="flex-1">Show my own camera</span>
          <Switch checked={!hideSelf} onCheckedChange={(v) => setSound({ hideSelf: !v })} aria-label="Show my own camera" />
        </label>
      </>
      }
    >
      <LayoutGrid />
    </PopoverCtl>
  );
}

function SettingsButton() {
  const c = useController();
  const room = useLk();
  const sound = useRoom((s) => s.sound);
  const mediaMuted = useRoom((s) => s.mediaMuted);
  const partnerName = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName ?? "Partner");
  const [open, setOpen] = useState(false);
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
      label="Sound & devices"
      testId="ctl-settings"
      open={open}
      onOpenChange={setOpen}
      contentClass="w-[320px] p-4"
      content={
      <>
        <p className="text-[11px] uppercase tracking-wider text-paper-faint">Volume · only affects what you hear</p>
        <VolumeRow label="Film & shared audio" value={mediaMuted ? 0 : sound.mediaVolume} onChange={(v) => { setSound({ mediaVolume: v }); useRoom.setState({ mediaMuted: false }); }} testId="vol-media" />
        <VolumeRow label={`${partnerName}’s voice`} value={sound.voiceVolume} onChange={(v) => setSound({ voiceVolume: v })} testId="vol-voice" />

        <div className="my-4 h-px bg-[var(--line)]" />
        <p className="text-[11px] uppercase tracking-wider text-paper-faint">Devices</p>
        <div className="mt-2 space-y-2">
          <DeviceRow
            label="Microphone"
            devices={devices.audioinput}
            value={active("audioinput")}
            onChange={(id) => void c.switchDevice("audioinput", id)}
            extra={room.localParticipant.isMicrophoneEnabled ? <MicMeter track={micTrack} bars={4} /> : null}
          />
          <DeviceRow label="Camera" devices={devices.videoinput} value={active("videoinput")} onChange={(id) => void c.switchDevice("videoinput", id)} />
          {sinkOk && devices.audiooutput.length > 0 && (
            <DeviceRow label="Speaker" devices={devices.audiooutput} value={active("audiooutput")} onChange={(id) => void c.switchDevice("audiooutput", id)} />
          )}
        </div>
        <label className="mt-3 flex items-center justify-between gap-3 text-[13px]">
          Mirror my camera (only for me)
          <Switch checked={sound.mirrorSelf} onCheckedChange={(v) => setSound({ mirrorSelf: v })} aria-label="Mirror my camera" />
        </label>
        <p className="mt-4 flex gap-2 text-[12px] leading-snug text-paper-faint">
          <Headphones className="mt-px size-3.5 shrink-0" />
          Hearing an echo? Headphones fix it reliably. Echo cancellation and noise suppression are on where your browser supports them.
        </p>
      </>
      }
    >
      <Settings2 />
    </PopoverCtl>
  );
}

function VolumeRow({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId?: string }) {
  return (
    <div className="mt-3" data-testid={testId}>
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="text-paper">{label}</span>
        <span className="font-mono text-[12px] text-paper-faint tabular">{Math.round(value * 100)}%</span>
      </div>
      <Slider aria-label={label} min={0} max={1} step={0.01} value={[value]} onValueChange={([v]) => onChange(v ?? 0)} />
    </div>
  );
}

function DeviceRow({ label, devices, value, onChange, extra }: { label: string; devices: MediaDeviceInfo[]; value?: string; onChange: (id: string) => void; extra?: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <span className="w-[76px] shrink-0 text-paper-dim">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={devices.length === 0}
        className="h-8 min-w-0 flex-1 truncate rounded-sm border hairline-strong bg-ink-900 px-2 text-[13px] text-paper outline-none focus:border-lamp/60 disabled:opacity-50"
      >
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


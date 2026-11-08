"use client";
import type { Participant } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { RoomStateDTO } from "@/lib/protocol";
import { useMediaQuery } from "@/lib/use-media-query";
import { ChatPanel } from "./chat-panel";
import { ControllerContext, useController, useLk } from "./context";
import { ControlBar, LeaveDialog } from "./control-bar";
import { RoomController, type InitialMedia } from "./controller";
import { FloatingTiles } from "./floating-tiles";
import { PartnerAudio, ParticipantTile } from "./media";
import { MediaPlayer } from "./players/media-player";
import { QueuePanel } from "./queue-panel";
import { LoadingScreen, MessageScreen } from "./screens";
import { SharedBrowser } from "./shared-browser";
import { AudioBlockedBanner, ConnectionOverlay, PingLayer, ReactionsLayer, ScreenStage, TopBar, WaitingCard } from "./stage-parts";
import { initRoomStore, useRoom, type LayoutPref } from "./store";
import { WatchPicker } from "./watch-picker";
import { YouTubeHub } from "./youtube-hub";

export function RoomView({ initial, media, onLeft }: { initial: RoomStateDTO; media: InitialMedia; onLeft: (seatKept: boolean) => void }) {
  const [ctl, setCtl] = useState<RoomController | null>(null);
  useEffect(() => {
    initRoomStore(initial);
    const c = new RoomController(initial.room.id, media);
    let started = false;
    // Deferred so React StrictMode's mount→unmount→mount doesn't connect twice.
    const t = setTimeout(() => {
      started = true;
      setCtl(c);
      void c.start();
    }, 0);
    return () => {
      clearTimeout(t);
      if (started) void c.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ctl) return <LoadingScreen label="Connecting…" />;
  return (
    <ControllerContext.Provider value={ctl}>
      <RoomShell onLeft={onLeft} />
    </ControllerContext.Provider>
  );
}

/** Heights of the floating chrome bands (top status pills, bottom control pill). */
const TOP_BAND = 64;
const BOTTOM_BAND = 96;
const PANEL_W = 376;

function RoomShell({ onLeft }: { onLeft: (seatKept: boolean) => void }) {
  const c = useController();
  const room = useLk();
  const conn = useRoom((s) => s.conn);
  const end = useRoom((s) => s.end);
  const panel = useRoom((s) => s.panel);
  const isHost = useRoom((s) => s.me.role === "host");
  const partnerDTO = useRoom((s) => s.participants.find((p) => p.id !== s.me.id));
  const playing = useRoom((s) => s.playback.status === "playing" && !!s.playback.mediaId);
  const browserOn = useRoom((s) => s.browser.active);
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const rootRef = useRef<HTMLDivElement>(null);
  const [immersive, setImmersive] = useState(false);
  const [idle, setIdle] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const partner = [...room.remoteParticipants.values()][0];

  const toggleImmersive = useCallback(async () => {
    const el = rootRef.current;
    if (!document.fullscreenElement) {
      setImmersive(true);
      if (el && document.fullscreenEnabled) await el.requestFullscreen().catch(() => {});
    } else {
      setImmersive(false);
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFs = () => setImmersive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleImmersive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleImmersive]);

  const poke = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 3000);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  // Chrome fades while something plays and nobody touches anything.
  const chromeHidden = (playing || browserOn) && idle && !leaveOpen && !panel;

  if (conn === "ended" && end) {
    return (
      <MessageScreen
        title={end.title}
        body={end.body}
        action={
          <Button asChild variant="primary">
            <Link href="/">Start a new room</Link>
          </Button>
        }
      />
    );
  }

  const panelInset = panel && desktop ? PANEL_W : 0;

  return (
    <div
      ref={rootRef}
      className={cn("fixed inset-0 overflow-hidden bg-black text-white", chromeHidden && "cursor-none")}
      onPointerMove={poke}
      onPointerDown={poke}
      onKeyDown={poke}
      data-testid="room"
      data-conn={conn}
    >
      <PartnerAudio />
      <div className="absolute inset-0 transition-[right] duration-300 ease-[cubic-bezier(.25,1,.5,1)]" style={{ right: panelInset }}>
        <Stage partner={partner} partnerName={partnerDTO?.displayName} chromeHidden={chromeHidden} />
        <AudioBlockedBanner />
        <ConnectionOverlay />
      </div>

      <header
        className={cn("pointer-events-none absolute inset-x-0 top-0 z-30 pt-[var(--safe-top)] transition-opacity duration-300 [&>*]:pointer-events-auto", chromeHidden && "opacity-0 [&>*]:pointer-events-none")}
        style={{ right: panelInset }}
      >
        <TopBar partner={partner} partnerName={partnerDTO?.displayName} />
      </header>

      <footer
        className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(var(--safe-bottom)+16px)] transition-opacity duration-300 [&>*]:pointer-events-auto", chromeHidden && "opacity-0 [&>*]:pointer-events-none")}
        style={{ right: panelInset }}
      >
        <ControlBar immersive={immersive} onToggleImmersive={() => void toggleImmersive()} onLeave={() => setLeaveOpen(true)} />
      </footer>

      <SidePanel desktop={desktop} />
      <WatchPicker />
      <YouTubeHub />
      <LeaveDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        isHost={isHost}
        onLeave={async () => {
          setLeaveOpen(false);
          await c.leave({ releaseSeat: !isHost });
          if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
          onLeft(isHost);
        }}
        onEnd={async () => {
          setLeaveOpen(false);
          try {
            await c.endForEveryone();
          } catch (e) {
            c.handleApiError(e, "Couldn’t end the room");
          }
        }}
      />
    </div>
  );
}

type Effective = Exclude<LayoutPref, "auto">;
type Content = "screen" | "browser" | "media" | "faces";

function Stage({ partner, partnerName, chromeHidden }: { partner?: Participant; partnerName?: string; chromeHidden: boolean }) {
  const c = useController();
  const room = useLk();
  const pref = useRoom((s) => s.layoutPref);
  const mediaId = useRoom((s) => s.playback.mediaId);
  const isYouTube = useRoom((s) => s.queue.find((q) => q.id === s.playback.mediaId)?.kind === "youtube");
  const browserOn = useRoom((s) => s.browser.active);
  const hideSelf = useRoom((s) => s.sound.hideSelf);
  const small = useMediaQuery("(max-width: 767px)");
  const portrait = useMediaQuery("(orientation: portrait)");
  const local = room.localParticipant;

  const sharer = partner?.isScreenShareEnabled ? partner : local.isScreenShareEnabled ? local : null;
  const content: Content = sharer ? "screen" : browserOn ? "browser" : mediaId ? "media" : "faces";

  let layout: Effective;
  if (pref === "auto") layout = small && portrait && content !== "faces" ? "compact" : content === "faces" ? "face" : content === "screen" ? "screen" : "cinema";
  else layout = pref;
  if (layout === "screen" && !sharer) layout = content === "faces" ? "face" : "cinema";
  if ((layout === "cinema" || layout === "compact") && content === "faces") layout = "face";

  let main: Content;
  if (layout === "face") main = "faces";
  else if (layout === "screen") main = "screen";
  else main = content;

  const minis: Content[] = [];
  for (const k of ["screen", "browser", "media"] as const) {
    const present = k === "screen" ? !!sharer : k === "browser" ? browserOn : !!mediaId;
    if (present && k !== main) minis.push(k);
  }

  // YouTube forbids anything on top of its player: give cameras their own rail.
  const railed = main === "media" && isYouTube && layout !== "compact";
  const railBelow = railed && small;

  const slot = (what: Content) => {
    if (main === what) return "absolute inset-0";
    const i = minis.indexOf(what);
    const yt = what === "media" && isYouTube;
    return cn(
      "absolute z-20 overflow-hidden rounded-xl shadow-float ring-1 ring-white/10 transition-all duration-300",
      yt ? "h-[244px] w-[356px]" : "aspect-video w-[min(320px,42vw)]",
      i === 0 ? "left-4" : "left-[calc(min(356px,42vw)+32px)]",
    );
  };
  const miniBottom = { bottom: BOTTOM_BAND + 8 };

  const onDouble = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, [role=slider], [data-player=youtube], [data-testid=shared-browser]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    c.sendPing((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  const contentNode = (
    <>
      {mediaId && (
        <div className={slot("media")} style={main === "media" ? undefined : miniBottom}>
          <MediaPlayer mode={main === "media" ? "main" : "mini"} onExpand={() => useRoom.setState({ layoutPref: "cinema" })} />
        </div>
      )}
      {browserOn && (
        <div className={slot("browser")} style={main === "browser" ? { top: TOP_BAND, bottom: BOTTOM_BAND - 8 } : miniBottom}>
          <SharedBrowser mode={main === "browser" ? "main" : "mini"} />
        </div>
      )}
      {sharer && (
        <div className={slot("screen")} style={main === "screen" ? undefined : miniBottom}>
          <ScreenStage sharer={sharer} isLocal={sharer === local} sharerName={sharer === local ? undefined : partnerName} />
        </div>
      )}
    </>
  );

  // Compact: content on top, both faces below (phones in portrait).
  if (layout === "compact" && main !== "faces") {
    return (
      <div className="absolute inset-0 flex flex-col gap-2 px-2 pb-[calc(var(--safe-bottom)+96px)] pt-[calc(var(--safe-top)+64px)]" data-testid="stage" data-layout={layout} data-main={main}>
        <div className="relative aspect-video max-h-[60%] w-full shrink-0 overflow-hidden rounded-2xl bg-black">{contentNode}</div>
        <div className="grid min-h-[120px] flex-1 grid-cols-2 gap-2">
          {partner ? (
            <ParticipantTile participant={partner} isLocal={false} name={partnerName} className="rounded-2xl" compact />
          ) : (
            <div className="grid place-items-center rounded-2xl bg-ink-850 p-3 text-center text-[12px] text-white/60">Waiting for {partnerName ?? "your guest"}</div>
          )}
          <ParticipantTile participant={local} isLocal className="rounded-2xl" compact />
        </div>
        <ReactionsLayer />
      </div>
    );
  }

  if (railed) {
    return (
      <div
        className={cn("absolute inset-0 flex gap-3 px-3", railBelow ? "flex-col" : "flex-row")}
        style={{ paddingTop: `calc(var(--safe-top) + ${TOP_BAND}px)`, paddingBottom: `calc(var(--safe-bottom) + ${BOTTOM_BAND}px)` }}
        data-testid="stage"
        data-layout={layout}
        data-main={main}
      >
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-black">{contentNode}</div>
        <aside className={cn("relative flex shrink-0 gap-3", railBelow ? "h-[120px] flex-row" : "w-[clamp(200px,22vw,300px)] flex-col justify-center")} aria-label="Cameras">
          {partner ? (
            <div className={cn("overflow-hidden rounded-2xl", railBelow ? "h-full flex-1" : "aspect-[4/3] w-full")}>
              <ParticipantTile participant={partner} isLocal={false} name={partnerName} className="rounded-2xl" compact />
            </div>
          ) : (
            <div className={cn("grid place-items-center rounded-2xl bg-ink-850 p-3 text-center text-[12px] text-white/60", railBelow ? "h-full flex-1" : "aspect-[4/3] w-full")}>Waiting for {partnerName ?? "your guest"}</div>
          )}
          {!hideSelf && (
            <div className={cn("overflow-hidden rounded-2xl", railBelow ? "h-full flex-1" : "aspect-[4/3] w-full")}>
              <ParticipantTile participant={local} isLocal className="rounded-2xl" compact />
            </div>
          )}
          {/* Reactions float over the rail, never over the YouTube player. */}
          <ReactionsLayer className="[&>span]:!bottom-4" />
        </aside>
      </div>
    );
  }

  return (
    <div className="absolute inset-0" data-testid="stage" data-layout={layout} data-main={main}>
      <div className="absolute inset-0" onDoubleClick={main === "screen" || (main === "media" && !isYouTube) ? onDouble : undefined}>
        {contentNode}
        {main !== "faces" && <PingLayer />}
      </div>
      {main === "faces" && <Faces partner={partner} partnerName={partnerName} split={pref === "face"} />}
      {main !== "faces" && (
        <FloatingTiles
          local={local}
          remote={partner}
          remoteName={partnerName}
          // Keep clear of the top pills, the control pill, and the video's own seek/volume row.
          insets={{ top: chromeHidden ? 0 : TOP_BAND, bottom: main === "media" ? BOTTOM_BAND + 92 : BOTTOM_BAND }}
        />
      )}
      <ReactionsLayer />
    </div>
  );
}

/** Call view: partner full-bleed with you in picture-in-picture (or split, if chosen). */
function Faces({ partner, partnerName, split }: { partner?: Participant; partnerName?: string; split: boolean }) {
  const room = useLk();
  const local = room.localParticipant;
  const hideSelf = useRoom((s) => s.sound.hideSelf);

  if (!partner) {
    return (
      <div className="absolute inset-0" data-testid="face-to-face">
        <div className="absolute inset-0 scale-105 opacity-50 blur-xl">
          <ParticipantTile participant={local} isLocal />
        </div>
        <div className="absolute inset-0 grid place-items-center bg-black/30 px-4 pb-[calc(var(--safe-bottom)+96px)] pt-[calc(var(--safe-top)+64px)]">
          <WaitingCard partnerName={partnerName} />
        </div>
      </div>
    );
  }

  if (split) {
    return (
      <div className="absolute inset-0 grid grid-cols-1 gap-2 p-2 pb-[calc(var(--safe-bottom)+96px)] pt-[calc(var(--safe-top)+64px)] sm:grid-cols-2" data-testid="face-to-face">
        <div className="overflow-hidden rounded-2xl">
          <ParticipantTile participant={partner} isLocal={false} name={partnerName} />
        </div>
        <div className="overflow-hidden rounded-2xl">
          <ParticipantTile participant={local} isLocal />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0" data-testid="face-to-face">
      <ParticipantTile participant={partner} isLocal={false} name={partnerName} />
      {!hideSelf && <FloatingTiles local={local} remoteName={partnerName} insets={{ top: TOP_BAND, bottom: BOTTOM_BAND }} />}
    </div>
  );
}

function SidePanel({ desktop }: { desktop: boolean }) {
  const panel = useRoom((s) => s.panel);
  const unread = useRoom((s) => s.unread);
  const tabs: { id: "chat" | "queue"; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "queue", label: "Up next" },
  ];
  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3" role="tablist" aria-label="Side panel">
        <div className="flex rounded-full bg-white/[0.07] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={panel === t.id}
              onClick={() => useRoom.setState({ panel: t.id, unread: t.id === "chat" ? 0 : unread })}
              className={cn("relative h-8 rounded-full px-4 text-[13px] font-semibold transition-colors", panel === t.id ? "bg-white text-black" : "text-paper-dim hover:text-paper")}
            >
              {t.label}
              {t.id === "chat" && panel !== "chat" && unread > 0 && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-lamp align-middle" />}
            </button>
          ))}
        </div>
        <button aria-label="Close panel" onClick={() => useRoom.setState({ panel: null })} className="ml-auto grid size-8 place-items-center rounded-full bg-white/10 text-paper-dim hover:text-paper">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">{panel === "chat" ? <ChatPanel /> : panel === "queue" ? <QueuePanel /> : null}</div>
    </div>
  );

  if (desktop) {
    return (
      <AnimatePresence initial={false}>
        {panel && (
          <motion.aside
            key="panel"
            initial={{ x: PANEL_W, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: PANEL_W, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
            className="absolute bottom-3 right-3 top-3 z-40 w-[360px] overflow-hidden rounded-[24px] border hairline bg-ink-850"
            aria-label="Chat and up next"
          >
            {body}
          </motion.aside>
        )}
      </AnimatePresence>
    );
  }
  return (
    <AnimatePresence>
      {panel && (
        <>
          <motion.div key="scrim" className="fixed inset-0 z-40 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useRoom.setState({ panel: null })} />
          <motion.aside
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            className="fixed inset-x-0 bottom-0 z-50 h-[75dvh] overflow-hidden rounded-t-[28px] border-t hairline bg-ink-850 pb-[var(--safe-bottom)]"
            aria-label="Chat and up next"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" aria-hidden />
            {body}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

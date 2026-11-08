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
import { QueuePanel } from "./queue-panel";
import { LoadingScreen, MessageScreen } from "./screens";
import { AudioBlockedBanner, ConnectionOverlay, PingLayer, ReactionsLayer, ScreenStage, TopBar, WaitingCard } from "./stage-parts";
import { initRoomStore, useRoom, type LayoutPref } from "./store";
import { SyncedPlayer } from "./synced-player";

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

function RoomShell({ onLeft }: { onLeft: (seatKept: boolean) => void }) {
  const c = useController();
  const room = useLk();
  const conn = useRoom((s) => s.conn);
  const end = useRoom((s) => s.end);
  const panel = useRoom((s) => s.panel);
  const isHost = useRoom((s) => s.me.role === "host");
  const partnerDTO = useRoom((s) => s.participants.find((p) => p.id !== s.me.id));
  const playbackStatus = useRoom((s) => s.playback.status);
  const mediaId = useRoom((s) => s.playback.mediaId);
  const rootRef = useRef<HTMLDivElement>(null);
  const [immersive, setImmersive] = useState(false);
  const [idle, setIdle] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const partner = [...room.remoteParticipants.values()][0];

  const toggleImmersive = useCallback(async () => {
    const el = rootRef.current;
    if (!immersive) {
      setImmersive(true);
      if (el && document.fullscreenEnabled && !document.fullscreenElement) await el.requestFullscreen().catch(() => {});
    } else {
      setImmersive(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    }
  }, [immersive]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
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
      } else if (e.key === "Escape" && immersive && !document.fullscreenElement) setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleImmersive, immersive]);

  // In cinema mode, chrome fades while something plays and nobody touches anything.
  const watching = !!mediaId && playbackStatus === "playing";
  const poke = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2800);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  const chromeHidden = immersive && watching && idle && !leaveOpen;

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

  return (
    <div
      ref={rootRef}
      className={cn("fixed inset-0 flex flex-col bg-ink-950 pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] pt-[var(--safe-top)]", chromeHidden && "cursor-none")}
      onPointerMove={poke}
      onPointerDown={poke}
      onKeyDown={poke}
      data-testid="room"
      data-conn={conn}
    >
      <PartnerAudio />
      <header
        className={cn(
          "z-30 shrink-0 transition-opacity duration-300",
          immersive && "absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent pt-[var(--safe-top)]",
          chromeHidden && "pointer-events-none opacity-0",
        )}
      >
        <TopBar partner={partner} partnerName={partnerDTO?.displayName} />
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className={cn("relative min-w-0 flex-1", immersive ? "p-0" : "px-2 sm:px-3")}>
          <Stage partner={partner} partnerName={partnerDTO?.displayName} immersive={immersive} />
          <ReactionsLayer />
          <AudioBlockedBanner />
          <ConnectionOverlay />
        </main>
        <SidePanel open={panel !== null} />
      </div>

      <footer
        className={cn(
          "z-30 shrink-0 py-3 transition-opacity duration-300 sm:py-4",
          immersive && "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pb-[calc(var(--safe-bottom)+12px)] pt-10",
          chromeHidden && "pointer-events-none opacity-0",
        )}
      >
        <ControlBar immersive={immersive} onToggleImmersive={() => void toggleImmersive()} onLeave={() => setLeaveOpen(true)} />
      </footer>

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

function Stage({ partner, partnerName, immersive }: { partner?: Participant; partnerName?: string; immersive: boolean }) {
  const c = useController();
  const room = useLk();
  const pref = useRoom((s) => s.layoutPref);
  const mediaId = useRoom((s) => s.playback.mediaId);
  const small = useMediaQuery("(max-width: 767px)");
  const portrait = useMediaQuery("(orientation: portrait)");
  const local = room.localParticipant;

  const sharer = partner?.isScreenShareEnabled ? partner : local.isScreenShareEnabled ? local : null;
  const content = sharer ? "screen" : mediaId ? "media" : "faces";

  let layout: Effective;
  if (pref === "auto") layout = small && portrait ? "compact" : content === "faces" ? "face" : content === "screen" ? "screen" : "cinema";
  else layout = pref;
  if (layout === "screen" && !sharer) layout = mediaId ? "cinema" : "face";
  if (layout === "cinema" && content === "faces") layout = "face";

  // What occupies the main area, and what's docked small.
  let main: "media" | "screen" | "faces";
  if (layout === "face") main = "faces";
  else if (layout === "screen") main = "screen";
  else if (layout === "cinema") main = mediaId && !(pref === "auto" && sharer) ? "media" : "screen";
  else main = sharer ? "screen" : mediaId ? "media" : "faces";

  const minis: ("media" | "screen")[] = [];
  if (sharer && main !== "screen") minis.push("screen");
  if (mediaId && main !== "media") minis.push("media");

  const slot = (what: "media" | "screen") => {
    if (main === what) return "absolute inset-0";
    const i = minis.indexOf(what);
    return cn(
      "absolute z-20 aspect-video w-[min(300px,42%)] overflow-hidden rounded-md shadow-float ring-1 ring-[var(--line)]",
      i === 0 ? "bottom-3 left-3" : "bottom-3 left-[calc(min(300px,42%)+24px)]",
    );
  };

  const onDouble = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, [role=slider]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    c.sendPing((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  const showFloating = main !== "faces" && layout !== "compact";

  return (
    <div className={cn("flex h-full w-full flex-col gap-2", layout === "compact" && "gap-2")} data-testid="stage" data-layout={layout} data-main={main}>
      <div className={cn("relative min-h-0", layout === "compact" && main !== "faces" ? "aspect-video max-h-[60%] w-full shrink-0 landscape:max-h-full landscape:flex-1" : "flex-1")}>
        <div className={cn("absolute inset-0", main !== "faces" && "")} onDoubleClick={main !== "faces" ? onDouble : undefined}>
          {mediaId && (
            <div className={slot("media")}>
              <SyncedPlayer key={mediaId} mode={main === "media" ? "main" : "mini"} onExpand={() => useRoom.setState({ layoutPref: "cinema" })} />
            </div>
          )}
          {sharer && (
            <div className={slot("screen")}>
              <ScreenStage sharer={sharer} isLocal={sharer === local} sharerName={sharer === local ? undefined : partnerName} />
            </div>
          )}
          {main !== "faces" && <PingLayer />}
        </div>

        {main === "faces" && <FaceToFace partner={partner} partnerName={partnerName} stacked={layout === "compact" || (small && portrait)} />}
        {showFloating && <FloatingTiles local={local} remote={partner} remoteName={partnerName} insets={{ top: immersive ? 56 : 0, bottom: main === "media" ? 72 : 0 }} />}
      </div>

      {layout === "compact" && main !== "faces" && (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          {partner ? (
            <ParticipantTile participant={partner} isLocal={false} name={partnerName} className="rounded-lg" compact />
          ) : (
            <div className="grid place-items-center rounded-lg bg-ink-900 p-3 text-center text-[12px] text-paper-dim">Waiting for {partnerName ?? "your guest"}</div>
          )}
          <ParticipantTile participant={local} isLocal className="rounded-lg" compact />
        </div>
      )}
    </div>
  );
}

function FaceToFace({ partner, partnerName, stacked }: { partner?: Participant; partnerName?: string; stacked: boolean }) {
  const room = useLk();
  const hideSelf = useRoom((s) => s.sound.hideSelf);
  const showSelf = !hideSelf || !partner;
  return (
    <div className={cn("absolute inset-0 grid gap-2 sm:gap-3", stacked ? "grid-rows-2" : showSelf ? "grid-cols-2" : "grid-cols-1")} data-testid="face-to-face">
      <FaceCell align={stacked ? "center" : showSelf ? "end" : "center"}>
        {partner ? (
          <ParticipantTile participant={partner} isLocal={false} name={partnerName} className="rounded-xl" />
        ) : (
          <div className="grid h-full place-items-center rounded-xl bg-ink-900 p-6 shadow-[0_0_0_1px_var(--line)]">
            <WaitingCard partnerName={partnerName} />
          </div>
        )}
      </FaceCell>
      {showSelf && (
        <FaceCell align={stacked ? "center" : "start"}>
          <ParticipantTile participant={room.localParticipant} isLocal className="rounded-xl" />
        </FaceCell>
      )}
    </div>
  );
}

/** Keeps a 4:3 frame that fits its cell in both directions (container query units). */
function FaceCell({ children, align }: { children: React.ReactNode; align: "start" | "center" | "end" }) {
  return (
    <div className={cn("flex min-h-0 min-w-0 items-center [container-type:size]", align === "end" ? "justify-end" : align === "start" ? "justify-start" : "justify-center")}>
      <div className="relative aspect-[4/3] w-[min(100cqw,calc(100cqh*4/3))] overflow-hidden rounded-xl">{children}</div>
    </div>
  );
}

function SidePanel({ open }: { open: boolean }) {
  const panel = useRoom((s) => s.panel);
  const unread = useRoom((s) => s.unread);
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const tabs: { id: "chat" | "queue"; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "queue", label: "Watchlist" },
  ];
  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b hairline px-3" role="tablist" aria-label="Side panel">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={panel === t.id}
            onClick={() => useRoom.setState({ panel: t.id, unread: t.id === "chat" ? 0 : unread })}
            className={cn("relative h-8 rounded-sm px-3 text-[13px] font-medium transition-colors", panel === t.id ? "bg-ink-800 text-paper" : "text-paper-dim hover:text-paper")}
          >
            {t.label}
            {t.id === "chat" && panel !== "chat" && unread > 0 && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-lamp align-middle" />}
          </button>
        ))}
        <button aria-label="Close panel" onClick={() => useRoom.setState({ panel: null })} className="ml-auto grid size-8 place-items-center rounded-sm text-paper-faint hover:bg-ink-800 hover:text-paper">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">{panel === "chat" ? <ChatPanel /> : panel === "queue" ? <QueuePanel /> : null}</div>
    </div>
  );

  if (desktop) {
    return (
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            key="panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
            className="shrink-0 overflow-hidden"
            aria-label="Chat and watchlist"
          >
            <div className="ml-1 mr-3 h-full w-[348px] overflow-hidden rounded-xl border hairline bg-ink-900">{body}</div>
          </motion.aside>
        )}
      </AnimatePresence>
    );
  }
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useRoom.setState({ panel: null })} />
          <motion.aside
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            className="fixed inset-x-0 bottom-0 z-50 h-[72dvh] overflow-hidden rounded-t-xl border-t hairline bg-ink-900 pb-[var(--safe-bottom)] shadow-float"
            aria-label="Chat and watchlist"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink-600" aria-hidden />
            {body}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

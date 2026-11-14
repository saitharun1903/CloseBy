import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource,
  type RemoteParticipant,
} from "@livekit/rtc-node";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { BOT_IDENTITY_PREFIX, parseInput, toPlaywrightKey, TOPIC_INPUT, TOPIC_STATE, type BrowserState, type InputEvent } from "./protocol.ts";

export interface SessionOptions {
  roomId: string;
  livekitUrl: string;
  token: string;
  startUrl: string;
  display: number;
  width?: number;
  height?: number;
  fps?: number;
  chromePath?: string;
  /** End the session when no people have been in the room for this long. */
  emptyTimeoutMs?: number;
  /** Hard cap on a session's lifetime. */
  maxLifetimeMs?: number;
  log?: (msg: string) => void;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * One room's shared browser: a real Chromium on its own virtual display and
 * audio sink, streamed into the room's LiveKit call as a (silent, camera-less)
 * participant. People in the room drive it with mouse/keyboard events sent
 * over the data channel.
 */
export class BrowserSession {
  readonly roomId: string;
  private o: Required<Omit<SessionOptions, "log" | "chromePath">> & { chromePath?: string };
  private log: (m: string) => void;
  private procs: ChildProcess[] = [];
  private room = new Room();
  private ctx?: BrowserContext;
  private page?: Page;
  private dataDir?: string;
  private sink: string;
  private queue: Promise<unknown> = Promise.resolve();
  private stateTimer?: ReturnType<typeof setInterval>;
  private emptyTimer?: ReturnType<typeof setTimeout>;
  private lifeTimer?: ReturnType<typeof setTimeout>;
  private stopping = false;
  private lastState = "";
  onEnded?: (reason: string) => void;

  constructor(opts: SessionOptions) {
    this.roomId = opts.roomId;
    this.o = { width: 1280, height: 720, fps: 30, emptyTimeoutMs: 120_000, maxLifetimeMs: 4 * 3600_000, ...opts } as typeof this.o;
    this.log = (m) => (opts.log ?? console.log)(`[${opts.roomId}] ${m}`);
    this.sink = `cb_${opts.display}`;
  }

  async start() {
    const { width: W, height: H, display } = this.o;
    const env = { ...process.env, DISPLAY: `:${display}`, PULSE_SINK: this.sink };

    // 1. Virtual screen and a private audio sink.
    this.spawn("Xvfb", [`:${display}`, "-screen", "0", `${W}x${H}x24`, "-nolisten", "tcp", "-ac"]);
    await waitFor(() => run("xdpyinfo", ["-display", `:${display}`]).then((c) => c === 0), 8000, "virtual display");
    await run("pactl", ["load-module", "module-null-sink", `sink_name=${this.sink}`, `sink_properties=device.description=${this.sink}`]);

    // 2. Chromium, full screen on that display, no browser chrome (we draw our own address bar).
    this.dataDir = await mkdtemp(path.join(tmpdir(), "cb-chrome-"));
    this.ctx = await chromium.launchPersistentContext(this.dataDir, {
      executablePath: this.o.chromePath || undefined,
      headless: false,
      viewport: null,
      env,
      ignoreDefaultArgs: ["--enable-automation", "--mute-audio", "--hide-scrollbars"],
      args: [
        "--kiosk",
        `--window-size=${W},${H}`,
        "--window-position=0,0",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars",
        "--disable-blink-features=AutomationControlled",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-features=Translate,MediaRouter,DialMediaRouteProvider",
        "--disable-dev-shm-usage",
        "--password-store=basic",
        "--lang=en-US",
      ],
    });
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    this.wirePage(this.page);
    // Links that open new windows land in the same view instead.
    this.ctx.on("page", (p) => void this.adoptPopup(p));
    void this.page.goto(this.o.startUrl, { waitUntil: "commit" }).catch((e) => this.log(`start url failed: ${e.message}`));

    // 3. Join the call and publish the screen + sound.
    this.room.on(RoomEvent.DataReceived, this.onData);
    this.room.on(RoomEvent.ParticipantConnected, () => {
      this.armEmptyTimer();
      void this.publishState(true);
    });
    this.room.on(RoomEvent.ParticipantDisconnected, () => this.armEmptyTimer());
    this.room.on(RoomEvent.Disconnected, () => void this.stop("disconnected from the call"));
    await this.room.connect(this.o.livekitUrl, this.o.token, { autoSubscribe: false, dynacast: true });

    const vsrc = new VideoSource(W, H);
    const vtrack = LocalVideoTrack.createVideoTrack("shared-browser", vsrc);
    await this.room.localParticipant!.publishTrack(
      vtrack,
      new TrackPublishOptions({ source: TrackSource.SOURCE_SCREENSHARE, simulcast: true, videoEncoding: { maxBitrate: 3_500_000n, maxFramerate: this.o.fps } }),
    );
    const asrc = new AudioSource(48000, 2, 1000);
    const atrack = LocalAudioTrack.createAudioTrack("shared-browser-audio", asrc);
    await this.room.localParticipant!.publishTrack(atrack, new TrackPublishOptions({ source: TrackSource.SOURCE_SCREENSHARE_AUDIO, dtx: false, red: true }));

    this.captureVideo(vsrc);
    this.captureAudio(asrc);

    this.stateTimer = setInterval(() => void this.publishState(true), 5000);
    this.lifeTimer = setTimeout(() => void this.stop("time limit"), this.o.maxLifetimeMs);
    this.armEmptyTimer();
    this.log(`started (${W}x${H}@${this.o.fps}, display :${display})`);
  }

  /** People (not bots) currently in the room. */
  private humans() {
    return [...this.room.remoteParticipants.values()].filter((p) => !p.identity.startsWith(BOT_IDENTITY_PREFIX));
  }

  private armEmptyTimer() {
    clearTimeout(this.emptyTimer);
    if (this.humans().length > 0) return;
    this.emptyTimer = setTimeout(() => void this.stop("room empty"), this.o.emptyTimeoutMs);
  }

  /* ───────────── capture ───────────── */

  private captureVideo(src: VideoSource) {
    const { width: W, height: H, fps, display } = this.o;
    const frameBytes = (W * H * 3) / 2; // I420
    const ff = this.spawn("ffmpeg", [
      "-loglevel", "error", "-nostdin",
      "-f", "x11grab", "-draw_mouse", "0", "-framerate", String(fps), "-video_size", `${W}x${H}`, "-i", `:${display}`,
      "-pix_fmt", "yuv420p", "-f", "rawvideo", "pipe:1",
    ]);
    let buf = Buffer.alloc(0);
    ff.stdout!.on("data", (chunk: Buffer) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= frameBytes) {
        const frame = new Uint8Array(buf.subarray(0, frameBytes));
        buf = buf.subarray(frameBytes);
        src.captureFrame(new VideoFrame(frame, W, H, VideoBufferType.I420));
      }
    });
  }

  private captureAudio(src: AudioSource) {
    const samples = 480; // 10 ms at 48 kHz
    const bytes = samples * 2 * 2; // stereo s16
    const ff = this.spawn("ffmpeg", [
      "-loglevel", "error", "-nostdin",
      "-f", "pulse", "-fragment_size", "1920", "-i", `${this.sink}.monitor`,
      "-ac", "2", "-ar", "48000", "-f", "s16le", "pipe:1",
    ], { optional: true }); // no sound is better than no browser
    let buf = Buffer.alloc(0);
    let chain: Promise<void> = Promise.resolve();
    ff.stdout!.on("data", (chunk: Buffer) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= bytes) {
        const pcm = new Int16Array(samples * 2);
        Buffer.from(pcm.buffer).set(buf.subarray(0, bytes));
        buf = buf.subarray(bytes);
        chain = chain.then(() => src.captureFrame(new AudioFrame(pcm, 48000, 2, samples))).catch(() => {});
      }
    });
  }

  /* ───────────── input ───────────── */

  private onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
    if (topic !== TOPIC_INPUT || !participant || participant.identity.startsWith(BOT_IDENTITY_PREFIX)) return;
    let ev: InputEvent | null = null;
    try {
      ev = parseInput(JSON.parse(dec.decode(payload)));
    } catch {
      return;
    }
    if (!ev) return;
    const e = ev;
    // Keep events in order (a click must follow the move that preceded it).
    this.queue = this.queue.then(() => this.apply(e)).catch((err) => this.log(`input failed: ${(err as Error).message}`));
  };

  private async apply(e: InputEvent) {
    const p = this.page;
    if (!p || p.isClosed()) return;
    const { width: W, height: H } = this.o;
    const button = (b: 0 | 1 | 2) => (b === 1 ? "middle" : b === 2 ? "right" : "left");
    switch (e.t) {
      case "move":
        return p.mouse.move(e.x * W, e.y * H);
      case "down":
        await p.mouse.move(e.x * W, e.y * H);
        return p.mouse.down({ button: button(e.b) });
      case "up":
        await p.mouse.move(e.x * W, e.y * H);
        return p.mouse.up({ button: button(e.b) });
      case "wheel":
        await p.mouse.move(e.x * W, e.y * H);
        return p.mouse.wheel(e.dx, e.dy);
      case "key":
        return e.type === "down" ? p.keyboard.down(toPlaywrightKey(e.key)) : p.keyboard.up(toPlaywrightKey(e.key));
      case "text":
        return p.keyboard.insertText(e.s);
      case "nav":
        await p.goto(e.url, { waitUntil: "commit" }).catch(() => {});
        return this.publishState();
      case "back":
        await p.goBack({ waitUntil: "commit" }).catch(() => {});
        return this.publishState();
      case "forward":
        await p.goForward({ waitUntil: "commit" }).catch(() => {});
        return this.publishState();
      case "reload":
        await p.reload({ waitUntil: "commit" }).catch(() => {});
        return this.publishState();
      case "stop":
        await p.evaluate(() => window.stop()).catch(() => {});
        return this.publishState();
    }
  }

  /* ───────────── page state ───────────── */

  private wirePage(p: Page) {
    p.on("framenavigated", (f) => {
      if (f === p.mainFrame()) void this.publishState();
    });
    p.on("load", () => void this.publishState());
    p.on("domcontentloaded", () => void this.publishState());
  }

  private async adoptPopup(popup: Page) {
    if (popup === this.page) return;
    try {
      await popup.waitForURL((u) => u.toString() !== "about:blank", { timeout: 8000 });
    } catch {
      /* stayed blank */
    }
    const url = popup.url();
    await popup.close().catch(() => {});
    if (url && url !== "about:blank" && this.page) await this.page.goto(url, { waitUntil: "commit" }).catch(() => {});
  }

  private cdp?: import("playwright-core").CDPSession;

  private async state(): Promise<BrowserState> {
    const p = this.page!;
    this.cdp ??= await this.ctx!.newCDPSession(p);
    const [title, nav, loading] = await Promise.all([
      p.title().catch(() => ""),
      this.cdp.send("Page.getNavigationHistory").catch(() => null),
      p.evaluate(() => document.readyState !== "complete").catch(() => false),
    ]);
    const i = nav?.currentIndex ?? 0;
    const n = nav?.entries.length ?? 1;
    return { url: p.url(), title, canBack: i > 0, canForward: i < n - 1, loading };
  }

  private async publishState(force = false) {
    if (!this.page || this.stopping || !this.room.localParticipant) return;
    const s = await this.state();
    const json = JSON.stringify(s);
    if (!force && json === this.lastState) return;
    this.lastState = json;
    await this.room.localParticipant.publishData(enc.encode(json), { reliable: true, topic: TOPIC_STATE }).catch(() => {});
  }

  /* ───────────── lifecycle ───────────── */

  async stop(reason = "stopped") {
    if (this.stopping) return;
    this.stopping = true;
    this.log(`stopping: ${reason}`);
    clearInterval(this.stateTimer);
    clearTimeout(this.emptyTimer);
    clearTimeout(this.lifeTimer);
    await this.room.disconnect().catch(() => {});
    await this.ctx?.close().catch(() => {});
    for (const p of this.procs.reverse()) p.kill("SIGKILL");
    await run("sh", ["-c", `pactl list short modules | awk '/sink_name=${this.sink}( |$)/{print $1}' | xargs -r -n1 pactl unload-module`]).catch(() => {});
    if (this.dataDir) await rm(this.dataDir, { recursive: true, force: true }).catch(() => {});
    this.onEnded?.(reason);
  }

  private spawn(cmd: string, args: string[], opts: { optional?: boolean } = {}) {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DISPLAY: `:${this.o.display}` } });
    p.stderr!.on("data", (d: Buffer) => {
      const s = d.toString().trim();
      if (s) this.log(`${cmd}: ${s.slice(0, 300)}`);
    });
    p.on("exit", (code) => {
      if (!this.stopping && code !== null && code !== 0) {
        this.log(`${cmd} exited (${code})${opts.optional ? " — continuing without it" : ""}`);
        if (!opts.optional) void this.stop(`${cmd} crashed`);
      }
    });
    this.procs.push(p);
    return p;
  }
}

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("exit", (c) => resolve(c ?? 1));
    p.on("error", () => resolve(1));
  });
}

async function waitFor(check: () => Promise<boolean>, ms: number, what: string) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${what} didn't start`);
}

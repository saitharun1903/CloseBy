import { createHmac, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { BrowserSession } from "./session.ts";
import { normalizeUrl } from "./protocol.ts";

/**
 * Closeby browser host — runs real Chromium sessions for rooms.
 *
 *   POST   /sessions          { roomId, livekitUrl, token, startUrl }   start (idempotent per room)
 *   DELETE /sessions/:roomId                                             stop
 *   GET    /health                                                       { ok, sessions, capacity }
 *
 * Every request except /health is signed by the Closeby app:
 *   x-closeby-timestamp: unix ms
 *   x-closeby-signature: hex(HMAC-SHA256(BROWSER_HOST_SECRET, `${timestamp}.${method}.${path}.${body}`))
 */
const PORT = Number(process.env.PORT ?? 8787);
const SECRET = process.env.BROWSER_HOST_SECRET ?? "";
const CAPACITY = Number(process.env.MAX_SESSIONS ?? 3);
const CHROME_PATH = process.env.CHROME_PATH || undefined;
const FPS = Number(process.env.FPS ?? 30);
const WIDTH = Number(process.env.WIDTH ?? 1280);
const HEIGHT = Number(process.env.HEIGHT ?? 720);
// Only connect to the LiveKit project this host serves (optional but recommended).
const LIVEKIT_ALLOW = (process.env.LIVEKIT_URL_ALLOW ?? "").split(",").map((s) => s.trim()).filter(Boolean);

if (SECRET.length < 32) {
  console.error("BROWSER_HOST_SECRET must be set (32+ characters).");
  process.exit(1);
}

const sessions = new Map<string, BrowserSession>();
const starting = new Map<string, Promise<void>>();
const freeDisplays = Array.from({ length: CAPACITY }, (_, i) => 100 + i);

ensurePulse();

function ensurePulse() {
  if (spawnSync("pactl", ["info"], { stdio: "ignore" }).status === 0) return;
  const asRoot = process.getuid?.() === 0;
  spawnSync("pulseaudio", ["-D", "--exit-idle-time=-1", "--disallow-exit", ...(asRoot ? ["--system", "--disallow-module-loading=0"] : [])], { stdio: "inherit" });
}

function verify(req: IncomingMessage, path: string, body: string): boolean {
  const ts = Number(req.headers["x-closeby-timestamp"]);
  const sig = String(req.headers["x-closeby-signature"] ?? "");
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 60_000 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const want = createHmac("sha256", SECRET).update(`${ts}.${req.method}.${path}.${body}`).digest();
  return timingSafeEqual(want, Buffer.from(sig, "hex"));
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 16_384) throw new Error("too large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const ROOM_RE = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;

async function startSession(body: { roomId: string; livekitUrl: string; token: string; startUrl: string }) {
  if (sessions.has(body.roomId)) return;
  const pending = starting.get(body.roomId);
  if (pending) return pending;
  const display = freeDisplays.shift();
  if (display === undefined) throw Object.assign(new Error("at capacity"), { status: 503 });
  const s = new BrowserSession({
    roomId: body.roomId,
    livekitUrl: body.livekitUrl,
    token: body.token,
    startUrl: body.startUrl,
    display,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    chromePath: CHROME_PATH,
  });
  s.onEnded = () => {
    if (sessions.get(body.roomId) === s) sessions.delete(body.roomId);
    freeDisplays.push(display);
  };
  const p = s
    .start()
    .then(() => {
      sessions.set(body.roomId, s);
    })
    .catch(async (e) => {
      await s.stop(`failed to start: ${(e as Error).message}`);
      throw e;
    })
    .finally(() => starting.delete(body.roomId));
  starting.set(body.roomId, p);
  return p;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, sessions: sessions.size, capacity: CAPACITY });
    }
    const body = req.method === "POST" ? await readBody(req) : "";
    if (!verify(req, url.pathname, body)) return send(res, 401, { error: "unauthorized" });

    if (req.method === "POST" && url.pathname === "/sessions") {
      const b = JSON.parse(body) as Record<string, unknown>;
      const roomId = String(b.roomId ?? "");
      const livekitUrl = String(b.livekitUrl ?? "");
      const token = String(b.token ?? "");
      const startUrl = normalizeUrl(b.startUrl ?? "https://www.youtube.com") ?? "https://www.youtube.com";
      if (!ROOM_RE.test(roomId) || !/^wss?:\/\//.test(livekitUrl) || token.length < 20) return send(res, 400, { error: "bad request" });
      if (LIVEKIT_ALLOW.length && !LIVEKIT_ALLOW.some((a) => livekitUrl.startsWith(a))) return send(res, 403, { error: "livekit url not allowed" });
      await startSession({ roomId, livekitUrl, token, startUrl });
      return send(res, 200, { ok: true });
    }
    const m = url.pathname.match(/^\/sessions\/([a-z0-9-]+)$/);
    if (req.method === "DELETE" && m) {
      await sessions.get(m[1]!)?.stop("closed by the room");
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("request failed:", (e as Error).message);
    return send(res, status, { error: status === 503 ? "at capacity" : "failed" });
  }
});

server.listen(PORT, () => console.log(`browser host listening on :${PORT} (capacity ${CAPACITY})`));

async function shutdown() {
  await Promise.all([...sessions.values()].map((s) => s.stop("host shutting down")));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

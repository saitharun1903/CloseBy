import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ROOM_ID_RE } from "./crypto";
import { getDb } from "./db";
import { env } from "./env";
import { AppError } from "./errors";
import { getGateway } from "./livekit";
import { hit, type RateRule } from "./ratelimit";
import type { RoomDeps } from "./rooms";
import { sessionCookieName, signSession, verifySession, type SessionClaims } from "./session";

export function deps(): RoomDeps {
  const e = env();
  return { db: getDb(), gateway: getGateway(), secret: e.SESSION_SECRET, appUrl: e.APP_URL, ttlHours: e.ROOM_TTL_HOURS };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    const res = NextResponse.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status });
    if (err.extra?.retryAfterSec) res.headers.set("Retry-After", String(err.extra.retryAfterSec));
    return res;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      { error: { code: "bad_request", message: first?.message ?? "Invalid request", field: first?.path.join(".") } },
      { status: 400 },
    );
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong on our side. Please try again." } }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: CSRF origin check for mutations, uniform error mapping. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") await assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

async function assertSameOrigin(req: Request) {
  // Cookies are SameSite=Lax; additionally require the Origin to match for state-changing calls.
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (no ambient cookies to abuse)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("forbidden", "Bad origin.");
  }
  const appHost = new URL(env().APP_URL).host;
  if (originHost !== host && originHost !== appHost) throw new AppError("forbidden", "Cross-site request blocked.");
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new AppError("bad_request", "Expected JSON.");
  const text = await req.text();
  if (text.length > 16_384) throw new AppError("bad_request", "Request too large.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppError("bad_request", "Malformed JSON.");
  }
  return schema.parse(data);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Trust the first hop only if your proxy sets it; see docs/DEPLOYMENT.md.
  const xff = h.get("x-forwarded-for");
  return (xff?.split(",")[0]?.trim() || h.get("x-real-ip") || "local").slice(0, 64);
}

export async function limit(bucket: string, id: string, rule: RateRule) {
  const r = await hit(bucket, id, rule);
  if (!r.ok) throw new AppError("rate_limited", "You’re doing that a bit too often. Try again shortly.", { retryAfterSec: r.retryAfterSec });
}

export function assertRoomId(roomId: string) {
  if (!ROOM_ID_RE.test(roomId)) throw new AppError("not_found", "This room doesn’t exist.");
}

export async function readSession(roomId: string): Promise<SessionClaims | null> {
  const jar = await cookies();
  const tok = jar.get(sessionCookieName(roomId))?.value;
  if (!tok) return null;
  return verifySession(tok, roomId, env().SESSION_SECRET);
}

export async function setSessionCookie(res: NextResponse, claims: SessionClaims, expiresAt: Date) {
  const token = await signSession(claims, env().SESSION_SECRET, expiresAt);
  res.cookies.set(sessionCookieName(claims.rid), token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse, roomId: string) {
  res.cookies.set(sessionCookieName(roomId), "", { httpOnly: true, path: "/", maxAge: 0 });
}

export type RoomCtx = { params: Promise<{ roomId: string }> };

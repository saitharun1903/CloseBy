import Redis from "ioredis";

/**
 * Fixed-window rate limiter. Uses Redis when REDIS_URL is set (shared across
 * instances), otherwise an in-process map (adequate for one instance).
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateRule {
  limit: number;
  windowSec: number;
}

export const RULES = {
  createRoom: { limit: 10, windowSec: 600 },
  preview: { limit: 30, windowSec: 60 },
  join: { limit: 12, windowSec: 300 },
  pinFailure: { limit: 5, windowSec: 900 },
  token: { limit: 30, windowSec: 60 },
  playback: { limit: 40, windowSec: 10 },
  queue: { limit: 30, windowSec: 60 },
  generic: { limit: 120, windowSec: 60 },
} satisfies Record<string, RateRule>;

const memory = new Map<string, { count: number; resetAt: number }>();
let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return (redis = null);
  redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  redis.on("error", () => {
    /* fall back to memory on errors; logged once below */
  });
  return redis;
}

async function hitMemory(key: string, rule: RateRule): Promise<RateLimitResult> {
  const now = Date.now();
  let e = memory.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + rule.windowSec * 1000 };
    memory.set(key, e);
  }
  e.count++;
  if (memory.size > 50_000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  return {
    ok: e.count <= rule.limit,
    remaining: Math.max(0, rule.limit - e.count),
    retryAfterSec: Math.ceil((e.resetAt - now) / 1000),
  };
}

/** Multiplies every limit. 1 in production; raised only for automated tests that create many rooms. */
function scaled(rule: RateRule): RateRule {
  const k = Number(process.env.RATE_LIMIT_SCALE ?? 1);
  return Number.isFinite(k) && k > 0 ? { ...rule, limit: Math.ceil(rule.limit * k) } : rule;
}

export async function hit(bucket: string, id: string, rawRule: RateRule): Promise<RateLimitResult> {
  const rule = scaled(rawRule);
  const key = `cb:rl:${bucket}:${id}`;
  const r = getRedis();
  if (r && r.status === "ready") {
    try {
      const res = await r.multi().incr(key).expire(key, rule.windowSec, "NX").ttl(key).exec();
      const count = Number(res?.[0]?.[1] ?? 0);
      const ttl = Number(res?.[2]?.[1] ?? rule.windowSec);
      return { ok: count <= rule.limit, remaining: Math.max(0, rule.limit - count), retryAfterSec: Math.max(1, ttl) };
    } catch {
      // fall through to memory
    }
  }
  return hitMemory(key, rule);
}

/** Peek without incrementing (used to block PIN attempts after too many failures). */
export async function peek(bucket: string, id: string, rawRule: RateRule): Promise<RateLimitResult> {
  const rule = scaled(rawRule);
  const key = `cb:rl:${bucket}:${id}`;
  const r = getRedis();
  if (r && r.status === "ready") {
    try {
      const [count, ttl] = await Promise.all([r.get(key), r.ttl(key)]);
      const c = Number(count ?? 0);
      return { ok: c < rule.limit, remaining: Math.max(0, rule.limit - c), retryAfterSec: Math.max(1, ttl) };
    } catch {
      /* fall through */
    }
  }
  const e = memory.get(key);
  const now = Date.now();
  if (!e || e.resetAt <= now) return { ok: true, remaining: rule.limit, retryAfterSec: 0 };
  return { ok: e.count < rule.limit, remaining: Math.max(0, rule.limit - e.count), retryAfterSec: Math.ceil((e.resetAt - now) / 1000) };
}

export function resetMemoryLimiter() {
  memory.clear();
}

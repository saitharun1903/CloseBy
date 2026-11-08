import { describe, expect, it } from "vitest";
import { createRoomBody, displayNameSchema, httpUrlSchema, joinRoomBody, playbackIntentBody } from "@/lib/protocol";
import { decryptString, encryptString, hashPin, newRoomId, newSecretToken, ROOM_ID_RE, safeEqualHex, sha256, verifyPin } from "@/server/crypto";
import { hit, peek, resetMemoryLimiter } from "@/server/ratelimit";
import { sessionCookieName, signSession, verifySession } from "@/server/session";

const SECRET = "x".repeat(48);

describe("ids and secrets", () => {
  it("room ids match the documented format and are unique", () => {
    const ids = new Set(Array.from({ length: 500 }, newRoomId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(ROOM_ID_RE);
  });
  it("invite tokens are 256-bit base64url", () => {
    const t = newSecretToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("constant-time compare on hashes", () => {
    expect(safeEqualHex(sha256("a"), sha256("a"))).toBe(true);
    expect(safeEqualHex(sha256("a"), sha256("b"))).toBe(false);
    expect(safeEqualHex(sha256("a"), "abcd")).toBe(false);
  });
});

describe("PIN hashing", () => {
  it("verifies the right PIN only", async () => {
    const h = await hashPin("4821");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPin("4821", h)).toBe(true);
    expect(await verifyPin("4822", h)).toBe(false);
    expect(await verifyPin("4821", "garbage")).toBe(false);
  });
});

describe("invite token encryption", () => {
  it("round-trips and rejects tampering", () => {
    const enc = encryptString("hello", SECRET);
    expect(decryptString(enc, SECRET)).toBe("hello");
    const [iv, tag, ct] = enc.split(".");
    const flipped = `${iv}.${tag}.${ct!.slice(0, -2)}${ct!.slice(-2) === "AA" ? "AB" : "AA"}`;
    expect(() => decryptString(flipped, SECRET)).toThrow();
    expect(() => decryptString(enc, "y".repeat(48))).toThrow();
  });
});

describe("session tokens", () => {
  const exp = new Date(Date.now() + 3600_000);
  it("verifies for the right room only", async () => {
    const tok = await signSession({ rid: "abcd-efgh-jkmn", pid: "p1", role: "guest" }, SECRET, exp);
    expect(await verifySession(tok, "abcd-efgh-jkmn", SECRET)).toEqual({ rid: "abcd-efgh-jkmn", pid: "p1", role: "guest" });
    expect(await verifySession(tok, "zzzz-zzzz-zzzz", SECRET)).toBeNull();
    expect(await verifySession(tok, "abcd-efgh-jkmn", "z".repeat(48))).toBeNull();
    expect(await verifySession(tok + "x", "abcd-efgh-jkmn", SECRET)).toBeNull();
  });
  it("rejects expired tokens", async () => {
    const tok = await signSession({ rid: "abcd-efgh-jkmn", pid: "p1", role: "host" }, SECRET, new Date(Date.now() - 1000));
    expect(await verifySession(tok, "abcd-efgh-jkmn", SECRET)).toBeNull();
  });
  it("uses a per-room cookie name", () => {
    expect(sessionCookieName("abcd-efgh-jkmn")).toBe("cb_s_abcdefghjkmn");
  });
});

describe("input validation", () => {
  it("display names: trimmed, bounded, no markup/control chars", () => {
    expect(displayNameSchema.parse("  Maya ")).toBe("Maya");
    expect(displayNameSchema.safeParse("").success).toBe(false);
    expect(displayNameSchema.safeParse("x".repeat(33)).success).toBe(false);
    expect(displayNameSchema.safeParse("<script>").success).toBe(false);
    expect(displayNameSchema.safeParse("a\u0007b").success).toBe(false);
  });
  it("PINs are 4–8 digits", () => {
    expect(createRoomBody.safeParse({ displayName: "A", pin: "123" }).success).toBe(false);
    expect(createRoomBody.safeParse({ displayName: "A", pin: "1234" }).success).toBe(true);
    expect(createRoomBody.safeParse({ displayName: "A", pin: "12a4" }).success).toBe(false);
  });
  it("only http(s) URLs", () => {
    expect(httpUrlSchema.safeParse("https://example.com/a.mp4").success).toBe(true);
    expect(httpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
  });
  it("join requires a plausible invite token", () => {
    expect(joinRoomBody.safeParse({ inviteToken: "short", displayName: "A" }).success).toBe(false);
  });
  it("playback intents are bounded", () => {
    expect(playbackIntentBody.safeParse({ baseVersion: 0, intent: { type: "rate", rate: 8 } }).success).toBe(false);
    expect(playbackIntentBody.safeParse({ baseVersion: 0, intent: { type: "seek", positionSec: -1 } }).success).toBe(false);
    expect(playbackIntentBody.safeParse({ baseVersion: 0, intent: { type: "explode" } }).success).toBe(false);
  });
});

describe("rate limiter (in-memory)", () => {
  it("allows up to the limit then blocks", async () => {
    resetMemoryLimiter();
    const rule = { limit: 3, windowSec: 60 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await hit("t", "ip", rule)).ok);
    expect(results).toEqual([true, true, true, false]);
    expect((await peek("t", "ip", rule)).ok).toBe(false);
    expect((await peek("t", "other", rule)).ok).toBe(true);
  });
});

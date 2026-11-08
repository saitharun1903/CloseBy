import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/** Unambiguous lowercase alphabet (no 0/o, 1/l/i). */
const ROOM_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Human-friendly room id like `k7mq-x2pd-9wfa` (~59 bits). Not a secret — the invite token is. */
export function newRoomId(): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export const ROOM_ID_RE = /^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/;

/** 256-bit url-safe secret. */
export function newSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt, 32, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [alg, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(pin, Buffer.from(saltB64, "base64"), expected.length, SCRYPT_PARAMS);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function aesKey(secret: string): Buffer {
  return createHash("sha256").update(`closeby:invite-enc:${secret}`).digest();
}

/** AES-256-GCM so the host can re-display their invite link after a refresh. */
export function encryptString(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptString(enc: string, secret: string): string {
  const [iv, tag, ct] = enc.split(".");
  if (!iv || !tag || !ct) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", aesKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

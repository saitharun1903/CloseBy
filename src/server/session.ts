import { jwtVerify, SignJWT } from "jose";

/**
 * Room session = an HttpOnly cookie holding a short JWT that binds the
 * browser to one seat (participant) in one room. Every room API call
 * re-validates it against the database (seat not released, room open).
 */

export interface SessionClaims {
  rid: string; // room id
  pid: string; // participant id
  role: "host" | "guest";
}

const ISSUER = "closeby";

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export function sessionCookieName(roomId: string) {
  return `cb_s_${roomId.replace(/-/g, "")}`;
}

export async function signSession(claims: SessionClaims, secret: string, expiresAt: Date): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(claims.rid)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key(secret));
}

export async function verifySession(token: string, roomId: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, audience: roomId, algorithms: ["HS256"] });
    if (payload.rid !== roomId || typeof payload.pid !== "string") return null;
    if (payload.role !== "host" && payload.role !== "guest") return null;
    return { rid: payload.rid, pid: payload.pid, role: payload.role };
  } catch {
    return null;
  }
}

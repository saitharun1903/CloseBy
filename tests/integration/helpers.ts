import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import type { DB } from "@/server/db";
import type { RealtimeGateway } from "@/server/livekit";
import type { RoomDeps } from "@/server/rooms";
import type { ServerMessage } from "@/lib/protocol";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://closeby:closeby@localhost:5432/closeby_test";

export class FakeGateway implements RealtimeGateway {
  broadcasts: { roomId: string; msg: ServerMessage }[] = [];
  connected = new Map<string, Set<string>>();
  reachable = true;
  deleted: string[] = [];
  removed: string[] = [];
  async ensureRoom() {}
  async issueToken(a: { roomId: string; identity: string }) {
    return `fake-token:${a.roomId}:${a.identity}`;
  }
  async connectedIdentities(roomId: string) {
    if (!this.reachable) return null;
    return new Set(this.connected.get(roomId) ?? []);
  }
  async broadcast(roomId: string, msg: ServerMessage) {
    this.broadcasts.push({ roomId, msg });
  }
  async removeParticipant(_roomId: string, identity: string) {
    this.removed.push(identity);
  }
  async deleteRoom(roomId: string) {
    this.deleted.push(roomId);
  }
}

export function makeDb() {
  const client = postgres(TEST_DB_URL, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as DB;
  return { db, client };
}

export async function truncate(db: DB) {
  await db.execute(sql`truncate table rooms cascade`);
}

export function makeDeps(db: DB, gateway = new FakeGateway(), now?: () => number): RoomDeps & { gateway: FakeGateway } {
  return { db, gateway, secret: "s".repeat(48), appUrl: "https://closeby.test", ttlHours: 12, now } as RoomDeps & { gateway: FakeGateway };
}

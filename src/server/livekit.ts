import { AccessToken, DataPacket_Kind, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { ServerMessage } from "@/lib/protocol";
import { SERVER_TOPIC } from "@/lib/protocol";
import { env } from "./env";

/**
 * Everything the app needs from the realtime layer, behind an interface so
 * room logic can be integration-tested without a media server.
 */
export interface RealtimeGateway {
  /** Pre-create the LiveKit room with a hard participant cap. */
  ensureRoom(roomId: string, maxParticipants: number, ttlSec: number): Promise<void>;
  issueToken(args: {
    roomId: string;
    identity: string;
    name: string;
    metadata: string;
    ttlSec: number;
  }): Promise<string>;
  /** Identities currently connected, or null if the media server can't be reached. */
  connectedIdentities(roomId: string): Promise<Set<string> | null>;
  broadcast(roomId: string, msg: ServerMessage, destinationIdentities?: string[]): Promise<void>;
  removeParticipant(roomId: string, identity: string): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
}

class LiveKitGateway implements RealtimeGateway {
  private svc: RoomServiceClient;
  constructor(private apiUrl: string, private key: string, private secret: string) {
    this.svc = new RoomServiceClient(apiUrl, key, secret);
  }

  async ensureRoom(roomId: string, maxParticipants: number, ttlSec: number) {
    await this.svc.createRoom({
      name: roomId,
      maxParticipants,
      // Close the media room shortly after both people leave; our DB room lives on until expiry.
      emptyTimeout: 5 * 60,
      departureTimeout: 60,
      metadata: JSON.stringify({ expiresInSec: ttlSec }),
    });
  }

  async issueToken({ roomId, identity, name, metadata, ttlSec }: Parameters<RealtimeGateway["issueToken"]>[0]) {
    const at = new AccessToken(this.key, this.secret, { identity, name, metadata, ttl: ttlSec });
    at.addGrant({
      room: roomId,
      roomJoin: true,
      roomCreate: false,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });
    return at.toJwt();
  }

  async connectedIdentities(roomId: string) {
    try {
      const list = await this.svc.listParticipants(roomId);
      return new Set(list.map((p) => p.identity));
    } catch (e) {
      // "room not found" means nobody is connected.
      if (String((e as Error)?.message ?? e).toLowerCase().includes("not found")) return new Set<string>();
      return null;
    }
  }

  async broadcast(roomId: string, msg: ServerMessage, destinationIdentities?: string[]) {
    const data = new TextEncoder().encode(JSON.stringify(msg));
    try {
      await this.svc.sendData(roomId, data, DataPacket_Kind.RELIABLE, { topic: SERVER_TOPIC, destinationIdentities });
    } catch (e) {
      // Room may not exist yet (nobody connected). Clients fetch fresh state on connect.
      if (!String((e as Error)?.message ?? e).toLowerCase().includes("not found")) {
        console.warn("[livekit] broadcast failed:", (e as Error)?.message ?? e);
      }
    }
  }

  async removeParticipant(roomId: string, identity: string) {
    try {
      await this.svc.removeParticipant(roomId, identity);
    } catch {
      /* not connected */
    }
  }

  async deleteRoom(roomId: string) {
    try {
      await this.svc.deleteRoom(roomId);
    } catch {
      /* already gone */
    }
  }
}

let gateway: RealtimeGateway | null = null;

export function getGateway(): RealtimeGateway {
  if (!gateway) {
    const e = env();
    gateway = new LiveKitGateway(e.LIVEKIT_API_URL, e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET);
  }
  return gateway;
}

/** Test seam. */
export function setGateway(g: RealtimeGateway | null) {
  gateway = g;
}

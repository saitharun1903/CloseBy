// Standalone smoke test: bot publishes a real Chromium into a local LiveKit room; a viewer checks frames + state.
import { AccessToken } from "livekit-server-sdk";
import { Room, RoomEvent, TrackKind, VideoStream, type RemoteTrack } from "@livekit/rtc-node";
import { BrowserSession } from "../src/session.ts";
import { TOPIC_INPUT, TOPIC_STATE } from "../src/protocol.ts";

const URL_ = "ws://127.0.0.1:7880";
async function token(identity: string, room: string) {
  const t = new AccessToken("devkey", "secret", { identity });
  t.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return t.toJwt();
}
const roomId = "test-bot1-room";
const s = new BrowserSession({ roomId, livekitUrl: URL_, token: await token("cb-browser-" + roomId, roomId), startUrl: "data:text/html,<body style='background:%23ff7700;margin:0'><h1 style='font-size:120px'>Hello</h1><a href='https://example.com' id=a>link</a></body>", display: 140, chromePath: "/opt/pw-browsers/chromium", emptyTimeoutMs: 60000 });
const t0 = Date.now();
await s.start();
console.log("bot started in", Date.now() - t0, "ms");

const viewer = new Room();
const states: string[] = [];
let frames = 0, sample: number[] = [];
viewer.on(RoomEvent.DataReceived, (p, _part, _k, topic) => { if (topic === TOPIC_STATE) states.push(new TextDecoder().decode(p)); });
viewer.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack) => {
  if (track.kind !== TrackKind.KIND_VIDEO) return;
  for await (const ev of new VideoStream(track)) {
    frames++;
    if (frames === 30) { const f = ev.frame.convert(0 /* RGBA */); const d = f.data; sample = [d[0], d[1], d[2]]; }
  }
});
await viewer.connect(URL_, await token("viewer", roomId), { autoSubscribe: true });
await new Promise((r) => setTimeout(r, 6000));
console.log("frames received in 6s:", frames, "top-left RGB:", sample.join(","));
console.log("last state:", states.at(-1));
// Navigate via the input channel.
await viewer.localParticipant!.publishData(new TextEncoder().encode(JSON.stringify({ t: "nav", url: "data:text/html,<title>Second</title><body style='background:%230055ff'>2</body>" })), { reliable: true, topic: TOPIC_INPUT });
await viewer.localParticipant!.publishData(new TextEncoder().encode(JSON.stringify({ t: "nav", url: "example.org" })), { reliable: true, topic: TOPIC_INPUT });
await new Promise((r) => setTimeout(r, 3000));
console.log("states after nav:", states.slice(-2).join(" | "));
await viewer.disconnect();
await s.stop("test done");
process.exit(0);

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { deps } = await import("../src/server/http");
const { cleanupExpiredRooms } = await import("../src/server/rooms");
const { closeDb } = await import("../src/server/db");
const r = await cleanupExpiredRooms(deps());
console.log(`✓ removed ${r.deleted} expired room(s)`);
await closeDb();
process.exit(0);

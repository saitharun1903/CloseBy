import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ROOM_TTL_HOURS: z.coerce.number().min(1).max(24).default(12),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  LIVEKIT_API_URL: z.string().url(),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().min(1),
  CRON_SECRET: z.string().optional(),
  /** Optional: enables in-app YouTube search (YouTube Data API v3). Without it, people paste links. */
  YOUTUBE_API_KEY: z.string().optional(),
  /** Test seam: where to validate YouTube videos (defaults to YouTube's public oEmbed endpoint). */
  YOUTUBE_OEMBED_URL: z.string().url().default("https://www.youtube.com/oembed"),
  /** Test seam for the Data API. */
  YOUTUBE_API_BASE: z.string().url().default("https://www.googleapis.com/youtube/v3"),
  /** Country for trending/search results (ISO 3166-1 alpha-2). */
  YOUTUBE_REGION: z.string().length(2).default("IN"),
  /** Optional: enables the shared cloud browser (Hyperbeam). */
  HYPERBEAM_API_KEY: z.string().optional(),
  HYPERBEAM_REGION: z.enum(["NA", "EU", "AS"]).default("AS"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server environment. Throws a readable error on misconfiguration. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}\nSee .env.example.`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production") {
    if (!e.APP_URL.startsWith("https://")) throw new Error("APP_URL must be https:// in production");
    if (!e.NEXT_PUBLIC_LIVEKIT_URL.startsWith("wss://")) throw new Error("NEXT_PUBLIC_LIVEKIT_URL must be wss:// in production");
    if (e.LIVEKIT_API_SECRET === "secret") throw new Error("Refusing to run production with the LiveKit dev secret");
  }
  cached = e;
  return e;
}

/** For tests. */
export function resetEnvCache() {
  cached = null;
}

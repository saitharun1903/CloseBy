import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3123);
const BASE = `http://localhost:${PORT}`;
const LIVEKIT_BIN = process.env.LIVEKIT_BIN ?? "livekit-server";

/**
 * E2E tests run two (or three) isolated browser contexts against a real
 * LiveKit server and a real Postgres. Chromium's fake camera/microphone
 * provide actual media streams, so these tests exercise genuine WebRTC.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "off",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--auto-select-desktop-capture-source=Entire screen",
        "--enable-usermedia-screen-capturing",
      ],
    },
    permissions: ["camera", "microphone"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } } }],
  webServer: [
    {
      command: `${LIVEKIT_BIN} --dev --bind 127.0.0.1 --node-ip 127.0.0.1`,
      url: "http://127.0.0.1:7880",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `npx next dev -p ${PORT}`,
      url: `${BASE}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        APP_URL: BASE,
        NEXT_PUBLIC_E2E: "1",
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://closeby:closeby@localhost:5432/closeby_test",
        LIVEKIT_API_KEY: "devkey",
        LIVEKIT_API_SECRET: "secret",
        LIVEKIT_API_URL: "http://127.0.0.1:7880",
        NEXT_PUBLIC_LIVEKIT_URL: "ws://127.0.0.1:7880",
        SESSION_SECRET: "e2e-session-secret-that-is-long-enough-000000",
        REDIS_URL: "",
        // Tests create far more rooms from one IP than any person would.
        RATE_LIMIT_SCALE: "50",
        YOUTUBE_OEMBED_URL: "http://127.0.0.1:3199/oembed",
        YOUTUBE_API_KEY: "test-key",
        YOUTUBE_API_BASE: "http://127.0.0.1:3199/yt",
      },
    },
    {
      // Serves the fixture film over http for "direct link" tests (with CORS, like a well-behaved CDN).
      command: "node tests/e2e/static-server.mjs",
      url: "http://127.0.0.1:3199/health",
      reuseExistingServer: true,
    },
  ],
});

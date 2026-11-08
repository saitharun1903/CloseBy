import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

function livekitOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!raw) return [];
  try {
    const u = new URL(raw);
    const httpProto = u.protocol === "wss:" ? "https:" : "http:";
    // LiveKit Cloud: the client fetches /settings/regions and may fail over to
    // other regional hosts under the same domain, so allow the whole domain.
    for (const cloud of ["livekit.cloud", "livekit.run"]) {
      if (u.hostname.endsWith(`.${cloud}`)) return [`wss://*.${cloud}`, `https://*.${cloud}`];
    }
    // Self-hosted: signalling over ws(s) and settings over http(s) on the same host.
    return [`${u.protocol}//${u.host}`, `${httpProto}//${u.host}`];
  } catch {
    return [];
  }
}

// YouTube IFrame Player API (player loads from the privacy-enhanced nocookie domain).
const YOUTUBE = {
  script: ["https://www.youtube.com", "https://s.ytimg.com"],
  frame: ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
  img: ["https://i.ytimg.com"],
};
// Hyperbeam shared browser: the SDK loads its runtime from the session host and
// falls back to Hyperbeam's relay domain on networks that block hyperbeam.com.
// It downloads that runtime and runs it via import(blob:…), so blob: must be an
// allowed script source (blob URLs can only be minted by code already on the page).
const HYPERBEAM = {
  script: ["blob:", "https://*.hyperbeam.com", "https://jquery.tutturu.workers.dev"],
  img: ["https://*.hyperbeam.com"],
  connect: ["https://*.hyperbeam.com", "wss://*.hyperbeam.com", "https://jquery.tutturu.workers.dev", "wss://jquery.tutturu.workers.dev"],
  frame: ["https://*.hyperbeam.com"],
};

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; nonces would force dynamic rendering everywhere.
  `script-src 'self' 'unsafe-inline' ${[...YOUTUBE.script, ...HYPERBEAM.script].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${[...YOUTUBE.img, ...HYPERBEAM.img].join(" ")}`,
  "font-src 'self' data:",
  // Media: local files (blob:) and user-supplied direct https URLs.
  "media-src 'self' blob: https:",
  `connect-src 'self' ${[...livekitOrigins(), ...HYPERBEAM.connect].join(" ")}`,
  `frame-src ${[...YOUTUBE.frame, ...HYPERBEAM.frame].join(" ")}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // YouTube requires embedders to identify themselves via Referer (its recommended policy).
  // Only the origin is sent cross-site; invite secrets live in the URL fragment, which is never sent.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(self), microphone=(self), display-capture=(self), fullscreen=(self), autoplay=(self "https://www.youtube-nocookie.com" "https://www.youtube.com"), encrypted-media=(self "https://www.youtube-nocookie.com" "https://www.youtube.com"), picture-in-picture=(self "https://www.youtube-nocookie.com"), geolocation=(), payment=(), usb=()',
  },
  ...(isProd
    ? [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Content-Security-Policy", value: csp },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "ioredis", "livekit-server-sdk"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;

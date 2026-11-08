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

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; nonces would force dynamic rendering everywhere.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Media: local files (blob:) and user-supplied direct https URLs.
  "media-src 'self' blob: https:",
  `connect-src 'self' ${livekitOrigins().join(" ")}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), fullscreen=(self), autoplay=(self), geolocation=(), payment=(), usb=()",
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

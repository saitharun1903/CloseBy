import { describe, expect, it, vi } from "vitest";

describe("content security policy (production)", () => {
  it("lets the shared-browser SDK run its downloaded runtime (import of a blob: URL)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { default: config } = await import("../../next.config");
    const rules = await config.headers!();
    const csp = rules.flatMap((r) => r.headers).find((h) => h.key.toLowerCase() === "content-security-policy")!.value;
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc.split(/\s+/)).toContain("blob:");
    expect(scriptSrc).toContain("https://*.hyperbeam.com");
    expect(csp).toContain("frame-ancestors 'none'");
    vi.unstubAllEnvs();
  });
});

import { describe, expect, it } from "vitest";
import { BROWSER_TIMEOUTS, createHyperbeamProvider } from "@/server/hyperbeam";

function fakeFetch(captured: unknown[]) {
  return (async (_url: string, init: RequestInit) => {
    captured.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ session_id: "sess-1234abcd", embed_url: "https://abc.hyperbeam.com/xyz" }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("hyperbeam provider", () => {
  it("doesn't end a session during a long, hands-off movie", () => {
    expect(BROWSER_TIMEOUTS.inactive).toBeGreaterThanOrEqual(3 * 3600);
    expect(BROWSER_TIMEOUTS.absolute).toBeGreaterThanOrEqual(BROWSER_TIMEOUTS.inactive);
  });

  it("creates a saved profile on request and reports its id", async () => {
    const sent: Record<string, unknown>[] = [];
    const p = createHyperbeamProvider("k", fakeFetch(sent));
    const s = await p.start({ roomId: "r", startUrl: "https://www.youtube.com", region: "AS", profile: "new" });
    expect(sent[0]!.profile).toBe(true);
    expect(s.profileId).toBe("sess-1234abcd");
  });

  it("loads an existing profile and keeps its id", async () => {
    const sent: Record<string, unknown>[] = [];
    const p = createHyperbeamProvider("k", fakeFetch(sent));
    const s = await p.start({ roomId: "r", startUrl: "https://www.youtube.com", region: "AS", profile: "prof-9876zyxw" });
    expect(sent[0]!.profile).toBe("prof-9876zyxw");
    expect(s.profileId).toBe("prof-9876zyxw");
  });

  it("sends no profile unless asked", async () => {
    const sent: Record<string, unknown>[] = [];
    const s = await createHyperbeamProvider("k", fakeFetch(sent)).start({ roomId: "r", startUrl: "https://x.com", region: "AS" });
    expect(sent[0]!).not.toHaveProperty("profile");
    expect(s.profileId).toBeUndefined();
  });
});

describe("cleanApiKey", () => {
  it("strips quotes, whitespace and a Bearer prefix", async () => {
    const { cleanApiKey } = await import("@/server/hyperbeam");
    expect(cleanApiKey('  "abc-123_XYZ"\n')).toBe("abc-123_XYZ");
    expect(cleanApiKey("Bearer abc-123")).toBe("abc-123");
    expect(cleanApiKey("'abc'")).toBe("abc");
    expect(cleanApiKey("abc")).toBe("abc");
  });
});

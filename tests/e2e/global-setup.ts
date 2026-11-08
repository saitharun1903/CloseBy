/**
 * Warm the dev server: the first request to each route compiles it, and a test
 * clicking before React hydrates a cold page is flaky. Compile the main routes up front.
 */
export default async function globalSetup() {
  const base = `http://localhost:${process.env.E2E_PORT ?? 3123}`;
  for (const path of ["/", "/r/aaaa-aaaa-aaaa", "/api/time", "/api/health"]) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(base + path);
        await res.text();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

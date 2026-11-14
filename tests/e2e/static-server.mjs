import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const dir = new URL("./fixtures/", import.meta.url).pathname;
createServer((req, res) => {
  if (req.url === "/health") return res.end("ok");
  // Stand-in for the YouTube Data API v3 (trending + search).
  if (req.url?.startsWith("/yt/")) {
    const u = new URL(req.url, "http://x");
    const cat = u.searchParams.get("videoCategoryId") ?? "all";
    const q = u.searchParams.get("q");
    const video = (id, title) => ({
      id,
      snippet: {
        title,
        channelTitle: "Test Channel",
        publishedAt: "2026-11-01T00:00:00Z",
        description: id === "chap0000001" ? "A video with chapters\n\n0:00 Intro\n0:40 Middle part\n1:20 Finale" : "No chapters here",
      },
      contentDetails: { duration: "PT2M" },
      statistics: { viewCount: "123456" },
      status: { embeddable: true },
    });
    res.writeHead(200, { "content-type": "application/json" });
    if (u.pathname === "/yt/search") return res.end(JSON.stringify({ items: [{ id: { videoId: "srchsrch001" } }] }));
    if (u.pathname === "/yt/playlistItems") return res.end(JSON.stringify({ items: ["plist000001", "plist000002", "plist000003"].map((videoId) => ({ contentDetails: { videoId } })) }));
    if (u.pathname === "/yt/playlists") return res.end(JSON.stringify({ items: [{ snippet: { title: "Road trip mix" } }] }));
    if (u.searchParams.get("id")) return res.end(JSON.stringify({ items: u.searchParams.get("id").split(",").map((id) => video(id, `Result for ${q ?? "search"}`)) }));
    return res.end(JSON.stringify({ items: [video("trend000001", `Top video (${cat})`), video("trend000002", `Second video (${cat})`)] }));
  }
  // Stand-in for YouTube's oEmbed endpoint (the test environment can't reach YouTube).
  if (req.url?.startsWith("/oembed")) {
    const v = new URL(req.url, "http://x").searchParams.get("url") ?? "";
    if (v.includes("NoEmbed0000")) return res.writeHead(401).end();
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ title: "Test YouTube Video", author_name: "Test Channel" }));
  }
  const name = decodeURIComponent((req.url ?? "/").split("?")[0].slice(1));
  if (!/^[\w.-]+$/.test(name)) return res.writeHead(404).end();
  let size;
  try {
    size = statSync(join(dir, name)).size;
  } catch {
    return res.writeHead(404).end();
  }
  const type = name.endsWith(".webm") ? "video/webm" : "text/html";
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  const headers = { "content-type": type, "accept-ranges": "bytes", "access-control-allow-origin": "*" };
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    createReadStream(join(dir, name), { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, "content-length": size });
    createReadStream(join(dir, name)).pipe(res);
  }
}).listen(3199, "127.0.0.1");

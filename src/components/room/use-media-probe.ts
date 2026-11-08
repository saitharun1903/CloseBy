"use client";

/** Load metadata for a file or URL in a detached element to learn duration and whether it's playable. */
export function probeMedia(src: string, timeoutMs = 12_000): Promise<{ ok: true; durationSec: number | null } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let done = false;
    const finish = (r: { ok: true; durationSec: number | null } | { ok: false; reason: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    v.onloadedmetadata = () => finish({ ok: true, durationSec: Number.isFinite(v.duration) ? v.duration : null });
    v.onerror = () => finish({ ok: false, reason: mediaErrorReason(v.error) });
    v.src = src;
  });
}

export function mediaErrorReason(err: MediaError | null): string {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "unsupported";
    case MediaError.MEDIA_ERR_NETWORK:
      return "network";
    case MediaError.MEDIA_ERR_DECODE:
      return "decode";
    case MediaError.MEDIA_ERR_ABORTED:
      return "aborted";
    default:
      return "unknown";
  }
}

export function explainMediaFailure(reason: string, kind: "file" | "url"): string {
  if (reason === "timeout") return "It took too long to load. The server may be slow or blocking playback from other sites.";
  if (reason === "network") return "The video stopped loading. Check your connection, or the link may have expired.";
  if (reason === "decode") return "Your browser couldn’t decode this video. Try an MP4 (H.264/AAC) or WebM version.";
  if (kind === "file")
    return "Your browser can’t play this file’s format. MP4 (H.264 + AAC) and WebM play almost everywhere; MKV and AVI often don’t.";
  return "This link couldn’t be played here. It needs to point straight at a video file (like .mp4 or .webm) that the site allows others to play — streaming-service pages and DRM-protected videos won’t work.";
}

"use client";
/**
 * Pop the partner's camera out into a floating system window (Picture-in-
 * Picture), so you keep seeing them while you use other tabs or apps.
 */
export function canPopOut(): boolean {
  if (typeof document === "undefined") return false;
  const v = document.createElement("video") as HTMLVideoElement & { webkitSupportsPresentationMode?: (m: string) => boolean };
  return !!document.pictureInPictureEnabled || typeof v.webkitSupportsPresentationMode === "function";
}

export async function popOutPartner(): Promise<"ok" | "no-video" | "unsupported"> {
  const v = document.querySelector<HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void }>("[data-testid=video-remote]");
  if (!v) return "no-video";
  try {
    if (document.pictureInPictureElement === v) {
      await document.exitPictureInPicture();
      return "ok";
    }
    if (v.requestPictureInPicture) {
      await v.requestPictureInPicture();
      return "ok";
    }
    if (v.webkitSetPresentationMode) {
      v.webkitSetPresentationMode("picture-in-picture");
      return "ok";
    }
  } catch {
    return "unsupported";
  }
  return "unsupported";
}

/** Convert SRT to WebVTT (VTT passes through). Runs locally; subtitle files are never uploaded. */
export function toVtt(text: string): string {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (clean.startsWith("WEBVTT")) return clean + "\n";
  const body = clean
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (/^\d+$/.test(lines[0]?.trim() ?? "")) lines.shift();
      if (lines[0]) lines[0] = lines[0].replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
      return lines.join("\n");
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

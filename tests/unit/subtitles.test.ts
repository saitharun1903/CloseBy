import { describe, expect, it } from "vitest";
import { formatBytes, toVtt } from "@/lib/subtitles";

describe("toVtt", () => {
  it("converts SRT cue numbers and comma timestamps", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:01:00,250 --> 00:01:02,000\r\nWorld\r\n";
    expect(toVtt(srt)).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n\n00:01:00.250 --> 00:01:02.000\nWorld\n");
  });
  it("passes VTT through", () => {
    expect(toVtt("WEBVTT\n\n00:00.000 --> 00:01.000\nHi")).toBe("WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n");
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(4.2 * 1024 ** 3)).toBe("4.2 GB");
  });
});

/**
 * What the sync engine needs from a player. Implemented for HTML5 <video>
 * (local files, direct links) and the YouTube IFrame Player.
 */
export interface MediaAdapter {
  /** Metadata known (duration, seekable). */
  ready(): boolean;
  time(): number;
  duration(): number | null;
  paused(): boolean;
  ended(): boolean;
  /** Decoder is waiting for data. */
  stalled(): boolean;
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  setRate(r: number): void;
  /**
   * Whether fractional playback rates (e.g. 1.04×) are supported for gentle
   * drift correction. YouTube only accepts fixed rates, so it corrects by seeking.
   */
  canNudge: boolean;
}

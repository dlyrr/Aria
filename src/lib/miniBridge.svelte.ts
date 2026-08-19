//! The wire between the main window and the miniplayer.
//!
//! They are two webviews, so they are two JavaScript worlds: the player store,
//! the library, the lyrics cache — none of it is shared, and the `<audio>`
//! element that is actually making sound lives in the main window only. The
//! miniplayer therefore owns no playback at all. It renders a copy of what the
//! main window tells it and sends back what you pressed.
//!
//! Two channels out, because they change at wildly different rates:
//!
//! - `mini://state` — the track, the artwork, the queue, the lyrics. Sent when
//!   any of it changes, which is a few times a song.
//! - `mini://tick`  — position and the toggles, four times a second. The
//!   miniplayer carries the playhead forward between ticks itself, the same
//!   way the main window does between the engine's, so a 4Hz wire still draws
//!   a smooth seek bar.
//!
//! And one back: `mini://cmd`. Tauri broadcasts to every window including the
//! sender, so each side only ever listens to the channels it doesn't write.

import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MiniTrack {
  path: string;
  title: string;
  artist: string;
  album: string;
  art: string | null;
}

export interface MiniLine {
  t: number;
  end?: number;
  text: string;
}

/** Everything the miniplayer draws that isn't the playhead. */
export interface MiniState {
  track: MiniTrack | null;
  duration: number;
  liked: boolean;
  queue: MiniTrack[];
  /** Index of the playing track within the queue the window was sent. */
  queueIndex: number;
  lines: MiniLine[];
  /** Unsynchronised lyrics, when that's all there is. */
  plain: string;
  lyricsStatus: string;
}

/** The parts that move while a track plays. */
export interface MiniTick {
  position: number;
  playing: boolean;
  volume: number;
  shuffled: boolean;
  repeat: "off" | "all" | "one";
  liked: boolean;
}

export type MiniCommand =
  | { action: "toggle" }
  | { action: "next" }
  | { action: "prev" }
  | { action: "seek"; value: number }
  | { action: "volume"; value: number }
  | { action: "shuffle" }
  | { action: "repeat" }
  | { action: "like" }
  | { action: "playIndex"; value: number }
  | { action: "hello" }
  | { action: "restore" };

/** True in the miniplayer window. Its route is the only thing that differs. */
export function isMiniWindow(): boolean {
  return typeof location !== "undefined" && location.pathname.replace(/\/$/, "").endsWith("/mini");
}

export const MINI_STATE = "mini://state";
export const MINI_TICK = "mini://tick";
export const MINI_CMD = "mini://cmd";

export function sendCommand(cmd: MiniCommand) {
  void emit(MINI_CMD, cmd);
}

export function onCommand(handler: (cmd: MiniCommand) => void): Promise<UnlistenFn> {
  return listen<MiniCommand>(MINI_CMD, (e) => handler(e.payload));
}

export function publishState(state: MiniState) {
  void emit(MINI_STATE, state);
}

export function publishTick(tick: MiniTick) {
  void emit(MINI_TICK, tick);
}

/**
 * The miniplayer's copy of the world.
 *
 * `position` is advanced locally between ticks and corrected by each one, so
 * the seek bar moves at the display's rate off a four-times-a-second wire.
 */
class MiniMirror {
  state = $state<MiniState>({
    track: null,
    duration: 0,
    liked: false,
    queue: [],
    queueIndex: -1,
    lines: [],
    plain: "",
    lyricsStatus: "idle",
  });

  position = $state(0);
  playing = $state(false);
  volume = $state(1);
  shuffled = $state(false);
  repeat = $state<"off" | "all" | "one">("off");

  private anchorPos = 0;
  private anchorAt = 0;
  private raf = 0;
  private stops: UnlistenFn[] = [];

  async start() {
    this.stops.push(
      await listen<MiniState>(MINI_STATE, (e) => {
        this.state = e.payload;
      }),
    );
    this.stops.push(
      await listen<MiniTick>(MINI_TICK, (e) => {
        const t = e.payload;
        this.playing = t.playing;
        this.volume = t.volume;
        this.shuffled = t.shuffled;
        this.repeat = t.repeat;
        this.state = { ...this.state, liked: t.liked };
        this.anchor(t.position);
        this.track();
      }),
    );
    // The main window has no idea we exist until we say so.
    sendCommand({ action: "hello" });
  }

  stop() {
    cancelAnimationFrame(this.raf);
    for (const off of this.stops) off();
    this.stops = [];
  }

  /** Called by the seek bar so the thumb doesn't snap back before the next tick. */
  anchor(seconds: number) {
    this.position = seconds;
    this.anchorPos = seconds;
    this.anchorAt = performance.now();
  }

  private track() {
    cancelAnimationFrame(this.raf);
    if (!this.playing) return;
    this.raf = requestAnimationFrame(() => {
      if (!this.playing) return;
      const elapsed = (performance.now() - this.anchorAt) / 1000;
      const next = this.anchorPos + elapsed;
      this.position = this.state.duration > 0 ? Math.min(next, this.state.duration) : next;
      this.track();
    });
  }
}

export const mini = new MiniMirror();

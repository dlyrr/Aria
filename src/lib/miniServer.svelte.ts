//! The main window's half of the miniplayer bridge.
//!
//! Lives here rather than in a component because it has to outlive every view:
//! the miniplayer can be open while you are anywhere in the app, or with the
//! main window minimised entirely.

import { invoke } from "@tauri-apps/api/core";
import { library } from "./library.svelte";
import { lyrics } from "./lyrics.svelte";
import { player, type TrackMeta } from "./player.svelte";
import {
  MINI_TICK,
  onCommand,
  publishState,
  publishTick,
  type MiniState,
  type MiniTrack,
} from "./miniBridge.svelte";

/** How often the playhead goes over the wire. The miniplayer interpolates. */
const TICK_MS = 250;

function slim(track: TrackMeta): MiniTrack {
  return {
    path: track.path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    art: track.art,
  };
}

let started = false;

export function serveMiniplayer() {
  if (started) return;
  started = true;

  /**
   * The heavy half of the payload. Rebuilt only when its parts actually change
   * — the queue and the lyrics of a four-minute song are a lot of JSON to put
   * on a wire four times a second for no reason.
   */
  function snapshot(): MiniState {
    const current = player.current;
    return {
      track: current ? slim(current) : null,
      duration: player.duration,
      liked: !!current && library.isFavourite(current.path),
      // Bounded: a queue can be the whole library, and the miniplayer shows a
      // list you scroll a little way down, not all of it.
      queue: player.queue.slice(0, 200).map(slim),
      queueIndex: player.currentIndex,
      lines: lyrics.lines.map((l) => ({ t: l.t, end: l.end, text: l.text })),
      plain: lyrics.plainText,
      lyricsStatus: lyrics.status,
    };
  }

  // Any of these changing is worth a new snapshot; the playhead is not.
  $effect.root(() => {
    $effect(() => {
      void player.current?.path;
      void player.queue.length;
      void player.currentIndex;
      void player.duration;
      void lyrics.status;
      void lyrics.lines.length;
      void library.favourites.length;
      publishState(snapshot());
    });
  });

  const timer = setInterval(() => {
    publishTick({
      position: player.position,
      playing: player.playing,
      volume: player.volume,
      shuffled: player.shuffled,
      repeat: player.repeat,
      liked: !!player.current && library.isFavourite(player.current.path),
    });
  }, TICK_MS);

  void onCommand((cmd) => {
    switch (cmd.action) {
      case "toggle":
        player.togglePlay();
        break;
      case "next":
        player.next();
        break;
      case "prev":
        player.prev();
        break;
      case "seek":
        player.seek(cmd.value);
        break;
      case "volume":
        player.setVolume(cmd.value);
        break;
      case "shuffle":
        player.toggleShuffle();
        break;
      case "repeat":
        player.cycleRepeat();
        break;
      case "like":
        if (player.current) library.toggleFavourite(player.current.path);
        break;
      case "playIndex":
        player.playIndex(cmd.value);
        break;
      case "hello":
        // A window that has just opened knows nothing. Send it everything.
        publishState(snapshot());
        break;
      case "restore":
        void invoke("set_main_visible", { visible: true });
        break;
    }
  });

  return () => clearInterval(timer);
}

export { MINI_TICK };

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { TrackMeta } from "./player.svelte";
import { detectFormat, parseDocument, parseLrc, type LyricLine } from "./lyricsParse";
export { asideFlags, splitAsides } from "./lyricsAside";
// The line/word model and every format reader live in `lyricsParse` now, so
// they stay directly testable and can be shared verbatim with the lyrics
// editor. Re-exported here because this is where the rest of the app looks.
export type { LyricLine, LyricWord } from "./lyricsParse";

/** How much of `word` has been sung at `position`, as a 0..1 fraction. */
export function wordProgress(word: { t: number; end: number }, position: number): number {
  if (position <= word.t) return 0;
  if (position >= word.end) return 1;
  const span = word.end - word.t;
  return span > 0 ? (position - word.t) / span : 1;
}

type Status = "idle" | "loading" | "synced" | "plain" | "instrumental" | "none" | "error";

interface FetchResult {
  found: boolean;
  instrumental: boolean;
  synced: string | null;
  plain: string | null;
}

interface CacheEntry extends FetchResult {
  ts: number;
}

// Hits are kept forever; misses are retried after this long in case LRCLIB gains
// the lyrics later.
const MISS_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

function sigOf(t: TrackMeta): string {
  return [t.title, t.artist, t.album, Math.round(t.duration)]
    .map((s) => String(s).toLowerCase().trim())
    .join("|");
}

interface OverrideEntry {
  lines: LyricLine[];
  plainText: string;
  synced: boolean;
  /** Set by formats that can declare a track has no vocals. */
  instrumental?: boolean;
  /** Set when the file was found but could not be parsed. */
  error?: string;
}

interface SidecarLyrics {
  text: string;
  extension: string;
}

/**
 * Build an override entry from a local lyrics file. `name` is the file's name
 * or path — enough for the double-barrelled extensions (`.santi.lyrics`,
 * `.lyricsfile.yaml`) to be recognised.
 *
 * The contents get the final say, so a sheet saved under the wrong suffix —
 * LRC in a `.txt`, which is common — still loads as what it actually is.
 */
function localEntry(text: string, name: string, duration = 0): OverrideEntry {
  const lower = name.toLowerCase();
  // A bare `.yaml` can only be a Lyricsfile here, and saying so up front gets
  // the format's own validation errors instead of a silent fall back to text.
  const yaml = lower.endsWith(".yaml") || lower.endsWith(".yml");
  const format = yaml ? "lyricsfile" : detectFormat(text, lower);
  try {
    const doc = parseDocument(text, format, duration);
    const synced = doc.lines.length > 0;
    return {
      lines: doc.lines,
      plainText: synced ? "" : doc.plain || text,
      synced,
      instrumental: doc.instrumental,
    };
  } catch (e) {
    // Only Lyricsfile throws; it validates strictly on purpose, and a file
    // that fails is reported rather than shown as half its lines.
    return { lines: [], plainText: "", synced: false, error: String(e) };
  }
}

class Lyrics {
  status = $state<Status>("idle");
  lines = $state<LyricLine[]>([]);
  plainText = $state("");
  /** Whether the current track uses a user-imported lyrics file. */
  overridden = $state(false);

  private cache: Record<string, CacheEntry> = {};
  private overrides: Record<string, OverrideEntry> = {};
  private cacheLoaded = false;
  private currentTrack: TrackMeta | null = null;
  private currentSig = "";

  private async ensureCache() {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    this.cache = (await invoke<Record<string, CacheEntry> | null>("load_data", { key: "lyricsCache" })) ?? {};
    this.overrides = (await invoke<Record<string, OverrideEntry> | null>("load_data", { key: "lyricsOverrides" })) ?? {};
  }

  private applyOverride(o: OverrideEntry) {
    if (o.error) {
      this.lines = [];
      this.plainText = "";
      this.status = "error";
      console.error("lyrics file could not be parsed:", o.error);
    } else if (o.instrumental) {
      this.lines = [];
      this.plainText = "";
      this.status = "instrumental";
    } else if (o.synced) {
      this.lines = o.lines;
      this.plainText = "";
      this.status = "synced";
    } else {
      this.lines = [];
      this.plainText = o.plainText;
      this.status = "plain";
    }
  }

  private apply(r: FetchResult) {
    if (r.synced) {
      // LRCLIB serves LRC, which since its v2 can carry `<mm:ss.xx>` word
      // timing — so this picks up karaoke timing from online too.
      this.lines = parseLrc(r.synced).lines;
      this.plainText = "";
      this.status = this.lines.length ? "synced" : "plain";
      if (!this.lines.length && r.plain) this.plainText = r.plain;
    } else if (r.plain) {
      this.lines = [];
      this.plainText = r.plain;
      this.status = "plain";
    } else if (r.instrumental) {
      this.lines = [];
      this.plainText = "";
      this.status = "instrumental";
    } else {
      this.lines = [];
      this.plainText = "";
      this.status = "none";
    }
  }

  /** Load lyrics for a track; no-op if already showing the same track. */
  async loadFor(track: TrackMeta | null) {
    if (!track) {
      this.currentSig = "";
      this.currentTrack = null;
      this.overridden = false;
      this.status = "idle";
      this.lines = [];
      this.plainText = "";
      return;
    }
    const sig = sigOf(track);
    if (sig === this.currentSig) return;
    this.currentSig = sig;
    this.currentTrack = track;
    await this.ensureCache();

    // A user-imported lyrics file (keyed by path) always wins over LRCLIB.
    const ov = this.overrides[track.path];
    if (ov) {
      this.overridden = true;
      this.applyOverride(ov);
      return;
    }
    this.overridden = false;

    // A same-name lyrics file beside the media is a portable, automatic
    // override. It is checked before the online cache and LRCLIB.
    try {
      const sidecar = await invoke<SidecarLyrics | null>("read_sidecar_lyrics", {
        path: track.path,
      });
      if (this.currentSig !== sig) return;
      if (sidecar) {
        // The backend reports which extension it matched; a stand-in name is
        // all `localEntry` needs to resolve the double-barrelled ones.
        this.applyOverride(
          localEntry(sidecar.text, `lyrics.${sidecar.extension}`, track.duration),
        );
        return;
      }
    } catch (e) {
      console.error("sidecar lyrics lookup failed:", e);
    }

    const cached = this.cache[sig];
    const fresh = cached && (cached.found || Date.now() - cached.ts < MISS_TTL);
    if (fresh) {
      this.apply(cached);
      return;
    }
    await this.fetch(track, sig);
  }

  /** Force a re-query (manual "refetch" button), bypassing the cache. */
  async refetch(track: TrackMeta | null) {
    if (!track) return;
    await this.ensureCache();
    this.currentSig = sigOf(track);
    await this.fetch(track, this.currentSig);
  }

  private async fetch(track: TrackMeta, sig: string) {
    this.status = "loading";
    this.lines = [];
    this.plainText = "";
    try {
      const r = await invoke<FetchResult>("fetch_lyrics", {
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
      });
      // Ignore if the track changed while we were fetching.
      if (this.currentSig !== sig) return;
      this.cache[sig] = { ...r, ts: Date.now() };
      await invoke("save_data", { key: "lyricsCache", value: this.cache });
      this.apply(r);
    } catch (e) {
      if (this.currentSig === sig) this.status = "error";
      console.error("lyrics fetch failed:", e);
    }
  }

  /** Import a lyrics file as this track's lyrics, overriding LRCLIB. */
  async importFile(track: TrackMeta | null) {
    if (!track) return;
    const f = await open({
      multiple: false,
      // The dialog matches on the final extension only, so Lyricsfile documents
      // come in under "yaml" and are recognised by their full name below.
      filters: [
        {
          name: "Lyrics",
          extensions: ["slyr", "lrc", "vtt", "srt", "txt", "yaml", "yml"],
        },
      ],
    });
    if (!f || Array.isArray(f)) return;
    const text = await invoke<string>("read_text_file", { path: f });
    const entry = localEntry(text, f, track.duration);

    await this.ensureCache();
    this.overrides[track.path] = entry;
    await invoke("save_data", { key: "lyricsOverrides", value: this.overrides });

    if (this.currentTrack?.path === track.path) {
      this.overridden = true;
      this.applyOverride(entry);
    }
  }

  /**
   * Re-read the current track's lyrics from disk.
   *
   * `loadFor` deliberately no-ops on the track it is already showing, so a
   * sidecar edited in another app — the lyrics editor, saving over the same
   * file — wouldn't appear until the track changed. This is the one gesture
   * that says "look again".
   */
  async reload(track: TrackMeta | null) {
    if (!track) return;
    this.currentSig = "";
    await this.loadFor(track);
  }

  /**
   * Follow a track that moved on disk. Imported lyrics are keyed by path, so
   * without this a track loses its lyrics the moment it is filed into an album.
   */
  async repath(from: string, to: string) {
    if (from === to) return;
    await this.ensureCache();
    const entry = this.overrides[from];
    if (!entry) return;
    delete this.overrides[from];
    this.overrides[to] = entry;
    await invoke("save_data", { key: "lyricsOverrides", value: this.overrides });
  }

  /** Remove the imported override and fall back to LRCLIB again. */
  async removeOverride(track: TrackMeta | null) {
    if (!track) return;
    await this.ensureCache();
    delete this.overrides[track.path];
    await invoke("save_data", { key: "lyricsOverrides", value: this.overrides });
    this.overridden = false;
    // Force a reload from LRCLIB/cache.
    this.currentSig = "";
    await this.loadFor(track);
  }

  /** Index of the line active at `position`, or -1. */
  activeIndex(position: number): number {
    const l = this.lines;
    if (!l.length) return -1;
    let lo = 0,
      hi = l.length - 1,
      ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (l[mid].t <= position) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  /**
   * When a line stops being sung. Lyricsfile carries a real `end`; LRC and the
   * cue formats don't, so the next line's start stands in — which is why those
   * formats never produce a gap and always have exactly one line active.
   */
  private lineEnd(i: number): number | null {
    const line = this.lines[i];
    if (!line) return null;
    if (line.end != null) return line.end;
    return this.lines[i + 1]?.t ?? null;
  }

  /**
   * Every line being sung at `position`, earliest first. Lyricsfile allows
   * lines to overlap (spec §4/§7) and a player may highlight several at once —
   * a call-and-response or a doubled vocal genuinely sounds simultaneously.
   *
   * Returns empty during an instrumental gap, which only a format with real end
   * times can express.
   */
  activeIndices(position: number, hold = 0): number[] {
    const l = this.lines;
    if (!l.length) return [];
    // Scanned, not windowed. A bounded look-back assumes overlaps are only
    // ever a line or two deep, which breaks the moment a line is deliberately
    // held across a section: it falls out of the window and vanishes mid-hold.
    // A full pass over a few hundred lines costs nothing at 30fps.
    const out: number[] = [];
    for (let i = 0; i < l.length; i++) {
      if (l[i].t > position) break;
      const end = this.lineEnd(i);
      // `hold` keeps a finished line lit into the next one's opening words.
      // Most authored timing butts lines end-to-start, so without it the
      // handover is instantaneous and only ever one line reads as sung.
      if (end == null || end + hold > position) out.push(i);
    }
    return out;
  }
}

export const lyrics = new Lyrics();

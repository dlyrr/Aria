//! Readers for every lyrics format Aria understands, and the line/word model
//! they all normalize to.
//!
//! Pure functions over strings — no store, no Tauri — so they stay directly
//! testable. Anything a parser can't make sense of is skipped rather than
//! thrown on: a subtitle file with one malformed cue should still load.
//!
//! Between them these cover what a lyrics editor can hand back: word timing in
//! enhanced LRC and WebVTT, real line ends in the cue formats, and an explicit
//! singer per line in all of them — which is what lets `lyricsLanes` put a duet
//! on two sides instead of guessing from overlap.

import { parseLyricsFile } from "./lyricsfile";
import { parseSanti, SANTI_EXT } from "./santiLyrics";

export type LyricsFormat =
  /** santi.lyrics — the native format, and the only one that loses nothing. */
  | "santi"
  | "lrc"
  | "elrc"
  | "srt"
  | "vtt"
  | "lyricsfile"
  | "txt";

/** One word or segment of a word-synced line. Times are seconds. */
export interface LyricWord {
  t: number;
  end: number;
  /** Includes the whitespace needed to rebuild the line. */
  text: string;
}

export interface LyricLine {
  t: number;
  /** End time in seconds, when the source format provides one. */
  end?: number;
  text: string;
  /** Word-level timing, when the source format provides it. */
  words?: LyricWord[];
  /**
   * Which singer the line belongs to, when the source says so. A free-form
   * label ("v2", "Harmony") — the display decides which side of the panel each
   * distinct voice sits on, so the label itself never has to be a side.
   */
  voice?: string;
}

/** A whole lyrics document, however it arrived. */
export interface LyricsDoc {
  title: string;
  artist: string;
  album: string;
  language: string;
  /** Track duration in seconds, or 0 when the source omits it. */
  duration: number;
  instrumental: boolean;
  /** Sorted by start time. Empty for an unsynchronized document. */
  lines: LyricLine[];
  /** Unsynchronized fallback lyrics, with line breaks preserved. */
  plain: string;
}

export function emptyDoc(): LyricsDoc {
  return {
    title: "",
    artist: "",
    album: "",
    language: "",
    duration: 0,
    instrumental: false,
    lines: [],
    plain: "",
  };
}

/**
 * Parse an `HH:MM:SS.mmm` / `MM:SS.mmm` timestamp (`.` or `,` for the fraction)
 * to seconds. Returns null rather than NaN so a caller can skip a bad cue
 * instead of poisoning the timeline with it.
 */
function parseClock(s: string): number | null {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return null;
  const h = m[1] ? +m[1] : 0;
  return h * 3600 + +m[2] * 60 + +m[3] + +`0.${m[4]}`;
}

/**
 * Read a colon-separated timestamp leniently: `1:02`, `1:02.5`, `0:00:12.000`
 * and `62.5` all land somewhere sensible. Used for inline word stamps, whose
 * shape differs between the formats that carry them.
 */
function parseLoose(text: string): number | null {
  const parts = text.trim().replace(",", ".").split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d*\.?\d*$/.test(part) || part === "" || part === ".") return null;
    total = total * 60 + parseFloat(part);
  }
  return Number.isFinite(total) && total >= 0 ? total : null;
}

/**
 * The distinct singers in a document, in order of first appearance.
 *
 * Everything that turns a voice into something concrete — which side of the
 * panel it sits on — derives it from this one order, so nothing can disagree
 * about who is singer two.
 */
export function voiceOrder(lines: { voice?: string }[]): string[] {
  const seen: string[] = [];
  for (const line of lines) {
    if (line.voice && !seen.includes(line.voice)) seen.push(line.voice);
  }
  return seen;
}

/**
 * Fill in end times a format left out, stretching each item to the next one's
 * start and clamping the last to its container. Shared by every parser: only
 * Lyricsfile and the subtitle formats carry real ends, and even they leave
 * word ends optional.
 */
function fillEnds<T extends { t: number; end: number; explicit?: boolean }>(
  items: T[],
  fallbackEnd: number,
) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].explicit) continue;
    const next = i + 1 < items.length ? items[i + 1].t : fallbackEnd;
    items[i].end = Math.max(items[i].t, next);
  }
}

/**
 * Inline word stamps: `<mm:ss.xx>` (enhanced LRC) and `<HH:MM:SS.mmm>` (VTT).
 * Only `.` and `,` open the fraction here — unlike a line stamp, an inline tag
 * never uses `:` for it, and allowing it would make `<00:00:12>` ambiguous.
 */
const WORD_TAG = /<(\d{1,3}:\d{1,2}(?::\d{2})?[.,]\d{1,3})>/g;
/** Non-global twin, for tests that must not disturb `WORD_TAG.lastIndex`. */
const HAS_WORD_TAG = /<\d{1,3}:\d{1,2}(?::\d{2})?[.,]\d{1,3}>/;

/**
 * Timestamps inside a lyric line, as words.
 *
 * Both enhanced LRC and WebVTT mark karaoke timing the same way: a stamp
 * immediately before the text it starts. A trailing stamp with no text after it
 * is the line's end rather than an empty word, which is how most writers close
 * out a line.
 *
 * `start` is the line's own start, which is where any text before the first
 * stamp is sung from — WebVTT relies on that, writing the opening run of a cue
 * with no stamp of its own.
 */
function parseInlineWords(
  body: string,
  start?: number,
): { words: LyricWord[]; end?: number; text: string } {
  WORD_TAG.lastIndex = 0;
  const hits: { t: number; from: number; to: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = WORD_TAG.exec(body)) !== null) {
    const t = parseLoose(m[1]);
    if (t != null) hits.push({ t, from: m.index, to: m.index + m[0].length });
  }
  if (!hits.length) return { words: [], text: body };

  const words: (LyricWord & { explicit?: boolean })[] = [];
  let end: number | undefined;
  hits.forEach((hit, i) => {
    const stop = i + 1 < hits.length ? hits[i + 1].from : body.length;
    const text = body.slice(hit.to, stop);
    if (!text.trim()) {
      // Trailing stamp: closes the line. A blank one mid-line is just spacing.
      if (i === hits.length - 1) end = hit.t;
      return;
    }
    words.push({ t: hit.t, end: hit.t, text });
  });
  if (!words.length) return { words: [], end, text: body.replace(WORD_TAG, "").trim() };

  // Text before the first stamp is sung from the line's own start. Given one,
  // it becomes a word in its own right; without one there is nothing to time it
  // by, so it joins the word after it rather than being dropped.
  const lead = body.slice(0, hits[0].from);
  if (lead.trim()) {
    if (start != null) words.unshift({ t: start, end: words[0].t, text: lead, explicit: true });
    else words[0] = { ...words[0], text: lead + words[0].text };
  }
  fillEnds(words, end ?? Infinity);
  return {
    // Rebuilt without the bookkeeping flag, so what callers get is the model.
    words: words.map(({ t, end, text }) => ({ t, end, text })),
    end,
    text: words.map((w) => w.text).join("").trim(),
  };
}

/** `[voice:v2:Harmony]` — how a writer names the singer behind a `v2:` prefix. */
const VOICE_HEADER = /^\[voice:\s*(v\d+)\s*:\s*(.*?)\s*\]$/i;
/** A `v1:` / `v2:` singer prefix, the closest thing LRC has to a speaker. */
const VOICE_PREFIX = /^\s*(v\d+)\s*:\s*/i;

/** Strip a `vN:` prefix off a line, returning the voice id it named. */
function takeVoicePrefix(text: string): { voice?: string; text: string } {
  const m = text.match(VOICE_PREFIX);
  if (!m) return { text };
  return { voice: m[1].toLowerCase(), text: text.slice(m[0].length) };
}

/** LRC header tags: `[ti:…]`, `[ar:…]`, `[al:…]`, `[length:…]`. */
const META_TAG = /^\[(ti|ar|al|length|la|lang|language):\s*(.*?)\s*\]$/i;

/**
 * Parse LRC, plain or enhanced. Enhanced files differ only by carrying
 * `<mm:ss.xx>` stamps inside the line, so one reader covers both.
 *
 * A line may carry several stamps (`[00:12.00][01:44.00]chorus`), which is how
 * LRC expresses a repeated section; each becomes its own line.
 */
export function parseLrc(text: string, into: LyricsDoc = emptyDoc()): LyricsDoc {
  const stamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const names = new Map<string, string>();
  const lines: LyricLine[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();

    const voiceName = trimmed.match(VOICE_HEADER);
    if (voiceName) {
      names.set(voiceName[1].toLowerCase(), voiceName[2]);
      continue;
    }
    const meta = trimmed.match(META_TAG);
    if (meta) {
      const value = meta[2];
      switch (meta[1].toLowerCase()) {
        case "ti":
          into.title ||= value;
          break;
        case "ar":
          into.artist ||= value;
          break;
        case "al":
          into.album ||= value;
          break;
        case "la":
        case "lang":
        case "language":
          into.language ||= value;
          break;
        case "length": {
          const secs = parseClock(value.includes(".") ? value : `${value}.0`);
          if (secs != null) into.duration ||= secs;
          break;
        }
      }
      continue;
    }

    stamp.lastIndex = 0;
    const stamps: number[] = [];
    let bodyAt = 0;
    let m: RegExpExecArray | null;
    while ((m = stamp.exec(raw)) !== null) {
      // Only a run of stamps at the head of the line opens it; a `[…]` later on
      // is text, not timing.
      if (m.index !== bodyAt) break;
      const frac = m[3] ? +`0.${m[3]}` : 0;
      stamps.push(+m[1] * 60 + +m[2] + frac);
      bodyAt = stamp.lastIndex;
    }
    if (!stamps.length) continue;

    const withVoice = takeVoicePrefix(raw.slice(bodyAt));
    const inline = parseInlineWords(withVoice.text, stamps[0]);
    const lineText = (inline.words.length ? inline.text : withVoice.text).trim();
    for (const t of stamps) {
      // A repeated section reuses the text, but its word timing belongs to the
      // first occurrence only — offsetting it would be inventing timing.
      const first = t === stamps[0];
      lines.push({
        t,
        end: first && inline.end != null ? inline.end : undefined,
        text: lineText,
        words: first && inline.words.length ? inline.words : undefined,
        voice: withVoice.voice ? (names.get(withVoice.voice) ?? withVoice.voice) : undefined,
      });
    }
  }

  lines.sort((a, b) => a.t - b.t);
  into.lines = lines;
  return into;
}

/** WebVTT voice span: `<v Singer>` / `<v.loud Singer>`. */
const VOICE_SPAN = /<v(?:\.[^\s>]+)*\s+([^>]*)>/i;

/**
 * Parse WebVTT (.vtt) or SubRip (.srt) cues.
 *
 * Both carry a real end time per cue, so the result can express a gap between
 * lines and two cues that genuinely overlap — which is what lets a duet show
 * both singers at once.
 */
export function parseCues(text: string, into: LyricsDoc = emptyDoc()): LyricsDoc {
  const lines: LyricLine[] = [];
  const body = text.replace(/^﻿/, "").replace(/^WEBVTT.*$/m, "");

  for (const block of body.split(/\r?\n\r?\n/)) {
    const rows = block.split(/\r?\n/).filter((l) => l.trim());
    const timeAt = rows.findIndex((l) => l.includes("-->"));
    if (timeAt < 0) continue;

    const [from, to] = rows[timeAt].split("-->").map((s) => s.trim().split(/\s+/)[0]);
    const t = parseClock(from);
    if (t == null) continue;
    const end = to ? parseClock(to) : null;

    // Everything after the timing row is cue text; the row before it, if any,
    // is the cue identifier and carries nothing we keep.
    const raw = rows.slice(timeAt + 1).join("\n");
    const voiced = raw.match(VOICE_SPAN);
    // SubRip has no speaker construct, so a duet arrives there the way LRC
    // carries one — as a `v1:` prefix.
    const prefixed = takeVoicePrefix(raw.replace(VOICE_SPAN, "").replace(/<\/v>/gi, ""));
    const inline = parseInlineWords(prefixed.text.replace(/\n/g, " "), t);

    const stripped = (inline.words.length ? inline.text : prefixed.text)
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!stripped) continue;

    lines.push({
      t,
      end: end != null && end > t ? end : undefined,
      text: stripped,
      words: inline.words.length
        ? inline.words.map((w) => ({ ...w, text: w.text.replace(/<[^>]+>/g, "") }))
        : undefined,
      voice: (voiced ? voiced[1].trim() : prefixed.voice) || undefined,
    });
  }

  lines.sort((a, b) => a.t - b.t);
  // A word left open by its cue runs to the cue's end.
  for (const line of lines) {
    const last = line.words?.[line.words.length - 1];
    if (last && !Number.isFinite(last.end)) last.end = line.end ?? last.t;
  }
  into.lines = lines;
  return into;
}

/**
 * Parse text in a known format into a document.
 *
 * Only Lyricsfile throws — it is a strict, validating format and a half-loaded
 * one would be worse than a reported error. The rest skip what they can't read.
 * `duration` (seconds) only bounds a trailing line whose end nothing else gives.
 */
export function parseDocument(text: string, format: LyricsFormat, duration = 0): LyricsDoc {
  const doc = emptyDoc();
  doc.duration = duration;
  switch (format) {
    case "santi":
      return parseSanti(text, duration);
    case "lyricsfile":
      return parseLyricsFile(text, duration);
    case "lrc":
    case "elrc":
      return parseLrc(text, doc);
    case "vtt":
    case "srt":
      return parseCues(text, doc);
    case "txt":
      doc.plain = text;
      return doc;
  }
}

/**
 * Guess a format from a file name and, failing that, the text itself.
 *
 * Content is consulted because a sidecar's extension is only a hint: files
 * arrive named `.txt` holding LRC often enough that trusting the suffix alone
 * would show a wall of timestamps.
 */
export function detectFormat(text: string, name = ""): LyricsFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(`.${SANTI_EXT}`)) return "santi";
  if (lower.endsWith(".lyricsfile.yaml") || lower.endsWith(".lyricsfile.yml")) return "lyricsfile";
  if (lower.endsWith(".vtt")) return "vtt";
  if (lower.endsWith(".srt")) return "srt";
  if (lower.endsWith(".lrc")) return HAS_WORD_TAG.test(text) ? "elrc" : "lrc";

  // Its own banner, before the YAML sniff below — the file opens with a `#`
  // comment, which a loose YAML test would happily claim.
  if (/^\s*#\s*santi\.lyrics/i.test(text)) return "santi";
  if (/^\s*(#|---|version\s*:)/.test(text) && /\bversion\s*:/.test(text)) return "lyricsfile";
  if (/^\s*WEBVTT/.test(text)) return "vtt";
  if (text.includes("-->")) return "srt";
  if (/\[\d{1,3}:\d{2}/.test(text)) return HAS_WORD_TAG.test(text) ? "elrc" : "lrc";
  return "txt";
}

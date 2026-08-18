//! santi.lyrics — the native format. Reader and writer.
//!
//! ⚠ This file is shared *verbatim* between santi.lyrics and Aria. It is the format's
//! only definition, so change it in one place and copy it across; never edit
//! one side alone.
//!
//! Everything else this app and Aria handle is somebody else's format, and each
//! drops something: LRC has no line ends and no singers, SubRip has no word
//! timing, Lyricsfile is YAML and can't be hand-edited without care. This one
//! holds the lot and still reads like a text file:
//!
//! ```text
//! # santi.lyrics v1
//!
//! title: Duet
//! artist: Two People
//! duration: 3:20
//!
//! voice 1 = Lead
//! voice 2 = Harmony
//!
//! [0:00.00-0:05.00]
//! [0:05.00-0:09.00] @1 I <+0.5>sing <+2.0>the <+2.8>lead
//! [0:06.00-0:08.50] @2 and I answer back
//! [0:20.00] after a long gap
//! ```
//!
//! A timed line with no text — the first one above — is an instrumental: an
//! intro, a solo, the bar before a last chorus. Players show it as a countdown
//! rather than as a blank, and having it in the file means the author decides
//! which silences are worth counting through instead of the player guessing
//! from the gaps.
//!
//! Three ideas do the work:
//!
//! 1. **`[start-end]` on every line.** A real end is what lets two singers sound
//!    at once and an instrumental break stay silent — the thing LRC can never
//!    express, because a line there simply runs until the next one. The brackets
//!    are how a lyrics file is expected to look; the `-end` is the new part.
//! 2. **`@1` / `@2` singers**, declared once at the top with real names. The
//!    display puts singer one on the left and singer two on the right.
//! 3. **Word stamps relative to the line** (`<+0.5>`). Relative, so a line is
//!    self-contained: nudging it half a second later is one edit to its start,
//!    not a rewrite of every word inside it. Absolute stamps parse too.

import type { LyricLine, LyricsDoc, LyricWord } from "./lyricsParse";
import { emptyDoc, voiceOrder } from "./lyricsParse";

/** The file extension: `song.slyr`, beside `song.mp3`. */
export const SANTI_EXT = "slyr";

/** Header keys with a defined meaning. Anything else is treated as lyric text,
 *  so a line like "Baby: don't go" is never mistaken for metadata. */
const META_KEYS = ["title", "artist", "album", "language", "duration", "instrumental"];

const META = new RegExp(`^(${META_KEYS.join("|")})\\s*:\\s*(.*)$`, "i");
/** `voice 2 = Harmony` — names a singer for the `@2` marks below. */
const VOICE_DECL = /^voice\s+(\S+)\s*=\s*(.*)$/i;
/** `h:mm:ss.mmm`, `m:ss.xx`, or plain seconds. */
const TIME = String.raw`\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?`;
/** `[0:05.00-0:09.00] text` — the written form. */
const LINE = new RegExp(String.raw`^\[(${TIME})(?:\s*-\s*(${TIME}))?\]\s*(.*)$`);
/**
 * `0:05.00-0:09.00 text` — the same line without its brackets. Accepted but
 * never written: dropping them is the easiest slip to make when typing a sheet
 * by hand, and rejecting the line over punctuation would be needless.
 *
 * A colon is required here, unlike inside brackets. Without one, a lyric that
 * opens on a number — "99 problems" — would be read as a line timed to 99
 * seconds; the brackets are what make that unambiguous, so bare lines have to
 * look like a clock to count as one.
 */
const CLOCK = String.raw`\d+(?::\d{1,2}){1,2}(?:\.\d{1,3})?`;
const BARE = new RegExp(String.raw`^(${CLOCK})(?:\s*-\s*(${CLOCK}))?(?:\s+(.*))?$`);
/** `@1` or `@Harmony`, right after the timing. */
const SINGER = /^@(\S+)\s*/;
/** A word stamp: `<+0.5>` relative to the line, or `<0:05.5>` absolute. */
const WORD = /<(\+?[\d:.]+)>/g;

/** Parse `h:mm:ss.mmm` / `m:ss.xx` / `12.5` to seconds. Null if unreadable. */
function readTime(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d*\.?\d*$/.test(part) || part === "" || part === ".") return null;
    total = total * 60 + parseFloat(part);
  }
  return Number.isFinite(total) && total >= 0 ? total : null;
}

/** `m:ss.xx`, or `h:mm:ss.xx` past the hour. */
function writeTime(t: number): string {
  const s = Math.max(0, t);
  const cs = Math.round((s - Math.floor(s)) * 100);
  // Rounding 59.999 up has to carry into the minute, not print ":60.00".
  const whole = Math.floor(s) + (cs === 100 ? 1 : 0);
  const frac = String(cs === 100 ? 0 : cs).padStart(2, "0");
  const secs = String(whole % 60).padStart(2, "0");
  const mins = Math.floor(whole / 60) % 60;
  const hours = Math.floor(whole / 3600);
  return hours
    ? `${hours}:${String(mins).padStart(2, "0")}:${secs}.${frac}`
    : `${mins}:${secs}.${frac}`;
}

/**
 * `@N` ids keyed by singer name.
 *
 * A name already ending in a number keeps it, so "Singer 2" is `@2` and lands
 * on the right whether or not singer one was ever marked. Everything else takes
 * the lowest number still free, in order of appearance. Exported because the
 * LRC writer numbers its `vN:` prefixes by exactly the same rule, and the two
 * must never disagree about who is singer two.
 */
export function numberVoices(order: string[]): Map<string, number> {
  const ids = new Map<string, number>();
  const used = new Set<number>();
  for (const name of order) {
    const numbered = name.match(/(\d+)\s*$/);
    if (!numbered) continue;
    const n = Math.max(1, +numbered[1]);
    if (used.has(n)) continue;
    ids.set(name, n);
    used.add(n);
  }
  let next = 1;
  for (const name of order) {
    if (ids.has(name)) continue;
    while (used.has(next)) next++;
    ids.set(name, next);
    used.add(next);
  }
  return ids;
}

/** Words from a line body, given the line's own start for relative stamps. */
function readWords(body: string, start: number): { words: LyricWord[]; end?: number; text: string } {
  WORD.lastIndex = 0;
  const hits: { t: number; from: number; to: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = WORD.exec(body)) !== null) {
    const raw = m[1];
    // `+x` is measured from the line's start; anything else is absolute.
    const t = raw.startsWith("+") ? addTo(start, raw.slice(1)) : readTime(raw);
    if (t != null) hits.push({ t, from: m.index, to: m.index + m[0].length });
  }
  if (!hits.length) return { words: [], text: body.trim() };

  const words: LyricWord[] = [];
  let end: number | undefined;
  hits.forEach((hit, i) => {
    const stop = i + 1 < hits.length ? hits[i + 1].from : body.length;
    const text = body.slice(hit.to, stop);
    if (!text.trim()) {
      // A trailing stamp closes the line rather than adding an empty word.
      if (i === hits.length - 1) end = hit.t;
      return;
    }
    words.push({ t: hit.t, end: hit.t, text });
  });
  if (!words.length) return { words: [], end, text: body.replace(WORD, "").trim() };

  // Text before the first stamp is sung from the line's start.
  const lead = body.slice(0, hits[0].from);
  if (lead.trimStart()) words.unshift({ t: start, end: words[0].t, text: lead.trimStart() });

  // Each word runs to the next one; the last runs to the line's end.
  for (let i = 0; i < words.length; i++) {
    const next = i + 1 < words.length ? words[i + 1].t : (end ?? words[i].t);
    words[i].end = Math.max(words[i].t, next);
  }
  return { words, end, text: words.map((w) => w.text).join("").trim() };
}

function addTo(start: number, offset: string): number | null {
  const secs = readTime(offset);
  return secs == null ? null : start + secs;
}

/** Parse a santi.lyrics document. Unreadable lines are skipped, never thrown on. */
export function parseSanti(text: string, duration = 0): LyricsDoc {
  const doc = emptyDoc();
  doc.duration = duration;
  const names = new Map<string, string>();
  const plain: string[] = [];
  let started = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    // Metadata and singer declarations only count above the first timed line,
    // so a lyric that happens to read "title: ..." stays a lyric.
    if (!started) {
      const voice = line.match(VOICE_DECL);
      if (voice) {
        names.set(voice[1].toLowerCase(), voice[2].trim());
        continue;
      }
      const meta = line.match(META);
      if (meta) {
        const value = meta[2].trim();
        switch (meta[1].toLowerCase()) {
          case "title":
            doc.title = value;
            break;
          case "artist":
            doc.artist = value;
            break;
          case "album":
            doc.album = value;
            break;
          case "language":
            doc.language = value;
            break;
          case "duration": {
            const secs = readTime(value);
            if (secs != null) doc.duration = secs;
            break;
          }
          case "instrumental":
            doc.instrumental = /^(yes|true|1)$/i.test(value);
            break;
        }
        continue;
      }
    }

    const timed = line.match(LINE) ?? line.match(BARE);
    const start = timed ? readTime(timed[1]) : null;
    if (!timed || start == null) {
      // No timestamp: unsynchronized lyrics, which the format still carries.
      plain.push(line);
      continue;
    }
    started = true;

    const end = timed[2] ? readTime(timed[2]) : null;
    let body = timed[3] ?? "";

    let voice: string | undefined;
    const singer = body.match(SINGER);
    if (singer) {
      const id = singer[1];
      // `@2` resolves through the declarations; `@Harmony` names itself.
      voice = names.get(id.toLowerCase()) ?? (/^\d+$/.test(id) ? `Singer ${id}` : id);
      body = body.slice(singer[0].length);
    }

    const parsed = readWords(body, start);
    doc.lines.push({
      t: start,
      end: end != null && end > start ? end : parsed.end,
      text: parsed.words.length ? parsed.text : body.trim(),
      words: parsed.words.length ? parsed.words : undefined,
      voice,
    });
  }

  doc.lines.sort((a, b) => a.t - b.t);
  doc.plain = plain.join("\n");
  return doc;
}

/** Write a document as santi.lyrics. */
export function writeSanti(doc: LyricsDoc): string {
  const out: string[] = ["# santi.lyrics v1", ""];

  const header: string[] = [];
  if (doc.title) header.push(`title: ${doc.title}`);
  if (doc.artist) header.push(`artist: ${doc.artist}`);
  if (doc.album) header.push(`album: ${doc.album}`);
  if (doc.language) header.push(`language: ${doc.language}`);
  // A track length is a round number to a reader; the centiseconds that matter
  // on a lyric line are just noise here.
  if (doc.duration > 0) header.push(`duration: ${writeTime(doc.duration).replace(/\.00$/, "")}`);
  if (doc.instrumental) header.push("instrumental: yes");
  if (header.length) out.push(...header, "");

  if (doc.instrumental) return `${out.join("\n")}\n`;

  // Only singers with a name of their own are declared: `@2` already means
  // "Singer 2" to the reader, so writing `voice 2 = Singer 2` would be two
  // lines of noise at the top of every duet that never got renamed.
  const ids = numberVoices(voiceOrder(doc.lines));
  const named = [...ids].filter(([name, n]) => name !== `Singer ${n}`);
  if (named.length) {
    for (const [name, n] of named) out.push(`voice ${n} = ${name}`);
    out.push("");
  }

  for (const line of doc.lines) {
    const time =
      line.end != null && line.end > line.t
        ? `${writeTime(line.t)}-${writeTime(line.end)}`
        : writeTime(line.t);
    const singer = line.voice ? `@${ids.get(line.voice) ?? 1} ` : "";
    out.push(`[${time}] ${singer}${body(line)}`.trimEnd());
  }

  if (doc.plain.trim()) {
    if (doc.lines.length) out.push("");
    out.push(...doc.plain.split(/\r?\n/));
  }
  return `${out.join("\n")}\n`;
}

/** A line's text, with word stamps written relative to the line's own start. */
function body(line: LyricLine): string {
  const words = line.words;
  if (!words?.length) return line.text;

  const offset = (t: number) => `<+${Math.max(0, t - line.t).toFixed(2)}>`;
  let text = words
    // The first word starts with the line, so it needs no stamp of its own.
    .map((w, i) => (i === 0 && Math.abs(w.t - line.t) < 0.005 ? w.text : offset(w.t) + w.text))
    .join("")
    .trimEnd();

  // Where the line has no explicit end, a trailing stamp closes the last word —
  // otherwise its duration would be lost on the way back in.
  const last = words[words.length - 1];
  if ((line.end == null || line.end <= line.t) && last.end > last.t) text += offset(last.end);
  return text;
}

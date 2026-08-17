#!/usr/bin/env node
//! Give your own lyric sheet LRCLIB's timings.
//!
//! LRCLIB's synced lyrics are timed but often abridged: lines are merged, ad
//! libs dropped, censored spellings, no section headers. A sheet from Genius
//! reads better but has no times. This aligns the two — your text keeps its
//! wording and line breaks, LRCLIB supplies the clock.
//!
//! Lines that match get their source line's timestamp. Runs that don't (your
//! sheet splitting one timed line into two, an ad lib LRCLIB never had) are
//! interpolated between the anchors either side, weighted by line length, so a
//! long line gets more of the gap than a short one.
//!
//!   node tools/lrc-align.mjs --track "The Recipe" --artist "Kendrick Lamar" \
//!     --text sheet.txt --out "The Recipe.lrc"
//!
//! `--text -` reads the sheet from stdin, which on Windows pairs with
//! `Get-Clipboard | node tools/lrc-align.mjs ... --text -`.
//!
//! Import the result into Aria with the lyrics panel's "Add from file…".

import { readFileSync, writeFileSync } from "node:fs";

const UA = "aria-lrc-align/0.1 (https://github.com/dlyrr/Aria)";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.text) {
  console.error("usage: lrc-align --text <file|-> (--id N | --track T --artist A) [--duration S] [--out F] [--keep-headers]");
  process.exit(2);
}

/** Fold a line to what two versions of the same lyric have in common. */
function norm(s) {
  return s
    .toLowerCase()
    // Curly quotes, dashes, and the parentheses that wrap ad libs.
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    // Censored spellings: "f**k", "sh-t", "n****" all fold to their letters
    // being unknowable, so drop the masks rather than try to guess.
    .replace(/[*_]+/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    // Contractions and dialect spellings that differ between sheets.
    .replace(/\b(in)\b/g, "ing")
    .replace(/ings\b/g, "ing")
    .replace(/\bya\b/g, "you")
    .replace(/\byo\b/g, "your")
    .replace(/\bmotherfuckin\b/g, "mothafuckin")
    .replace(/\bwit\b/g, "with")
    .replace(/\bfo\b/g, "for")
    .replace(/\bmornin\b/g, "morning")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s) => norm(s).split(" ").filter(Boolean);

/** Dice coefficient over word bigrams, with a unigram floor for short lines. */
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const grams = (t) => (t.length < 2 ? t : t.slice(1).map((w, i) => `${t[i]} ${w}`));
  const score = (ga, gb) => {
    const pool = new Map();
    for (const g of ga) pool.set(g, (pool.get(g) ?? 0) + 1);
    let hit = 0;
    for (const g of gb) {
      const n = pool.get(g) ?? 0;
      if (n > 0) {
        hit++;
        pool.set(g, n - 1);
      }
    }
    return (2 * hit) / (ga.length + gb.length);
  };
  return Math.max(score(grams(ta), grams(tb)), score(ta, tb) * 0.9);
}

/**
 * Monotonic global alignment (Needleman–Wunsch). Order is the one thing both
 * sheets agree on, so nothing may cross: pairs come out in reading order.
 */
function align(target, source) {
  const n = target.length;
  const m = source.length;
  const GAP = -0.34;
  const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const from = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    score[i][0] = score[i - 1][0] + GAP;
    from[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    score[0][j] = score[0][j - 1] + GAP;
    from[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      // Similarity re-centred so a poor pair scores worse than two gaps.
      const diag = score[i - 1][j - 1] + (similarity(target[i - 1], source[j - 1].text) - 0.42);
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      if (diag >= up && diag >= left) {
        score[i][j] = diag;
        from[i][j] = 0;
      } else if (up >= left) {
        score[i][j] = up;
        from[i][j] = 1;
      } else {
        score[i][j] = left;
        from[i][j] = 2;
      }
    }
  }
  /** For each target line: the source index it matched, or -1. */
  const match = new Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = i === 0 ? 2 : j === 0 ? 1 : from[i][j];
    if (step === 0) {
      if (similarity(target[i - 1], source[j - 1].text) >= 0.34) match[i - 1] = j - 1;
      i--;
      j--;
    } else if (step === 1) i--;
    else j--;
  }
  return match;
}

function parseSynced(lrc) {
  const out = [];
  for (const line of lrc.split(/\r?\n/)) {
    const m = line.match(/^\s*\[(\d+):(\d+(?:[.,]\d+)?)\]\s*(.*)$/);
    if (!m) continue;
    out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(",", ".")), text: m[3].trim() });
  }
  return out.sort((a, b) => a.t - b.t);
}

const stamp = (t) => {
  const s = Math.max(0, t);
  const mm = Math.floor(s / 60);
  const ss = (s - mm * 60).toFixed(2).padStart(5, "0");
  return `[${String(mm).padStart(2, "0")}:${ss}]`;
};

async function fetchRecord() {
  if (args.id) {
    const r = await fetch(`https://lrclib.net/api/get/${args.id}`, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`LRCLIB ${r.status}`);
    return r.json();
  }
  const q = new URLSearchParams({ track_name: args.track ?? "", artist_name: args.artist ?? "" });
  const r = await fetch(`https://lrclib.net/api/search?${q}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`LRCLIB ${r.status}`);
  const list = (await r.json()).filter((x) => x.syncedLyrics);
  if (!list.length) throw new Error("no synced lyrics on LRCLIB for that search");
  // Closest duration to the file being synced; ties go to the most complete.
  const want = args.duration ? +args.duration : list[0].duration;
  list.sort(
    (a, b) =>
      Math.abs(a.duration - want) - Math.abs(b.duration - want) ||
      b.syncedLyrics.length - a.syncedLyrics.length,
  );
  return list[0];
}

const record = await fetchRecord();
const source = parseSynced(record.syncedLyrics);
if (!source.length) throw new Error("record has no synced lines");

const raw = args.text === "-" || args.text === true
  ? readFileSync(0, "utf8")
  : readFileSync(args.text, "utf8");

const isHeader = (l) => /^\[.*\]$/.test(l.trim());
/** Section headers are structure, not lyric: they never take part in matching. */
const sheet = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((text) => ({ text, header: isHeader(text) }));

const sung = sheet.filter((l) => !l.header);
const match = align(sung.map((l) => l.text), source);

// Anchors in hand, fill the gaps. A run of unmatched lines shares the time
// between its neighbours in proportion to how much there is to sing.
const times = new Array(sung.length).fill(null);
sung.forEach((_, i) => {
  if (match[i] >= 0) times[i] = source[match[i]].t;
});
// Monotonic: a stray match that goes backwards is worse than no match.
let high = -Infinity;
for (let i = 0; i < times.length; i++) {
  if (times[i] === null) continue;
  if (times[i] <= high) times[i] = null;
  else high = times[i];
}

const END = record.duration ?? source[source.length - 1].t + 4;
const weight = (i) => Math.max(4, tokens(sung[i].text).length);
for (let i = 0; i < times.length; i++) {
  if (times[i] !== null) continue;
  let j = i;
  while (j < times.length && times[j] === null) j++;
  const before = i > 0 ? times[i - 1] : null;
  // The next anchor, or the end of the record for a trailing run.
  const afterT = j < times.length ? times[j] : END;
  const startT = before ?? Math.max(0, source[0].t - (j - i) * 2.4);
  const span = afterT - startT;
  // The anchor line before the run is still being sung during part of the gap,
  // so it takes a share too — otherwise the first interpolated line lands on
  // top of it. With no anchor before (a run at the very start) the run has the
  // whole synthesised span to itself.
  const lead = before === null ? 0 : weight(i - 1);
  let total = lead;
  for (let k = i; k < j; k++) total += weight(k);
  let acc = lead;
  for (let k = i; k < j; k++) {
    times[k] = startT + (span * acc) / total;
    acc += weight(k);
  }
  i = j - 1;
}

// Strictly increasing, and never behind the previous line by rounding.
for (let i = 1; i < times.length; i++) {
  if (times[i] <= times[i - 1]) times[i] = times[i - 1] + 0.2;
}

const keepHeaders = !!args["keep-headers"];
const out = [];
out.push(`[ti:${record.trackName ?? args.track ?? ""}]`);
out.push(`[ar:${record.artistName ?? args.artist ?? ""}]`);
if (record.albumName) out.push(`[al:${record.albumName}]`);
out.push(`[length:${stamp(record.duration ?? 0).slice(1, -1)}]`);
out.push(`[re:aria lrc-align]`);

let k = 0;
for (const line of sheet) {
  if (line.header) {
    // A header belongs to the line after it: same instant, a shade earlier.
    if (keepHeaders && k < times.length) out.push(`${stamp(Math.max(0, times[k] - 0.05))}${line.text}`);
    continue;
  }
  out.push(`${stamp(times[k])}${line.text}`);
  k++;
}

const target = args.out ?? "aligned.lrc";
writeFileSync(target, out.join("\n") + "\n", "utf8");

const matched = match.filter((m) => m >= 0).length;
console.error(
  [
    `LRCLIB #${record.id} — ${record.artistName} / ${record.trackName} (${record.albumName ?? "?"}), ${record.duration}s`,
    `source ${source.length} timed lines, sheet ${sung.length} sung lines (${sheet.length - sung.length} headers)`,
    `anchored ${matched}/${sung.length} (${Math.round((matched / sung.length) * 100)}%), interpolated ${sung.length - matched}`,
    `wrote ${target}`,
  ].join("\n"),
);

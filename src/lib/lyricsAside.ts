//! Parenthetical asides in lyric text — ad-libs, backing vocals, producer tags.
//!
//! Pure text helpers with no store or Tauri dependency, kept apart from
//! `lyrics.svelte.ts` so they stay directly testable.

/** Only the field these helpers need, so callers aren't tied to `LyricWord`. */
interface TextRun {
  text: string;
}

const OPEN = /[([{]/;
const CLOSE = /[)\]}]/;
/** A letter or digit — the same "real content" test the word splitter uses. */
const CONTENT = /[^\W_]/u;

/** Bracket characters, dropped from display. */
export function stripBrackets(text: string): string {
  return text.replace(/[([{)\]}]/g, "");
}

/**
 * Which words sit inside a parenthetical aside. Bracket depth is carried across
 * words because an aside routinely spans several of them.
 *
 * Judged at the word's first letter, not from its bracket counts: a word owns
 * the punctuation that trails it (`wordsync.py` slices up to the next token),
 * so the `(` opening an aside lands on the end of the word *before* it. Counting
 * brackets marked that lead-in word as an aside, and a line alternating between
 * the two ended up entirely inside one.
 *
 * A word whose brackets all close before its first letter — the `)` ending an
 * aside — is therefore outside it, and a word with no letters at all inherits
 * the depth it ends on.
 */
export function asideFlags(words: TextRun[]): boolean[] {
  let depth = 0;
  return words.map((w) => {
    let inside: boolean | undefined;
    for (const ch of w.text) {
      if (OPEN.test(ch)) depth++;
      else if (CLOSE.test(ch)) depth = Math.max(0, depth - 1);
      else if (inside === undefined && CONTENT.test(ch)) inside = depth > 0;
    }
    return inside ?? depth > 0;
  });
}

/**
 * Split a line's words into at most two rows: everything sung normally, and
 * every parenthetical gathered together beneath it.
 *
 * A line alternating between the two (`a (b) c (d)`) is one phrase against one
 * run of backing vocals, so it reads as two rows — not the four that breaking
 * at every bracket produces. The lead row stays a continuous phrase instead of
 * being chopped into fragments by each ad-lib.
 *
 * The cost is that a mid-line aside no longer sits where it was written: `a (b)
 * c` renders as `a c` over `b`. Both rows stay in reading order internally, so
 * an aside is still placeable against the lead by position.
 *
 * Brackets are dropped from display. They can't survive the regrouping: a `(`
 * trails the lead-in word, so keeping them renders the lead row as `a (c (`.
 * The row's smaller, dimmer type is what marks it as an aside now.
 *
 * Whichever kind opens the line leads, so a line starting on an ad-lib isn't
 * flipped around.
 *
 * Indices are returned rather than the words themselves so callers can still
 * reach per-word timing and emphasis data, which is keyed by original position.
 */
export function asideRuns(words: TextRun[]): { aside: boolean; indices: number[] }[] {
  const rows = [
    { aside: false, indices: [] as number[] },
    { aside: true, indices: [] as number[] },
  ];
  const flags = asideFlags(words);
  flags.forEach((isAside, i) => rows[isAside ? 1 : 0].indices.push(i));
  if (flags[0]) rows.reverse();
  return rows.filter((r) => r.indices.length);
}

/**
 * The same two-row split for an untimed line, brackets dropped to match, so a
 * line doesn't visibly reflow the moment word timings take over.
 */
export function asideTextRuns(text: string): { aside: boolean; text: string }[] {
  const rows = [
    { aside: false, text: "" },
    { aside: true, text: "" },
  ];
  let leads: boolean | undefined;
  for (const r of splitAsides(text)) {
    const piece = stripBrackets(r.text).replace(/\s+/g, " ").trim();
    if (!piece) continue; // whitespace between runs carries no content of its own
    leads ??= r.aside;
    const row = rows[r.aside ? 1 : 0];
    row.text = row.text ? `${row.text} ${piece}` : piece;
  }
  if (leads) rows.reverse();
  return rows.filter((r) => r.text);
}

/**
 * Display text for one row's words, in row order: brackets dropped, spacing
 * repaired.
 *
 * Word timings carry their own spacing, and gathering the asides puts words
 * side by side that weren't adjacent in the line. Where the space between two
 * of them went to a word now left on the other row, it has to be put back, or
 * `b` and `d` render as `bd`. The first word is trimmed for the mirror case: a
 * leading space that used to separate it from the word before now sits at the
 * start of a row, and `.word` preserves it.
 *
 * Timing is untouched — this is display text only, so the karaoke fill still
 * runs against each word's own span.
 */
export function rowTexts(texts: string[]): string[] {
  const bare = texts.map(stripBrackets);
  return bare.map((t, i) => {
    if (i === 0) return t.replace(/^\s+/, "");
    return /\s$/.test(bare[i - 1]) || /^\s/.test(t) ? t : ` ${t}`;
  });
}

/**
 * Split a plain lyric line into normal and parenthetical runs, in order.
 * Concatenating every run reproduces the input exactly.
 */
export function splitAsides(text: string): { text: string; aside: boolean }[] {
  const out: { text: string; aside: boolean }[] = [];
  // Trailing bracket optional: a line can open an aside and never close it.
  const bracket = /[([{][^)\]}]*[)\]}]?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = bracket.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), aside: false });
    out.push({ text: m[0], aside: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), aside: false });
  return out.length ? out : [{ text, aside: false }];
}

//! Which side of the panel a lyric line sits on.
//!
//! When two lines sound at once, stacking them flush-left reads as one line
//! being replaced by the next. Offsetting the overlapping one to the opposite
//! side makes it obvious they are concurrent — the treatment Apple Music uses
//! for call-and-response and doubled vocals.

import { voiceOrder } from "./lyricsParse";

/**
 * How much overlap counts as genuinely concurrent, in seconds.
 *
 * Authored timing routinely overlaps by a few tens of milliseconds where one
 * phrase is clipped against the next — inaudible, and not two voices at once.
 * Offsetting on that would scatter lines across both sides for no reason a
 * listener could hear.
 */
const MIN_OVERLAP = 0.35;

/**
 * Which side each singer sings from.
 *
 * Numbered labels go first and take the side their number names, so "Singer 2"
 * — or `@2` in a santi.lyrics file — is on the right whoever else is in the
 * song, and marking singer one later never flips it. Named singers then fill
 * whatever side is still free, which keeps a "Singer 2" duetting with a
 * "Harmony" on opposite sides rather than stacked on the same one.
 */
function voiceSides(order: string[]): Map<string, number> {
  const sides = new Map<string, number>();
  const taken = new Set<number>();
  for (const voice of order) {
    const numbered = voice.match(/(\d+)\s*$/);
    if (!numbered) continue;
    const side = (Math.max(1, +numbered[1]) - 1) % 2;
    sides.set(voice, side);
    taken.add(side);
  }
  let spare = 0;
  for (const voice of order) {
    if (sides.has(voice)) continue;
    const side = !taken.has(0) ? 0 : !taken.has(1) ? 1 : spare++ % 2;
    sides.set(voice, side);
    taken.add(side);
  }
  return sides;
}

interface Spanned {
  t: number;
  end?: number;
  /** Singer label, when the source names one. */
  voice?: string;
}

/**
 * A 0/1 lane per line: 0 sits left, 1 sits right.
 *
 * Derived from the timings alone, never from the playhead. A lane computed
 * from "what is active right now" would change as lines enter and leave, so a
 * line would visibly jump sides mid-phrase; this way its side is fixed for the
 * whole song and only the highlight moves.
 *
 * Two sources, in order:
 *
 * 1. An explicit singer. Where the file says who sings a line — a santi.lyrics
 *    `@2`, a WebVTT `<v Name>`, a Lyricsfile `voice`, an LRC `v2:` prefix — the
 *    singer decides the side, and it no longer depends on how the line happens
 *    to be timed. This is what makes a duet read as a duet even in the stretches
 *    where the two singers never actually overlap.
 * 2. Failing that, overlap. A line overlapping its predecessor takes the
 *    opposite lane, so a chain of overlaps alternates rather than piling
 *    everything on one side. Anything that starts cleanly after the previous
 *    line ends resets to the left.
 */
export function alignmentLanes(lines: Spanned[]): number[] {
  const sides = voiceSides(voiceOrder(lines));
  const lanes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const voice = lines[i].voice;
    if (voice) {
      lanes.push(sides.get(voice) ?? 0);
      continue;
    }
    const prev = lines[i - 1];
    if (!prev) {
      lanes.push(0);
      continue;
    }
    // Without an explicit end a line runs to the next one, so it cannot overlap.
    const overlap = prev.end != null ? prev.end - lines[i].t : 0;
    lanes.push(overlap >= MIN_OVERLAP ? 1 - lanes[i - 1] : 0);
  }
  return lanes;
}

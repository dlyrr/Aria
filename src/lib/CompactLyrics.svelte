<script lang="ts">
  //! One line at a time, in a bar — Solarium's "Compact" lyrics.
  //!
  //! Deliberately not the scrolling panel at a smaller size: a bar that scrolls
  //! is a panel in disguise. This shows the line being sung (word-lit where the
  //! source has word timing) with the next one waiting beneath it, and nothing
  //! else — so it can sit over the artwork without taking the screen from it.
  import { lyrics, wordProgress } from "$lib/lyrics.svelte";
  import { player } from "$lib/player.svelte";
  import { glass } from "$lib/liquidGlass";

  const synced = $derived(lyrics.status === "synced" && lyrics.lines.length > 0);

  /** The latest line that has started; -1 during an intro. */
  const anchor = $derived(synced ? lyrics.activeIndex(player.position) : -1);
  const current = $derived(anchor >= 0 ? lyrics.lines[anchor] : null);
  const next = $derived(lyrics.lines[anchor + 1] ?? null);

  /** Per-word emphasis for the sung line — the same measure the panel uses. */
  function emphasisOf(words: { t: number; end: number }[]): number[] {
    const held = words.map((w) => Math.max(w.end - w.t, 0));
    const sorted = [...held].sort((a, b) => a - b);
    const median = Math.max(sorted[sorted.length >> 1], 0.05);
    return held.map((d) => Math.max(0, Math.min(1, (d / median - 1.5) / 1.5)));
  }
  const emphasis = $derived(current?.words?.length ? emphasisOf(current.words) : []);
</script>

{#if synced}
  <div
    class="compact-lyrics"
    use:glass={{ blur: 26, saturate: 1.7, brightness: 1.02, bezel: 18, strength: 28 }}
  >
    <div class="now-line" class:waiting={!current}>
      {#if current?.words?.length}
        <!-- One line, no whitespace between spans: word text carries its own
             spacing, and a newline here would show up as an extra gap. -->
        {#each current.words as w, i (i)}<span class="word" style="--wp:{wordProgress(w, player.position)};--emph:{emphasis[i] ?? 0}"><span class="word-dim">{w.text}</span><span class="word-lit" aria-hidden="true">{w.text}</span></span>{/each}
      {:else if current?.text}
        {current.text}
      {:else}
        ♪
      {/if}
    </div>
    {#if next?.text}
      <div class="next-line">{next.text}</div>
    {/if}
  </div>
{/if}

<style>
  .compact-lyrics {
    padding: 14px 26px 13px;
    border-radius: 18px;
    border: 1px solid var(--sol-hairline, rgba(255, 255, 255, 0.24));
    /* Same glass as the rest of Solarium — see `.solarium` for the recipe. */
    background: var(--sol-glass, rgba(255, 255, 255, 0.1));
    backdrop-filter: blur(26px) saturate(1.7) brightness(1.02);
    box-shadow:
      var(--sol-rim, inset 0 1px 0 rgba(255, 255, 255, 0.3)),
      0 20px 50px rgba(10, 3, 8, 0.28);
    text-align: center;
    font-family: var(--font-lyrics);
  }
  .now-line {
    font-size: clamp(18px, 1.45vw, 25px);
    font-weight: 700;
    line-height: 1.28;
    color: #fff;
    text-shadow: 0 0 22px rgba(255, 255, 255, 0.28);
  }
  /* Before the first line lands there is nothing to light, so the bar shows the
     upcoming line alone rather than an empty box. */
  .now-line.waiting {
    opacity: 0.5;
  }
  .next-line {
    margin-top: 5px;
    font-size: clamp(13px, 1vw, 16px);
    font-weight: 620;
    line-height: 1.3;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Same two-copy karaoke fill as the panel, minus the glow wrapper: at this
     size the bloom would close up the counters. */
  .word {
    position: relative;
    display: inline-block;
    white-space: pre;
    transform: translateY(calc(var(--wp, 0) * var(--lyric-fx-lift, 1) * -2px))
      scale(calc(1 + var(--emph, 0) * var(--wp, 0) * var(--lyric-fx-emphasis, 1) * 0.04));
    transform-origin: center bottom;
    transition: transform calc(180ms / var(--lyric-fx-speed, 1)) var(--motion-spring);
  }
  .word-dim {
    opacity: 0.44;
  }
  .word-lit {
    position: absolute;
    left: 0;
    top: 0;
    --feather: calc(var(--lyric-fx-fill-softness, 1) * 6px);
    --edge: calc(var(--wp, 0) * (100% + 2 * var(--feather)) - var(--feather));
    -webkit-mask-image: linear-gradient(
      90deg,
      #000 calc(var(--edge) - var(--feather)),
      transparent calc(var(--edge) + var(--feather))
    );
    mask-image: linear-gradient(
      90deg,
      #000 calc(var(--edge) - var(--feather)),
      transparent calc(var(--edge) + var(--feather))
    );
    transition: -webkit-mask-image 60ms linear, mask-image 60ms linear;
  }
  @media (prefers-reduced-motion: reduce) {
    .word {
      transform: none;
      transition: none;
    }
  }
</style>

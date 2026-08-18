<script lang="ts">
  //! The three dots Apple Music shows through an instrumental — an intro, a
  //! solo, the bar of silence before a last chorus.
  //!
  //! They are a countdown, not a spinner: each dot owns a third of the gap and
  //! lights as that third passes, so a glance tells you how long is left. The
  //! last moment before the vocal, all three swell together, which is what
  //! makes the entry land on the beat rather than surprise you.

  interface Props {
    /** How far through the silence, 0–1. */
    progress?: number;
  }
  let { progress = 0 }: Props = $props();

  const p = $derived(Math.max(0, Math.min(1, progress)));
  /** The swell just before the line arrives. */
  const imminent = $derived(p > 0.88);
</script>

<span class="dots" class:imminent style="--p:{p}" aria-hidden="true">
  <span class="dot" style="--i:0"></span>
  <span class="dot" style="--i:1"></span>
  <span class="dot" style="--i:2"></span>
</span>

<style>
  .dots {
    display: inline-flex;
    align-items: center;
    /* `em`, so the dots scale with whatever lyric size the surface uses.
       Tight enough to read as one object rather than three marks — they are a
       single countdown, and spaced out they scan as punctuation. */
    gap: 0.17em;
    line-height: 1;
    vertical-align: middle;
  }
  .dot {
    width: 0.4em;
    height: 0.4em;
    border-radius: 50%;
    background: currentColor;
    /* Each dot's share of the countdown: dot 0 fills over the first third,
       dot 1 the second, dot 2 the last. */
    --lit: clamp(calc(var(--p) * 3 - var(--i)), 0, 1);
    opacity: calc(0.2 + 0.8 * var(--lit));
    transform: scale(calc(0.7 + 0.45 * var(--lit)));
    /* Position ticks arrive ~30x a second; these bridge the gap between them
       without lagging behind the music. */
    transition:
      opacity 140ms linear,
      transform 220ms var(--motion-spring);
  }
  /* All three breathe together on the way in, so the vocal is announced. */
  .imminent .dot {
    animation: dot-swell 620ms ease-in-out infinite;
    animation-delay: calc(var(--i) * 70ms);
  }
  /* Peak kept just under where neighbours would collide at this spacing. */
  @keyframes dot-swell {
    0%,
    100% {
      transform: scale(1.12);
    }
    50% {
      transform: scale(1.3);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      transition: none;
    }
    .imminent .dot {
      animation: none;
    }
  }
</style>

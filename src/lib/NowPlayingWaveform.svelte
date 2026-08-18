<script lang="ts">
  //! The four bouncing bars beside the playing track, in Apple Music's shape.
  //!
  //! Every bar is the real level of its own frequency band — bass, low mid,
  //! high mid, treble — measured off the samples on their way to the mixer.
  //! Four bars fed one loudness all move as one lump, which is the tell that
  //! an indicator is decorative; a real split makes the bass bar punch on the
  //! kick while the treble bar rides the hats, which is the whole point.
  //!
  //! Nothing is animated here on a timer. The player advances the levels every
  //! animation frame — attacking fast, releasing slow, the way a meter has to
  //! — so the height written below is already smooth and already current.

  let {
    playing = false,
    bands = [0, 0, 0, 0],
  }: {
    playing?: boolean;
    /** Per-frequency-band levels, 0–1, bass → treble. */
    bands?: number[];
  } = $props();

  /** Bars never quite collapse: Apple's keep a stub through a quiet passage. */
  const FLOOR = 0.18;

  /**
   * Bar height, 0–1. The weights only trim the visual balance — the upper
   * bands are already gain-matched where they are measured, and without a
   * little taper the treble bar reads as the loudest thing in the room.
   */
  const WEIGHT = [1, 0.96, 0.9, 0.84];

  function height(index: number): number {
    const level = Math.max(0, Math.min(1, bands[index] ?? 0));
    return FLOOR + level * WEIGHT[index] * (1 - FLOOR);
  }
</script>

<span class="analyzer" aria-hidden="true">
  {#each [0, 1, 2, 3] as index (index)}
    <span class="bar" style="--height:{playing ? height(index) : FLOOR}"></span>
  {/each}
</span>

<style>
  .analyzer {
    display: inline-flex;
    align-items: flex-end;
    justify-content: center;
    gap: 1.8px;
    width: 20px;
    height: 14px;
    color: var(--accent);
  }
  .bar {
    width: 2px;
    height: 100%;
    /* Barely rounded, not a pill: Apple's bars are rectangles with the corners
       taken off, and at 2px wide a full radius turns them into lozenges. */
    border-radius: 1px;
    background: currentColor;
    transform-origin: bottom center;
    /* No transition. The level arriving here is already interpolated per frame
       by the player, so easing it again would only add lag between the sound
       and the bar. */
    transform: scaleY(var(--height, 0.18));
  }

  @media (prefers-reduced-motion: reduce) {
    .bar:nth-child(1) {
      transform: scaleY(0.4);
    }
    .bar:nth-child(2) {
      transform: scaleY(0.85);
    }
    .bar:nth-child(3) {
      transform: scaleY(0.6);
    }
    .bar:nth-child(4) {
      transform: scaleY(1);
    }
  }
</style>

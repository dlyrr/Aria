<script lang="ts">
  //! Minimal — the third immersive mode, and the quiet one.
  //!
  //! One frames the cover, Solarium *is* the cover; Minimal gets out of the
  //! cover's way. There is no crop, no bleed, no ink-flipping and no idle
  //! choreography: a square record floats a little above centre over a hushed
  //! colour field, a handful of light trails drift behind it slowly enough
  //! that you notice they moved rather than watching them move, and the only
  //! chrome is a single pill at the bottom.
  //!
  //! The restraint is also the performance budget. This codebase has spent a
  //! lot of time fighting frame drops (see liquidGlass.ts) and the two things
  //! that cost frames are large `backdrop-filter` surfaces and anything that
  //! repaints every tick. So: glass exists only on the dock and the lyric card,
  //! and the trails are pure CSS transform animations on wrapper divs — no
  //! requestAnimationFrame anywhere in this file.
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import { player, formatTime } from "$lib/player.svelte";
  import { ui } from "$lib/ui.svelte";
  import { theme } from "$lib/theme.svelte";
  import { library } from "$lib/library.svelte";
  import { glass } from "$lib/liquidGlass";
  import Artwork from "$lib/Artwork.svelte";
  import LyricsPanel from "$lib/LyricsPanel.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";
  import DynamicBackground from "$lib/DynamicBackground.svelte";
  import type { ArtworkPalette } from "$lib/accent";

  // Same contract as Solarium: the field is derived once in +page.svelte and
  // handed down, so every mode shows the same backdrop rather than each one
  // re-deriving a subtly different palette from the same picture.
  let {
    backdrop,
    onappearance,
  }: {
    backdrop: { key: string; art: string | null; palette: ArtworkPalette };
    /** Opens the Appearance panel — owned by Immersive.svelte, shared with One and Solarium. */
    onappearance: () => void;
  } = $props();

  let seeking = $state(false);
  let seekValue = $state(0);
  let volumeOpen = $state(false);

  const pos = $derived(seeking ? seekValue : player.position);
  const progress = $derived(player.duration > 0 ? (pos / player.duration) * 100 : 0);
  const volPct = $derived(player.volume * 100);
  const starred = $derived(!!player.current && library.isFavourite(player.current.path));

  // Minimal reuses One's single `panel` switch rather than Solarium's pair:
  // there is one side slot here and only one thing can be in it, which is
  // exactly what a three-way "which panel" describes.
  const lyricsOpen = $derived(ui.panel === "lyrics");
  const queueOpen = $derived(ui.panel === "queue");
  const sideOpen = $derived(ui.panel !== "none");

  /** Everything after the playing track — what "queue" actually means to a listener. */
  const upcoming = $derived(player.queue.slice(Math.max(0, player.currentIndex + 1)));

  // The palette is only used for the rim and the faintest wash here. Minimal
  // deliberately does not tint its type: the whole point of the mode is that
  // nothing competes with the cover for colour.
  const tint = $derived(
    [
      `--min-primary:${backdrop.palette.primary}`,
      `--min-light:${backdrop.palette.accentLight}`,
      `--min-deep:${backdrop.palette.deep}`,
    ].join(";"),
  );

  /**
   * The trails, as data rather than as six near-identical blocks of markup.
   *
   * `top` bands them down the window and `path` is drawn in a 1000×300 box
   * that gets stretched to the band (`preserveAspectRatio="none"`), which is
   * what turns an ordinary bezier into a wide, lazy arc. `anim` picks one of
   * six keyframe pairs and `dur`/`delay` are all coprime-ish so the set never
   * comes back into phase — the moment two lines visibly move together the
   * whole thing reads as a loop instead of as weather.
   */
  const TRAILS = [
    { top: "-8%", opacity: 0.2, anim: "a", dur: 19, delay: -7, path: "M0,214 C210,64 402,286 616,150 S872,38 1000,168" },
    { top: "8%", opacity: 0.15, anim: "b", dur: 26, delay: -23, path: "M0,96 C168,232 386,44 588,182 S848,268 1000,120" },
    { top: "24%", opacity: 0.24, anim: "c", dur: 16, delay: -31, path: "M0,178 C248,26 430,244 648,112 S886,206 1000,72" },
    { top: "42%", opacity: 0.14, anim: "d", dur: 31, delay: -11, path: "M0,58 C196,206 424,84 620,226 S862,96 1000,196" },
    { top: "60%", opacity: 0.22, anim: "e", dur: 23, delay: -44, path: "M0,240 C232,118 398,268 632,138 S878,222 1000,104" },
    { top: "78%", opacity: 0.17, anim: "f", dur: 35, delay: -19, path: "M0,124 C186,268 412,120 634,244 S856,132 1000,214" },
  ];

  /** Opens the side slot on a panel, or closes it if that panel is already up. */
  function choosePanel(panel: "queue" | "lyrics") {
    ui.panel = ui.panel === panel ? "none" : panel;
    if (ui.panel !== "none") ui.lastPanel = ui.panel;
  }

  function onSeekInput(e: Event) {
    seeking = true;
    player.scrubbing = true;
    seekValue = +(e.target as HTMLInputElement).value;
  }

  async function onSeekCommit() {
    await player.seek(seekValue);
    seeking = false;
    player.scrubbing = false;
  }

  function onKey(e: KeyboardEvent) {
    // The menu / Appearance panel gets first refusal on Escape, same as the
    // other two modes — listener order can't arbitrate that, so `ui` is asked.
    if (e.key === "Escape" && !ui.immersiveOverlay) ui.exit();
  }

  onMount(() => {
    window.scrollTo(0, 0);
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="minimal" class:shifted={sideOpen} style={tint} transition:fade={{ duration: 260 }}>
  <!-- Exactly Solarium's field, at Solarium's saturation: the same picture
       blown up until it is only colour. It is the entire backdrop here, so
       nothing is layered on top of it that would need to blur it. -->
    <!-- The colour field is hoisted to Immersive.svelte: it has to fill the
         window rather than this mode, or the settings dock has nothing behind
         it once the stage is shifted aside. -->

  <!-- One flat gradient, no filter. The field is warm and busy near the middle;
       this pushes the corners down so the cover is the brightest thing on
       screen without having to dim the field itself (which would cost a
       repaint of the shader's output every time it drifted). -->
  <div class="hush" aria-hidden="true"></div>

  <!-- Light trails.
       Each curve gets its own wrapper div and the animation runs on the *div*,
       never on the SVG or the path. That is the whole trick: a transform
       animation on a plain element is handed to the compositor and costs
       nothing per frame, while the same animation on an SVG node re-rasterises
       the drawing every tick — six full-window re-rasters a frame is precisely
       the kind of thing this app has been bleeding frames to.
       The wrappers are bands rather than full-window layers to keep the layer
       memory down, and they overhang left and right so a drifting line never
       shows the end of its own stroke. -->
  <div class="trails" aria-hidden="true">
    {#each TRAILS as t (t.anim)}
      <div
        class="trail trail-{t.anim}"
        style="top:{t.top};opacity:{t.opacity};animation-duration:{t.dur}s;animation-delay:{t.delay}s"
      >
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" focusable="false">
          <!-- `non-scaling-stroke` is load-bearing: the box is stretched hard
               by `preserveAspectRatio="none"`, and without it the hairline
               would fatten with it and stop reading as a light trail. -->
          <path d={t.path} vector-effect="non-scaling-stroke" />
        </svg>
      </div>
    {/each}
  </div>

  <!-- The cover moves by transform alone — never by `left` — so the shift into
       the lyrics layout is a compositor job and the artwork is never
       re-mounted, which would restart the image decode and flash. -->
  <div class="cover">
    <Artwork src={player.current?.art} size="100%" radius="14px" />
  </div>

  {#if sideOpen}
    <section
      class="side-card"
      aria-label={lyricsOpen ? "Lyrics" : "Play queue"}
      use:glass={{ blur: 11, saturate: 1.7, brightness: 0.98, bezel: 30, strength: 40, lens: 0.055, dispersion: 0 }}
      transition:fade={{ duration: 220 }}
    >
      {#if lyricsOpen}
        <LyricsPanel />
      {:else}
        <div class="queue">
          <h2>Up Next</h2>
          {#if upcoming.length === 0}
            <p class="queue-empty">Nothing queued</p>
          {:else}
            <ol>
              {#each upcoming as track, i (track.path + i)}
                <li>
                  <button onclick={() => player.playIndex(player.currentIndex + 1 + i)}>
                    <span class="q-title">{track.title}</span>
                    <span class="q-sub">{track.artist}</span>
                  </button>
                </li>
              {/each}
            </ol>
          {/if}
        </div>
      {/if}
    </section>
  {/if}


  <!-- The dock is the only chrome, so unlike Solarium's it never sleeps and
       never hides: there is nothing else on screen to reach for. -->
  <div
    class="transport"
    use:glass={{ blur: 4, saturate: 1.6, brightness: 1.02, bezel: 18, strength: 26, lens: 0.05 }}
  >
    <div class="left-cluster">
      <button
        class="ctl secondary"
        class:on={player.shuffled}
        title="Shuffle"
        aria-label="Shuffle"
        aria-pressed={player.shuffled}
        onclick={() => player.toggleShuffle()}
      >
        <ImmersiveIcon name="shuffle" size={16} />
      </button>
      <button class="ctl" title="Previous" aria-label="Previous" onclick={() => player.prev()}>
        <ImmersiveIcon name="previous" size={18} />
      </button>
      <button
        class="ctl play"
        title={player.playing ? "Pause" : "Play"}
        aria-label={player.playing ? "Pause" : "Play"}
        onclick={() => player.togglePlay()}
      >
        <ImmersiveIcon name={player.playing ? "pause" : "play"} size={20} />
      </button>
      <button class="ctl" title="Next" aria-label="Next" onclick={() => player.next()}>
        <ImmersiveIcon name="next" size={18} />
      </button>
      <button
        class="ctl secondary repeat"
        class:on={player.repeat !== "off"}
        title="Repeat"
        aria-label="Repeat"
        onclick={() => player.cycleRepeat()}
      >
        <ImmersiveIcon name="repeat" size={16} />
        {#if player.repeat === "one"}<span class="repeat-one">1</span>{/if}
      </button>
      <span class="time">
        {formatTime(pos)} / -{formatTime(Math.max(0, player.duration - pos))}
      </span>
    </div>

    <!-- The inset card is cut *into* the pill rather than laid on it: it is the
         one dark thing in the mode, and being a recess is what stops it from
         reading as a black bar dropped over the artwork. The scrubber is its
         bottom edge, full bleed — the only line in the dock, so it can't be
         mistaken for a divider. -->
    <div class="now-card">
      <div class="now-meta">
        <div class="now-title">{player.current?.title ?? "Not Playing"}</div>
        <div class="now-sub">
          {#if player.current}
            <span class="now-album">{player.current.album || "Single"}</span>
            – {player.current.artist}
          {:else}
            Nothing queued
          {/if}
        </div>
      </div>
      {#if player.current}
        <div class="now-actions">
          <button
            class="mini"
            class:on={starred}
            title={starred ? "Remove from Liked Songs" : "Add to Liked Songs"}
            aria-label={starred ? "Remove from Liked Songs" : "Add to Liked Songs"}
            aria-pressed={starred}
            onclick={() => player.current && library.toggleFavourite(player.current.path)}
          >
            <ImmersiveIcon name="star" size={13} />
          </button>
          <button
            class="mini"
            class:on={queueOpen}
            title="Queue"
            aria-label="Queue"
            aria-pressed={queueOpen}
            onclick={() => choosePanel("queue")}
          >
            <ImmersiveIcon name="queue" size={13} />
          </button>
        </div>
      {/if}
      <div class="track" style="--pct:{progress}%">
        <input
          aria-label="Playback position"
          type="range"
          min="0"
          max={player.duration || 0}
          step="0.1"
          value={pos}
          oninput={onSeekInput}
          onchange={onSeekCommit}
          disabled={!player.loaded}
        />
      </div>
    </div>

    <div class="right-cluster">
      <div
        class="pop-wrap"
        role="group"
        aria-label="Volume"
        onpointerenter={() => (volumeOpen = true)}
        onpointerleave={() => (volumeOpen = false)}
      >
        <button
          class="ctl secondary"
          title="Volume"
          aria-label="Volume"
          onclick={() => (volumeOpen = !volumeOpen)}
        >
          <ImmersiveIcon name="volume" size={16} />
        </button>
        {#if volumeOpen}
          <div
            class="pop"
            use:glass={{ blur: 6, saturate: 1.6, bezel: 12, strength: 20, lens: 0.07 }}
            transition:fade={{ duration: 120 }}
          >
            <div class="track volume" style="--pct:{volPct}%">
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={player.volume}
                oninput={(e) => player.setVolume(+(e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="pop-foot">{Math.round(volPct)}%</div>
          </div>
        {/if}
      </div>
      <button
        class="ctl secondary"
        class:on={queueOpen}
        title="Queue"
        aria-label="Queue"
        aria-pressed={queueOpen}
        onclick={() => choosePanel("queue")}
      >
        <ImmersiveIcon name="queue" size={16} />
      </button>
      <button
        class="ctl secondary"
        class:on={lyricsOpen}
        title="Lyrics"
        aria-label="Lyrics"
        aria-pressed={lyricsOpen}
        onclick={() => choosePanel("lyrics")}
      >
        <ImmersiveIcon name="lyrics" size={16} />
      </button>
      <button
        class="ctl secondary gear"
        title="Appearance"
        aria-label="Appearance"
        onclick={() => onappearance()}
      >
        <ImmersiveIcon name="gear" size={16} />
      </button>
      <button
        class="ctl secondary"
        title="Exit immersive mode"
        aria-label="Exit immersive mode"
        onclick={() => ui.exit()}
      >
        <ImmersiveIcon name="collapse" size={16} />
      </button>
    </div>
  </div>
</div>

<style>
  .minimal {
    /* One ink, always white. Solarium flips its type black over a pale record
       because the artwork is *behind* the glass there; here the glass only ever
       sits over the hushed field, which is dark by construction, so the whole
       luma-sampling apparatus would be dead weight. */
    --min-text: rgba(255, 255, 255, 0.96);
    --min-muted: rgba(255, 255, 255, 0.72);
    /* Same nearly-clear pane as Solarium: a thin milk of white so it reads as a
       surface, with everything else done to the backdrop by `use:glass`. */
    --min-glass: linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.11),
      rgba(255, 255, 255, 0.02) 45%,
      rgba(255, 255, 255, 0.05)
    );
    --min-edge: color-mix(in srgb, var(--min-light, #fff) 62%, rgba(255, 255, 255, 0.9));
    /* Faint on purpose — the live rim `use:glass` draws just inside it is the
       real edge, and this only covers the frame before it lands. */
    --min-hairline: color-mix(in srgb, var(--min-edge) 26%, transparent);
    --min-rim:
      inset 0 1px 0 color-mix(in srgb, var(--min-edge) 58%, transparent),
      inset 1px 0 0 color-mix(in srgb, var(--min-edge) 26%, transparent),
      inset 0 -1px 0 color-mix(in srgb, var(--min-deep, #000) 30%, transparent),
      inset -1px 0 0 color-mix(in srgb, var(--min-deep, #000) 14%, transparent),
      0 0 0 1px color-mix(in srgb, var(--min-primary, #fff) 18%, transparent);
    /* Big enough to be the subject, small enough that the dock never crowds it.
       Bounded on both axes because a tall narrow window and a wide short one
       want opposite constraints and `min()` picks whichever bites first. */
    --min-cover: min(46vh, 34vw);
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    z-index: 2147483647;
    overflow: hidden;
    overscroll-behavior: none;
    isolation: isolate;
    background: var(--bg-deep);
    color: var(--min-text);
  }

  .hush {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      radial-gradient(120% 90% at 50% 42%, transparent 0%, rgba(6, 3, 8, 0.34) 72%, rgba(4, 2, 6, 0.62) 100%),
      linear-gradient(to bottom, rgba(6, 3, 8, 0.16), transparent 30%, rgba(5, 2, 7, 0.4));
  }

  .trails {
    position: absolute;
    inset: 0;
    z-index: 2;
    overflow: hidden;
    pointer-events: none;
  }
  .trail {
    position: absolute;
    /* Wider than the window on both sides so the drift never walks a stroke's
       end point into view. */
    left: -24%;
    right: -24%;
    height: 34%;
    animation-name: drift-a;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    /* Alternate rather than loop: a looping translate has to snap back at the
       seam, and at these opacities the snap is the only thing you'd notice. */
    animation-direction: alternate;
  }
  .trail svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  .trail path {
    fill: none;
    stroke: rgba(255, 255, 255, 0.9);
    stroke-width: 1;
    stroke-linecap: round;
  }

  /* Six keyframe pairs, each a different sideways walk, sag and tilt.
     These were an order of magnitude smaller and slower to begin with, on the
     theory that "calm" meant "barely". It doesn't: a few percent over a minute
     is arithmetic rather than motion, and the lines simply read as painted on.
     Calm is a slow drift you can *see* — so the travel is now a sixth of the
     window over ~20s, with a little scale so the curves breathe as they pass
     rather than sliding like a decal. */
  @keyframes drift-a {
    from { transform: translate3d(-14%, 3.5%, 0) rotate(-1.4deg) scale(1.04); }
    to { transform: translate3d(14%, -3.5%, 0) rotate(1.4deg) scale(1.1); }
  }
  @keyframes drift-b {
    from { transform: translate3d(11%, -5%, 0) rotate(1.8deg) scale(1.08); }
    to { transform: translate3d(-13%, 5%, 0) rotate(-1.6deg) scale(1.02); }
  }
  @keyframes drift-c {
    from { transform: translate3d(-9%, -2.6%, 0) rotate(0.9deg) scale(1.06); }
    to { transform: translate3d(17%, 4.2%, 0) rotate(-1.7deg) scale(1.12); }
  }
  @keyframes drift-d {
    from { transform: translate3d(16%, 4.6%, 0) rotate(-2deg) scale(1.1); }
    to { transform: translate3d(-10%, -3.4%, 0) rotate(1.2deg) scale(1.03); }
  }
  @keyframes drift-e {
    from { transform: translate3d(-17%, 2.2%, 0) rotate(1.5deg) scale(1.05); }
    to { transform: translate3d(8%, -4.8%, 0) rotate(-1.1deg) scale(1.13); }
  }
  @keyframes drift-f {
    from { transform: translate3d(6%, -3.8%, 0) rotate(-0.8deg) scale(1.09); }
    to { transform: translate3d(-15%, 5.4%, 0) rotate(1.9deg) scale(1.04); }
  }

  .trail-a { animation-name: drift-a; }
  .trail-b { animation-name: drift-b; }
  .trail-c { animation-name: drift-c; }
  .trail-d { animation-name: drift-d; }
  .trail-e { animation-name: drift-e; }
  .trail-f { animation-name: drift-f; }

  /* 46% rather than 50%: optical centre, and it buys the dock its air. The
     transform carries both the centring and the shift so the two can never
     fight each other mid-transition. */
  .cover {
    position: absolute;
    z-index: 3;
    left: 50%;
    top: 46%;
    width: var(--min-cover);
    height: var(--min-cover);
    transform: translate(-50%, -50%);
    transition: transform 560ms var(--motion-spring);
  }
  /* Centre of the cover lands at ~28vw — measured from the window, not from the
     free space, because the lyric card's glass blurs whatever ends up under it
     and the two are allowed to sit close. The scale-down is small on purpose:
     the record should look like it stepped aside, not like it was demoted. */
  .minimal.shifted .cover {
    transform: translate(-50%, -50%) translateX(-22vw) scale(0.86);
  }
  /* Artwork.svelte ships the library's small `--art-shadow`; at this size the
     cover needs a real one or it sits flat on the field instead of over it. */
  .cover :global(.art) {
    box-shadow:
      0 2px 8px rgba(4, 1, 6, 0.3),
      0 42px 96px rgba(4, 1, 6, 0.5);
  }

  .side-card {
    position: absolute;
    z-index: 4;
    right: 3vw;
    top: 7vh;
    /* Clears the dock. Fixed against the window, never against its contents —
       the lyric panel scrolls inside this box precisely so nothing in it can
       push the card past the pill. */
    bottom: 124px;
    width: min(46vw, 620px);
    /* Grid, so LyricsPanel's `height: 100%` resolves against a definite track
       instead of against the content it is meant to be scrolling. */
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    border-radius: 30px;
    border: 1px solid var(--min-hairline);
    background: var(--min-glass);
    /* Baseline frosting; `use:glass` replaces this inline with the same blur
       plus the refracting rim, and if it can't, this is what you get. */
    backdrop-filter: blur(11px) saturate(1.7) brightness(0.98);
    box-shadow:
      var(--min-rim),
      0 30px 80px rgba(6, 2, 8, 0.3);
    overflow: hidden;
  }

  .side-card :global(.lyrics) {
    padding: 22% 8% 26%;
    scrollbar-width: none;
    /* The card's rounded corners are the frame, so the text fades inside them
       rather than being cut by them. */
    -webkit-mask-image: linear-gradient(transparent 0%, #000 14%, #000 82%, transparent 100%);
    mask-image: linear-gradient(transparent 0%, #000 14%, #000 82%, transparent 100%);
  }
  .side-card :global(.lyrics::-webkit-scrollbar) {
    display: none;
  }
  .side-card :global(.synced) {
    gap: 18px;
  }
  .side-card :global(.line) {
    width: 100%;
    padding: 2px 6px;
    font-size: clamp(24px, 1.8vw, 38px);
    line-height: 1.24;
    color: var(--min-text);
    --lyric-dim: 0.4;
    --lyric-past: 0;
    --lyric-past-hover: 0.22;
    --lyric-lit: 1;
    --lyric-blur-step: 0.55px;
    --lyric-glow: 0 0 24px rgba(255, 255, 255, 0.4);
    text-align: left;
    transform-origin: left center;
  }
  /* A lane inferred from overlapping timings stays left: on a card this narrow,
     throwing half the lines to the far side on a guess reads as a layout fault
     rather than as two voices. A named singer is not a guess, so that one is
     honoured — it is the duet the file says it is. */
  .side-card :global(.line.offset) {
    text-align: left;
    transform-origin: left center;
  }
  .side-card :global(.line.offset.voiced) {
    text-align: right;
    transform-origin: right center;
  }
  .side-card :global(.line.active) {
    color: var(--min-text);
    transform: none;
  }
  .side-card :global(.line:hover) {
    background: rgba(255, 255, 255, 0.08);
  }

  .queue {
    min-height: 0;
    overflow-y: auto;
    padding: 26px 24px 32px;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(transparent 0%, #000 5%, #000 92%, transparent 100%);
    mask-image: linear-gradient(transparent 0%, #000 5%, #000 92%, transparent 100%);
  }
  .queue::-webkit-scrollbar {
    display: none;
  }
  .queue h2 {
    margin: 0 0 14px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.58);
  }
  .queue-empty {
    margin: 0;
    font-size: 13px;
    color: var(--min-muted);
  }
  .queue ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .queue li button {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border-radius: 10px;
    text-align: left;
    color: inherit;
    transition: background 140ms ease;
  }
  .queue li button:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .q-title,
  .q-sub {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .q-title {
    font-size: 13px;
    font-weight: 600;
  }
  .q-sub {
    font-size: 11.5px;
    color: var(--min-muted);
  }


  .transport {
    position: absolute;
    z-index: 6;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    width: min(1150px, 92vw);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 5px 10px 5px 14px;
    border-radius: 999px;
    border: 1px solid var(--min-hairline);
    background: var(--min-glass);
    backdrop-filter: blur(4px) saturate(1.6) brightness(1.02);
    box-shadow:
      var(--min-rim),
      0 20px 54px rgba(6, 2, 8, 0.32);
  }
  .left-cluster,
  .right-cluster {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .right-cluster {
    justify-content: flex-end;
  }
  .ctl {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: #fff;
    display: grid;
    place-items: center;
    flex: none;
    transition:
      background 160ms ease,
      color 160ms ease,
      transform 220ms var(--motion-spring);
  }
  .ctl:hover {
    background: rgba(255, 255, 255, 0.14);
    transform: scale(1.08);
  }
  .ctl:active {
    transform: scale(0.92);
  }
  .ctl.secondary {
    color: rgba(255, 255, 255, 0.8);
  }
  .ctl.on {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
  }
  .gear:hover {
    transform: rotate(45deg);
  }
  .repeat {
    position: relative;
  }
  .repeat-one {
    position: absolute;
    font-size: 8px;
    font-weight: 800;
  }
  .time {
    margin-left: 8px;
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.82);
    white-space: nowrap;
  }

  .now-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: clamp(300px, 34vw, 470px);
    min-width: 0;
    padding: 4px 8px 8px 15px;
    border-radius: 15px;
    overflow: hidden;
    /* Only just darker than the pill around it: cut deeper and it stops reading
       as a recess in the glass and starts reading as a black bar. */
    background: rgba(8, 3, 9, 0.16);
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.15),
      inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  }
  .now-meta {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .now-title {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .now-sub {
    font-size: 11px;
    color: var(--min-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The album is set as a label, not a link: Minimal has no library browser to
     open, so making it look clickable would be a promise the mode can't keep. */
  .now-album {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 650;
  }
  .now-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .mini {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.66);
    transition:
      color 140ms ease,
      background 140ms ease,
      transform 200ms var(--motion-spring);
  }
  .mini:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    transform: scale(1.1);
  }
  .mini.on {
    color: #fff;
  }
  .mini.on :global(svg) {
    fill: currentColor;
  }
  /* Full bleed along the bottom edge of the recess. */
  .now-card .track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    border-radius: 0;
  }

  .track {
    --pct: 0%;
    position: relative;
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0.94) var(--pct),
      rgba(255, 255, 255, 0.22) var(--pct)
    );
  }
  .track input {
    -webkit-appearance: none;
    appearance: none;
    position: absolute;
    inset: -8px 0;
    width: 100%;
    height: 19px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  .track input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #fff;
    opacity: 0;
    box-shadow: 0 2px 8px rgba(20, 4, 12, 0.28);
    transition: opacity 140ms ease;
  }
  .track:hover input::-webkit-slider-thumb,
  .track input:focus-visible::-webkit-slider-thumb {
    opacity: 1;
  }

  .pop-wrap {
    position: relative;
  }
  .pop {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%);
    width: 130px;
    padding: 12px 14px;
    border-radius: 18px;
    border: 1px solid var(--min-hairline);
    background:
      var(--min-glass),
      rgba(14, 6, 14, 0.24);
    backdrop-filter: blur(6px) saturate(1.6);
    box-shadow:
      var(--min-rim),
      0 16px 40px rgba(6, 2, 8, 0.36);
  }
  /* Keeps the pointer inside the group on the way up to the popover. */
  .pop::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: 14px;
  }
  .pop-foot {
    margin-top: 10px;
    text-align: center;
    font-size: 12px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.86);
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.96);
    outline-offset: 3px;
  }

  @media (max-width: 1080px) {
    .minimal {
      --min-cover: min(40vh, 40vw);
    }
    .side-card {
      width: min(52vw, 520px);
      top: 5vh;
    }
    .minimal.shifted .cover {
      transform: translate(-50%, -50%) translateX(-24vw) scale(0.8);
    }
    .now-card {
      width: clamp(200px, 30vw, 380px);
    }
  }
  /* Below this the side-by-side stops working: the cover goes back to centre,
     dims, and the card takes the window. */
  @media (max-width: 780px) {
    .side-card {
      left: 4vw;
      right: 4vw;
      top: 12vh;
      width: auto;
    }
    .minimal.shifted .cover {
      transform: translate(-50%, -50%) scale(0.7);
      opacity: 0.25;
    }
    .transport {
      grid-template-columns: 1fr;
      gap: 8px;
      justify-items: center;
    }
    .right-cluster {
      justify-content: center;
    }
    .now-card {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    /* Frozen, not removed: the curves are part of the composition, and the
       still frame is the one the delays would have put them at anyway. */
    .trail {
      animation: none;
    }
    .cover,
    .ctl,
    .mini {
      transition: none;
    }
    .gear:hover {
      transform: none;
    }
  }
</style>

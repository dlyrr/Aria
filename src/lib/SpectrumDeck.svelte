<script lang="ts">
  //! Spectrum Deck — the third immersive mode.
  //!
  //! One frames the cover and Solarium *is* the cover; this one throws the
  //! cover away and keeps only its light. What's left is a room: a flat deck
  //! ruled in hairlines running out to a horizon, a sun sitting on that
  //! horizon, and the music itself laid down the middle of the deck as a strip
  //! of lit cells that scrolls away from you. The record is still what colours
  //! the room — the field behind everything is the same artwork wash Solarium
  //! uses — but here it reads as the sky over the deck rather than as a
  //! picture, which is why it's pushed a stop harder (saturation 1.9) and then
  //! smothered under a dark sky/ground pair.
  //!
  //! The whole scene is CSS 3D: one `perspective` on a wrapper, one `rotateX`
  //! on each plane inside it. Nothing here is drawn per frame. That is not a
  //! stylistic preference — see the header of liquidGlass.ts: this app has
  //! already lost its frame rate once to a full-screen filter, and a synthwave
  //! deck is exactly the kind of thing that invites a canvas repainting the
  //! window sixty times a second. The compositor does the perspective for
  //! free; the only thing that moves is one `translateY` on one element.
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import { player, formatTime } from "$lib/player.svelte";
  import { ui } from "$lib/ui.svelte";
  import { theme } from "$lib/theme.svelte";
  import { library } from "$lib/library.svelte";
  import { glass } from "$lib/liquidGlass";
  import LyricsPanel from "$lib/LyricsPanel.svelte";
  import SolariumQueue from "$lib/SolariumQueue.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";
  import DynamicBackground from "$lib/DynamicBackground.svelte";
  import type { ArtworkPalette } from "$lib/accent";

  let {
    backdrop,
    onappearance,
  }: {
    backdrop: { key: string; art: string | null; palette: ArtworkPalette };
    /** Opens the Appearance panel — owned by Immersive.svelte, shared with One. */
    onappearance: () => void;
  } = $props();

  /** Frequency cells across the ribbon. */
  const COLS = 16;
  /**
   * Rows in the ring buffer. 26 of them span the deck; the 27th is the one
   * being slid in from under the front edge, off-screen, so a new row never
   * appears inside the picture — see `.rows` in the stylesheet for the
   * arithmetic that keeps that true.
   */
  const ROWS = 27;

  /**
   * Four bands smeared across sixteen columns.
   *
   * The analyzer only publishes four levels, and dropping four fat bars onto a
   * sixteen-wide grid gives four blocks with hard steps between them — a bar
   * chart in perspective, not a spectrum. Interpolating instead gives the
   * ridge a continuous back, which is the whole reason to look at it.
   *
   * Cosine rather than linear between the band centres: linear leaves a
   * visible kink exactly at each of the four control points, and once the
   * ribbon is scrolling those kinks line up into four vertical seams running
   * down the deck. Cosine lands flat at each centre, so the seams disappear.
   *
   * Returns the *drawn* opacity, not the level: the row is immutable once it
   * has been pushed, so there is no reason to keep the raw number around and
   * re-derive this on every render.
   */
  function spread(bands: readonly number[]): number[] {
    const out = new Array<number>(COLS);
    for (let c = 0; c < COLS; c++) {
      // Band i sits at the centre of its quarter of the ribbon, so the four
      // controls are at 12.5% / 37.5% / 62.5% / 87.5% across.
      const x = (c / (COLS - 1)) * 4 - 0.5;
      const i = Math.floor(x);
      const t = x - i;
      // Clamped at both ends: the outer eighth of the ribbon has no band
      // beyond it to lean toward, and it should hold its edge value rather
      // than fall off to nothing.
      const a = bands[Math.min(3, Math.max(0, i))] ?? 0;
      const b = bands[Math.min(3, Math.max(0, i + 1))] ?? 0;
      const s = (1 - Math.cos(t * Math.PI)) / 2;
      const v = Math.max(0, a + (b - a) * s);
      // A floor of 0.05 rather than 0, so a silent cell still reads as a cell
      // of the deck. The 0.8 gamma lifts the quiet middle of a track out of
      // the dark — without it everything but the kick sits invisible.
      const lit = Math.min(1, 0.05 + 1.2 * Math.pow(v, 0.8));
      // Two decimals: this goes straight into an inline style string sixteen
      // times a tick, and nobody can see the third.
      out[c] = Math.round(lit * 100) / 100;
    }
    return out;
  }

  /**
   * How far up its column each band reaches, right now.
   *
   * This was a scrolling history — a waterfall of past levels creeping toward
   * the horizon — which is a beautiful thing that is not an analyser. What it
   * showed was where the music had been; watching it, you could not tell which
   * end was live. Columns that answer the sound *as it happens* is the whole
   * ask, so the deck reads left-to-right as bass-to-treble and moves with the
   * track rather than away from it.
   *
   * `player.analyzerBands` is already interpolated and enveloped every frame
   * (fast attack, slow release), so nothing needs smoothing again here.
   */
  const heights = $derived(spread(player.analyzerBands));

  /** Depth index for each cell in a column, front to back. */
  const depths = Array.from({ length: ROWS }, (_, r) => r);

  /**
   * The high-water mark per column, falling slower than the bar under it.
   * Written on the same frames the levels change, so it needs no clock: a
   * fixed fraction per frame is a fall of about a second from the top, and
   * being frame-rate dependent is fine for a decoration nobody times.
   */
  let peaks = $state<number[]>(new Array(COLS).fill(0));
  $effect(() => {
    const next = heights;
    const held = peaks;
    let changed = false;
    const out = held.map((p, c) => {
      const fallen = p * 0.978;
      const v = Math.max(next[c] ?? 0, fallen);
      if (Math.abs(v - p) > 0.002) changed = true;
      return v;
    });
    if (changed) peaks = out;
  });

  let seeking = $state(false);
  let seekValue = $state(0);
  let volumeOpen = $state(false);

  const pos = $derived(seeking ? seekValue : player.position);
  const progress = $derived(player.duration > 0 ? (pos / player.duration) * 100 : 0);
  const volPct = $derived(player.volume * 100);
  const starred = $derived(!!player.current && library.isFavourite(player.current.path));

  // One side column, driven by `ui.panel` rather than a local flag so the
  // button cluster in Immersive.svelte — which is outside this component and
  // outlives it — can toggle the same thing.
  const sideOpen = $derived(ui.panel !== "none");

  /**
   * The record's colours, handed to the scene as variables. Only the edges and
   * the horizon glow use them: everything else on the deck is white, because a
   * grid tinted toward the artwork stops reading as light and starts reading
   * as a coloured overlay.
   */
  const tint = $derived(
    [
      `--deck-primary:${backdrop.palette.primary}`,
      `--deck-secondary:${backdrop.palette.secondary}`,
      `--deck-light:${backdrop.palette.accentLight}`,
      `--deck-deep:${backdrop.palette.deep}`,
    ].join(";"),
  );

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
    // The right-click menu / Appearance dock gets first refusal on Escape.
    if (e.key === "Escape" && !ui.immersiveOverlay) ui.exit();
  }

  onMount(() => {
    window.scrollTo(0, 0);
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="deck" class:side-open={sideOpen} style={tint} transition:fade={{ duration: 260 }}>
  <!-- The stage is everything the scene owns. It narrows when a side card
       opens rather than being covered by it — the deck's geometry is written
       in percentages of this box precisely so that narrowing it re-projects
       the whole room instead of cropping a picture of it. -->
  <div class="stage">
    <!-- The colour field is hoisted to Immersive.svelte: it has to fill the
         window rather than this mode, or the settings dock has nothing behind
         it once the stage is shifted aside. -->

    <!-- Sky and ground are one job split in two: the field is a warm blur with
         no structure, and it only becomes a sunset once something says which
         half of it is above the horizon and which is the floor. -->
    <div class="sky" aria-hidden="true"></div>
    <div class="ground" aria-hidden="true"></div>

    <!-- Under the grid, not over it: the lines crossing the sun are what make
         it sit *at* the horizon rather than float in front of the scene. -->
    <div class="sun" aria-hidden="true"></div>

    <div class="world" aria-hidden="true">
      <div class="floor"></div>
      <!-- Bed and rows are two planes at identical tilt rather than one plane
           with two backgrounds, because only one of them moves: the deck's
           column rules belong to the deck and must stay nailed down while the
           light scrolls over them. -->
      <div class="bed"></div>
      <div class="ribbon">
        <div class="bars">
          <!-- One column per band, lit from the front edge up to that band's
               level: an analyser, not a history of one. The DOM is
               column-major so a column's level is a custom property its own
               cells inherit — which is what keeps this to sixteen style writes
               a frame instead of four hundred. Each cell's lit state is then
               arithmetic the browser does from `--h` and its own `--r`. -->
          {#each heights as h, c (c)}
            <div class="bar" style="--h:{h};--p:{peaks[c]}">
              {#each depths as r (r)}
                <i style="--r:{r}"></i>
              {/each}
              <span class="peak"></span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Haze sits over the grid, not under it: its job is to eat the last few
         centimetres before the vanishing point, where the floor's rules
         converge into a solid white smear. A gradient in screen space is the
         cheapest possible way to do that and it costs one static layer. -->
    <div class="haze" aria-hidden="true"></div>
    <div class="horizon" aria-hidden="true"></div>
  </div>

  {#if sideOpen}
    <div class="side">
      {#if ui.panel === "lyrics"}
        <section
          class="card lyrics-card"
          aria-label="Lyrics"
          use:glass={{ blur: 11, saturate: 1.7, brightness: 0.98, bezel: 30, strength: 40, lens: 0.055, dispersion: 0 }}
          transition:fade={{ duration: 220 }}
        >
          <LyricsPanel />
        </section>
      {:else}
        <section
          class="card queue-card"
          aria-label="Play queue"
          use:glass={{ blur: 11, saturate: 1.7, brightness: 0.94, bezel: 30, strength: 40, lens: 0.055, dispersion: 0 }}
          transition:fade={{ duration: 220 }}
        >
          <SolariumQueue variant="side" />
        </section>
      {/if}
    </div>
  {/if}


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

    <!-- Cut into the pill rather than laid on it, and the only dark thing in
         the dock: the deck behind it is already all light on black, so a
         raised card would be a fifth bright object competing with the ribbon.
         A recess reads as part of the housing. -->
    <div class="now-card">
      <div class="now-meta">
        <div class="now-title">{player.current?.title ?? "Not Playing"}</div>
        <div class="now-sub">
          {#if player.current}
            <!-- Plain text, not links: this mode has no library browser over
                 the top of it, so an album that navigated would drop you out
                 of the room with nothing to show for it. -->
            <span class="now-album">{player.current.album || "Single"}</span>
            <span class="now-dash">–</span>
            <span class="now-artist">{player.current.artist}</span>
          {:else}
            Nothing queued
          {/if}
        </div>
      </div>
      {#if player.current}
        <div class="now-badges">
          <button
            class="now-icon"
            class:on={starred}
            title={starred ? "Remove from Liked Songs" : "Add to Liked Songs"}
            aria-label={starred ? "Remove from Liked Songs" : "Add to Liked Songs"}
            aria-pressed={starred}
            onclick={() => player.current && library.toggleFavourite(player.current.path)}
          >
            <ImmersiveIcon name="star" size={13} />
          </button>
          <button
            class="now-icon"
            class:on={ui.panel === "queue"}
            title="Queue"
            aria-label="Queue"
            aria-pressed={ui.panel === "queue"}
            onclick={() => ui.togglePanel("queue")}
          >
            <ImmersiveIcon name="queue" size={13} />
          </button>
        </div>
      {/if}
      <!-- The scrubber is the bottom edge of the recess, full bleed: the one
           horizontal rule in the dock, so it can't be read as anything else. -->
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
        class:on={ui.panel === "queue"}
        title="Queue"
        aria-label="Queue"
        aria-pressed={ui.panel === "queue"}
        onclick={() => ui.togglePanel("queue")}
      >
        <ImmersiveIcon name="queue" size={16} />
      </button>
      <button
        class="ctl secondary"
        class:on={ui.panel === "lyrics"}
        title="Lyrics"
        aria-label="Lyrics"
        aria-pressed={ui.panel === "lyrics"}
        onclick={() => ui.togglePanel("lyrics")}
      >
        <ImmersiveIcon name="lyrics" size={16} />
      </button>
      <button
        class="ctl secondary"
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
  .deck {
    /* --- The room, in numbers -------------------------------------------
       Every one of these feeds a single projection, and they are not free
       parameters: they were solved together so that the near edge of both
       planes lands just past the bottom of the window.

       With tilt θ and perspective P, a point y down a plane whose origin is
       pinned to the horizon sits at depth y·sinθ and is magnified by
       P/(P − y·sinθ), landing y·cosθ·(that) below the horizon on screen. At
       θ=72°, P=105dvh and a plane 80dvh long that works out to ~90dvh below a
       horizon at 15dvh — about 5dvh of overshoot, hidden under the dock.

       Change one and you must re-solve the rest, or the deck will either stop
       short of the bottom of the window or run away to infinity (which is what
       happens the moment y·sinθ reaches P). */
    --horizon: 15dvh;
    --persp: 105dvh;
    --tilt: 72deg;
    --plane-h: 80dvh;
    /* 26 rows span the plane; the 27th lives below its front edge. */
    --rows-total: 27;
    --row-h: calc(var(--plane-h) / 26);
    --side: min(560px, 44%);

    --deck-text: rgba(255, 255, 255, 0.96);
    --deck-muted: rgba(255, 255, 255, 0.72);
    /* Liquid glass, as Solarium sets it: the pane is nearly clear and all the
       work is done to what is behind it by `use:glass`. */
    --deck-glass: linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.11),
      rgba(255, 255, 255, 0.02) 45%,
      rgba(255, 255, 255, 0.05)
    );
    --deck-edge: color-mix(in srgb, var(--deck-light, #fff) 62%, rgba(255, 255, 255, 0.9));
    --deck-hairline: color-mix(in srgb, var(--deck-edge) 26%, transparent);
    --deck-rim:
      inset 0 1px 0 color-mix(in srgb, var(--deck-edge) 58%, transparent),
      inset 1px 0 0 color-mix(in srgb, var(--deck-edge) 26%, transparent),
      inset 0 -1px 0 color-mix(in srgb, var(--deck-deep, #000) 30%, transparent),
      inset -1px 0 0 color-mix(in srgb, var(--deck-deep, #000) 14%, transparent),
      0 0 0 1px color-mix(in srgb, var(--deck-primary, #fff) 18%, transparent);

    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    z-index: 2147483647;
    overflow: hidden;
    overscroll-behavior: none;
    isolation: isolate;
    /* Black under everything, so the sky and ground gradients are darkening a
       known quantity rather than whatever the app's surface happens to be. */
    background: #05020a;
    color: var(--deck-text);
  }

  .stage {
    position: absolute;
    inset: 0;
    /* No `overflow: hidden` here — clipping a box that contains a perspective
       is one of the reliable ways to get a browser to flatten the whole 3D
       subtree. `.deck` clips instead, one level up and outside the chain. */
    transition: right 420ms var(--motion-spring);
  }
  .deck.side-open .stage {
    right: var(--side);
  }


  .sky {
    position: absolute;
    z-index: 1;
    left: 0;
    right: 0;
    top: 0;
    height: var(--horizon);
    /* Darkest at the top and letting go entirely at the horizon: what's left
       of the field is a band of the record's colour sitting on the skyline,
       which is the only place a wash of orange reads as a sunset.
       Lighter than it was: at 0.86 the sky was near enough opaque that the
       field's drift happened behind a curtain, and a moving backdrop nobody
       can see moving is just an expensive still. */
    background: linear-gradient(to bottom, rgba(4, 1, 9, 0.62), rgba(4, 1, 9, 0.02));
    pointer-events: none;
  }
  .ground {
    position: absolute;
    z-index: 1;
    left: 0;
    right: 0;
    top: var(--horizon);
    bottom: 0;
    /* The floor has to be dark for the ribbon's unlit cells to read as unlit,
       and it has to get darker toward the viewer or the grid's own convergence
       makes the far end look like the near end. It stops well short of opaque
       now, so the field still turns over underneath the deck — the colour
       moving under a static grid is most of what sells the perspective. */
    background: linear-gradient(to bottom, rgba(3, 1, 7, 0.06), rgba(3, 1, 7, 0.5));
    pointer-events: none;
  }

  .sun {
    position: absolute;
    z-index: 2;
    left: 50%;
    top: var(--horizon);
    width: 13dvh;
    height: 13dvh;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    /* Two things at once: a hard white disc, and a bloom around it that is
       larger than the disc. The bloom is a box-shadow rather than a blur
       filter — a filter on an element this size is a per-frame cost the moment
       anything near it moves, and this needs to cost nothing at all. */
    background: radial-gradient(
      circle at 50% 50%,
      #fff 0 34%,
      rgba(255, 255, 255, 0.92) 48%,
      rgba(255, 255, 255, 0.3) 70%,
      rgba(255, 255, 255, 0) 78%
    );
    box-shadow:
      0 0 60px 12px rgba(255, 255, 255, 0.38),
      0 0 150px 44px color-mix(in srgb, var(--deck-light, #fff) 40%, rgba(255, 255, 255, 0.16));
    pointer-events: none;
  }

  /* One perspective for the whole room. Both planes hang off this box and
     share its vanishing point, which is why the ribbon lies *on* the floor
     instead of hovering at its own angle. The eye is put level with the
     horizon (`perspective-origin: 50% 0`) so the planes fall away from the
     skyline symmetrically. */
  .world {
    position: absolute;
    z-index: 3;
    left: 0;
    right: 0;
    top: var(--horizon);
    bottom: 0;
    perspective: var(--persp);
    perspective-origin: 50% 0%;
    pointer-events: none;
  }

  .floor,
  .bed,
  .ribbon {
    position: absolute;
    top: 0;
    height: var(--plane-h);
    /* Pinned at the horizon and tipped away: with the origin at the top edge
       that edge stays at scale 1 on the skyline and everything below it walks
       toward the viewer and grows. */
    transform-origin: 50% 0;
    transform: rotateX(var(--tilt));
  }

  .floor {
    /* Only needs to be as wide as the window *at the horizon*, because every
       row closer than that is magnified and therefore covers more. 130% is
       margin for the corners; a 300%-wide plane would be a texture four times
       the size for pixels that are already off-screen. */
    left: -15%;
    right: -15%;
    background-image:
      repeating-linear-gradient(
        to right,
        rgba(255, 255, 255, 0.35) 0 1px,
        transparent 1px 2%
      ),
      repeating-linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.35) 0 1px,
        transparent 1px 4%
      );
  }

  /* The ribbon's own surface: 17% of the stage at the skyline, and about
     three and a half times that by the time it reaches you — so it reads as
     roughly a third of the screen through the middle of its run, which is
     where the eye measures it. */
  .bed,
  .ribbon {
    left: 41.5%;
    right: 41.5%;
  }
  .bed {
    /* Transparent at the far end so the sun burns through the top of the
       ribbon, opaque by the time it reaches the viewer so unlit cells have
       something dark to be unlit against. */
    background-image:
      repeating-linear-gradient(
        to right,
        rgba(255, 255, 255, 0.18) 0 1px,
        transparent 1px calc(100% / 16)
      ),
      linear-gradient(
        to bottom,
        rgba(4, 2, 9, 0) 0%,
        rgba(4, 2, 9, 0.42) 20%,
        rgba(4, 2, 9, 0.74) 100%
      );
    box-shadow:
      inset 1px 0 0 rgba(255, 255, 255, 0.3),
      inset -1px 0 0 rgba(255, 255, 255, 0.3);
  }

  /*
    The scroll.

    The stack is 27 rows tall and hangs one row *below* the plane's front edge,
    so at rest the newest row is entirely off the bottom of the window and the
    oldest row's top sits exactly on the horizon. Over one tick the stack
    slides up by one row: the newest row rises into view at the front, the
    oldest slides out above the skyline. At the tick the data shifts up by one
    row and the animation snaps back to zero — the two cancel exactly, so the
    ribbon never jumps and no row is ever born or destroyed inside the picture.

    The translate is on this inner element rather than on `.ribbon` because
    `.ribbon` also carries the tilt, and the bed underneath must not move: the
    deck's rules are the deck, and only the light travels.
  */
  .bars {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 1px;
  }
  /* A column of the deck, front (nearest the viewer) to back. Reversed so the
     first cell is the front one: a bar grows out of the front edge toward the
     skyline, which is the direction perspective makes "up". */
  .bar {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
  }

  /* The gaps are the ribbon's horizontal rules, and because they live in the
     plane's own space the perspective widens them as they come forward — a
     free depth cue that a drawn 1px line would not have given. */
  /**
   * Whether a cell is lit is a subtraction, not a branch.
   *
   * `--h` is its column's level 0–1 and `--r` is how many cells it sits from
   * the front, so `h × rows − r` is positive for every cell under the level
   * and negative above it. Clamped, that *is* the opacity — and the single
   * cell straddling the top of the bar gets a fraction, which softens the tip
   * instead of letting it step a whole cell at a time.
   *
   * The point of doing it here rather than in the script: levels arrive as
   * sixteen custom properties and the browser resolves four hundred cells from
   * them, instead of the script writing an opacity per cell per frame.
   */
  .bar i {
    flex: 1;
    min-height: 0;
    background: #fff;
    opacity: clamp(0, calc(var(--h, 0) * var(--rows-total) - var(--r, 0)), 1);
  }
  /* A real analyser holds the high-water mark and lets it fall slower than the
     bar — that is what keeps a transient legible after the sound that caused
     it has already gone. */
  .peak {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    bottom: calc(var(--p, 0) * 100%);
    background: #fff;
    opacity: calc(0.2 + 0.6 * var(--p, 0));
    pointer-events: none;
  }

  .haze {
    position: absolute;
    z-index: 4;
    left: 0;
    right: 0;
    top: var(--horizon);
    height: 15dvh;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--deck-deep, #0a0310) 70%, transparent),
      transparent
    );
    pointer-events: none;
  }
  .horizon {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    top: var(--horizon);
    height: 1px;
    background: rgba(255, 255, 255, 0.8);
    box-shadow:
      0 0 12px 1px rgba(255, 255, 255, 0.4),
      0 0 40px 6px color-mix(in srgb, var(--deck-light, #fff) 34%, transparent);
    pointer-events: none;
  }

  /* --- Side card ------------------------------------------------------- */
  .side {
    position: absolute;
    z-index: 6;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--side);
    display: flex;
    min-width: 0;
    min-height: 0;
    padding: 64px 28px 118px;
  }
  .card {
    flex: 1;
    min-width: 0;
    min-height: 0;
    /* Grid, so the lyric panel's `height: 100%` resolves against a definite
       track instead of against the content it is meant to be scrolling. */
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    border-radius: 30px;
    border: 1px solid var(--deck-hairline);
    background: var(--deck-glass);
    /* Baseline frosting; `use:glass` replaces this inline with the same blur
       plus the refracting rim, and if it can't, this is what you get. */
    backdrop-filter: blur(11px) saturate(1.7) brightness(0.98);
    box-shadow:
      var(--deck-rim),
      0 30px 80px rgba(6, 2, 12, 0.42);
    overflow: hidden;
  }
  .queue-card {
    background:
      var(--deck-glass),
      rgba(14, 6, 20, 0.3);
  }

  .lyrics-card :global(.lyrics) {
    padding: 22% 8% 26%;
    scrollbar-width: none;
    /* The card's rounded corners are the frame, so the text fades inside them
       rather than being cut by them. */
    -webkit-mask-image: linear-gradient(transparent 0%, #000 14%, #000 82%, transparent 100%);
    mask-image: linear-gradient(transparent 0%, #000 14%, #000 82%, transparent 100%);
  }
  .lyrics-card :global(.lyrics::-webkit-scrollbar) {
    display: none;
  }
  .lyrics-card :global(.synced) {
    gap: 18px;
  }
  .lyrics-card :global(.line) {
    width: 100%;
    padding: 2px 6px;
    font-size: clamp(26px, 1.95vw, 40px);
    line-height: 1.24;
    color: #fff;
    /* Set the ramp's knobs, not `opacity` — writing opacity here would flatten
       the per-line dim/blur falloff back to one value. */
    --lyric-dim: 0.4;
    --lyric-past: 0;
    --lyric-past-hover: 0.22;
    --lyric-lit: 1;
    --lyric-blur-step: 0.55px;
    /* Always safe here: the deck behind the card is black by construction, so
       unlike Solarium there is no pale cover that could turn this into a grey
       halo, and no ink flip to arrange. */
    --lyric-glow: 0 0 24px rgba(255, 255, 255, 0.42);
    text-align: left;
    transform-origin: left center;
  }
  /* A lane inferred from overlapping timings stays left: on a card this narrow
     throwing half the lines to the far side on a guess reads as a layout
     fault rather than as two voices. */
  .lyrics-card :global(.line.offset) {
    text-align: left;
    transform-origin: left center;
  }
  /* A named singer is not a guess, so that split is honoured. */
  .lyrics-card :global(.line.offset.voiced) {
    text-align: right;
    transform-origin: right center;
  }
  .lyrics-card :global(.line.active) {
    color: #fff;
    transform: none;
  }
  .lyrics-card :global(.line:hover) {
    background: rgba(255, 255, 255, 0.08);
  }


  .transport {
    position: absolute;
    z-index: 7;
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
    border: 1px solid var(--deck-hairline);
    background: var(--deck-glass);
    backdrop-filter: blur(4px) saturate(1.6) brightness(1.02);
    box-shadow:
      var(--deck-rim),
      0 20px 54px rgba(6, 2, 12, 0.42);
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
    width: clamp(300px, 34vw, 480px);
    min-width: 0;
    padding: 4px 10px 8px 15px;
    border-radius: 15px;
    overflow: hidden;
    background: rgba(6, 2, 10, 0.28);
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.28),
      inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  }
  .now-meta {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .now-title {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .now-sub {
    font-size: 11px;
    color: var(--deck-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Caps for the record, sentence case for the person: two facts in one line
     need something other than a dash to tell them apart at 11px. */
  .now-album {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 650;
  }
  .now-dash {
    opacity: 0.6;
  }
  .now-badges {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .now-icon {
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
  .now-icon:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    transform: scale(1.1);
  }
  .now-icon.on {
    color: #fff;
  }
  .now-icon.on :global(svg) {
    fill: currentColor;
  }
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
    box-shadow: 0 2px 8px rgba(4, 1, 8, 0.4);
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
    border: 1px solid var(--deck-hairline);
    background:
      var(--deck-glass),
      rgba(12, 5, 18, 0.3);
    backdrop-filter: blur(6px) saturate(1.6);
    box-shadow:
      var(--deck-rim),
      0 16px 40px rgba(4, 1, 8, 0.44);
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
    .deck {
      --side: min(440px, 50%);
    }
    .now-card {
      width: clamp(200px, 30vw, 380px);
    }
  }
  @media (max-width: 780px) {
    .transport {
      grid-template-columns: 1fr;
      gap: 8px;
      justify-items: center;
      border-radius: 26px;
    }
    .right-cluster {
      justify-content: center;
    }
    .now-card {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    /* Nothing to freeze on the deck any more: the bars answer the music and
       stopping them would be stopping the analyser, not calming it. The
       transitions below are the only motion this mode adds of its own. */
    .stage,
    .ctl,
    .now-icon {
      transition: none;
    }
  }
</style>

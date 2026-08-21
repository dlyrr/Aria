<script lang="ts">
  //! One Classic — the third immersive mode: the layout every full-screen
  //! player had before they all became floating pills.
  //!
  //! One centres the cover and stacks its transport under it; Solarium turns
  //! the cover into the room. This one is the hi-fi front panel: the record on
  //! the left, the words on the right, and one unbroken control bar along the
  //! very bottom of the window. That bar is the whole point of the mode — it
  //! spans edge to edge and never floats, so the controls are always in the
  //! same place, at the same size, whatever else is on screen. Anything that
  //! made it hover (a pill, a card, an idle fade) would turn it back into One.
  //!
  //! It borrows Solarium's colour field and One's lyric typography, because
  //! those two are already the house answers to "what is behind this" and
  //! "how big are the words".
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import { player, formatTime } from "$lib/player.svelte";
  import { ui } from "$lib/ui.svelte";
  import { library } from "$lib/library.svelte";
  import { nav } from "$lib/nav.svelte";
  import { glass } from "$lib/liquidGlass";
  import Artwork from "$lib/Artwork.svelte";
  import ArtistLink from "$lib/ArtistLink.svelte";
  import LyricsPanel from "$lib/LyricsPanel.svelte";
  import SolariumQueue from "$lib/SolariumQueue.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";
  import ImmersiveBrowser from "$lib/ImmersiveBrowser.svelte";
  import type { ArtworkPalette } from "$lib/accent";

  let {
    backdrop,
    onappearance,
  }: {
    backdrop: { key: string; art: string | null; palette: ArtworkPalette };
    /** Opens the Appearance panel — owned by Immersive.svelte, shared with the other modes. */
    onappearance: () => void;
  } = $props();

  let seeking = $state(false);
  let seekValue = $state(0);

  const pos = $derived(seeking ? seekValue : player.position);
  const progress = $derived(player.duration > 0 ? (pos / player.duration) * 100 : 0);
  const volPct = $derived(player.volume * 100);

  // One's three-way `ui.panel` describes this mode exactly: the right half
  // shows the lyrics, or the queue, or nothing at all. Solarium needs its own
  // pair of switches because both of its cards can be up at once; here the
  // right half is a single slot, so reusing `panel` also means the choice you
  // made in One is the choice you come back to here.
  const split = $derived(ui.panel !== "none");

  const starred = $derived(!!player.current && library.isFavourite(player.current.path));

  /** The library record the current track belongs to, if the scan found one. */
  const album = $derived.by(() => {
    const track = player.current;
    if (!track) return null;
    return library.albums.find((a) => a.name === track.album) ?? null;
  });
  const albumPinned = $derived(!!album && library.isPinned("album", album.id));

  /** Opens the library browser on the current track's album. */
  function goToAlbum() {
    const track = player.current;
    if (!track) return;
    if (album) {
      nav.go("album", album.id);
    } else {
      nav.query = track.album;
      nav.go("albums");
    }
    ui.browserOpen = true;
  }

  function choosePanel(panel: "queue" | "lyrics") {
    ui.togglePanel(panel);
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

<!-- No idle timer anywhere in here, deliberately. The other two modes fade
     their chrome out because their chrome hovers over the artwork; this mode's
     chrome *is* the bottom of the window, and a control bar that disappears
     when you stop moving is a control bar you have to go looking for. -->
<div class="classic" class:split transition:fade={{ duration: 260 }}>
  <!-- The same field Solarium paints, at the same saturation: this mode has no
       full-bleed crop of its own, so the colour is the only thing standing
       between a framed square and a black screen. -->
    <!-- The colour field is hoisted to Immersive.svelte: it has to fill the
         window rather than this mode, or the settings dock has nothing behind
         it once the stage is shifted aside. -->


  <main class="stage">
    <!-- Positioned once and moved with `transform` alone. Animating `left`
         would relayout the whole stage on every frame of the slide, and the
         lyric panel beside it is already repainting each frame; a transform is
         composited and costs the layout nothing. It is also why the cover is
         not re-mounted between the two positions — it slides across, keeping
         the record you were looking at. -->
    <button
      class="cover"
      title={split ? "Hide panel" : "Show lyrics or queue"}
      aria-label={split ? "Hide panel" : "Show lyrics or queue"}
      onclick={() => ui.toggleArtworkPanel()}
    >
      <Artwork
        src={player.current?.art}
        size="100%"
        radius="6px"
        kind={player.current?.kind ?? "audio"}
      />
    </button>

    {#if ui.panel === "lyrics"}
      <!-- No card, no glass, no panel: the words are printed straight onto the
           colour field. A frosted pane here would be a second rectangle
           competing with the cover, and — see liquidGlass.ts — a backdrop
           filter over text that repaints every frame is exactly the thing that
           took this app down to single-figure frame rates. -->
      <section class="pane lyric-field" aria-label="Lyrics" transition:fade={{ duration: 220 }}>
        <LyricsPanel />
      </section>
    {:else if ui.panel === "queue"}
      <section class="pane queue-field" aria-label="Play queue" transition:fade={{ duration: 220 }}>
        <SolariumQueue variant="side" />
      </section>
    {/if}
  </main>

  <!-- The one piece of glass in the mode, and it is small enough to afford it:
       a switcher for what the right half is showing, parked where your eye
       already is when you finish a line. -->
  <div
    class="pane-toggle"
    role="group"
    aria-label="Right panel"
    use:glass={{ blur: 6, saturate: 1.6, bezel: 12, strength: 20, lens: 0.07 }}
  >
    <button
      class:selected={ui.panel === "queue"}
      title="Queue"
      aria-label="Queue"
      aria-pressed={ui.panel === "queue"}
      onclick={() => choosePanel("queue")}
    >
      <ImmersiveIcon name="queue" size={17} />
    </button>
    <button
      class:selected={ui.panel === "lyrics"}
      title="Lyrics"
      aria-label="Lyrics"
      aria-pressed={ui.panel === "lyrics"}
      onclick={() => choosePanel("lyrics")}
    >
      <ImmersiveIcon name="lyrics" size={17} />
    </button>
  </div>

  <!-- Full width, no background of its own. The only thing behind it is a
       gradient scrim painted by `::before`, which costs one gradient rather
       than a per-frame backdrop sample of everything under a 120px-tall bar. -->
  <div class="bar">
    <div class="bar-meta">
      <div class="bar-title">{player.current?.title ?? "Not Playing"}</div>
      <div class="bar-sub">
        {#if player.current}
          <!-- Set in caps: it is the record's name, not a sentence, and the
               caps are what stop it reading as a second title. -->
          <button class="album-link" onclick={goToAlbum} title="Open in the browser">
            {player.current.album || "Single"}
          </button>
          <span class="dash">–</span>
          <ArtistLink artist={player.current.artist} />
        {:else}
          Nothing queued
        {/if}
      </div>
      <div class="ghosts">
        <button class="ghost" title="Appearance" aria-label="Appearance" onclick={() => onappearance()}>
          <ImmersiveIcon name="gear" size={15} />
        </button>
        <button
          class="ghost"
          title="Open this record in the browser"
          aria-label="Open this record in the browser"
          onclick={goToAlbum}
          disabled={!player.current}
        >
          <ImmersiveIcon name="more" size={15} />
        </button>
        <button
          class="ghost"
          class:on={albumPinned}
          title={albumPinned ? "Remove album from your library" : "Add album to your library"}
          aria-label={albumPinned ? "Remove album from your library" : "Add album to your library"}
          aria-pressed={albumPinned}
          onclick={() => album && library.togglePin("album", album.id)}
          disabled={!album}
        >
          <ImmersiveIcon name="check" size={15} />
        </button>
        <button
          class="ghost star"
          class:on={starred}
          title={starred ? "Remove from Liked Songs" : "Add to Liked Songs"}
          aria-label={starred ? "Remove from Liked Songs" : "Add to Liked Songs"}
          aria-pressed={starred}
          onclick={() => player.current && library.toggleFavourite(player.current.path)}
          disabled={!player.current}
        >
          <ImmersiveIcon name="star" size={15} />
        </button>
        <button
          class="ghost"
          class:on={ui.panel === "queue"}
          title="Queue"
          aria-label="Queue"
          aria-pressed={ui.panel === "queue"}
          onclick={() => choosePanel("queue")}
        >
          <ImmersiveIcon name="queue" size={15} />
        </button>
      </div>
    </div>

    <!-- Scrubber above, transport below. That order is the classic one and it
         is also the honest one: the line tells you where you are, the buttons
         are what you do about it. -->
    <div class="bar-centre">
      <div class="seekrow">
        <span class="time">{formatTime(pos)}</span>
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
        <span class="time">-{formatTime(Math.max(0, player.duration - pos))}</span>
      </div>

      <div class="transport">
        <button
          class="ctl secondary"
          class:on={player.shuffled}
          title="Shuffle"
          aria-label="Shuffle"
          aria-pressed={player.shuffled}
          onclick={() => player.toggleShuffle()}
        >
          <ImmersiveIcon name="shuffle" size={18} />
        </button>
        <button class="ctl" title="Previous" aria-label="Previous" onclick={() => player.prev()}>
          <ImmersiveIcon name="previous" size={22} />
        </button>
        <button
          class="ctl play"
          title={player.playing ? "Pause" : "Play"}
          aria-label={player.playing ? "Pause" : "Play"}
          onclick={() => player.togglePlay()}
        >
          <ImmersiveIcon name={player.playing ? "pause" : "play"} size={27} />
        </button>
        <button class="ctl" title="Next" aria-label="Next" onclick={() => player.next()}>
          <ImmersiveIcon name="next" size={22} />
        </button>
        <button
          class="ctl secondary repeat"
          class:on={player.repeat !== "off"}
          title="Repeat"
          aria-label="Repeat"
          onclick={() => player.cycleRepeat()}
        >
          <ImmersiveIcon name="repeat" size={18} />
          {#if player.repeat === "one"}<span class="repeat-one">1</span>{/if}
        </button>
      </div>
    </div>

    <div class="bar-right">
      <!-- Always out, never a popover. There is room for it down here, and a
           volume slider you have to summon first is the thing the pills got
           wrong. -->
      <div class="volume-row">
        <ImmersiveIcon name="volume" size={16} />
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
      </div>
      <button
        class="ghost"
        class:on={ui.browserOpen}
        title="Browser"
        aria-label="Library browser"
        aria-pressed={ui.browserOpen}
        onclick={() => ui.toggleBrowser()}
      >
        <ImmersiveIcon name="browser" size={16} />
      </button>
      <!-- Arrows pushing outward: the cover alone, centred, nothing beside it.
           The pair to "collapse" next to it — one goes further in, one comes
           all the way out. -->
      <button
        class="ghost"
        title="Artwork only"
        aria-label="Artwork only"
        aria-pressed={!split}
        onclick={() => (ui.panel = "none")}
      >
        <ImmersiveIcon name="immersive" size={16} />
      </button>
      <button
        class="ghost"
        title="Exit immersive mode"
        aria-label="Exit immersive mode"
        onclick={() => ui.exit()}
      >
        <ImmersiveIcon name="collapse" size={16} />
      </button>
    </div>
  </div>

  {#if ui.browserOpen}
    <ImmersiveBrowser />
  {/if}
</div>

<style>
  .classic {
    --cl-text: rgba(255, 255, 255, 0.96);
    --cl-muted: rgba(255, 255, 255, 0.68);
    --cl-faint: rgba(255, 255, 255, 0.44);
    /* The bar's height is a constant, not a measurement: the stage above it is
       sized by subtraction, and letting the bar's own content decide would put
       a layout dependency between the two — a longer track title would move
       the artwork. */
    --bar-h: 120px;
    /* How far the cover slides when the right half opens. From 50% of the
       window to 25% of it is a quarter of the width, expressed in the one unit
       that stays honest inside a `transform`. */
    --cover-shift: 25vw;
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    z-index: 2147483647;
    overflow: hidden;
    overscroll-behavior: none;
    isolation: isolate;
    /* Transparent, not a surface: the colour field lives one layer down in
       Immersive.svelte and this would cover it. The floor under everything is
       painted there. */
    background: transparent;
    color: var(--cl-text);
  }


  /* Everything above the bar. It is a positioning context and nothing else —
     the two children place themselves, because a grid would have to reflow to
     move the cover and the whole point is that the cover only transforms. */
  .stage {
    position: absolute;
    inset: 0 0 var(--bar-h);
    z-index: 2;
  }

  .cover {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(52vh, 30vw);
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    transform: translate(-50%, -50%);
    transition: transform 420ms var(--motion-spring);
  }
  .split .cover {
    transform: translate(-50%, -50%) translateX(calc(-1 * var(--cover-shift)));
  }
  /* Squarer corners than One's 8px and far squarer than Solarium's 30px cards:
     this is a sleeve, and a sleeve has a printed edge. The shadow is what lifts
     it off the colour field, in place of a border it doesn't get. */
  .cover :global(.art) {
    width: 100% !important;
    height: 100% !important;
    box-shadow: 0 34px 90px rgba(22, 5, 15, 0.42);
  }
  /* The hover nudge has to be composed onto whichever of the two positions is
     current, so each state spells the whole transform out; a bare `scale()`
     here would drop the split offset and teleport the cover back to centre. */
  .cover:hover {
    transform: translate(-50%, -50%) scale(1.006);
  }
  .split .cover:hover {
    transform: translate(-50%, -50%) translateX(calc(-1 * var(--cover-shift))) scale(1.006);
  }
  .cover:active {
    transform: translate(-50%, -50%) scale(0.994);
  }
  .split .cover:active {
    transform: translate(-50%, -50%) translateX(calc(-1 * var(--cover-shift))) scale(0.994);
  }

  /* The right half, exactly: the cover's shifted centre sits at 25% of the
     window and it is at most 30vw wide, so its right edge lands at 40% and
     never reaches this. */
  .pane {
    position: absolute;
    top: 0;
    left: 50%;
    right: 0;
    bottom: 0;
    min-width: 0;
    min-height: 0;
    /* Grid with one definite row, so the panels' `height: 100%` resolves
       against the track rather than against the content they mean to scroll. */
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    padding: 0 clamp(24px, 4vw, 72px) 0 clamp(12px, 2vw, 40px);
    color: #fff;
    /* No card behind the type, so legibility over a bright patch of the field
       has to come from the letters themselves. */
    text-shadow: 0 1px 22px rgba(22, 4, 14, 0.34);
  }
  .lyric-field {
    overflow: hidden;
    /* The fade is the frame. With no card edge there is nothing to crop
       against, so the text has to stop being there rather than be cut off. */
    mask-image: linear-gradient(transparent 0%, #000 12%, #000 84%, transparent 100%);
    -webkit-mask-image: linear-gradient(transparent 0%, #000 12%, #000 84%, transparent 100%);
  }
  .lyric-field :global(.lyrics) {
    padding: 20% 2% 22%;
    scrollbar-width: none;
  }
  .lyric-field :global(.lyrics::-webkit-scrollbar) {
    display: none;
  }
  .lyric-field :global(.synced) {
    gap: 20px;
  }
  .lyric-field :global(.line) {
    width: 100%;
    max-width: 760px;
    padding: 2px 8px;
    font-size: clamp(26px, 2.1vw, 40px);
    line-height: 1.28;
    color: #fff;
    /* Set the ramp's knobs, not `opacity` — writing opacity here would flatten
       the per-line dim/blur falloff back to one value. */
    --lyric-dim: 0.44;
    --lyric-past: 0;
    --lyric-past-hover: 0.2;
    --lyric-lit: 0.98;
    --lyric-blur-step: 0.6px;
    /* Only safe over the artwork field, where the backdrop is always dark. */
    --lyric-glow: 0 0 22px rgba(255, 255, 255, 0.42);
    text-align: left;
    transform-origin: left center;
  }
  /* A line in the second lane reads from the right, so a duet is visibly two
     voices rather than one list. Written with `.offset` in the selector on
     purpose: the rule above and LyricsPanel's own `.line.offset` land on the
     same specificity, so without this the winner is decided by which
     component's CSS the bundler happens to emit last. */
  .lyric-field :global(.line.offset) {
    text-align: right;
    transform-origin: right center;
  }
  .lyric-field :global(.line.active) {
    color: #fff;
    transform: none;
  }
  .lyric-field :global(.line:hover) {
    background: rgba(255, 255, 255, 0.07);
  }
  .queue-field {
    overflow: hidden;
    padding-top: 4vh;
    padding-bottom: 3vh;
  }

  .pane-toggle {
    position: absolute;
    z-index: 6;
    right: clamp(24px, 4vw, 72px);
    bottom: calc(var(--bar-h) + 18px);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.11),
      rgba(255, 255, 255, 0.02) 45%,
      rgba(255, 255, 255, 0.05)
    );
    /* Baseline frosting; `use:glass` replaces this inline with the same blur
       plus the refracting rim, and if that fails to parse this is what's left
       rather than a clear hole. */
    backdrop-filter: blur(6px) saturate(1.6);
    box-shadow: 0 12px 34px rgba(12, 4, 10, 0.26);
  }
  .pane-toggle button {
    width: 40px;
    height: 32px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.76);
    transition: background 160ms ease, color 160ms ease;
  }
  .pane-toggle button:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  .pane-toggle button.selected {
    color: #fff;
    background: rgba(255, 255, 255, 0.2);
  }

  .bar {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--bar-h);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(340px, 40%) minmax(0, 1fr);
    align-items: center;
    gap: clamp(16px, 3vw, 56px);
    padding: 0 clamp(20px, 3vw, 44px);
    color: #fff;
  }
  /* A scrim, not a panel. One gradient painted once, versus a 120px-tall
     backdrop filter resampled every frame the lyrics scroll under it — and it
     buys the same thing, which is small type staying readable when the bottom
     of the cover happens to be white. It starts above the bar so the edge of
     the darkening is never a visible line. */
  .bar::before {
    content: "";
    position: absolute;
    inset: -40px 0 0;
    z-index: -1;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(12, 4, 10, 0.22) 45%,
      rgba(12, 4, 10, 0.46) 100%
    );
  }

  .bar-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    min-width: 0;
  }
  .bar-title {
    font-size: 13px;
    font-weight: 750;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-sub {
    font-size: 11px;
    font-weight: 550;
    color: var(--cl-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .album-link {
    display: inline;
    padding: 0;
    font: inherit;
    color: inherit;
    text-transform: uppercase;
    letter-spacing: 0.055em;
    border-radius: 4px;
    transition: color 140ms ease;
  }
  .album-link:hover {
    color: #fff;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .dash {
    margin: 0 2px;
    color: var(--cl-faint);
  }
  .ghosts {
    display: flex;
    align-items: center;
    gap: 1px;
    /* Pulled left by half a button so the icon row's optical left edge lines up
       with the text above it rather than with the buttons' hit boxes. */
    margin: 2px 0 0 -6px;
  }

  /* Ghost buttons: no chrome at rest. There are eight of them around this bar,
     and giving each one a resting background would rebuild, in pieces, exactly
     the panel this mode is trying not to have. */
  .ghost {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    color: rgba(255, 255, 255, 0.62);
    transition: background 150ms ease, color 150ms ease;
  }
  .ghost:hover:not(:disabled) {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .ghost.on {
    color: #fff;
  }
  .ghost:disabled {
    opacity: 0.3;
    cursor: default;
  }
  /* Filled rather than merely brightened: a pinned song should read as pinned
     from across the room, and at 15px an outline star does not. */
  .star.on :global(svg) {
    fill: currentColor;
  }

  .bar-centre {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
  }
  .seekrow {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 46px;
    align-items: center;
    gap: 10px;
  }
  .time {
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.78);
    text-align: center;
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
  /* The native input is the hit area, stretched well past the 4px line it
     draws: a 4px drag target is a miss waiting to happen. */
  .track input {
    -webkit-appearance: none;
    appearance: none;
    position: absolute;
    inset: -8px 0;
    width: 100%;
    height: 20px;
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

  .transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(4px, 1vw, 14px);
  }
  .ctl {
    width: 38px;
    height: 38px;
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
    background: rgba(255, 255, 255, 0.12);
    transform: scale(1.08);
  }
  .ctl:active {
    transform: scale(0.9);
  }
  .ctl.play {
    width: 46px;
    height: 46px;
  }
  .ctl.secondary {
    color: rgba(255, 255, 255, 0.72);
  }
  .ctl.on {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .repeat {
    position: relative;
  }
  .repeat-one {
    position: absolute;
    font-size: 8px;
    font-weight: 800;
  }

  .bar-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-width: 0;
  }
  .volume-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
    color: rgba(255, 255, 255, 0.66);
  }
  .volume {
    width: clamp(64px, 7vw, 104px);
    flex: none;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.96);
    outline-offset: 3px;
  }

  /* Narrow windows: the three zones stop fitting side by side long before the
     cover runs out of room, so the bar loses its shoulders first — the
     transport is the part nobody can do without. */
  @media (max-width: 1180px) {
    .classic {
      --bar-h: 112px;
    }
    .bar {
      gap: 16px;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 44%) minmax(0, 1fr);
    }
    .volume {
      width: 64px;
    }
    .lyric-field :global(.line) {
      font-size: clamp(22px, 2.6vw, 32px);
    }
  }
  @media (max-width: 900px) {
    .classic {
      /* The cover keeps the left third, and at this width that third is most
         of what there is, so the split closes the gap rather than widening
         it. */
      --cover-shift: 27vw;
    }
    .bar {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
      row-gap: 4px;
    }
    /* Dropped, not stacked. Stacking would grow the bar, and the bar's height
       is the constant the whole layout is measured from. */
    .bar-right {
      display: none;
    }
    .pane {
      padding-right: 20px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cover,
    .ctl,
    .ghost,
    .pane-toggle button,
    .album-link {
      transition: none;
    }
    /* Only the hover nudge goes: the split offset is carrying layout meaning,
       so it has to survive even with motion turned down. */
    .cover:hover,
    .cover:active {
      transform: translate(-50%, -50%);
    }
    .split .cover:hover,
    .split .cover:active {
      transform: translate(-50%, -50%) translateX(calc(-1 * var(--cover-shift)));
    }
  }
</style>

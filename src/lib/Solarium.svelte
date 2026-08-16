<script lang="ts">
  //! Solarium — the second immersive mode.
  //!
  //! One frames the cover; Solarium *is* the cover. The artwork is cropped to a
  //! target aspect ratio, made as tall as the window, and dissolved at its
  //! edges into the colour field derived from that same cover — so there is no
  //! frame, no edge and no seam between the art and the room it lights.
  //! Everything else (transport, lyrics, queue) floats over it as liquid glass.
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import { player, formatTime } from "$lib/player.svelte";
  import { ui } from "$lib/ui.svelte";
  import { theme } from "$lib/theme.svelte";
  import { immersiveStyle, aspectValue } from "$lib/immersiveStyle.svelte";
  import { library } from "$lib/library.svelte";
  import { nav } from "$lib/nav.svelte";
  import { glass } from "$lib/liquidGlass";
  import { artworkLuma, lumaOver, type ArtworkLuma } from "$lib/artworkLuma";
  import ArtistLink from "$lib/ArtistLink.svelte";
  import LyricsPanel from "$lib/LyricsPanel.svelte";
  import CompactLyrics from "$lib/CompactLyrics.svelte";
  import SolariumQueue from "$lib/SolariumQueue.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";
  import WindowControls from "$lib/WindowControls.svelte";
  import ImmersiveBrowser from "$lib/ImmersiveBrowser.svelte";
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

  let seeking = $state(false);
  let seekValue = $state(0);
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWake = 0;
  let volumeOpen = $state(false);
  let speedOpen = $state(false);

  const pos = $derived(seeking ? seekValue : player.position);
  const progress = $derived(player.duration > 0 ? (pos / player.duration) * 100 : 0);
  const volPct = $derived(player.volume * 100);
  const starred = $derived(!!player.current && library.isPinned("song", player.current.path));

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  /** `1.5` → "1.5×", `1` → "1×", `0.75` → "0.75×". */
  const speedText = (s: number) => `${parseFloat(s.toFixed(2))}×`;
  const speedLabel = $derived(speedText(player.speed));

  const art = $derived(player.current?.art ?? null);

  // Lyrics either take the side card or the bar above the transport; the queue
  // takes the side only when asked to, and otherwise floats over the artwork.
  const lyricsSide = $derived(ui.solLyrics && immersiveStyle.lyricsType === "full");
  const lyricsBar = $derived(ui.solLyrics && immersiveStyle.lyricsType === "compact");
  const queueSide = $derived(ui.solQueue && immersiveStyle.queueOnSide);
  const queueFloat = $derived(ui.solQueue && !immersiveStyle.queueOnSide);

  /** The whole stage, and the width the side cards take out of it. */
  let stageW = $state(0);
  let stageH = $state(0);
  let sideW = $state(0);

  const ratio = $derived(aspectValue(immersiveStyle.aspect));
  // The frame is the target ratio at the full height of the window: a 4:3
  // frame in a 16:9 window leaves colour field either side of the art, and a
  // 16:9 one nearly fills it. Wider than the window it stops growing — 21:9
  // and 32:9 in a 16:9 window are the same picture, one that fills the width
  // — since past that point more ratio is only more zoom into a crop that's
  // already off both edges. Artwork Y Position picks which band of the cover
  // survives the crop into the frame.
  const frameH = $derived(stageH);
  const frameW = $derived(Math.min(stageH * ratio, stageW));
  // Centred on the space the side cards leave, not on the window: the art is
  // painted right across the stage and the cards' glass blurs whatever ends up
  // under them, so the crop can straddle the join without a seam.
  const freeW = $derived(Math.max(0, stageW - (lyricsSide || queueSide ? sideW : 0)));
  const frameLeft = $derived((freeW - frameW) / 2);

  /** Lightness map of the current cover; null until it has loaded. */
  let luma = $state<ArtworkLuma | null>(null);
  $effect(() => {
    const src = art;
    luma = null;
    if (!src) return;
    let cancelled = false;
    artworkLuma(src).then((v) => {
      if (!cancelled) luma = v;
    });
    return () => {
      cancelled = true;
    };
  });

  // How the cover sits in the frame under `object-fit: cover`: scaled until it
  // covers, then whatever overhangs is what Artwork Y Position pans through.
  const artAspect = $derived(luma?.aspect ?? 1);
  const coverScale = $derived(
    Math.max(frameW / Math.max(1, artAspect), frameH) / Math.max(1, frameH),
  );
  const drawnW = $derived(frameH * coverScale * artAspect);
  const drawnH = $derived(frameH * coverScale);
  const overflowY = $derived(Math.max(0, drawnH - frameH));
  // A square cover in a square frame has nothing to pan through, so the slider
  // would be dead at 1:1. Below a floor of overhang the picture is allowed to
  // slide past the frame instead — up to a third of the window's height — so
  // Y keeps meaning "which band of the cover is in the middle" everywhere. Any
  // frame that already overhangs by that much doesn't move at all.
  const slack = $derived(Math.max(0, stageH * 0.3 - overflowY));
  const panPx = $derived(((50 - immersiveStyle.artworkY) / 100) * slack);
  const artPosition = $derived(
    `50% calc(${immersiveStyle.artworkY}% ${panPx >= 0 ? "+" : "-"} ${Math.abs(panPx).toFixed(1)}px)`,
  );

  /**
   * Which ink a pane over a given stage rectangle should use. The rectangle
   * is mapped back through the frame's crop onto the cover and the mean
   * lightness there decides — over a pale picture the glass gets dark type,
   * as it would on paper.
   */
  function inkFor(x0: number, y0: number, x1: number, y1: number): "light" | "dark" {
    if (!luma || !drawnW || !drawnH) return "light";
    const offX = frameLeft + (frameW - drawnW) / 2;
    const offY = ((frameH - drawnH) * immersiveStyle.artworkY) / 100 + panPx;
    const u = (x: number) => (x - offX) / drawnW;
    const v = (y: number) => (y - offY) / drawnH;
    const l = lumaOver(luma, u(x0), v(y0), u(x1), v(y1));
    // The glass adds a thin milk of white, so it tips dark a little early.
    return l > 0.56 ? "dark" : "light";
  }
  const sideInk = $derived(
    inkFor(stageW - sideW + 28, 64, stageW - 28, stageH - 118),
  );
  const floatInk = $derived(
    inkFor(freeW / 2 - 280, stageH * 0.13, freeW / 2 + 280, stageH - 118),
  );
  const barInk = $derived(
    inkFor(stageW / 2 - 400, stageH - 176, stageW / 2 + 400, stageH - 108),
  );

  const tint = $derived(
    [
      `--sol-primary:${backdrop.palette.primary}`,
      `--sol-secondary:${backdrop.palette.secondary}`,
      `--sol-light:${backdrop.palette.accentLight}`,
      `--sol-deep:${backdrop.palette.deep}`,
    ].join(";"),
  );

  /** Opens the library browser on the current track's album. */
  function goToAlbum() {
    const track = player.current;
    if (!track) return;
    const album = library.albums.find((a) => a.name === track.album);
    if (album) {
      nav.go("album", album.id);
    } else {
      nav.query = track.album;
      nav.go("albums");
    }
    ui.browserOpen = true;
    wake(true);
  }

  // The side column holds one card. With the queue on the side, opening one
  // closes the other; a floating queue can share the screen with the lyrics.
  function toggleLyrics() {
    ui.solLyrics = !ui.solLyrics;
    if (ui.solLyrics && immersiveStyle.queueOnSide) ui.solQueue = false;
    wake(true);
  }
  function toggleQueue() {
    ui.solQueue = !ui.solQueue;
    if (ui.solQueue && immersiveStyle.queueOnSide) ui.solLyrics = false;
    wake(true);
  }

  function scheduleIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    if (seeking) return;
    idleTimer = setTimeout(() => {
      idle = true;
      volumeOpen = false;
      speedOpen = false;
    }, 3200);
  }

  function wake(force = false) {
    const now = performance.now();
    if (!force && !idle && now - lastWake < 120) return;
    lastWake = now;
    idle = false;
    scheduleIdle();
  }

  function onSeekInput(e: Event) {
    seeking = true;
    player.scrubbing = true;
    seekValue = +(e.target as HTMLInputElement).value;
    wake(true);
  }

  async function onSeekCommit() {
    await player.seek(seekValue);
    seeking = false;
    player.scrubbing = false;
    scheduleIdle();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      // The menu / Appearance panel gets first refusal on Escape.
      if (!ui.immersiveOverlay) ui.exit();
      return;
    }
    wake(true);
  }

  onMount(() => {
    window.scrollTo(0, 0);
    wake(true);
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
    };
  });
</script>

<svelte:window
  onkeydown={onKey}
  onpointermove={() => wake()}
  onpointerdown={() => wake(true)}
/>

<div class="solarium" class:idle style={tint} transition:fade={{ duration: 260 }}>
  <!-- The field and the artwork are the same picture at two scales: one blown
       up until it is only colour, one still readable. -->
  {#if theme.artworkField}
    <div class="field" aria-hidden="true">
      <DynamicBackground
        art={backdrop.art}
        palette={backdrop.palette}
        label="solarium"
        saturation={1.9}
      />
    </div>
  {/if}

  <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
    {#if art}
      <div
        class="art-frame"
        data-mask={immersiveStyle.maskType}
        style="width:{frameW}px;height:{frameH}px;left:{frameLeft}px"
      >
        <!-- Keyed so a new cover cross-fades rather than popping in over the
             outgoing one's crop. -->
        {#key art}
          <img
            src={art}
            alt=""
            style="object-position:{artPosition}"
            transition:fade={{ duration: 420 }}
          />
        {/key}
      </div>
    {/if}

    {#if lyricsSide || queueSide}
      <div class="side" bind:clientWidth={sideW}>
        {#if lyricsSide}
          <section
            class="card lyrics-card"
            aria-label="Lyrics"
            data-ink={sideInk}
            use:glass={{ blur: 24, saturate: 1.7, brightness: 0.98, bezel: 30, strength: 40 }}
            transition:fade={{ duration: 220 }}
          >
            <LyricsPanel />
          </section>
        {/if}
        {#if queueSide}
          <section
            class="card queue-card"
            aria-label="Play queue"
            data-ink={sideInk}
            use:glass={{ blur: 24, saturate: 1.7, brightness: 0.94, bezel: 30, strength: 40 }}
            transition:fade={{ duration: 220 }}
          >
            <SolariumQueue variant="side" />
          </section>
        {/if}
      </div>
    {/if}
  </div>

  {#if lyricsBar}
    <div class="compact-slot" data-ink={barInk} transition:fade={{ duration: 200 }}>
      <CompactLyrics />
    </div>
  {/if}

  {#if queueFloat}
    <!-- Centred on the free part of the stage, like the artwork, so it and a
         lyric card don't overlap. -->
    <section
      class="card queue-float"
      aria-label="Play queue"
      style="left:{freeW / 2}px"
      data-ink={floatInk}
      use:glass={{ blur: 28, saturate: 1.7, brightness: 0.9, bezel: 28, strength: 38 }}
      transition:fade={{ duration: 200 }}
    >
      <SolariumQueue variant="float" />
    </section>
  {/if}

  {#if !idle}
    <div class="window-chrome" transition:fade={{ duration: 160 }}>
      <WindowControls fullscreenAware />
    </div>

    <div
      class="view-toggle"
      role="group"
      aria-label="Layout"
      use:glass={{ blur: 12, saturate: 1.6, bezel: 12, strength: 22 }}
      transition:fade={{ duration: 160 }}
    >
      <button
        class:selected={!ui.solLyrics && !ui.solQueue}
        title="Artwork only"
        aria-label="Artwork only"
        onclick={() => {
          ui.solLyrics = false;
          ui.solQueue = false;
          wake(true);
        }}
      >
        <ImmersiveIcon name="sidebar" size={17} />
      </button>
      <button
        class:selected={ui.solQueue}
        title="Queue"
        aria-label="Queue"
        aria-pressed={ui.solQueue}
        onclick={toggleQueue}
      >
        <ImmersiveIcon name="queue" size={17} />
      </button>
      <button
        class:selected={ui.solLyrics}
        title="Lyrics"
        aria-label="Lyrics"
        aria-pressed={ui.solLyrics}
        onclick={toggleLyrics}
      >
        <ImmersiveIcon name="lyrics" size={17} />
      </button>
    </div>
  {/if}

  <!-- The dock stays through idle — it is the one thing you reach for from
       across the room. Only the chrome around it sleeps. -->
  <div
    class="transport"
    data-ink="light"
    use:glass={{ blur: 10, saturate: 1.6, brightness: 1.02, bezel: 18, strength: 26 }}
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
        <ImmersiveIcon name="shuffle" size={17} />
      </button>
      <button class="ctl" title="Previous" aria-label="Previous" onclick={() => player.prev()}>
        <ImmersiveIcon name="previous" size={19} />
      </button>
      <button
        class="ctl play"
        title={player.playing ? "Pause" : "Play"}
        aria-label={player.playing ? "Pause" : "Play"}
        onclick={() => player.togglePlay()}
      >
        <ImmersiveIcon name={player.playing ? "pause" : "play"} size={22} />
      </button>
      <button class="ctl" title="Next" aria-label="Next" onclick={() => player.next()}>
        <ImmersiveIcon name="next" size={19} />
      </button>
      <button
        class="ctl secondary repeat"
        class:on={player.repeat !== "off"}
        title="Repeat"
        aria-label="Repeat"
        onclick={() => player.cycleRepeat()}
      >
        <ImmersiveIcon name="repeat" size={17} />
        {#if player.repeat === "one"}<span class="repeat-one">1</span>{/if}
      </button>
      <span class="time">
        {formatTime(pos)} / -{formatTime(Math.max(0, player.duration - pos))}
      </span>
    </div>

    <!-- The inset card is the record on the deck: it names what is playing and
         carries the progress of it, so the pill needs no separate readout. -->
    <div class="now-card" style="--pct:{progress}%">
      <div class="now-meta">
        <div class="now-title">{player.current?.title ?? "Not Playing"}</div>
        <div class="now-sub">
          {#if player.current}
            <!-- The album is a way in: it opens the browser on that record. -->
            <button class="album-link" onclick={goToAlbum} title="Open in the browser">
              {player.current.album || "Single"}
            </button>
            –
            <ArtistLink artist={player.current.artist} />
          {:else}
            Nothing queued
          {/if}
        </div>
      </div>
      {#if player.current}
        <div class="now-badges">
          {#if player.speed !== 1}
            <span class="now-badge" title="Playback speed">{speedLabel}</span>
          {/if}
          <button
            class="now-star"
            class:on={starred}
            title={starred ? "Unpin song" : "Pin song"}
            aria-label={starred ? "Unpin song" : "Pin song"}
            aria-pressed={starred}
            onclick={() => player.current && library.togglePin("song", player.current.path)}
          >
            <ImmersiveIcon name="star" size={13} />
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
          <ImmersiveIcon name="volume" size={17} />
        </button>
        {#if volumeOpen}
          <div
            class="pop volume-pop"
            use:glass={{ blur: 14, saturate: 1.6, bezel: 12, strength: 20 }}
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
        class:on={ui.solQueue}
        title="Queue"
        aria-label="Queue"
        aria-pressed={ui.solQueue}
        onclick={toggleQueue}
      >
        <ImmersiveIcon name="queue" size={17} />
      </button>
      <button
        class="ctl secondary"
        class:on={ui.solLyrics}
        title="Lyrics"
        aria-label="Lyrics"
        aria-pressed={ui.solLyrics}
        onclick={toggleLyrics}
      >
        <ImmersiveIcon name="lyrics" size={17} />
      </button>
      <button
        class="ctl secondary"
        class:on={ui.browserOpen}
        title="Browser"
        aria-label="Library browser"
        aria-pressed={ui.browserOpen}
        onclick={() => ui.toggleBrowser()}
      >
        <ImmersiveIcon name="browser" size={17} />
      </button>
      <div
        class="pop-wrap"
        role="group"
        aria-label="Playback speed"
        onpointerenter={() => (speedOpen = true)}
        onpointerleave={() => (speedOpen = false)}
      >
        <button
          class="ctl secondary"
          class:on={player.speed !== 1}
          title="Playback speed"
          aria-label="Playback speed"
          aria-expanded={speedOpen}
          onclick={() => (speedOpen = !speedOpen)}
        >
          <ImmersiveIcon name="gauge" size={17} />
        </button>
        {#if speedOpen}
          <div
            class="pop speed-pop"
            use:glass={{ blur: 14, saturate: 1.6, bezel: 14, strength: 22 }}
            transition:fade={{ duration: 120 }}
          >
            <div class="pop-head">
              <span>Playback Speed</span>
              <strong>{speedLabel}</strong>
            </div>
            <div class="track speed" style="--pct:{((player.speed - 0.5) / 1.5) * 100}%">
              <input
                aria-label="Playback speed"
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={player.speed}
                oninput={(e) => player.setSpeed(+(e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="chips">
              {#each SPEEDS as s (s)}
                <button
                  class="chip"
                  class:on={player.speed === s}
                  aria-pressed={player.speed === s}
                  onclick={() => player.setSpeed(s)}
                >
                  {speedText(s)}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
      <button
        class="ctl secondary"
        title="Exit immersive mode"
        aria-label="Exit immersive mode"
        onclick={() => ui.exit()}
      >
        <ImmersiveIcon name="collapse" size={17} />
      </button>
    </div>
  </div>

  {#if !idle}
    <button
      class="gear"
      title="Appearance"
      aria-label="Appearance"
      use:glass={{ blur: 12, saturate: 1.6, bezel: 14, strength: 22 }}
      onclick={() => onappearance()}
      transition:fade={{ duration: 160 }}
    >
      <ImmersiveIcon name="gear" size={19} />
    </button>
  {/if}

  {#if ui.browserOpen}
    <ImmersiveBrowser />
  {/if}
</div>

<style>
  .solarium {
    --sol-text: rgba(255, 255, 255, 0.96);
    --sol-muted: rgba(255, 255, 255, 0.72);
    /* Liquid glass. The pane itself is nearly clear — a thin milk of white so
       it reads as a surface — and everything else is done to what's behind
       it: `use:glass` blurs and re-saturates the backdrop and bends it at the
       rim. The tint therefore comes from the record, not from a swatch. */
    --sol-glass: linear-gradient(
        165deg,
        rgba(255, 255, 255, 0.11),
        rgba(255, 255, 255, 0.02) 45%,
        rgba(255, 255, 255, 0.05)
      );
    /* Slightly smoked, for menus that need to hold small type. */
    --sol-glass-strong: linear-gradient(
        165deg,
        rgba(255, 255, 255, 0.1),
        rgba(255, 255, 255, 0.02) 50%,
        rgba(255, 255, 255, 0.04)
      ),
      rgba(16, 8, 14, 0.24);
    /* The edges carry the record's colour: the hairline is the cover's light
       accent lifted toward white, and the lip along the top-left edge is the
       same light caught on the rim. Together with the dispersion in the
       backdrop filter (see liquidGlass.ts) that is what makes an edge read as
       the edge of tinted glass rather than a white outline. */
    --sol-edge: color-mix(in srgb, var(--sol-light, #fff) 62%, rgba(255, 255, 255, 0.9));
    /* Faint on purpose: the live rim `use:glass` draws just inside it is the
       real edge, and this is only there for the frame before it lands. */
    --sol-hairline: color-mix(in srgb, var(--sol-edge) 26%, transparent);
    --sol-rim:
      inset 0 1px 0 color-mix(in srgb, var(--sol-edge) 58%, transparent),
      inset 1px 0 0 color-mix(in srgb, var(--sol-edge) 26%, transparent),
      inset 0 -1px 0 color-mix(in srgb, var(--sol-deep, #000) 30%, transparent),
      inset -1px 0 0 color-mix(in srgb, var(--sol-deep, #000) 14%, transparent),
      0 0 0 1px color-mix(in srgb, var(--sol-primary, #fff) 18%, transparent);
    /* Ink over glass. Panes set `data-ink` from the cover under them; the
       rules below turn that into a colour and its muted/faint tints. */
    --sol-ink-rgb: 255 255 255;
    --sol-ink: rgb(var(--sol-ink-rgb));
    --sol-ink-muted: rgb(var(--sol-ink-rgb) / 0.72);
    --sol-ink-faint: rgb(var(--sol-ink-rgb) / 0.5);
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    z-index: 2147483647;
    overflow: hidden;
    overscroll-behavior: none;
    isolation: isolate;
    background: var(--bg-deep);
    color: var(--sol-text);
  }
  .solarium.idle {
    cursor: none;
  }
  .field {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }
  /* Black on a pale record, white on a dark one. `--sol-ink` is what every
     piece of type in a pane is set in, so flipping it here flips them all. */
  [data-ink="dark"] {
    --sol-ink-rgb: 18 10 16;
    --sol-ink-muted: rgb(var(--sol-ink-rgb) / 0.66);
    --sol-ink-faint: rgb(var(--sol-ink-rgb) / 0.42);
    color: var(--sol-ink);
  }
  [data-ink="light"] {
    color: var(--sol-ink);
  }

  /* The stage is the whole window, and it is the *window* the frame is sized
     from — never its content. The lyric card scrolls inside a fixed height
     precisely so nothing in here can grow the stage. */
  .stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: hidden;
  }
  /* Sized in JS: the cover math needs the stage's pixels, and a CSS-only frame
     of an arbitrary ratio at exactly the window's height doesn't exist. */
  .art-frame {
    position: absolute;
    top: 0;
    transition:
      width 380ms var(--motion-spring),
      height 380ms var(--motion-spring),
      left 380ms var(--motion-spring);
  }
  .art-frame img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Slightly hotter than the field behind it, which is the same picture blown
       out to colour — without this the artwork reads as the duller of the two. */
    filter: saturate(1.06) contrast(1.02);
  }
  /* The mask is the whole idea: no border, no shadow, no frame — the cover just
     stops being a picture somewhere near the edge of the screen. */
  /* A soft ellipse a little taller than it is wide, in the frame's own
     proportions: on a square frame the corners are gone and the sides half
     go, while the top of the picture reaches the top of the screen; on a
     wide frame the sides dissolve over the outer quarter and the top and
     bottom hold nearly solid. */
  .art-frame[data-mask="radial"] {
    -webkit-mask-image: radial-gradient(
      ellipse 54% 66% at 50% 50%,
      #000 32%,
      rgba(0, 0, 0, 0.5) 66%,
      transparent 96%
    );
    mask-image: radial-gradient(
      ellipse 54% 66% at 50% 50%,
      #000 32%,
      rgba(0, 0, 0, 0.5) 66%,
      transparent 96%
    );
  }
  /* Two straight fades intersected: the whole picture, softened only along
     its left and right edges, so a square frame reads as a square. */
  .art-frame[data-mask="linear"] {
    -webkit-mask-image:
      linear-gradient(to right, transparent 0%, #000 17%, #000 83%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 5%, #000 95%, transparent 100%);
    mask-image:
      linear-gradient(to right, transparent 0%, #000 17%, #000 83%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 5%, #000 95%, transparent 100%);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
  }

  /* Over the artwork rather than beside it. Its own height is fixed by the
     window, and the card scrolls inside it — see `.stage`. */
  .side {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    width: max(380px, 46%);
    display: flex;
    gap: 16px;
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
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass);
    /* Baseline frosting; `use:glass` replaces this inline with the same blur
       plus the refracting rim, and if it can't, this is what you get. */
    backdrop-filter: blur(24px) saturate(1.7) brightness(0.98);
    box-shadow:
      var(--sol-rim),
      0 30px 80px rgba(10, 3, 8, 0.28);
    overflow: hidden;
  }
  /* The queue's glass is smoked where the lyric card's is clear: it holds
     rows of small type, and the record shows through them otherwise. */
  .queue-card,
  .queue-float {
    background:
      var(--sol-glass),
      rgba(20, 8, 16, 0.22);
  }
  .queue-float {
    position: absolute;
    z-index: 4;
    top: 13vh;
    bottom: 118px;
    transform: translateX(-50%);
    width: min(560px, 90vw);
    backdrop-filter: blur(28px) saturate(1.7) brightness(0.9);
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
    color: var(--sol-ink);
    --lyric-dim: 0.4;
    --lyric-past: 0;
    --lyric-past-hover: 0.22;
    --lyric-lit: 1;
    --lyric-blur-step: 0.55px;
    --lyric-glow: 0 0 24px rgba(255, 255, 255, 0.4);
    text-align: left;
    transform-origin: left center;
  }
  .lyrics-card :global(.line.offset) {
    text-align: left;
    transform-origin: left center;
  }
  .lyrics-card :global(.line.active) {
    color: var(--sol-ink);
    transform: none;
  }
  .lyrics-card :global(.line:hover) {
    background: rgb(var(--sol-ink-rgb) / 0.08);
  }
  /* The glow is a white bloom; on dark ink it would halo the letters grey. */
  .lyrics-card[data-ink="dark"] :global(.line) {
    --lyric-glow: none;
  }

  .compact-slot {
    position: absolute;
    z-index: 4;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    width: min(760px, 82vw);
    /* Above the dock, which never leaves. */
    bottom: 108px;
  }

  .window-chrome {
    position: absolute;
    z-index: 7;
    top: 26px;
    left: 26px;
  }
  .view-toggle {
    position: absolute;
    z-index: 6;
    top: 20px;
    /* Clear of the traffic lights to its left. */
    left: 92px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass);
    backdrop-filter: blur(12px) saturate(1.6);
    box-shadow:
      var(--sol-rim),
      0 12px 34px rgba(12, 4, 10, 0.24);
  }
  .view-toggle button {
    width: 38px;
    height: 30px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.76);
    transition: background 160ms ease, color 160ms ease;
  }
  .view-toggle button:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  .view-toggle button.selected {
    color: #fff;
    background: rgba(255, 255, 255, 0.2);
  }

  .transport {
    position: absolute;
    z-index: 6;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    width: min(1180px, 90vw);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
    padding: 8px 12px 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass);
    backdrop-filter: blur(10px) saturate(1.6) brightness(1.02);
    box-shadow:
      var(--sol-rim),
      0 20px 54px rgba(12, 4, 10, 0.3);
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
    width: 34px;
    height: 34px;
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
    padding: 6px 12px 9px 18px;
    border-radius: 18px;
    overflow: hidden;
    /* The one dark thing on the pill: the record sits *in* the glass, so it's
       cut deeper than the surface around it. */
    background: rgba(10, 4, 9, 0.28);
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.26),
      inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  .now-meta {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .now-title {
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .now-sub {
    font-size: 11.5px;
    color: var(--sol-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .album-link {
    display: inline;
    padding: 0;
    font: inherit;
    color: inherit;
    border-radius: 4px;
    transition: color 140ms ease;
  }
  .album-link:hover {
    color: #fff;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .now-badges {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
  }
  .now-badge {
    padding: 1px 6px;
    border-radius: 6px;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.92);
    background: rgba(255, 255, 255, 0.16);
  }
  .now-star {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.72);
    transition: color 140ms ease, background 140ms ease, transform 200ms var(--motion-spring);
  }
  .now-star:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    transform: scale(1.1);
  }
  .now-star.on {
    color: #fff;
  }
  .now-star.on :global(svg) {
    fill: currentColor;
  }
  /* The scrubber is the bottom edge of the card, full bleed: the only line in
     the bar, so it can't be mistaken for anything else. */
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

  /* Popovers off the transport: volume, playback speed. */
  .pop-wrap {
    position: relative;
  }
  .pop {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 14px;
    border-radius: 18px;
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass-strong);
    backdrop-filter: blur(14px) saturate(1.6);
    box-shadow:
      var(--sol-rim),
      0 16px 40px rgba(10, 3, 8, 0.34);
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
  .volume-pop {
    width: 130px;
  }
  .speed-pop {
    width: 268px;
    padding: 12px 14px 12px;
  }
  .pop-foot {
    margin-top: 10px;
    text-align: center;
    font-size: 12px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.86);
  }
  .pop-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 12px;
    font-weight: 650;
    color: rgba(255, 255, 255, 0.78);
  }
  .pop-head strong {
    font-size: 13px;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .chips {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
    margin-top: 12px;
  }
  .chip {
    min-width: 0;
    height: 26px;
    padding: 0;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.78);
    background: rgba(255, 255, 255, 0.1);
    transition: background 140ms ease, color 140ms ease;
  }
  .chip:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
  }
  .chip.on {
    color: #fff;
    background: rgba(255, 255, 255, 0.3);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .gear {
    position: absolute;
    z-index: 6;
    right: 26px;
    bottom: 26px;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.85);
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass);
    backdrop-filter: blur(12px) saturate(1.6);
    box-shadow:
      var(--sol-rim),
      0 14px 36px rgba(12, 4, 10, 0.26);
    transition:
      background 160ms ease,
      color 160ms ease,
      transform 260ms var(--motion-spring);
  }
  .gear:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.22);
    transform: rotate(45deg);
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.96);
    outline-offset: 3px;
  }

  @media (max-width: 1080px) {
    .side {
      width: max(320px, 52%);
      padding: 54px 18px 112px;
      flex-direction: column;
    }
    .transport {
      width: min(96vw, 1080px);
    }
    .now-card {
      width: clamp(200px, 30vw, 380px);
    }
  }
  @media (max-width: 780px) {
    .view-toggle {
      top: 56px;
      left: 18px;
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
    .art-frame,
    .compact-slot,
    .ctl,
    .gear,
    .now-star,
    .chip {
      transition: none;
    }
    .gear:hover {
      transform: none;
    }
  }
</style>

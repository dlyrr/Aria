<script lang="ts">
  //! Solarium — the second immersive mode.
  //!
  //! One frames the cover; Solarium *is* the cover. The artwork is cropped to a
  //! target aspect ratio, scaled until it covers the stage, and then dissolved
  //! at its edges into the colour field derived from that same cover — so there
  //! is no frame, no edge and no seam between the art and the room it lights.
  //! Everything else (transport, lyrics, queue) floats over it as glass.
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import { player, formatTime } from "$lib/player.svelte";
  import { ui } from "$lib/ui.svelte";
  import { theme } from "$lib/theme.svelte";
  import { immersiveStyle, aspectValue } from "$lib/immersiveStyle.svelte";
  import ArtistLink from "$lib/ArtistLink.svelte";
  import LyricsPanel from "$lib/LyricsPanel.svelte";
  import CompactLyrics from "$lib/CompactLyrics.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";
  import WindowControls from "$lib/WindowControls.svelte";
  import DynamicBackground from "$lib/DynamicBackground.svelte";
  import type { ArtworkPalette } from "$lib/accent";

  let {
    backdrop,
    onappearance,
  }: {
    backdrop: { key: string; art: string | null; palette: ArtworkPalette };
    /** Opens the Appearance panel — owned by Immersive.svelte, shared with One. */
    onappearance: (x?: number, y?: number) => void;
  } = $props();

  let seeking = $state(false);
  let seekValue = $state(0);
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWake = 0;
  let volumeOpen = $state(false);

  const pos = $derived(seeking ? seekValue : player.position);
  const progress = $derived(player.duration > 0 ? (pos / player.duration) * 100 : 0);
  const volPct = $derived(player.volume * 100);
  const upcoming = $derived(player.queue.slice(Math.max(0, player.currentIndex + 1)));

  const art = $derived(player.current?.art ?? null);

  // Lyrics either take the side card or the bar above the transport; the queue
  // takes the side only when asked to, and otherwise floats over the artwork.
  const lyricsSide = $derived(ui.solLyrics && immersiveStyle.lyricsType === "full");
  const lyricsBar = $derived(ui.solLyrics && immersiveStyle.lyricsType === "compact");
  const queueSide = $derived(ui.solQueue && immersiveStyle.queueOnSide);
  const queueFloat = $derived(ui.solQueue && !immersiveStyle.queueOnSide);

  /** The artwork stage — everything left of the side cards, edge to edge. */
  let regionW = $state(0);
  let regionH = $state(0);

  const ratio = $derived(aspectValue(immersiveStyle.aspect));
  // The frame is the target ratio scaled until it *covers* the stage, not until
  // it fits inside it: a 4:3 crop on a 16:9 window has to overflow sideways, or
  // the mask would fade out into bare colour well before the screen edge.
  const frameW = $derived(Math.max(regionW, regionH * ratio));
  const frameH = $derived(Math.max(regionH, regionW / ratio));
  const frameLeft = $derived((regionW - frameW) / 2);
  // Artwork Y Position drives both the frame's overflow (0 = top-aligned,
  // 100 = bottom) and the crop inside it, so one slider reads as one movement.
  const frameTop = $derived((regionH - frameH) * (immersiveStyle.artworkY / 100));

  const tint = $derived(
    [
      `--sol-primary:${backdrop.palette.primary}`,
      `--sol-secondary:${backdrop.palette.secondary}`,
      `--sol-deep:${backdrop.palette.deep}`,
    ].join(";"),
  );

  function scheduleIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    if (seeking) return;
    idleTimer = setTimeout(() => {
      idle = true;
      volumeOpen = false;
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

  <div class="stage" class:with-side={lyricsSide || queueSide}>
    <div class="art-region" bind:clientWidth={regionW} bind:clientHeight={regionH}>
      {#if art}
        <div
          class="art-frame"
          data-mask={immersiveStyle.maskType}
          style="width:{frameW}px;height:{frameH}px;left:{frameLeft}px;top:{frameTop}px"
        >
          <!-- Keyed so a new cover cross-fades rather than popping in over the
               outgoing one's crop. -->
          {#key art}
            <img
              src={art}
              alt=""
              style="object-position:50% {immersiveStyle.artworkY}%"
              transition:fade={{ duration: 420 }}
            />
          {/key}
        </div>
      {/if}
    </div>

    {#if lyricsSide || queueSide}
      <div class="side">
        {#if lyricsSide}
          <section class="card lyrics-card" aria-label="Lyrics" transition:fade={{ duration: 220 }}>
            <LyricsPanel />
          </section>
        {/if}
        {#if queueSide}
          <section class="card queue-card" aria-label="Play queue" transition:fade={{ duration: 220 }}>
            {@render queueBody()}
          </section>
        {/if}
      </div>
    {/if}
  </div>

  {#if lyricsBar}
    <div class="compact-slot" class:raised={!idle} transition:fade={{ duration: 200 }}>
      <CompactLyrics />
    </div>
  {/if}

  {#if queueFloat}
    <section class="card queue-float" aria-label="Play queue" transition:fade={{ duration: 200 }}>
      {@render queueBody()}
    </section>
  {/if}

  {#if !idle}
    <div class="window-chrome" transition:fade={{ duration: 160 }}>
      <WindowControls fullscreenAware />
    </div>

    <div class="view-toggle" role="group" aria-label="Layout" transition:fade={{ duration: 160 }}>
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
        onclick={() => {
          ui.solQueue = !ui.solQueue;
          wake(true);
        }}
      >
        <ImmersiveIcon name="queue" size={17} />
      </button>
      <button
        class:selected={ui.solLyrics}
        title="Lyrics"
        aria-label="Lyrics"
        aria-pressed={ui.solLyrics}
        onclick={() => {
          ui.solLyrics = !ui.solLyrics;
          wake(true);
        }}
      >
        <ImmersiveIcon name="lyrics" size={17} />
      </button>
    </div>

    <div class="transport" transition:fade={{ duration: 180 }}>
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
              {player.current.album || "Single"} —
              <ArtistLink artist={player.current.artist} />
            {:else}
              Nothing queued
            {/if}
          </div>
        </div>
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
          class="volume-wrap"
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
            <div class="volume-pop" transition:fade={{ duration: 120 }}>
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
          {/if}
        </div>
        <button
          class="ctl secondary"
          class:on={ui.solQueue}
          title="Queue"
          aria-label="Queue"
          aria-pressed={ui.solQueue}
          onclick={() => (ui.solQueue = !ui.solQueue)}
        >
          <ImmersiveIcon name="queue" size={17} />
        </button>
        <button
          class="ctl secondary"
          class:on={ui.solLyrics}
          title="Lyrics"
          aria-label="Lyrics"
          aria-pressed={ui.solLyrics}
          onclick={() => (ui.solLyrics = !ui.solLyrics)}
        >
          <ImmersiveIcon name="lyrics" size={17} />
        </button>
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

    <button
      class="gear"
      title="Appearance"
      aria-label="Appearance"
      onclick={() => onappearance()}
      transition:fade={{ duration: 160 }}
    >
      <ImmersiveIcon name="gear" size={19} />
    </button>
  {/if}
</div>

{#snippet queueBody()}
  <div class="queue-scroll">
    <h2>Now Playing</h2>
    {#if player.current}
      <button class="now-row" onclick={() => player.playIndex(player.currentIndex)}>
        <img src={player.current.art ?? ""} alt="" class:empty={!player.current.art} />
        <span class="queue-meta">
          <strong>{player.current.title}</strong>
          <small>{player.current.artist} — {player.current.album}</small>
        </span>
      </button>
    {/if}

    <div class="queue-heading">
      <h2>Playing Next</h2>
      <span>{Math.max(0, player.currentIndex + 1)} of {player.queue.length}</span>
    </div>

    <div class="queue-list">
      {#each upcoming as track, i (track.path + i)}
        <button class="queue-row" onclick={() => player.playIndex(player.currentIndex + i + 1)}>
          <span class="queue-number">{player.currentIndex + i + 2}</span>
          <img src={track.art ?? ""} alt="" class:empty={!track.art} />
          <span class="queue-meta">
            <strong>{track.title}</strong>
            <small>{track.artist} — {track.album}</small>
          </span>
        </button>
      {/each}
      {#if !upcoming.length}
        <p class="queue-empty">Nothing after this one.</p>
      {/if}
    </div>
  </div>
{/snippet}

<style>
  .solarium {
    --sol-text: rgba(255, 255, 255, 0.96);
    --sol-muted: rgba(255, 255, 255, 0.72);
    /* Every pane of glass in here is the cover's own deep tone over black, so
       the chrome is lit by the record rather than painted on top of it. */
    --sol-glass: color-mix(in srgb, var(--sol-deep, #201018) 52%, rgba(14, 6, 12, 0.5));
    --sol-glass-strong: color-mix(in srgb, var(--sol-deep, #201018) 62%, rgba(10, 4, 9, 0.62));
    --sol-hairline: rgba(255, 255, 255, 0.16);
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

  .stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    transition: grid-template-columns 380ms var(--motion-spring);
  }
  .stage.with-side {
    grid-template-columns: minmax(0, 1fr) minmax(360px, 46%);
  }
  .art-region {
    position: relative;
    min-width: 0;
    overflow: hidden;
  }
  /* Sized in JS: the cover math needs the region's pixels, and a CSS-only
     `cover` of an arbitrary ratio inside an arbitrary box doesn't exist. */
  .art-frame {
    position: absolute;
    transition:
      width 380ms var(--motion-spring),
      height 380ms var(--motion-spring),
      left 380ms var(--motion-spring),
      top 380ms var(--motion-spring);
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
  .art-frame[data-mask="radial"] {
    -webkit-mask-image: radial-gradient(
      ellipse 74% 74% at 50% 50%,
      #000 34%,
      rgba(0, 0, 0, 0.72) 62%,
      transparent 92%
    );
    mask-image: radial-gradient(
      ellipse 74% 74% at 50% 50%,
      #000 34%,
      rgba(0, 0, 0, 0.72) 62%,
      transparent 92%
    );
  }
  /* Two straight fades intersected: a soft-edged rectangle rather than an
     ellipse, which keeps a wide crop reading as a wide crop. */
  .art-frame[data-mask="linear"] {
    -webkit-mask-image:
      linear-gradient(to right, transparent 0%, #000 17%, #000 83%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%);
    mask-image:
      linear-gradient(to right, transparent 0%, #000 17%, #000 83%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
  }

  .side {
    display: flex;
    gap: 16px;
    min-width: 0;
    padding: 58px 28px 118px;
  }
  .card {
    flex: 1;
    min-width: 0;
    border-radius: 26px;
    border: 1px solid var(--sol-hairline);
    background:
      linear-gradient(
        150deg,
        color-mix(in srgb, var(--sol-primary, #fff) 16%, transparent),
        color-mix(in srgb, var(--sol-secondary, #000) 10%, transparent)
      ),
      rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(26px) saturate(1.3);
    box-shadow: 0 30px 80px rgba(10, 3, 8, 0.26);
    overflow: hidden;
  }
  .queue-card {
    flex: 0 0 clamp(260px, 24vw, 340px);
  }
  .queue-float {
    position: absolute;
    z-index: 4;
    right: 28px;
    bottom: 118px;
    width: clamp(280px, 26vw, 360px);
    height: min(58vh, 560px);
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
    color: #fff;
    transform: none;
  }
  .lyrics-card :global(.line:hover) {
    background: rgba(255, 255, 255, 0.08);
  }

  .compact-slot {
    position: absolute;
    z-index: 4;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    width: min(760px, 82vw);
    transition: bottom 300ms var(--motion-spring);
  }
  /* Steps up over the transport when the transport is on screen, and drops back
     into its place when the chrome fades out. */
  .compact-slot.raised {
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
    border-radius: 12px;
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass);
    backdrop-filter: blur(28px) saturate(1.4);
    box-shadow: 0 12px 34px rgba(12, 4, 10, 0.24);
  }
  .view-toggle button {
    width: 38px;
    height: 30px;
    border-radius: 9px;
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
    padding: 8px 14px;
    border-radius: 17px;
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass);
    backdrop-filter: blur(30px) saturate(1.5);
    box-shadow: 0 20px 54px rgba(12, 4, 10, 0.3);
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
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.82);
    white-space: nowrap;
  }

  .now-card {
    position: relative;
    width: clamp(280px, 34vw, 470px);
    min-width: 0;
    padding: 6px 14px 9px;
    border-radius: 11px;
    overflow: hidden;
    background: rgba(10, 4, 9, 0.34);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
  .now-meta {
    min-width: 0;
    text-align: center;
  }
  .now-title {
    font-size: 12.5px;
    font-weight: 720;
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

  .volume-wrap {
    position: relative;
  }
  .volume-pop {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    width: 130px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--sol-hairline);
    background: var(--sol-glass-strong);
    backdrop-filter: blur(28px) saturate(1.4);
    box-shadow: 0 16px 40px rgba(10, 3, 8, 0.34);
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
    backdrop-filter: blur(28px) saturate(1.4);
    box-shadow: 0 14px 36px rgba(12, 4, 10, 0.26);
    transition:
      background 160ms ease,
      color 160ms ease,
      transform 260ms var(--motion-spring);
  }
  .gear:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
    transform: rotate(45deg);
  }

  .queue-scroll {
    height: 100%;
    overflow-y: auto;
    padding: 18px 14px 24px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  }
  .queue-scroll h2 {
    font-size: 15px;
    font-weight: 740;
    margin: 0 0 8px 6px;
  }
  .queue-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 22px 6px 6px;
  }
  .queue-heading h2 {
    margin: 0;
  }
  .queue-heading span {
    font-size: 12px;
    color: var(--sol-muted);
  }
  .now-row,
  .queue-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 7px 6px;
    color: #fff;
    text-align: left;
    border-radius: 9px;
    transition: background 150ms ease, transform 220ms var(--motion-spring);
  }
  .now-row {
    background: rgba(255, 255, 255, 0.1);
  }
  .now-row:hover,
  .queue-row:hover {
    background: rgba(255, 255, 255, 0.16);
    transform: translateX(2px);
  }
  .queue-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0;
  }
  .now-row img,
  .queue-row img {
    width: 38px;
    height: 38px;
    flex: none;
    object-fit: cover;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.1);
  }
  img.empty {
    visibility: hidden;
  }
  .queue-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .queue-meta strong {
    font-size: 12.5px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .queue-meta small {
    font-size: 11.5px;
    color: var(--sol-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .queue-number {
    width: 20px;
    flex: none;
    text-align: right;
    font-size: 12px;
    color: var(--sol-muted);
    font-variant-numeric: tabular-nums;
  }
  .queue-empty {
    margin: 14px 6px;
    font-size: 12.5px;
    color: var(--sol-muted);
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.96);
    outline-offset: 3px;
  }

  @media (max-width: 1080px) {
    .stage.with-side {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 52%);
    }
    .side {
      padding: 54px 18px 112px;
      flex-direction: column;
    }
    .queue-card {
      flex: 1 1 40%;
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
    .stage,
    .art-frame,
    .compact-slot,
    .ctl,
    .gear,
    .now-row,
    .queue-row {
      transition: none;
    }
    .gear:hover {
      transform: none;
    }
  }
</style>

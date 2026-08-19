<script lang="ts">
  //! The miniplayer: the whole player in a window you can leave in a corner.
  //!
  //! It holds no playback of its own — the sound is made in the main window,
  //! which owns the audio element. Everything here is a mirror fed over Tauri
  //! events (see miniBridge), and every control is a message back. That is the
  //! only way a second window can play at all, and it has one good
  //! consequence: closing this window cannot interrupt the music.
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { mini, sendCommand } from "$lib/miniBridge.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";
  import SidebarIcon from "$lib/icons/SidebarIcon.svelte";

  type View = "art" | "lyrics" | "queue";
  let view = $state<View>("art");
  let pinned = $state(true);
  let seeking = $state(false);
  let seekValue = $state(0);

  /** Named `snap`, not `state`: a local called `state` turns every `$state`
   *  rune in this file into a store subscription on it. */
  const snap = $derived(mini.state);
  const track = $derived(snap.track);
  const pos = $derived(seeking ? seekValue : mini.position);
  const remaining = $derived(Math.max(0, snap.duration - pos));

  /** Which lyric line is being sung — the same rule the main window uses. */
  const activeLine = $derived.by(() => {
    const lines = snap.lines;
    let found = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t > pos) break;
      found = i;
    }
    return found;
  });

  /** Everything after the playing track. The queue arrives already bounded. */
  const upcoming = $derived(
    snap.queueIndex >= 0 ? snap.queue.slice(snap.queueIndex + 1) : snap.queue,
  );

  let lyricsEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const i = activeLine;
    if (i < 0 || view !== "lyrics" || !lyricsEl) return;
    const el = lyricsEl.querySelector<HTMLElement>('[data-i="' + i + '"]');
    if (!el) return;
    const box = lyricsEl.getBoundingClientRect();
    const line = el.getBoundingClientRect();
    lyricsEl.scrollTo({
      top: lyricsEl.scrollTop + line.top - box.top - (lyricsEl.clientHeight - line.height) / 2,
      behavior: "smooth",
    });
  });

  function clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function scrub(e: Event) {
    seeking = true;
    seekValue = +(e.currentTarget as HTMLInputElement).value;
  }

  function commitScrub() {
    seeking = false;
    mini.anchor(seekValue);
    sendCommand({ action: "seek", value: seekValue });
  }

  async function togglePin() {
    pinned = !pinned;
    try {
      await invoke("set_miniplayer_pinned", { pinned });
    } catch (e) {
      console.error("couldn't change always-on-top:", e);
    }
  }

  onMount(() => {
    void mini.start();
    return () => mini.stop();
  });
</script>

<div class="mini">
  <!-- The artwork is the window's background in every view, blurred out of the
       way behind the lyrics and the queue. It is the one thing that makes this
       read as *this song's* player rather than as a generic remote. -->
  {#if track?.art}
    <img class="wash" src={track.art} alt="" aria-hidden="true" />
  {/if}

  <div class="body">
    {#if view === "art"}
      <div class="cover-art">
        {#if track?.art}
          <img src={track.art} alt="" />
        {:else}
          <div class="no-art"><ImmersiveIcon name="queue" size={40} /></div>
        {/if}
      </div>
    {:else if view === "lyrics"}
      <div class="lyrics" bind:this={lyricsEl}>
        {#if snap.lines.length}
          {#each snap.lines as line, i (i)}
            <button
              class="line"
              class:active={i === activeLine}
              class:past={i < activeLine}
              data-i={i}
              onclick={() => sendCommand({ action: "seek", value: line.t })}
            >
              {line.text || "♪"}
            </button>
          {/each}
        {:else if snap.plain.trim()}
          <p class="plain">{snap.plain}</p>
        {:else}
          <p class="none">No lyrics for this one.</p>
        {/if}
      </div>
    {:else}
      <div class="queue">
        {#if track}
          <h2>Now Playing</h2>
          <div class="row current">
            <img src={track.art ?? ""} alt="" class:blank={!track.art} />
            <span class="meta">
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
          </div>
        {/if}
        <h2>Continue Playing</h2>
        {#each upcoming as item, i (item.path + i)}
          <button
            class="row"
            onclick={() => sendCommand({ action: "playIndex", value: snap.queueIndex + 1 + i })}
          >
            <img src={item.art ?? ""} alt="" class:blank={!item.art} />
            <span class="meta">
              <strong>{item.title}</strong>
              <small>{item.artist}</small>
            </span>
          </button>
        {/each}
        {#if !upcoming.length}
          <p class="none">Nothing queued after this.</p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- One bar, always in the same place, whatever the view above it is. -->
  <footer class="bar">
    {#if view === "art"}
      <div class="now">
        <strong>{track?.title ?? "Not Playing"}</strong>
        <small>{track?.artist ?? ""}</small>
      </div>
    {:else}
      <div class="mini-now">
        <img src={track?.art ?? ""} alt="" class:blank={!track?.art} />
        <span class="meta">
          <strong>{track?.title ?? "Not Playing"}</strong>
          <small>{track?.artist ?? ""}</small>
        </span>
      </div>
    {/if}

    <div class="seek">
      <span class="t">{clock(pos)}</span>
      <input
        type="range"
        min="0"
        max={snap.duration || 0}
        step="0.1"
        value={pos}
        aria-label="Seek"
        disabled={!snap.duration}
        oninput={scrub}
        onchange={commitScrub}
      />
      <span class="t">-{clock(remaining)}</span>
    </div>

    <div class="controls">
      <button
        class="ctl"
        class:on={pinned}
        title={pinned ? "Unpin from top" : "Keep on top"}
        aria-label="Keep on top"
        onclick={togglePin}
      >
        <SidebarIcon name="pin" size={15} />
      </button>
      <button
        class="ctl"
        class:on={mini.shuffled}
        title="Shuffle"
        aria-label="Shuffle"
        onclick={() => sendCommand({ action: "shuffle" })}
      >
        <ImmersiveIcon name="shuffle" size={16} />
      </button>
      <button
        class="ctl"
        title="Previous"
        aria-label="Previous"
        onclick={() => sendCommand({ action: "prev" })}
      >
        <ImmersiveIcon name="previous" size={17} />
      </button>
      <button
        class="ctl play"
        title={mini.playing ? "Pause" : "Play"}
        aria-label="Play or pause"
        onclick={() => sendCommand({ action: "toggle" })}
      >
        <ImmersiveIcon name={mini.playing ? "pause" : "play"} size={20} />
      </button>
      <button
        class="ctl"
        title="Next"
        aria-label="Next"
        onclick={() => sendCommand({ action: "next" })}
      >
        <ImmersiveIcon name="next" size={17} />
      </button>
      <button
        class="ctl"
        class:on={mini.repeat !== "off"}
        title={mini.repeat === "one" ? "Repeat one" : "Repeat"}
        aria-label="Repeat"
        onclick={() => sendCommand({ action: "repeat" })}
      >
        <ImmersiveIcon name={mini.repeat === "one" ? "infinity" : "repeat"} size={16} />
      </button>
      <button
        class="ctl"
        class:on={snap.liked}
        title={snap.liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
        aria-label="Like"
        onclick={() => sendCommand({ action: "like" })}
      >
        <ImmersiveIcon name="star" size={15} />
      </button>
      <button
        class="ctl"
        class:on={view === "lyrics"}
        title="Lyrics"
        aria-label="Lyrics"
        onclick={() => (view = view === "lyrics" ? "art" : "lyrics")}
      >
        <ImmersiveIcon name="lyrics" size={16} />
      </button>
      <button
        class="ctl"
        class:on={view === "queue"}
        title="Queue"
        aria-label="Queue"
        onclick={() => (view = view === "queue" ? "art" : "queue")}
      >
        <ImmersiveIcon name="queue" size={16} />
      </button>
    </div>
  </footer>
</div>

<style>
  :global(body) {
    overflow: hidden;
    background: #17121a;
  }
  .mini {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #fff;
    background: #17121a;
  }
  /* The cover, blown up and blurred, as the room the window sits in. Cheap:
     one static image with a filter, no shader and nothing per frame. */
  .wash {
    position: absolute;
    inset: -18%;
    width: 136%;
    height: 136%;
    object-fit: cover;
    filter: blur(46px) saturate(1.5) brightness(0.42);
    pointer-events: none;
  }

  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .cover-art {
    position: absolute;
    inset: 0;
  }
  .cover-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .no-art {
    display: grid;
    place-items: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.35);
  }

  .lyrics {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: 22% 18px 26%;
    scrollbar-width: none;
  }
  .lyrics::-webkit-scrollbar {
    width: 0;
  }
  .line {
    display: block;
    width: 100%;
    text-align: left;
    font-family: var(--font-lyrics);
    font-size: 19px;
    font-weight: 700;
    line-height: 1.32;
    padding: 7px 4px;
    color: #fff;
    opacity: 0.34;
    transition: opacity 220ms;
  }
  .line.past {
    opacity: 0.2;
  }
  .line.active {
    opacity: 1;
  }
  .plain,
  .none {
    padding: 12px 4px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    white-space: pre-wrap;
    line-height: 1.6;
  }

  .queue {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: 12px 12px 20px;
    scrollbar-width: none;
  }
  .queue::-webkit-scrollbar {
    width: 0;
  }
  .queue h2 {
    font-size: 15px;
    font-weight: 750;
    margin: 10px 4px 8px;
  }
  .row {
    width: 100%;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 6px;
    border-radius: 9px;
    text-align: left;
    color: #fff;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.09);
  }
  .row.current {
    background: rgba(255, 255, 255, 0.12);
  }
  .row img {
    width: 42px;
    height: 42px;
    border-radius: 6px;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.08);
  }
  .row img.blank {
    visibility: hidden;
  }
  .meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .meta strong,
  .meta small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta strong {
    font-size: 12.5px;
    font-weight: 650;
  }
  .meta small {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.62);
    margin-top: 1px;
  }

  .bar {
    position: relative;
    flex: none;
    padding: 10px 12px 12px;
    background: linear-gradient(to top, rgba(10, 6, 12, 0.95), rgba(10, 6, 12, 0.74));
    backdrop-filter: blur(14px);
  }
  .now {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-bottom: 8px;
  }
  .now strong {
    font-size: 14px;
    font-weight: 700;
  }
  .now strong,
  .now small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .now small {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.65);
    margin-top: 2px;
  }
  .mini-now {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    margin-bottom: 8px;
  }
  .mini-now img {
    width: 34px;
    height: 34px;
    border-radius: 5px;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.08);
  }
  .mini-now img.blank {
    visibility: hidden;
  }

  .seek {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .t {
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.68);
  }
  .seek input {
    width: 100%;
    accent-color: #fff;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
    margin-top: 8px;
  }
  .ctl {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.72);
    transition:
      background 140ms,
      color 140ms;
  }
  .ctl:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  .ctl.on {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
  }
  .ctl.play {
    width: 34px;
    height: 34px;
    color: #fff;
  }
</style>

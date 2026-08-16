<script lang="ts">
  //! Solarium's queue card. One component for both homes: the card beside the
  //! artwork when Queue On Side is on, and the one floating over it when it's
  //! off. Same content either way — a row of pills up top (the queue's own
  //! shuffle / repeat / autoplay, the count, and how long is left and when
  //! that lands), Now Playing, then what's next.
  import { player, formatTime } from "$lib/player.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";

  let { variant = "side" }: { variant?: "side" | "float" } = $props();

  const upcoming = $derived(player.queue.slice(Math.max(0, player.currentIndex + 1)));
  const played = $derived(Math.max(0, player.currentIndex));

  /** Seconds of music still to come, this track's remainder included. */
  const remaining = $derived(
    Math.max(0, (player.current?.duration ?? 0) - player.position) +
      upcoming.reduce((s, t) => s + t.duration, 0),
  );
  const remainingLabel = $derived.by(() => {
    const m = Math.round(remaining / 60);
    if (m < 1) return "<1 min";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h} h ${m % 60} min`;
  });
  // Re-derives with `remaining`, which moves with the playhead, so the clock
  // stays honest without its own timer.
  const endsAt = $derived(
    new Date(Date.now() + remaining * 1000).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
  );
</script>

<div class="queue" class:float={variant === "float"}>
  <div class="pills">
    <span class="pill icon-pill" title="Queue"><ImmersiveIcon name="queue" size={15} /></span>
    <span class="pill group" role="group" aria-label="Queue options">
      <button
        class:on={player.shuffled}
        title="Shuffle"
        aria-label="Shuffle"
        aria-pressed={player.shuffled}
        onclick={() => player.toggleShuffle()}
      >
        <ImmersiveIcon name="shuffle" size={15} />
      </button>
      <button
        class:on={player.repeat !== "off"}
        title="Repeat"
        aria-label="Repeat"
        onclick={() => player.cycleRepeat()}
      >
        <ImmersiveIcon name="repeat" size={15} />
        {#if player.repeat === "one"}<span class="one">1</span>{/if}
      </button>
      <button
        class:on={player.autoplay}
        title="Autoplay"
        aria-label="Autoplay"
        aria-pressed={player.autoplay}
        onclick={() => player.toggleAutoplay()}
      >
        <ImmersiveIcon name="infinity" size={15} />
      </button>
    </span>
    <span class="pill">{player.queue.length} {player.queue.length === 1 ? "item" : "items"}</span>
    {#if variant === "side" && player.current}
      {@render timePill()}
    {/if}
  </div>

  <div class="scroll">
    <div class="heading">
      <h2>Now Playing</h2>
      {#if played > 0}
        <span class="badge" title="{played} played">
          <ImmersiveIcon name="history" size={12} />
          {played}
        </span>
      {/if}
    </div>
    {#if player.current}
      <button class="row now" onclick={() => player.playIndex(player.currentIndex)}>
        <img src={player.current.art ?? ""} alt="" class:empty={!player.current.art} />
        <span class="meta">
          <strong>{player.current.title}</strong>
          <small>{player.current.artist} – {player.current.album}</small>
        </span>
      </button>
    {:else}
      <p class="empty">Nothing playing.</p>
    {/if}

    {#if upcoming.length}
      <div class="heading next">
        <h2>Playing Next</h2>
        <span class="count">{upcoming.length}</span>
      </div>
      <div class="list">
        {#each upcoming as track, i (track.path + i)}
          <button class="row" onclick={() => player.playIndex(player.currentIndex + i + 1)}>
            <img src={track.art ?? ""} alt="" class:empty={!track.art} />
            <span class="meta">
              <strong>{track.title}</strong>
              <small>{track.artist} – {track.album}</small>
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if player.autoplay}
      <div class="autoplay">
        <ImmersiveIcon name="infinity" size={18} />
        <div>
          <h2>AutoPlay</h2>
          <p>Similar music will continue playing.</p>
        </div>
      </div>
    {:else if !upcoming.length}
      <p class="empty">Nothing after this one.</p>
    {/if}
  </div>

  {#if variant === "float" && player.current}
    <div class="float-time">
      {@render timePill()}
    </div>
  {/if}
</div>

{#snippet timePill()}
  <span class="pill time" title="Time left in the queue, and when it ends">
    <ImmersiveIcon name="clock" size={13} />
    <strong>{remainingLabel}</strong>
    <span class="arrow">→</span>
    <span>{endsAt}</span>
  </span>
{/snippet}

<style>
  .queue {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.94);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px 22px 4px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 13px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 700;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.92);
    background: rgb(var(--sol-ink-rgb, 255 255 255) / 0.12);
    box-shadow: inset 0 1px 0 rgb(var(--sol-ink-rgb, 255 255 255) / 0.22);
  }
  .icon-pill {
    padding: 0 12px;
  }
  .group {
    gap: 2px;
    padding: 0 6px;
  }
  .group button {
    position: relative;
    width: 30px;
    height: 28px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.72);
    transition: background 140ms ease, color 140ms ease;
  }
  .group button:hover {
    color: var(--sol-ink, #fff);
    background: rgb(var(--sol-ink-rgb, 255 255 255) / 0.14);
  }
  .group button.on {
    color: var(--sol-ink, #fff);
    background: rgb(var(--sol-ink-rgb, 255 255 255) / 0.22);
  }
  .one {
    position: absolute;
    font-size: 7px;
    font-weight: 800;
  }
  /* The one coloured thing on the card: it answers a question ("when will
     this be over?") rather than naming a control. */
  .pill.time {
    background: linear-gradient(120deg, rgba(255, 90, 140, 0.92), rgba(255, 60, 110, 0.86));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.34),
      0 8px 22px rgba(255, 60, 110, 0.32);
    color: #fff;
  }
  .pill.time :global(svg) {
    color: #fff;
  }
  .pill.time strong {
    font-weight: 800;
  }
  .pill.time .arrow {
    opacity: 0.8;
  }
  .float-time {
    position: absolute;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    z-index: 2;
  }
  .float .scroll {
    padding-bottom: 76px;
  }

  .scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 12px 22px 22px;
    scrollbar-width: thin;
    scrollbar-color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.28) transparent;
  }
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 6px 4px 8px;
  }
  .heading.next {
    margin-top: 22px;
  }
  h2 {
    font-size: 15.5px;
    font-weight: 750;
    margin: 0;
  }
  .badge,
  .count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.85);
    background: rgb(var(--sol-ink-rgb, 255 255 255) / 0.12);
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 8px;
    color: var(--sol-ink, #fff);
    text-align: left;
    border-radius: 12px;
    transition: background 150ms ease, transform 220ms var(--motion-spring);
  }
  .row.now {
    background: rgb(var(--sol-ink-rgb, 255 255 255) / 0.1);
    box-shadow: inset 0 1px 0 rgb(var(--sol-ink-rgb, 255 255 255) / 0.14);
    padding: 9px 10px;
  }
  .row:hover {
    background: rgb(var(--sol-ink-rgb, 255 255 255) / 0.15);
    transform: translateX(2px);
  }
  .list .row {
    border-radius: 0;
    border-bottom: 1px solid rgb(var(--sol-ink-rgb, 255 255 255) / 0.1);
  }
  .list .row:hover {
    border-radius: 12px;
    border-bottom-color: transparent;
  }
  .row img {
    width: 44px;
    height: 44px;
    flex: none;
    object-fit: cover;
    border-radius: 7px;
    background: rgb(var(--sol-ink-rgb, 255 255 255) / 0.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
  }
  img.empty {
    visibility: hidden;
  }
  .meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .meta strong {
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta small {
    font-size: 12px;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.72);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .autoplay {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 22px 4px 8px;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.92);
  }
  .autoplay h2 {
    margin: 0 0 2px;
  }
  .autoplay p {
    margin: 0;
    font-size: 12.5px;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.72);
  }
  .empty {
    margin: 12px 8px;
    font-size: 12.5px;
    color: rgb(var(--sol-ink-rgb, 255 255 255) / 0.66);
  }
  button:focus-visible {
    outline: 2px solid rgb(var(--sol-ink-rgb, 255 255 255) / 0.9);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .row {
      transition: none;
    }
  }
</style>

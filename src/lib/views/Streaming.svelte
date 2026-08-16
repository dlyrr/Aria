<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { nav } from "$lib/nav.svelte";
  import { player, formatTime } from "$lib/player.svelte";
  import { streaming, SERVICES, type ServiceId, type StreamTrack } from "$lib/streaming.svelte";
  import Artwork from "$lib/Artwork.svelte";
  import NowPlayingWaveform from "$lib/NowPlayingWaveform.svelte";

  /** The sidebar opens this view per service; no param means search them all. */
  const scoped = $derived(
    SERVICES.find((s) => s.id === nav.param && streaming.enabled[s.id]) ?? null,
  );
  const title = $derived(scoped ? scoped.label : "Streaming");

  let term = $state(streaming.query);
  let debounce = 0;

  /** Re-run the last query when you switch services, so the results on screen
   *  always belong to the heading above them. */
  let lastScope: ServiceId | "all" | null = null;
  $effect(() => {
    const scope = scoped?.id ?? "all";
    if (lastScope === scope) return;
    lastScope = scope;
    if (term.trim()) void streaming.search(term, scoped?.id ?? null);
    else streaming.results = [];
  });

  function onInput(e: Event) {
    term = (e.target as HTMLInputElement).value;
    clearTimeout(debounce);
    debounce = setTimeout(() => void streaming.search(term, scoped?.id ?? null), 400);
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    clearTimeout(debounce);
    void streaming.search(term, scoped?.id ?? null);
  }

  function play(index: number) {
    player.setQueue(streaming.results.map((r) => streaming.toTrack(r)), index);
  }

  function isCurrent(result: StreamTrack) {
    return player.current?.path === result.stream;
  }
</script>

<div class="view">
  <div class="header">
    <div>
      <div class="view-title">{title}</div>
      <p class="desc">
        {#if scoped}
          Searching {scoped.label}. What plays here is the 30-second preview
          {scoped.label} publishes — the button on each row opens the full track on the
          service.
        {:else}
          Searching {streaming.active.map((s) => s.label).join(" and ")}. What plays here is
          the 30-second preview each service publishes — the button on each row opens the
          full track on the service.
        {/if}
      </p>
    </div>
  </div>

  {#if !streaming.any}
    <div class="empty">
      No services are switched on.
      <button class="text-link" onclick={() => nav.go("settings")}>
        Turn one on in Settings
      </button>
    </div>
  {:else}
    <form class="search" onsubmit={onSubmit}>
      <input
        aria-label={`Search ${title}`}
        placeholder="Search for a song, artist, or album"
        value={term}
        oninput={onInput}
      />
      <button class="pill-btn filled" type="submit" disabled={streaming.searching}>
        {streaming.searching ? "Searching…" : "Search"}
      </button>
    </form>

    {#if streaming.lastError}
      <div class="notice" role="alert">{streaming.lastError}</div>
    {/if}

    {#if streaming.results.length > 0}
      <div class="list">
        {#each streaming.results as result, i (result.service + result.id + i)}
          <div
            class="row"
            class:current={isCurrent(result)}
            role="button"
            tabindex="0"
            onclick={() => play(i)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                play(i);
              }
            }}
          >
            <div class="art">
              <Artwork src={result.art} size="40px" radius="6px" />
              {#if isCurrent(result)}
                <span class="playing">
                  <NowPlayingWaveform playing={player.playing} bands={player.analyzerBands} />
                </span>
              {/if}
            </div>
            <div class="copy">
              <strong>{result.title}</strong>
              <small>{result.artist}{result.album ? ` — ${result.album}` : ""}</small>
            </div>
            <span class="badge">{streaming.label(result.service)}</span>
            <span class="len">
              {result.duration > 0 ? formatTime(result.duration) : ""}
            </span>
            {#if result.page}
              <button
                class="open"
                title={`Open on ${streaming.label(result.service)}`}
                onclick={(e) => {
                  e.stopPropagation();
                  openUrl(result.page!);
                }}
              >
                Open ↗
              </button>
            {/if}
          </div>
        {/each}
      </div>
      <p class="foot">
        Previews only — full playback needs a paid account and the service's own DRM, which
        Aria's window can't run.
      </p>
    {:else if streaming.searching}
      <div class="empty">Searching…</div>
    {:else if streaming.searched}
      <div class="empty">Nothing found for “{streaming.query}”.</div>
    {:else}
      <div class="empty">Search {title} to hear something that isn't on your disk yet.</div>
    {/if}
  {/if}
</div>

<style>
  .header {
    max-width: 720px;
  }
  .desc {
    color: var(--text-dim);
    font-size: 13px;
    margin: -14px 0 18px;
  }
  .search {
    display: flex;
    gap: 8px;
    max-width: 620px;
    margin-bottom: 18px;
  }
  .search input {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 980px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    padding: 0 16px;
    outline: none;
  }
  .search input:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    cursor: default;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.current {
    background: var(--active);
  }
  .row.current .copy strong {
    color: var(--accent);
  }
  .art {
    position: relative;
    flex: none;
  }
  /* Sits over the cover the way the library's lists mark their current row. */
  .playing {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 6px;
  }
  .copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .copy strong {
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .copy small {
    color: var(--text-dim);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Which catalogue a row came from — the two overlap, and the lists are
     interleaved, so the answer has to be on the row itself. */
  .badge {
    flex: none;
    font-size: 11px;
    font-weight: 650;
    color: var(--text-dim);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 980px;
    padding: 2px 9px;
  }
  .len {
    flex: none;
    width: 44px;
    text-align: right;
    font-size: 12px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .open {
    flex: none;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-faint);
    padding: 4px 8px;
    border-radius: 6px;
  }
  .open:hover {
    background: var(--active);
    color: var(--accent);
  }
  .notice {
    max-width: 620px;
    margin-bottom: 14px;
    color: var(--danger);
    font-size: 12px;
  }
  .empty {
    color: var(--text-dim);
    padding: 26px 0;
    font-size: 13px;
  }
  .foot {
    margin-top: 18px;
    color: var(--text-faint);
    font-size: 12px;
  }
  .text-link {
    color: var(--accent);
    font-size: 13px;
    font-weight: 650;
    padding: 0 0 0 4px;
  }
</style>

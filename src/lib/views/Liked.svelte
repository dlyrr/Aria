<script lang="ts">
  //! Liked Songs — every track you've favourited, newest first.
  //!
  //! A view rather than a real playlist, and deliberately so: a playlist is a
  //! thing you arrange, and this one's order is a fact about when you pressed
  //! the star. Nothing here can be reordered or removed by dragging, only
  //! unliked, which is exactly the shape of the thing it's modelled on.
  import { library } from "$lib/library.svelte";
  import { player } from "$lib/player.svelte";
  import { nav } from "$lib/nav.svelte";
  import Artwork from "$lib/Artwork.svelte";
  import TrackList from "$lib/TrackList.svelte";

  const liked = $derived(library.likedTracks);

  /** The search box filters here too, the way it does on every other list. */
  const shown = $derived.by(() => {
    const q = nav.query.trim().toLowerCase();
    if (!q) return liked;
    return liked.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    );
  });

  /** Four covers for the tile, oldest of the newest first — a collage, not a grid. */
  const mosaic = $derived(
    liked
      .map((t) => t.art)
      .filter((a): a is string => !!a)
      .slice(0, 4),
  );

  const totalMinutes = $derived(
    Math.round(liked.reduce((sum, t) => sum + t.duration, 0) / 60),
  );

  function play(index: number) {
    player.setQueue(shown, index);
  }
</script>

<div class="liked">
  <header class="head">
    <!-- The tile is made of the music in it. With nothing liked yet it's the
         empty heart, which is the only honest picture of an empty list. -->
    <div class="tile" class:collage={mosaic.length > 1}>
      {#if mosaic.length > 1}
        {#each mosaic as art (art)}
          <img src={art} alt="" />
        {/each}
      {:else if mosaic.length === 1}
        <Artwork src={mosaic[0]} size="100%" radius="0" />
      {:else}
        <span class="heart" aria-hidden="true">♥</span>
      {/if}
    </div>

    <div class="meta">
      <span class="kind">Playlist</span>
      <h1>Liked Songs</h1>
      <p class="count">
        {liked.length}
        {liked.length === 1 ? "song" : "songs"}
        {#if totalMinutes > 0}<span class="dot">·</span>{totalMinutes} min{/if}
      </p>
      <div class="actions">
        <button class="pill-btn filled" disabled={!shown.length} onclick={() => play(0)}>
          Play
        </button>
        <button
          class="pill-btn"
          disabled={!shown.length}
          onclick={() => {
            player.setQueue(shown, 0);
            if (!player.shuffled) player.toggleShuffle();
          }}
        >
          Shuffle
        </button>
      </div>
    </div>
  </header>

  {#if !liked.length}
    <p class="empty">
      Nothing liked yet. Press the star on a track — in the player, in immersive,
      or from its right-click menu — and it lands here.
    </p>
  {:else if !shown.length}
    <p class="empty">No liked song matches “{nav.query}”.</p>
  {:else}
    <TrackList tracks={shown} onplay={play} showArt={true} />
  {/if}
</div>

<style>
  .liked {
    height: 100%;
    overflow-y: auto;
    padding: 24px 26px 60px;
  }
  .head {
    display: flex;
    align-items: flex-end;
    gap: 22px;
    margin-bottom: 26px;
  }
  .tile {
    width: 188px;
    height: 188px;
    flex-shrink: 0;
    border-radius: 12px;
    overflow: hidden;
    display: grid;
    place-items: center;
    /* The gradient is the fallback *and* the ground the collage sits on, so a
       library with three liked songs doesn't show a hole in the fourth cell. */
    background: linear-gradient(150deg, var(--accent), color-mix(in srgb, var(--accent) 30%, #101014));
    box-shadow: var(--art-shadow);
  }
  .tile.collage {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    place-items: stretch;
  }
  .tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .heart {
    font-size: 68px;
    color: #fff;
    opacity: 0.9;
    line-height: 1;
  }
  .meta {
    min-width: 0;
  }
  .kind {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
  }
  h1 {
    font-size: clamp(30px, 4vw, 54px);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.05;
    margin: 4px 0 8px;
  }
  .count {
    color: var(--text-dim);
    font-size: 13px;
  }
  .dot {
    margin: 0 6px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
  .empty {
    color: var(--text-dim);
    font-size: 13.5px;
    max-width: 52ch;
    padding: 8px 2px;
    line-height: 1.6;
  }
</style>

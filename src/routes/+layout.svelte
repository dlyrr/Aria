<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { player } from "$lib/player.svelte";
  import { library } from "$lib/library.svelte";
  import { layout } from "$lib/layout.svelte";
  import { lastfm } from "$lib/lastfm.svelte";
  import { discord } from "$lib/discord.svelte";
  import { streaming } from "$lib/streaming.svelte";
  import { theme } from "$lib/theme.svelte";
  import { lyricsStyle } from "$lib/lyricsStyle.svelte";
  import { immersiveStyle } from "$lib/immersiveStyle.svelte";
  import { isMiniWindow } from "$lib/miniBridge.svelte";
  import { serveMiniplayer } from "$lib/miniServer.svelte";

  let { children } = $props();

  function onRefreshShortcut(event: KeyboardEvent) {
    const refresh =
      event.key === "F5" ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r");
    if (!refresh) return;
    event.preventDefault();
    void library.rescan();
  }

  onMount(() => {
    theme.load();
    // The miniplayer is a second webview of the same bundle. It must not start
    // a player of its own — that would be a second audio element decoding the
    // same file — nor scan the library, nor scrobble. It mirrors the main
    // window over events instead; see miniBridge.
    if (isMiniWindow()) return;

    lyricsStyle.load();
    immersiveStyle.load();
    layout.load();
    player.init();
    library.load();
    lastfm.load();
    discord.load();
    streaming.load();
    return serveMiniplayer();
  });
</script>

<svelte:window onkeydown={onRefreshShortcut} />

{@render children()}

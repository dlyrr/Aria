<script lang="ts">
  //! Picks the immersive mode and hosts what the two of them share.
  //!
  //! The modes are whole screens rather than variants of one screen, so they
  //! are separate components; the right-click menu, the settings dock and the
  //! button cluster are not, so they live here and outlive a switch between
  //! them.
  import { fade } from "svelte/transition";
  import ImmersiveOne from "$lib/ImmersiveOne.svelte";
  import Solarium from "$lib/Solarium.svelte";
  import OneClassic from "$lib/OneClassic.svelte";
  import MinimalImmersive from "$lib/MinimalImmersive.svelte";
  import SpectrumDeck from "$lib/SpectrumDeck.svelte";
  import ImmersiveChrome from "$lib/ImmersiveChrome.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";
  import { immersiveStyle } from "$lib/immersiveStyle.svelte";
  import { ui } from "$lib/ui.svelte";
  import { glass } from "$lib/liquidGlass";
  import type { ArtworkPalette } from "$lib/accent";

  let {
    backdrop,
  }: {
    backdrop: { key: string; art: string | null; palette: ArtworkPalette };
  } = $props();

  /** The settings dock, docked to the left edge. */
  let appearance = $state(false);

  /** Whichever panel the mode is showing beside the artwork. */
  const lyricsOpen = $derived(
    immersiveStyle.mode === "solarium" ? ui.solLyrics : ui.panel === "lyrics",
  );

  function toggleLyrics() {
    if (immersiveStyle.mode === "solarium") ui.solLyrics = !ui.solLyrics;
    else ui.panel = ui.panel === "lyrics" ? "none" : "lyrics";
  }
</script>

<!--
  The mode is shifted and shrunk rather than covered.

  A settings dock over the top of the artwork hides the thing most of its
  controls are changing. Pushing the stage aside instead keeps the whole of it
  visible while you work — the point of a side dock over a centred dialog — and
  the inset corners make it read as a card that has been moved out of the way
  rather than as a window that has been cropped.

  `transform` on this wrapper also gives the mode's `position: fixed` children a
  containing block, so they scale with it instead of escaping to the viewport.
-->
<div class="immersive-stage" class:aside={appearance}>
  {#if immersiveStyle.mode === "solarium"}
    <Solarium {backdrop} onappearance={() => (appearance = true)} />
  {:else if immersiveStyle.mode === "classic"}
    <OneClassic {backdrop} onappearance={() => (appearance = true)} />
  {:else if immersiveStyle.mode === "minimal"}
    <MinimalImmersive {backdrop} onappearance={() => (appearance = true)} />
  {:else if immersiveStyle.mode === "spectrum"}
    <SpectrumDeck {backdrop} onappearance={() => (appearance = true)} />
  {:else}
    <ImmersiveOne {backdrop} />
  {/if}
</div>

<!-- Outside the shifted wrapper: the cluster is the thing doing the shifting,
     so it has to stay put while the stage moves under it. -->
<div
  class="cluster"
  role="group"
  aria-label="Immersive layout"
  use:glass={{ blur: 6, saturate: 1.6, bezel: 12, strength: 20, lens: 0.07 }}
  transition:fade={{ duration: 160 }}
>
  <button
    class="cluster-btn"
    class:on={appearance}
    title="Settings"
    aria-label="Settings"
    aria-pressed={appearance}
    onclick={() => (appearance = !appearance)}
  >
    <ImmersiveIcon name="sidebar" size={16} />
  </button>
  <button
    class="cluster-btn"
    class:on={lyricsOpen}
    title="Lyrics"
    aria-label="Lyrics"
    aria-pressed={lyricsOpen}
    onclick={toggleLyrics}
  >
    <ImmersiveIcon name="lyrics" size={16} />
  </button>
</div>

<ImmersiveChrome
  {appearance}
  onopen={() => (appearance = true)}
  onclose={() => (appearance = false)}
/>

<style>
  .immersive-stage {
    position: fixed;
    inset: 0;
    z-index: 60;
    transform-origin: center center;
    transition:
      transform 420ms var(--motion-spring),
      border-radius 420ms ease;
  }
  .immersive-stage.aside {
    /* Clears the 480px dock and leaves a margin the artwork can breathe in. */
    transform: translateX(260px) scale(0.74);
    border-radius: 20px;
    overflow: hidden;
  }

  .cluster {
    position: fixed;
    /* Below the traffic lights, which own the very corner. */
    top: 58px;
    left: 18px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(28, 16, 24, 0.34);
    backdrop-filter: blur(6px) saturate(1.6);
    box-shadow: 0 12px 34px rgba(12, 4, 10, 0.24);
  }
  .cluster-btn {
    width: 34px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.7);
    transition:
      background 150ms ease,
      color 150ms ease;
  }
  .cluster-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }
  .cluster-btn.on {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
  }

  @media (prefers-reduced-motion: reduce) {
    .immersive-stage {
      transition: none;
    }
  }
</style>

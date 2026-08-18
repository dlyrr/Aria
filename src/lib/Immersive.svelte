<script lang="ts">
  //! Picks the immersive mode and hosts what the two of them share.
  //!
  //! The modes are whole screens rather than variants of one screen, so they
  //! are separate components; the right-click menu and the settings dock are
  //! not, so they live here and outlive a switch between them.
  import ImmersiveOne from "$lib/ImmersiveOne.svelte";
  import Solarium from "$lib/Solarium.svelte";
  import OneClassic from "$lib/OneClassic.svelte";
  import MinimalImmersive from "$lib/MinimalImmersive.svelte";
  import SpectrumDeck from "$lib/SpectrumDeck.svelte";
  import ImmersiveChrome from "$lib/ImmersiveChrome.svelte";
  import { immersiveStyle } from "$lib/immersiveStyle.svelte";
  import { ui } from "$lib/ui.svelte";
  import type { ArtworkPalette } from "$lib/accent";

  let {
    backdrop,
  }: {
    backdrop: { key: string; art: string | null; palette: ArtworkPalette };
  } = $props();

  /**
   * Opening the dock is every mode's own business — each already has a row of
   * buttons with a place for it, so the state lives on `ui` and this component
   * only reacts to it.
   */
  const open = () => (ui.immersiveSidebar = true);
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
<div class="immersive-stage" class:aside={ui.immersiveSidebar}>
  {#if immersiveStyle.mode === "solarium"}
    <Solarium {backdrop} onappearance={open} />
  {:else if immersiveStyle.mode === "classic"}
    <OneClassic {backdrop} onappearance={open} />
  {:else if immersiveStyle.mode === "minimal"}
    <MinimalImmersive {backdrop} onappearance={open} />
  {:else if immersiveStyle.mode === "spectrum"}
    <SpectrumDeck {backdrop} onappearance={open} />
  {:else}
    <ImmersiveOne {backdrop} />
  {/if}
</div>

<ImmersiveChrome
  appearance={ui.immersiveSidebar}
  onopen={open}
  onclose={() => (ui.immersiveSidebar = false)}
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

  @media (prefers-reduced-motion: reduce) {
    .immersive-stage {
      transition: none;
    }
  }
</style>

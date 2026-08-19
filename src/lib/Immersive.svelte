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
  import DynamicBackground from "$lib/DynamicBackground.svelte";
  import WindowControls from "$lib/WindowControls.svelte";
  import { theme } from "$lib/theme.svelte";
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
<!--
  The colour field belongs to the window, not to the mode.

  Every mode used to carry its own, which was fine while a mode filled the
  screen — and wrong the moment the stage could be shifted aside, because the
  field went with it and left the settings dock sitting on bare black. One
  field, behind everything, and the stage floats on it.
-->
{#if theme.artworkField}
  <div class="immersive-field" aria-hidden="true">
    <DynamicBackground
      art={backdrop.art}
      palette={backdrop.palette}
      label="immersive"
      saturation={1.9}
    />
  </div>
{/if}

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

<!-- Outside the stage wrapper, because the traffic lights belong to the
     window: inside a mode they ride the shift transform and end up floating in
     the middle of the shrunken card rather than at the window's corner. -->
<div class="immersive-chrome">
  <WindowControls fullscreenAware />
</div>

<ImmersiveChrome
  appearance={ui.immersiveSidebar}
  onopen={open}
  onclose={() => (ui.immersiveSidebar = false)}
/>

<style>
  .immersive-field {
    position: fixed;
    inset: 0;
    z-index: 59;
    overflow: hidden;
    pointer-events: none;
    /* Black underneath, so the field's own gaps and the margin around a
       shifted stage are the same colour rather than whatever the app was
       showing before immersive opened. */
    background: #05020a;
  }
  .immersive-stage {
    position: fixed;
    inset: 0;
    z-index: 60;
    transform-origin: center center;
    transition:
      transform 420ms var(--motion-spring),
      border-radius 420ms ease;
  }
  .immersive-chrome {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2147483646;
    padding: 14px 16px;
  }
  .immersive-stage.aside {
    /* Sized so the whole card stays on screen: at 0.78 and a fixed 228px it
       ran off the right-hand edge, because the shift is applied after the
       scale and the two together were wider than the window. A percentage
       keeps the geometry right at any window size. */
    transform: translateX(13.5%) scale(0.7);
    border-radius: 22px;
    overflow: hidden;
    box-shadow: 0 40px 120px rgba(4, 1, 7, 0.5);
  }

  @media (prefers-reduced-motion: reduce) {
    .immersive-stage {
      transition: none;
    }
  }
</style>

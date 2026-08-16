<script lang="ts">
  //! Picks the immersive mode and hosts what the two of them share.
  //!
  //! The modes are whole screens rather than variants of one screen, so they
  //! are separate components; the right-click menu and the Appearance panel are
  //! not, so they live here and outlive a switch between them.
  import ImmersiveOne from "$lib/ImmersiveOne.svelte";
  import Solarium from "$lib/Solarium.svelte";
  import ImmersiveChrome from "$lib/ImmersiveChrome.svelte";
  import { immersiveStyle } from "$lib/immersiveStyle.svelte";
  import type { ArtworkPalette } from "$lib/accent";

  let {
    backdrop,
  }: {
    backdrop: { key: string; art: string | null; palette: ArtworkPalette };
  } = $props();

  /** The Appearance panel; it always opens centre-screen. */
  let appearance = $state(false);
</script>

{#if immersiveStyle.mode === "solarium"}
  <Solarium {backdrop} onappearance={() => (appearance = true)} />
{:else}
  <ImmersiveOne {backdrop} />
{/if}

<ImmersiveChrome
  {appearance}
  onopen={() => (appearance = true)}
  onclose={() => (appearance = false)}
/>

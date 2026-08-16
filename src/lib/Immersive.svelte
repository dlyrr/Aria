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

  /** Where the Appearance panel was summoned from; null while it is closed. */
  let appearance = $state<{ x: number; y: number } | null>(null);

  // A negative anchor means "nothing to sit beside" — the gear button, which is
  // itself in the corner the panel would tuck into.
  function openAppearance(x = -1, y = -1) {
    appearance = { x, y };
  }
</script>

{#if immersiveStyle.mode === "solarium"}
  <Solarium {backdrop} onappearance={openAppearance} />
{:else}
  <ImmersiveOne {backdrop} />
{/if}

<ImmersiveChrome
  {appearance}
  onopen={openAppearance}
  onclose={() => (appearance = null)}
/>

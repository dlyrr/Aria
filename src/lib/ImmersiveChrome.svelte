<script lang="ts">
  //! The right-click menu and the Appearance panel, shared by both immersive
  //! modes. It renders as a sibling of the mode component rather than inside
  //! it, so switching modes never takes the menu down with it.
  import { fade } from "svelte/transition";
  import { ui } from "$lib/ui.svelte";
  import {
    immersiveStyle,
    IMMERSIVE_MODES,
    ASPECT_RATIOS,
    type AspectRatio,
    type ImmersiveMode,
    type LyricsType,
    type MaskType,
  } from "$lib/immersiveStyle.svelte";
  import ImmersiveIcon from "$lib/icons/ImmersiveIcon.svelte";

  let {
    appearance,
    onopen,
    onclose,
  }: {
    /** Where the panel was asked for, or null when it is closed. */
    appearance: { x: number; y: number } | null;
    onopen: (x?: number, y?: number) => void;
    onclose: () => void;
  } = $props();

  let menu = $state<{ x: number; y: number } | null>(null);
  let menuEl = $state<HTMLElement | null>(null);
  let modeSubmenu = $state(false);

  let panelEl = $state<HTMLElement | null>(null);
  let panelLeft = $state(0);
  let panelTop = $state(0);
  let placed = $state(false);
  /** Which dropdown is expanded, by row key. */
  let openSelect = $state<string | null>(null);

  const solarium = $derived(immersiveStyle.mode === "solarium");

  // Tells the mode component to leave Escape alone while any of this is up.
  $effect(() => {
    ui.immersiveOverlay = !!menu || !!appearance || !!openSelect;
  });

  function onContextMenu(e: MouseEvent) {
    if (!ui.immersive) return;
    // Always swallow the webview's own menu inside immersive, including over
    // our panels — a native "Reload" item over the Appearance panel would be
    // the only thing on screen that isn't part of the mode.
    e.preventDefault();
    const target = e.target as HTMLElement | null;
    if (target?.closest(".imm-menu, .appearance")) return;
    modeSubmenu = false;
    menu = { x: e.clientX, y: e.clientY };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    // Escape closes what's on top first; only an empty screen exits immersive,
    // which is why this runs before the mode component's own handler.
    if (openSelect) {
      openSelect = null;
      e.stopPropagation();
    } else if (menu) {
      menu = null;
      e.stopPropagation();
    } else if (appearance) {
      onclose();
      e.stopPropagation();
    }
  }

  // Keep the menu on screen.
  const menuPos = $derived.by(() => {
    if (!menu) return { left: 0, top: 0 };
    const w = menuEl?.offsetWidth ?? 208;
    const h = menuEl?.offsetHeight ?? 150;
    return {
      left: Math.max(8, Math.min(menu.x, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - h - 8)),
    };
  });

  // Same for the panel, which is measured after it mounts: a negative anchor
  // means "no click to sit next to" (the gear button), so it tucks into the
  // bottom-right corner instead.
  $effect(() => {
    const at = appearance;
    const el = panelEl;
    if (!at || !el) {
      placed = false;
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = at.x >= 0 ? at.x : vw - r.width - 84;
    const y = at.y >= 0 ? at.y : vh - r.height - 84;
    panelLeft = Math.max(12, Math.min(x, vw - r.width - 12));
    panelTop = Math.max(12, Math.min(y, vh - r.height - 12));
    placed = true;
  });

  function openAppearanceFromMenu() {
    const at = menu;
    menu = null;
    onopen(at?.x, at?.y);
  }

  function pickMode(mode: ImmersiveMode) {
    immersiveStyle.setMode(mode);
    menu = null;
    modeSubmenu = false;
  }
</script>

<svelte:window oncontextmenu={onContextMenu} onkeydown={onKey} />

{#if menu}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="imm-scrim" onclick={() => (menu = null)} onpointerdown={() => (menu = null)}></div>
  <div
    class="imm-menu"
    role="menu"
    tabindex="-1"
    bind:this={menuEl}
    style="left:{menuPos.left}px;top:{menuPos.top}px"
    transition:fade={{ duration: 110 }}
  >
    <button class="imm-item" role="menuitem" onclick={openAppearanceFromMenu}>
      <ImmersiveIcon name="gear" size={14} />
      <span>Appearance</span>
    </button>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="imm-sub-wrap"
      onmouseenter={() => (modeSubmenu = true)}
      onmouseleave={() => (modeSubmenu = false)}
    >
      <button
        class="imm-item"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={modeSubmenu}
        onclick={() => (modeSubmenu = !modeSubmenu)}
      >
        <ImmersiveIcon name="immersive" size={14} />
        <span>Immersive Mode</span>
        <span class="imm-arrow">›</span>
      </button>
      {#if modeSubmenu}
        <div class="imm-menu imm-submenu" role="menu">
          {#each IMMERSIVE_MODES as option (option.id)}
            <button class="imm-item" role="menuitem" onclick={() => pickMode(option.id)}>
              <span class="imm-tick">
                {#if immersiveStyle.mode === option.id}<ImmersiveIcon name="check" size={13} />{/if}
              </span>
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="imm-sep"></div>

    <button
      class="imm-item"
      role="menuitem"
      onclick={() => {
        menu = null;
        ui.toggleBrowser();
      }}
    >
      <ImmersiveIcon name="browser" size={14} />
      <span>Browser</span>
    </button>
    <button
      class="imm-item"
      role="menuitem"
      onclick={() => {
        menu = null;
        ui.exit();
      }}
    >
      <ImmersiveIcon name="collapse" size={14} />
      <span>Exit Immersive</span>
    </button>
  </div>
{/if}

{#if appearance}
  <div
    class="appearance"
    class:placed
    bind:this={panelEl}
    style="left:{panelLeft}px;top:{panelTop}px"
    role="dialog"
    aria-label="Appearance"
    transition:fade={{ duration: 140 }}
  >
    <div class="head">
      <h2>Appearance</h2>
      <button class="close" aria-label="Close" title="Close" onclick={onclose}>
        <ImmersiveIcon name="close" size={14} />
      </button>
    </div>

    <div class="rows">
      <div class="row">
        <span class="label">Immersive Mode</span>
        {@render select(
          "mode",
          immersiveStyle.mode,
          IMMERSIVE_MODES.map((m) => ({ v: m.id, label: m.label })),
          (v) => immersiveStyle.setMode(v as ImmersiveMode),
          false,
        )}
      </div>

      <!-- Everything below shapes Solarium's artwork frame, which One doesn't
           have. Shown disabled rather than hidden, so the panel doesn't change
           shape when you switch modes. -->
      <div class="row" class:off={!solarium} title={solarium ? "" : "Solarium only"}>
        <span class="label">Artwork Y Position</span>
        <div class="slider">
          <span class="bubble" style="left:{immersiveStyle.artworkY}%">
            {immersiveStyle.artworkY}
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label="Artwork Y Position"
            disabled={!solarium}
            value={immersiveStyle.artworkY}
            oninput={(e) => immersiveStyle.setArtworkY(+(e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      <div class="row" class:off={!solarium} title={solarium ? "" : "Solarium only"}>
        <span class="label">Target Aspect Ratio</span>
        {@render select(
          "aspect",
          immersiveStyle.aspect,
          ASPECT_RATIOS.map((r) => ({ v: r, label: r })),
          (v) => immersiveStyle.setAspect(v as AspectRatio),
          !solarium,
        )}
      </div>

      <div class="row" class:off={!solarium} title={solarium ? "" : "Solarium only"}>
        <span class="label">Queue On Side</span>
        <button
          class="toggle"
          class:on={immersiveStyle.queueOnSide}
          role="switch"
          aria-checked={immersiveStyle.queueOnSide}
          aria-label="Queue On Side"
          disabled={!solarium}
          onclick={() => immersiveStyle.setQueueOnSide(!immersiveStyle.queueOnSide)}
        >
          <span class="knob"></span>
        </button>
      </div>

      <div class="row" class:off={!solarium} title={solarium ? "" : "Solarium only"}>
        <span class="label">Lyrics Type</span>
        {@render select(
          "lyrics",
          immersiveStyle.lyricsType,
          [
            { v: "full", label: "Full" },
            { v: "compact", label: "Compact" },
          ],
          (v) => immersiveStyle.setLyricsType(v as LyricsType),
          !solarium,
        )}
      </div>

      <div class="row" class:off={!solarium} title={solarium ? "" : "Solarium only"}>
        <span class="label">Mask Type</span>
        {@render select(
          "mask",
          immersiveStyle.maskType,
          [
            { v: "radial", label: "Radial" },
            { v: "linear", label: "Linear" },
          ],
          (v) => immersiveStyle.setMaskType(v as MaskType),
          !solarium,
        )}
      </div>
    </div>

    <button
      class="reset"
      disabled={immersiveStyle.isDefault}
      onclick={() => {
        openSelect = null;
        immersiveStyle.reset();
      }}
    >
      <ImmersiveIcon name="refresh" size={14} />
      <span>Reset to Defaults</span>
    </button>
  </div>
{/if}

{#snippet select(
  key: string,
  value: string,
  options: { v: string; label: string }[],
  pick: (v: string) => void,
  disabled: boolean,
)}
  <div class="select">
    <button
      class="select-btn"
      class:open={openSelect === key}
      {disabled}
      aria-haspopup="listbox"
      aria-expanded={openSelect === key}
      onclick={() => (openSelect = openSelect === key ? null : key)}
    >
      <span>{options.find((o) => o.v === value)?.label ?? value}</span>
      <ImmersiveIcon name="chevron" size={13} />
    </button>
    {#if openSelect === key}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="select-scrim" onpointerdown={() => (openSelect = null)}></div>
      <div class="select-menu" role="listbox" transition:fade={{ duration: 100 }}>
        {#each options as option (option.v)}
          <button
            class="select-item"
            role="option"
            aria-selected={option.v === value}
            onclick={() => {
              pick(option.v);
              openSelect = null;
            }}
          >
            <span class="tick">
              {#if option.v === value}<ImmersiveIcon name="check" size={12} />{/if}
            </span>
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  /* Both layers sit at the immersive overlay's own z-index and come after it in
     the DOM, which is what puts them over the artwork. */
  .imm-scrim {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: transparent;
  }
  .imm-menu {
    position: fixed;
    z-index: 2147483647;
    min-width: 208px;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    border-radius: 11px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(22, 14, 20, 0.9);
    backdrop-filter: blur(30px) saturate(1.4);
    box-shadow: 0 18px 48px rgba(8, 3, 7, 0.45);
    color: rgba(255, 255, 255, 0.9);
  }
  .imm-sub-wrap {
    position: relative;
  }
  .imm-submenu {
    position: absolute;
    left: calc(100% - 2px);
    top: -5px;
    min-width: 150px;
  }
  .imm-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    color: inherit;
    transition: background 130ms ease, color 130ms ease;
  }
  .imm-item:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.13);
  }
  .imm-arrow {
    margin-left: auto;
    opacity: 0.6;
    font-size: 15px;
    line-height: 1;
  }
  .imm-tick {
    width: 13px;
    display: grid;
    place-items: center;
  }
  .imm-sep {
    height: 1px;
    margin: 4px 6px;
    background: rgba(255, 255, 255, 0.12);
  }

  .appearance {
    position: fixed;
    z-index: 2147483647;
    width: 460px;
    max-width: calc(100vw - 24px);
    padding: 14px 16px 14px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    background: rgba(18, 12, 16, 0.86);
    backdrop-filter: blur(34px) saturate(1.4);
    box-shadow: 0 26px 70px rgba(6, 2, 6, 0.5);
    color: rgba(255, 255, 255, 0.9);
    /* Measured before it is placed; showing it at 0,0 first would read as the
       panel jumping across the screen. */
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .appearance.placed {
    opacity: 1;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  h2 {
    font-size: 13px;
    font-weight: 700;
    margin: 0;
  }
  .close {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.65);
    transition: background 130ms ease, color 130ms ease;
  }
  .close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    align-items: center;
    gap: 14px;
    min-height: 42px;
  }
  .row.off {
    opacity: 0.42;
  }
  .label {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.86);
  }

  .slider {
    position: relative;
    display: flex;
    align-items: center;
    height: 28px;
  }
  .slider input {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    margin: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.24);
    cursor: pointer;
  }
  .slider input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .slider input:disabled {
    cursor: default;
  }
  /* Rides the thumb: the value belongs to the handle, not to a column of
     numbers down the right-hand edge. */
  .bubble {
    position: absolute;
    bottom: 22px;
    transform: translateX(-50%);
    padding: 1px 7px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    pointer-events: none;
  }

  .select {
    position: relative;
    justify-self: end;
  }
  .select-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 11px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 650;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    transition: background 140ms ease;
  }
  .select-btn:hover:not(:disabled),
  .select-btn.open {
    background: rgba(255, 255, 255, 0.24);
  }
  .select-btn:disabled {
    cursor: default;
  }
  .select-scrim {
    position: fixed;
    inset: 0;
    z-index: 1;
  }
  .select-menu {
    position: absolute;
    z-index: 2;
    top: calc(100% + 5px);
    right: 0;
    min-width: 118px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 7, 9, 0.94);
    backdrop-filter: blur(24px);
    box-shadow: 0 18px 44px rgba(4, 2, 4, 0.5);
  }
  .select-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px 7px 6px;
    border-radius: 7px;
    font-size: 12.5px;
    font-weight: 650;
    color: rgba(255, 255, 255, 0.86);
    text-align: left;
    transition: background 130ms ease, color 130ms ease;
  }
  .select-item:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  .tick {
    width: 13px;
    display: grid;
    place-items: center;
  }

  .toggle {
    justify-self: end;
    width: 42px;
    height: 24px;
    padding: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    display: flex;
    justify-content: flex-start;
    transition: background 160ms ease;
  }
  .toggle.on {
    background: rgba(255, 255, 255, 0.42);
    justify-content: flex-end;
  }
  .toggle:disabled {
    cursor: default;
  }
  .knob {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    transition: transform 200ms var(--motion-spring);
  }

  .reset {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-top: 10px;
    padding: 9px;
    border-radius: 9px;
    font-size: 12.5px;
    font-weight: 650;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.1);
    transition: background 140ms ease, color 140ms ease;
  }
  .reset:hover:not(:disabled) {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
  }
  .reset:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.9);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .knob,
    .appearance {
      transition: none;
    }
  }
</style>

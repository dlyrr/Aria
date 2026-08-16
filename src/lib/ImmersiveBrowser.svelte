<script lang="ts">
  //! The library browser floated over an immersive mode: the sidebar and the
  //! main view in a panel, so you can queue something without leaving.
  //! Shared by One and Solarium; each mounts it while `ui.browserOpen`.
  import { fade } from "svelte/transition";
  import { ui } from "$lib/ui.svelte";
  import Sidebar from "$lib/Sidebar.svelte";
  import MainView from "$lib/MainView.svelte";
</script>

<div class="browser-overlay" transition:fade={{ duration: 200 }}>
  <div class="browser-panel">
    <button
      class="browser-close"
      title="Close browser"
      aria-label="Close browser"
      onclick={() => ui.toggleBrowser()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
    <div class="browser-body">
      <Sidebar />
      <div class="browser-main">
        <MainView />
      </div>
    </div>
  </div>
</div>

<style>
  .browser-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
  }
  .browser-panel {
    position: absolute;
    inset: 4vh 8% 4vh 4vw;
    display: flex;
    border-radius: 20px;
    overflow: hidden;
    background: var(--bg-deep);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 30px 90px rgba(5, 2, 6, 0.5);
  }
  .browser-close {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 2;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-dim);
    background: var(--surface);
    border: 1px solid var(--border);
    transition: background 150ms ease, color 150ms ease;
  }
  .browser-close:hover {
    color: var(--text);
    background: var(--hover);
  }
  .browser-body {
    display: flex;
    width: 100%;
    height: 100%;
  }
  .browser-main {
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: hidden;
    background: color-mix(in srgb, var(--bg) 72%, transparent);
    backdrop-filter: blur(22px) saturate(1.08);
  }
  @media (max-width: 760px), (max-height: 620px) {
    .browser-panel {
      right: 3%;
    }
  }
</style>

<script lang="ts">
  let {
    name,
    size = 20,
  }: {
    name:
      | "exit"
      | "queue"
      | "lyrics"
      | "shuffle"
      | "previous"
      | "play"
      | "pause"
      | "next"
      | "repeat"
      | "infinity"
      | "volume"
      | "more"
      | "sidebar"
      | "browser"
      | "collapse"
      | "gear"
      | "refresh"
      | "check"
      | "chevron"
      | "close"
      | "immersive"
      | "gauge"
      | "history"
      | "clock"
      | "star";
    size?: number;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === "exit"}
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  {:else if name === "queue"}
    <path d="M4 6h11M4 12h8M4 18h8" />
    <path d="M17 11v7.5a2.5 2.5 0 1 1-2-2.45" />
    <path d="M17 11l3-1" />
  {:else if name === "lyrics"}
    <path d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
    <path d="M8 10h8M8 13h5" />
  {:else if name === "shuffle"}
    <path d="M4 7h2.5c4 0 6.5 10 11 10H20" />
    <path d="m17 14 3 3-3 3M4 17h2.5c1.6 0 3-1.6 4.2-3.5M14 7.6c1.1-.5 2.2-.6 3.3-.6H20" />
    <path d="m17 4 3 3-3 3" />
  {:else if name === "previous"}
    <path d="M6 5v14M19 6 9 12l10 6Z" fill="currentColor" stroke="none" />
  {:else if name === "play"}
    <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />
  {:else if name === "pause"}
    <path d="M8 5h3v14H8zM14 5h3v14h-3z" fill="currentColor" stroke="none" />
  {:else if name === "next"}
    <path d="M18 5v14M5 6l10 6-10 6Z" fill="currentColor" stroke="none" />
  {:else if name === "repeat"}
    <path d="M17 4l3 3-3 3" />
    <path d="M4 11V9a2 2 0 0 1 2-2h14M7 20l-3-3 3-3" />
    <path d="M20 13v2a2 2 0 0 1-2 2H4" />
  {:else if name === "infinity"}
    <!-- One continuous lemniscate: two lobes joined by a crossing at centre. -->
    <path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8" />
  {:else if name === "volume"}
    <path d="M5 9v6h4l5 4V5L9 9H5Z" />
    <path d="M17 9.5a4 4 0 0 1 0 5M19 7a7 7 0 0 1 0 10" />
  {:else if name === "more"}
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  {:else if name === "sidebar"}
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <line x1="9" y1="4" x2="9" y2="20" />
  {:else if name === "browser"}
    <!-- A window with a magnifier in its corner: the library, searchable. -->
    <path d="M13 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" />
    <line x1="3" y1="9.5" x2="21" y2="9.5" />
    <circle cx="16.5" cy="16.5" r="3" />
    <path d="m18.8 18.8 2.4 2.4" />
  {:else if name === "gauge"}
    <!-- Speedometer: a dial with the needle past twelve. -->
    <path d="M4.5 17.5a8.5 8.5 0 1 1 15 0" />
    <path d="m12 14 3.4-4.4" />
    <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
    <path d="M6.5 13.5h.01M17.5 13.5h.01M8 9.5h.01M12 8h.01" stroke-width="2.4" />
  {:else if name === "history"}
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3.5 3.5V8h4.5" />
    <path d="M12 8v4.5l3 1.8" />
  {:else if name === "clock"}
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  {:else if name === "star"}
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8Z" />
  {:else if name === "collapse"}
    <!-- The inverse of "exit": four arrows pulled in toward the middle. -->
    <path d="M9 3v6H3M21 9h-6V3M3 15h6v6M15 21v-6h6" />
  {:else if name === "immersive"}
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  {:else if name === "gear"}
    <circle cx="12" cy="12" r="3.1" />
    <path
      d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.11a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.11a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.11a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v.05a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.11a1.6 1.6 0 0 0-1.46 1Z"
    />
  {:else if name === "refresh"}
    <path d="M20 11a8 8 0 1 0-2.3 6.3" />
    <path d="M20 5v6h-6" />
  {:else if name === "check"}
    <path d="m4.5 12.5 5 5 10-11" stroke-width="2.4" />
  {:else if name === "chevron"}
    <path d="m6 9.5 6 6 6-6" stroke-width="2.2" />
  {:else if name === "close"}
    <path d="M6 6l12 12M18 6 6 18" stroke-width="2.4" />
  {/if}
</svg>

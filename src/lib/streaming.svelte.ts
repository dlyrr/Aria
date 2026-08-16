import { invoke } from "@tauri-apps/api/core";
import type { TrackMeta } from "./player.svelte";

/**
 * Online music services.
 *
 * Off by default: Aria is a local player, and a service you didn't ask for has
 * no business making network calls on your behalf. Switching one on in Settings
 * adds it to the sidebar and to the search below.
 *
 * What plays is the 30-second preview each service publishes. Full playback
 * would need a commercial licence and a DRM module the WebView can't run, so
 * every result also carries a link to the track on the service — see
 * `src-tauri/src/streaming.rs`.
 */

export type ServiceId = "deezer" | "apple";

export interface StreamTrack {
  id: string;
  service: ServiceId;
  title: string;
  artist: string;
  album: string;
  /** Length of the whole track, for display. 0 when unknown. */
  duration: number;
  /** Length of what actually plays. */
  preview_duration: number;
  art: string | null;
  /** Preview audio URL — used as the track's `path`. */
  stream: string;
  page: string | null;
}

export interface Service {
  id: ServiceId;
  label: string;
  /** What enabling it gets you. */
  hint: string;
  /** Where the full track lives. */
  site: string;
}

export const SERVICES: Service[] = [
  {
    id: "deezer",
    label: "Deezer",
    hint: "Deep on independent and very recent releases. Keyless — no account needed.",
    site: "https://www.deezer.com",
  },
  {
    id: "apple",
    label: "Apple Music",
    hint: "The iTunes catalogue, searched through Apple's public API. Keyless — no account needed.",
    site: "https://music.apple.com",
  },
];

/** How many results to ask each service for. */
const PER_SERVICE = 25;

function serviceById(id: ServiceId): Service {
  return SERVICES.find((s) => s.id === id) ?? SERVICES[0];
}

class Streaming {
  enabled = $state<Record<ServiceId, boolean>>({ deezer: false, apple: false });

  query = $state("");
  results = $state<StreamTrack[]>([]);
  searching = $state(false);
  lastError = $state("");
  /** True once a search has run, so the empty state can tell "nothing yet"
   *  apart from "nothing found". */
  searched = $state(false);

  private loaded = false;
  /** Guards against an older search landing after a newer one. */
  private seq = 0;

  /** The services currently switched on, in listing order. */
  get active(): Service[] {
    return SERVICES.filter((s) => this.enabled[s.id]);
  }

  get any(): boolean {
    return this.active.length > 0;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const saved = await invoke<Partial<Record<ServiceId, boolean>> | null>("load_data", {
        key: "streaming",
      });
      if (saved) {
        this.enabled = {
          deezer: !!saved.deezer,
          apple: !!saved.apple,
        };
      }
    } catch {
      /* first run — off is the right default */
    }
  }

  async setEnabled(id: ServiceId, on: boolean) {
    this.enabled = { ...this.enabled, [id]: on };
    // Results from a service just switched off shouldn't linger in the view.
    if (!on) {
      this.results = this.results.filter((r) => this.enabled[r.service]);
    }
    if (!this.any) {
      this.results = [];
      this.searched = false;
      this.lastError = "";
    }
    await invoke("save_data", { key: "streaming", value: this.enabled });
  }

  /**
   * Search the enabled services, or just `only` if given.
   *
   * Results are interleaved rather than concatenated: the two catalogues
   * overlap heavily, and whichever answered first would otherwise own the top
   * of the list on every query.
   */
  async search(query = this.query, only: ServiceId | null = null) {
    const term = query.trim();
    this.query = query;
    const services = only ? [serviceById(only)] : this.active;

    if (!term || services.length === 0) {
      this.results = [];
      this.searched = false;
      this.lastError = "";
      return;
    }

    const run = ++this.seq;
    this.searching = true;
    this.lastError = "";

    const settled = await Promise.all(
      services.map(async (service) => {
        try {
          return await invoke<StreamTrack[]>("stream_search", {
            service: service.id,
            query: term,
            limit: PER_SERVICE,
          });
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }),
    );
    if (run !== this.seq) return;

    const lists = settled.filter((r): r is StreamTrack[] => Array.isArray(r));
    const failures = settled.filter((r): r is string => typeof r === "string");

    const merged: StreamTrack[] = [];
    const depth = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < depth; i++) {
      for (const list of lists) {
        if (list[i]) merged.push(list[i]);
      }
    }

    this.results = merged;
    this.searched = true;
    // A service that failed while another answered is a note, not a wall —
    // the results that did arrive stay on screen either way.
    this.lastError = failures.join(" ");
    this.searching = false;
  }

  /** A search result as something the player understands. The preview URL is
   *  the track's path: it identifies the row and is what actually gets fetched. */
  toTrack(result: StreamTrack): TrackMeta {
    return {
      path: result.stream,
      title: result.title,
      artist: result.artist,
      album: result.album,
      album_artist: result.artist,
      track_number: null,
      // The preview length, not the track's — the transport should promise
      // only what it can play. It is also what keeps previews from scrobbling,
      // since anything 30s or under is below Last.fm's threshold.
      duration: result.preview_duration,
      art: result.art,
      kind: "audio",
    };
  }

  label(id: ServiceId): string {
    return serviceById(id).label;
  }
}

export const streaming = new Streaming();

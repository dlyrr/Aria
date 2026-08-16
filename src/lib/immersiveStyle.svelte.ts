//! Which immersive mode is on, and how Solarium is laid out.
//!
//! Two modes ship:
//!
//! - `one`      — the original: a square cover centred in the window with the
//!                transport under it and a panel beside it.
//! - `solarium` — the cover *is* the screen. It is cropped to a target aspect
//!                ratio, dissolved into the colour field it generates, and the
//!                controls float over it.
//!
//! Everything below `mode` describes Solarium only; One has no artwork frame to
//! crop, no mask and no compact lyric bar, so those knobs are shown disabled
//! rather than silently doing nothing (see ImmersiveChrome).

export type ImmersiveMode = "one" | "solarium";

export const IMMERSIVE_MODES: {
  id: ImmersiveMode;
  label: string;
  hint: string;
}[] = [
  {
    id: "one",
    label: "One",
    hint: "Square cover, centred, with the panel beside it.",
  },
  {
    id: "solarium",
    label: "Solarium",
    hint: "The cover fills the screen and dissolves into its own colour.",
  },
];

/** Shape of the artwork frame. Named as they're written on a monitor's box. */
export type AspectRatio = "1:1" | "4:3" | "16:9" | "16:10" | "21:9" | "32:9";

export const ASPECT_RATIOS: AspectRatio[] = [
  "1:1",
  "4:3",
  "16:9",
  "16:10",
  "21:9",
  "32:9",
];

/** `"16:10"` → 1.6. */
export function aspectValue(ratio: AspectRatio): number {
  const [w, h] = ratio.split(":").map(Number);
  return h > 0 ? w / h : 1;
}

/**
 * - `full`    — the tall lyric card beside the artwork.
 * - `compact` — one line at a time, in a bar above the transport.
 */
export type LyricsType = "full" | "compact";

/** How the artwork's edges are dissolved into the colour field behind it. */
export type MaskType = "radial" | "linear";

export interface ImmersiveDefaults {
  artworkY: number;
  aspect: AspectRatio;
  queueOnSide: boolean;
  lyricsType: LyricsType;
  maskType: MaskType;
}

export const SOLARIUM_DEFAULTS: ImmersiveDefaults = {
  // Faces and titles sit above centre on most covers, so the default crop is
  // biased upward rather than centred.
  artworkY: 22,
  aspect: "4:3",
  queueOnSide: true,
  lyricsType: "full",
  maskType: "radial",
};

const clamp = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;

class ImmersiveStyle {
  mode = $state<ImmersiveMode>("solarium");

  artworkY = $state(SOLARIUM_DEFAULTS.artworkY);
  aspect = $state<AspectRatio>(SOLARIUM_DEFAULTS.aspect);
  queueOnSide = $state(SOLARIUM_DEFAULTS.queueOnSide);
  lyricsType = $state<LyricsType>(SOLARIUM_DEFAULTS.lyricsType);
  maskType = $state<MaskType>(SOLARIUM_DEFAULTS.maskType);

  load() {
    try {
      const mode = localStorage.getItem("aria.immersive.mode") as ImmersiveMode | null;
      if (mode && IMMERSIVE_MODES.some((m) => m.id === mode)) this.mode = mode;

      const y = localStorage.getItem("aria.solarium.artworkY");
      if (y !== null) this.artworkY = clamp(+y, 0, 100);

      const aspect = localStorage.getItem("aria.solarium.aspect") as AspectRatio | null;
      if (aspect && ASPECT_RATIOS.includes(aspect)) this.aspect = aspect;

      const queue = localStorage.getItem("aria.solarium.queueOnSide");
      if (queue !== null) this.queueOnSide = queue === "true";

      const lyricsType = localStorage.getItem("aria.solarium.lyricsType") as LyricsType | null;
      if (lyricsType === "full" || lyricsType === "compact") this.lyricsType = lyricsType;

      const mask = localStorage.getItem("aria.solarium.maskType") as MaskType | null;
      if (mask === "radial" || mask === "linear") this.maskType = mask;
    } catch {
      /* first run / storage blocked — defaults are fine */
    }
  }

  setMode(mode: ImmersiveMode) {
    this.mode = mode;
    this.persist();
  }

  setArtworkY(value: number) {
    this.artworkY = clamp(Math.round(value), 0, 100);
    this.persist();
  }

  setAspect(aspect: AspectRatio) {
    this.aspect = aspect;
    this.persist();
  }

  setQueueOnSide(on: boolean) {
    this.queueOnSide = on;
    this.persist();
  }

  setLyricsType(type: LyricsType) {
    this.lyricsType = type;
    this.persist();
  }

  setMaskType(type: MaskType) {
    this.maskType = type;
    this.persist();
  }

  /** Solarium's layout only — the chosen mode is not a look, so it survives. */
  reset() {
    this.artworkY = SOLARIUM_DEFAULTS.artworkY;
    this.aspect = SOLARIUM_DEFAULTS.aspect;
    this.queueOnSide = SOLARIUM_DEFAULTS.queueOnSide;
    this.lyricsType = SOLARIUM_DEFAULTS.lyricsType;
    this.maskType = SOLARIUM_DEFAULTS.maskType;
    this.persist();
  }

  get isDefault(): boolean {
    return (
      this.artworkY === SOLARIUM_DEFAULTS.artworkY &&
      this.aspect === SOLARIUM_DEFAULTS.aspect &&
      this.queueOnSide === SOLARIUM_DEFAULTS.queueOnSide &&
      this.lyricsType === SOLARIUM_DEFAULTS.lyricsType &&
      this.maskType === SOLARIUM_DEFAULTS.maskType
    );
  }

  private persist() {
    try {
      localStorage.setItem("aria.immersive.mode", this.mode);
      localStorage.setItem("aria.solarium.artworkY", String(this.artworkY));
      localStorage.setItem("aria.solarium.aspect", this.aspect);
      localStorage.setItem("aria.solarium.queueOnSide", String(this.queueOnSide));
      localStorage.setItem("aria.solarium.lyricsType", this.lyricsType);
      localStorage.setItem("aria.solarium.maskType", this.maskType);
    } catch {
      /* ignore */
    }
  }
}

export const immersiveStyle = new ImmersiveStyle();

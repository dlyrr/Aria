//! Liquid glass: a `use:glass` action for Aria's floating panes and chrome.
//!
//! Three things make glass read as glass rather than as a translucent grey box:
//! the backdrop is blurred and re-saturated behind it, its rim bends what's
//! behind it — the thick edge of a lens — and that bend splits into colour at
//! the very edge, the way a real lens fringes.
//!
//! All of it is live. The maps below are geometry, redrawn only when the
//! element resizes; the sampling is the compositor's, every frame, so the bend
//! and the fringe follow whatever moves behind the pane rather than being
//! baked into a picture of it.
//!
//! The blur is one CSS function. The rim
//! is not: it needs an SVG displacement map the exact size of the element,
//! which is why this is an action rather than a class. Chromium (so WebView2)
//! will run an SVG filter as a `backdrop-filter`; the map is drawn on a canvas
//! whenever the element changes size and fed to that filter.
//!
//! The stylesheet still sets a plain blurred `backdrop-filter` on every glass
//! element. This only ever *replaces* it inline, so if the url() form fails to
//! parse the pane keeps its flat frosting rather than going clear.
//!
//! The action also gives the pane its rim: a hairline ring just inside the
//! edge that is itself a backdrop filter — the colour behind the edge, pushed
//! brighter and more saturated. Because it reads the backdrop and not a
//! palette, it follows the picture as the picture moves: the rim over a red
//! patch is red, over a green one green, frame by frame.

export interface GlassOptions {
  /**
   * Off hands the element back to the stylesheet: no inline filter, no rim.
   *
   * An action can't be applied conditionally in markup, and some surfaces are
   * glass only in some themes — Aria's light palette turns menu frosting off
   * outright, because blur over a light backdrop reads as smeared rather than
   * as glass. This is how those surfaces opt out without a second component.
   */
  enabled?: boolean;
  /** Backdrop blur radius, px. */
  blur?: number;
  saturate?: number;
  brightness?: number;
  /** Width of the refracting rim, px. */
  bezel?: number;
  /** Peak displacement at the very edge, px. */
  strength?: number;
  /**
   * How far red and blue are pulled apart at the rim, as a fraction of the rim
   * vector. Real glass disperses: the thick edge of a lens fringes into colour,
   * and that fringe is what makes a rim read as glass rather than as a bevel.
   *
   * Edge-only, by construction — it is driven by a map that is neutral
   * everywhere the rim profile is zero, so the fringe cannot bleed into the
   * body however far a pane magnifies. 0 turns it off.
   */
  dispersion?: number;
  /** Width of the live-coloured hairline at the edge, px. 0 for none. */
  rim?: number;
  /**
   * Whole-pane magnification, as a fraction of the distance from the centre:
   * 0.05 samples the backdrop 5% closer in at the edges than it really is, so
   * anything crossing the pane's boundary steps sideways as it enters. This is
   * the body of the glass, where `strength` is only its rim.
   */
  lens?: number;
}

const DEFAULTS: Required<GlassOptions> = {
  enabled: true,
  blur: 28,
  saturate: 1.6,
  brightness: 1,
  bezel: 22,
  strength: 34,
  dispersion: 0.12,
  rim: 1.5,
  lens: 0.05,
};

/**
 * Not for the window chrome — titlebar, sidebar, now-playing panel. Those were
 * given glass once and it cost the whole app its frame rate: an SVG filter in a
 * `backdrop-filter` is re-run over the element's entire backdrop every frame,
 * so the price is the surface's *area*, and those three are the largest in the
 * window. Worse, they stay mounted underneath the immersive overlay, so they
 * dragged immersive down with them.
 *
 * They keep the plain `--chrome-blur`, which the compositor handles cheaply.
 * Reach for `glass` on things that float — panes, popovers, pills, buttons —
 * and leave anything the size of a wall alone.
 */
const NS = "http://www.w3.org/2000/svg";
/** Maps are drawn no larger than this on their long side and stretched. */
const MAP_MAX = 640;

let host: SVGSVGElement | null = null;
let seq = 0;

/** Every filter lives in one hidden `<svg>` at the end of `<body>`. */
function filterHost(): SVGSVGElement {
  if (host?.isConnected) return host;
  host = document.createElementNS(NS, "svg");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none";
  document.body.appendChild(host);
  return host;
}

/** Whether the engine accepts an SVG filter alongside blur() in a backdrop. */
const supported = (() => {
  try {
    return CSS.supports("backdrop-filter", "blur(1px) url(#x)");
  } catch {
    return false;
  }
})();

/**
 * Draws the displacement maps for a `w`×`h` rounded rectangle with corner
 * radius `r`: red is X, green is Y, 128 is "leave this pixel alone".
 *
 * Two are produced, because the two things this filter does have to be
 * separable.
 *
 * **The refraction map** carries both of them at once. The rim points toward
 * the centre, hardest at the very edge and easing to nothing `bezel` px in — a
 * quarter-circle profile, so the edge behaves like the thick lip of a lens.
 * Over the whole pane there is also a gentle magnification: every pixel samples
 * slightly closer to the centre than it sits, by `lens` of its distance from
 * it. That is the straw-in-a-glass effect — a line crossing the pane's edge
 * comes out the other side offset, because the glass bends everything behind it
 * and not only the bit near the rim.
 *
 * **The edge map** carries the rim vector alone, and is exactly neutral
 * everywhere the rim profile is zero. It drives the colour fringing, and
 * keeping it apart from the whole-pane magnification is what confines that
 * fringing to the edge: scaling one map for all three channels would disperse
 * wherever the map is non-neutral, which for a magnifying pane is everywhere.
 *
 * Returns both, with the displacement (px) a full-strength channel stands for
 * in each; the caller feeds those to feDisplacementMap's `scale`.
 */
function drawMap(
  w: number,
  h: number,
  r: number,
  bezel: number,
  strength: number,
  lens: number,
): { url: string; scale: number; edgeUrl: string; edgeScale: number } | null {
  const shrink = Math.min(1, MAP_MAX / Math.max(w, h));
  const mw = Math.max(2, Math.round(w * shrink));
  const mh = Math.max(2, Math.round(h * shrink));

  // Everything below is in element pixels, which is what `scale` is in too.
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw, hh);
  const bz = Math.max(1, bezel);
  // One scale has to cover the largest vector in the map: the rim's, or the
  // lens's at the far corner, whichever is bigger.
  const scale = Math.max(1, strength, Math.max(hw, hh) * lens);

  // What a full channel is worth in the edge map: its largest vector is the
  // rim's, so the two share `strength` and the dispersion scale stays in px.
  const edgeScale = Math.max(1, strength);

  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(mw, mh);
  const px = image.data;

  const edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = mw;
  edgeCanvas.height = mh;
  const edgeCtx = edgeCanvas.getContext("2d");
  if (!edgeCtx) return null;
  const edgeImage = edgeCtx.createImageData(mw, mh);
  const edgePx = edgeImage.data;

  const clamp = (v: number) => Math.max(-1, Math.min(1, v));

  for (let y = 0; y < mh; y++) {
    const ey = ((y + 0.5) / mh) * h - hh;
    const ay = Math.abs(ey);
    const qy = ay - (hh - rr);
    for (let x = 0; x < mw; x++) {
      const ex = ((x + 0.5) / mw) * w - hw;
      const ax = Math.abs(ex);
      const qx = ax - (hw - rr);

      // Rounded-rectangle signed distance (negative inside), and its normal.
      //   sdf = min(max(qx, qy), 0) + |max(q, 0)| - r
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const depth = rr - (Math.min(Math.max(qx, qy), 0) + outside);
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        nx = qx / (outside || 1);
        ny = qy / (outside || 1);
      } else if (qx > qy) {
        nx = 1;
        ny = 0;
      } else {
        nx = 0;
        ny = 1;
      }

      const t = Math.max(0, Math.min(1, 1 - depth / bz));
      // Lens profile: nearly nothing until the last third of the rim, then it
      // dives. Linear reads as a bevel, not a curve.
      const m = t > 0 ? 1 - Math.sqrt(Math.max(0, 1 - t * t)) : 0;
      // Both vectors point inward, so the filter only ever samples from
      // further inside the backdrop — never off the edge of it.
      const rimX = -nx * Math.sign(ex || 1) * m * strength;
      const rimY = -ny * Math.sign(ey || 1) * m * strength;
      const dx = rimX - ex * lens;
      const dy = rimY - ey * lens;

      const i = (y * mw + x) * 4;
      px[i] = Math.round(128 + clamp(dx / scale) * 127);
      px[i + 1] = Math.round(128 + clamp(dy / scale) * 127);
      px[i + 2] = 128;
      px[i + 3] = 255;

      // The rim on its own. Dead neutral wherever `m` is 0 — which is the
      // whole pane bar the bezel band — so the fringing it drives cannot
      // reach the middle even in principle.
      edgePx[i] = Math.round(128 + clamp(rimX / edgeScale) * 127);
      edgePx[i + 1] = Math.round(128 + clamp(rimY / edgeScale) * 127);
      edgePx[i + 2] = 128;
      edgePx[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  edgeCtx.putImageData(edgeImage, 0, 0);
  return {
    url: canvas.toDataURL("image/png"),
    scale,
    edgeUrl: edgeCanvas.toDataURL("image/png"),
    edgeScale,
  };
}

function cornerRadius(node: HTMLElement): number {
  const v = parseFloat(getComputedStyle(node).borderTopLeftRadius);
  return Number.isFinite(v) ? v : 0;
}

/**
 * The rim ring. A child rather than a pseudo-element so the action can add it
 * to any element without a stylesheet rule per host. Its mask keeps only a
 * `width`-px band inside the edge; its own backdrop-filter is what colours it.
 */
function makeRim(width: number): HTMLSpanElement {
  const rim = document.createElement("span");
  rim.setAttribute("aria-hidden", "true");
  rim.className = "liquid-glass-rim";
  const ring =
    "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
  const style = rim.style;
  style.position = "absolute";
  style.inset = "0";
  style.borderRadius = "inherit";
  style.pointerEvents = "none";
  style.zIndex = "2147483647";
  style.padding = `${width}px`;
  style.setProperty("-webkit-mask", ring);
  style.setProperty("mask", ring);
  style.setProperty("-webkit-mask-composite", "xor");
  style.setProperty("mask-composite", "exclude");
  // The colour behind the edge, lifted: bright enough to read as a lit rim,
  // saturated enough that a muted backdrop still shows a hue.
  const lift = "brightness(1.6) saturate(2.4) contrast(1.08)";
  style.setProperty("backdrop-filter", lift);
  style.setProperty("-webkit-backdrop-filter", lift);
  // A whisper of white on top so it never disappears against a dark cover.
  style.background = "rgba(255,255,255,0.14)";
  return rim;
}

export function glass(node: HTMLElement, options: GlassOptions = {}) {
  let opts = { ...DEFAULTS, ...options };
  const id = `liquid-glass-${++seq}`;

  let rim: HTMLSpanElement | null = null;
  function ensureRim() {
    if (opts.rim <= 0) {
      rim?.remove();
      rim = null;
      return;
    }
    if (!rim) {
      rim = makeRim(opts.rim);
      // The ring is positioned against the host, which must therefore be
      // positioned itself; most already are.
      if (getComputedStyle(node).position === "static") node.style.position = "relative";
      node.appendChild(rim);
    } else {
      rim.style.padding = `${opts.rim}px`;
    }
  }

  let filter: SVGFilterElement | null = null;
  let feImage: SVGFEImageElement | null = null;
  let feEdgeImage: SVGFEImageElement | null = null;
  /** Refraction: bends the backdrop once, for all three channels together. */
  let feRefract: SVGFEDisplacementMapElement | null = null;
  /** Dispersion: red pulled one way along the rim vector, blue the other. */
  let feSplit: SVGFEDisplacementMapElement[] = [];
  let lastKey = "";
  /** Displacement (px) a full-strength channel stands for in the current map. */
  let mapScale = opts.strength;
  let edgeMapScale = opts.strength;
  let raf = 0;

  /**
   * Which shape of filter graph is currently built. Dispersion costs two extra
   * displacement passes over the whole backdrop, every frame — worth it on a
   * pill, ruinous on a full-height card. At 0 the graph is built without them
   * rather than run with a scale of zero, which would pay for them anyway.
   */
  let chain = "";

  function ensureFilter() {
    const wanted = opts.dispersion > 0 ? "dispersed" : "plain";
    if (filter && chain === wanted) return;
    // The shape changed: throw the old graph away and build the other one.
    if (filter) {
      filter.remove();
      filter = null;
      lastKey = "";
    }
    chain = wanted;
    const svg = filterHost();
    filter = document.createElementNS(NS, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("primitiveUnits", "userSpaceOnUse");
    // sRGB, or the engine linearises the map and 128 stops meaning zero.
    filter.setAttribute("color-interpolation-filters", "sRGB");

    feImage = document.createElementNS(NS, "feImage");
    feImage.setAttribute("preserveAspectRatio", "none");
    feImage.setAttribute("result", "map");
    // The rim-only map is only fed to the split passes, so a plain chain has
    // no use for it and shouldn't be decoding it.
    feEdgeImage = null;
    if (wanted === "dispersed") {
      feEdgeImage = document.createElementNS(NS, "feImage");
      feEdgeImage.setAttribute("preserveAspectRatio", "none");
      feEdgeImage.setAttribute("result", "edge");
    }
    filter.append(feImage);
    if (feEdgeImage) filter.append(feEdgeImage);

    // Refract first, with every channel bent identically: this is the glass
    // itself, and it must not tint anything.
    feRefract = document.createElementNS(NS, "feDisplacementMap");
    feRefract.setAttribute("in", "SourceGraphic");
    feRefract.setAttribute("in2", "map");
    feRefract.setAttribute("xChannelSelector", "R");
    feRefract.setAttribute("yChannelSelector", "G");
    feRefract.setAttribute("result", "base");
    filter.append(feRefract);

    // Then split the outer two channels along the *rim-only* map. Real glass
    // disperses: the thick edge of a lens fringes into colour, and that fringe
    // is what stops the rim reading as a bevel. Because the map driving this is
    // neutral away from the edge, red and blue land exactly back on green
    // across the whole body — the fringing cannot bleed inward.
    //
    // Green is taken from `base` untouched, so the pane's true colour is
    // whatever the backdrop is, with colour appearing only where it bends.
    //
    // Skipped entirely at dispersion 0. Each split is another displacement of
    // the whole backdrop, and on a pane the size of a card that is the
    // difference between a frame budget and a slideshow — so a big pane can
    // buy back two thirds of its cost by giving up the fringe.
    feSplit = [];
    if (chain === "dispersed") {
      const channels: { keep: string; from: string; split: boolean }[] = [
        { keep: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", from: "red", split: true },
        { keep: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", from: "base", split: false },
        { keep: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", from: "blue", split: true },
      ];
      channels.forEach(({ keep, from, split }, i) => {
        if (split) {
          const bend = document.createElementNS(NS, "feDisplacementMap");
          bend.setAttribute("in", "base");
          bend.setAttribute("in2", "edge");
          bend.setAttribute("xChannelSelector", "R");
          bend.setAttribute("yChannelSelector", "G");
          bend.setAttribute("result", from);
          filter!.append(bend);
          feSplit.push(bend);
        }
        const channel = document.createElementNS(NS, "feColorMatrix");
        channel.setAttribute("in", from);
        channel.setAttribute("type", "matrix");
        channel.setAttribute("values", keep);
        channel.setAttribute("result", `ch${i}`);
        filter!.append(channel);
      });
      const sum01 = document.createElementNS(NS, "feComposite");
      sum01.setAttribute("in", "ch0");
      sum01.setAttribute("in2", "ch1");
      sum01.setAttribute("operator", "arithmetic");
      sum01.setAttribute("k2", "1");
      sum01.setAttribute("k3", "1");
      sum01.setAttribute("result", "ch01");
      const sum = document.createElementNS(NS, "feComposite");
      sum.setAttribute("in", "ch01");
      sum.setAttribute("in2", "ch2");
      sum.setAttribute("operator", "arithmetic");
      sum.setAttribute("k2", "1");
      sum.setAttribute("k3", "1");
      filter.append(sum01, sum);
    }
    svg.appendChild(filter);
  }

  function apply() {
    raf = 0;
    if (!opts.enabled) {
      // Clear ours rather than writing "none": the stylesheet's own
      // backdrop-filter is the fallback everything here is layered over, and
      // it has to be what shows through.
      rim?.remove();
      rim = null;
      node.style.removeProperty("backdrop-filter");
      node.style.removeProperty("-webkit-backdrop-filter");
      return;
    }
    ensureRim();
    if (!supported) return;
    const w = Math.round(node.offsetWidth);
    const h = Math.round(node.offsetHeight);
    if (w < 4 || h < 4) return;
    const r = cornerRadius(node);
    const key = `${w}x${h}r${r}b${opts.bezel}s${opts.strength}l${opts.lens}`;
    ensureFilter();
    if (key !== lastKey) {
      const map = drawMap(w, h, r, opts.bezel, opts.strength, opts.lens);
      if (!map) return;
      lastKey = key;
      mapScale = map.scale;
      edgeMapScale = map.edgeScale;
      const size = String(w);
      const height = String(h);
      filter!.setAttribute("x", "0");
      filter!.setAttribute("y", "0");
      filter!.setAttribute("width", size);
      filter!.setAttribute("height", height);
      const images: [SVGFEImageElement, string][] = [[feImage!, map.url]];
      if (feEdgeImage) images.push([feEdgeImage, map.edgeUrl]);
      for (const [image, href] of images) {
        image.setAttribute("x", "0");
        image.setAttribute("y", "0");
        image.setAttribute("width", size);
        image.setAttribute("height", height);
        image.setAttribute("href", href);
      }
    }
    // The refraction map is normalised to `mapScale`, so that is what every
    // channel is bent by — one bend, no tint.
    feRefract!.setAttribute("scale", String(mapScale));
    // The edge map is normalised to `edgeMapScale`, so this much scale pulls
    // red and blue apart by `dispersion` of the local rim vector, and by
    // nothing at all where that vector is zero.
    const spread = edgeMapScale * opts.dispersion;
    feSplit[0]?.setAttribute("scale", String(spread));
    feSplit[1]?.setAttribute("scale", String(-spread));
    const value = `blur(${opts.blur}px) saturate(${opts.saturate}) brightness(${opts.brightness}) url(#${id})`;
    node.style.backdropFilter = value;
    // Some engines still want the prefix to accept url() here.
    node.style.setProperty("-webkit-backdrop-filter", value);
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  }

  const ro = new ResizeObserver(schedule);
  ro.observe(node);
  schedule();

  return {
    update(next: GlassOptions = {}) {
      opts = { ...DEFAULTS, ...next };
      schedule();
    },
    destroy() {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      filter?.remove();
      filter = null;
      rim?.remove();
      rim = null;
    },
  };
}

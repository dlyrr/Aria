//! Liquid glass: a `use:glass` action for Solarium's floating panes.
//!
//! Two things make glass read as glass rather than as a translucent grey box:
//! the backdrop is blurred and re-saturated behind it, and its rim bends what's
//! behind it — the thick edge of a lens. The blur is one CSS function. The rim
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
  /** Backdrop blur radius, px. */
  blur?: number;
  saturate?: number;
  brightness?: number;
  /** Width of the refracting rim, px. */
  bezel?: number;
  /** Peak displacement at the very edge, px. */
  strength?: number;
  /**
   * How far the three colour channels are bent apart at the rim, as a fraction
   * of `strength`. Real glass disperses: the edge of a lens fringes into
   * colour, and that fringe is what makes the rim read as glass and not as
   * a bevel. 0 turns it off.
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
  blur: 28,
  saturate: 1.6,
  brightness: 1,
  bezel: 22,
  strength: 34,
  dispersion: 0.12,
  rim: 1.5,
  lens: 0.05,
};

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
 * Draws the displacement map for a `w`×`h` rounded rectangle with corner
 * radius `r`: red is X, green is Y, 128 is "leave this pixel alone".
 *
 * Two things are written into it. The rim points toward the centre, hardest at
 * the very edge and easing to nothing `bezel` px in — a quarter-circle
 * profile, so the edge behaves like the thick lip of a lens. Over the whole
 * pane there is also a gentle magnification: every pixel samples slightly
 * closer to the centre than it sits, by `lens` of its distance from it. That
 * is the straw-in-a-glass effect — a line crossing the pane's edge comes out
 * the other side offset, because the glass is bending everything behind it and
 * not only the bit near the rim.
 *
 * Returns the map and the displacement (px) that a full-strength channel
 * stands for; the caller feeds that to feDisplacementMap's `scale`.
 */
function drawMap(
  w: number,
  h: number,
  r: number,
  bezel: number,
  strength: number,
  lens: number,
): { url: string; scale: number } | null {
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

  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(mw, mh);
  const px = image.data;
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
      const dx = -nx * Math.sign(ex || 1) * m * strength - ex * lens;
      const dy = -ny * Math.sign(ey || 1) * m * strength - ey * lens;

      const i = (y * mw + x) * 4;
      px[i] = Math.round(128 + clamp(dx / scale) * 127);
      px[i + 1] = Math.round(128 + clamp(dy / scale) * 127);
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { url: canvas.toDataURL("image/png"), scale };
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
  /** One displacement per channel — red bent least, blue most. */
  let feMaps: SVGFEDisplacementMapElement[] = [];
  let lastKey = "";
  /** Displacement (px) a full-strength channel stands for in the current map. */
  let mapScale = opts.strength;
  let raf = 0;

  function ensureFilter() {
    if (filter) return;
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
    filter.append(feImage);
    // Bend the backdrop three times, keep one channel of each, add them back
    // together. In the flat middle all three land on the same pixel and the
    // sum is the original; at the rim they part and the edge fringes.
    const keep = ["1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
                  "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
                  "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"];
    feMaps = keep.map((values, i) => {
      const map = document.createElementNS(NS, "feDisplacementMap");
      map.setAttribute("in", "SourceGraphic");
      map.setAttribute("in2", "map");
      map.setAttribute("xChannelSelector", "R");
      map.setAttribute("yChannelSelector", "G");
      map.setAttribute("result", `bent${i}`);
      const channel = document.createElementNS(NS, "feColorMatrix");
      channel.setAttribute("in", `bent${i}`);
      channel.setAttribute("type", "matrix");
      channel.setAttribute("values", values);
      channel.setAttribute("result", `ch${i}`);
      filter!.append(map, channel);
      return map;
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
    svg.appendChild(filter);
  }

  function apply() {
    raf = 0;
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
      const size = String(w);
      filter!.setAttribute("x", "0");
      filter!.setAttribute("y", "0");
      filter!.setAttribute("width", size);
      filter!.setAttribute("height", String(h));
      feImage!.setAttribute("x", "0");
      feImage!.setAttribute("y", "0");
      feImage!.setAttribute("width", size);
      feImage!.setAttribute("height", String(h));
      feImage!.setAttribute("href", map.url);
    }
    // The map is normalised to `mapScale`, so that is what the middle channel
    // is bent by; the outer two are pulled either side of it to disperse.
    const spread = mapScale * opts.dispersion;
    feMaps[0].setAttribute("scale", String(mapScale - spread));
    feMaps[1].setAttribute("scale", String(mapScale));
    feMaps[2].setAttribute("scale", String(mapScale + spread));
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

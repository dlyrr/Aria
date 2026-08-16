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
}

const DEFAULTS: Required<GlassOptions> = {
  blur: 28,
  saturate: 1.6,
  brightness: 1,
  bezel: 22,
  strength: 34,
  dispersion: 0.12,
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
 * radius `r`: red is X, green is Y, 128 is "leave this pixel alone". Inside the
 * rim the map points toward the centre, hardest at the very edge and easing to
 * nothing `bezel` px in — a quarter-circle profile, so the middle of the pane
 * is flat glass and only the edge behaves like a lens.
 */
function drawMap(w: number, h: number, r: number, bezel: number): string | null {
  const scale = Math.min(1, MAP_MAX / Math.max(w, h));
  const mw = Math.max(2, Math.round(w * scale));
  const mh = Math.max(2, Math.round(h * scale));
  const rr = Math.min(r * scale, mw / 2, mh / 2);
  const bz = Math.max(1, bezel * scale);

  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(mw, mh);
  const px = image.data;
  const hw = mw / 2;
  const hh = mh / 2;

  for (let y = 0; y < mh; y++) {
    const py = y + 0.5 - hh;
    const ay = Math.abs(py);
    const qy = ay - (hh - rr);
    for (let x = 0; x < mw; x++) {
      const pxx = x + 0.5 - hw;
      const ax = Math.abs(pxx);
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
      const dx = -nx * Math.sign(pxx || 1) * m;
      const dy = -ny * Math.sign(py || 1) * m;

      const i = (y * mw + x) * 4;
      px[i] = Math.round(128 + dx * 127);
      px[i + 1] = Math.round(128 + dy * 127);
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function cornerRadius(node: HTMLElement): number {
  const v = parseFloat(getComputedStyle(node).borderTopLeftRadius);
  return Number.isFinite(v) ? v : 0;
}

export function glass(node: HTMLElement, options: GlassOptions = {}) {
  let opts = { ...DEFAULTS, ...options };
  const id = `liquid-glass-${++seq}`;

  let filter: SVGFilterElement | null = null;
  let feImage: SVGFEImageElement | null = null;
  /** One displacement per channel — red bent least, blue most. */
  let feMaps: SVGFEDisplacementMapElement[] = [];
  let lastKey = "";
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
    if (!supported) return;
    const w = Math.round(node.offsetWidth);
    const h = Math.round(node.offsetHeight);
    if (w < 4 || h < 4) return;
    const r = cornerRadius(node);
    const key = `${w}x${h}r${r}b${opts.bezel}`;
    ensureFilter();
    if (key !== lastKey) {
      const url = drawMap(w, h, r, opts.bezel);
      if (!url) return;
      lastKey = key;
      const size = String(w);
      filter!.setAttribute("x", "0");
      filter!.setAttribute("y", "0");
      filter!.setAttribute("width", size);
      filter!.setAttribute("height", String(h));
      feImage!.setAttribute("x", "0");
      feImage!.setAttribute("y", "0");
      feImage!.setAttribute("width", size);
      feImage!.setAttribute("height", String(h));
      feImage!.setAttribute("href", url);
    }
    const spread = opts.strength * opts.dispersion;
    feMaps[0].setAttribute("scale", String(opts.strength - spread));
    feMaps[1].setAttribute("scale", String(opts.strength));
    feMaps[2].setAttribute("scale", String(opts.strength + spread));
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
    },
  };
}

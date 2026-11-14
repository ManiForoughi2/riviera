// Ghosty reveal (https://design.how/vault/ghosty-reveal), ported from the skill's mask.ts.
// MIT, Arlan Marat (see LICENSE in this folder).
// the whole trick is one mask: a feathered ramp, transparent for its first quarter and opaque past two
// thirds, pushed about by turbulence so its edge is cloud and not a line. it is laid over the box at
// 500 percent of its height and slid, so only a sliver of the soft edge ever crosses the box.

export const MASK_SCALE = 500;                              // percent of the box's height
export const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

// the ramp runs from (x1, y1) to (x2, y2) in a 0..1 box: transparent at the start, opaque at the end
const svg = (x1, y1, x2, y2) => {
  const body = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200' preserveAspectRatio='none'>`
    + `<defs><linearGradient id='g' gradientUnits='userSpaceOnUse' x1='${x1 * 200}' y1='${y1 * 200}' x2='${x2 * 200}' y2='${y2 * 200}'>`
    + `<stop offset='0.25' stop-color='#fff' stop-opacity='0'/><stop offset='0.4' stop-color='#fff' stop-opacity='0.3'/>`
    + `<stop offset='0.55' stop-color='#fff' stop-opacity='0.78'/><stop offset='0.67' stop-color='#fff' stop-opacity='1'/></linearGradient>`
    + `<filter id='f' x='-20%' y='-20%' width='140%' height='140%'><feTurbulence type='fractalNoise' baseFrequency='0.035' numOctaves='3' seed='4'/>`
    + `<feDisplacementMap in='SourceGraphic' scale='26' xChannelSelector='R' yChannelSelector='G'/></filter></defs>`
    + `<rect x='-40' y='-40' width='280' height='280' fill='url(#g)' filter='url(#f)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(body)}`;
};

export const MASK_IN = svg(0, 0, 0, 1);     // clear above, solid below: sliding it up brings the fog in from the bottom
export const MASK_OUT = svg(0, 1, 0, 0);    // solid above, clear below: sliding it up lifts the fog off from the bottom

// the mask as a small bitmap. laid over a phone screen at 500 percent the svg would be filtered at
// thousands of pixels tall on the first frame; a cloud this soft loses nothing drawn small and stretched.
// resolves to a css url(), or to the svg itself if the browser will not hand the pixels back
export function rasterMask(src, w = 96, h = 480) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(`url("${c.toDataURL("image/png")}")`);
      } catch { resolve(`url("${src}")`); }
    };
    img.onerror = () => resolve(`url("${src}")`);
    img.src = src;
  });
}

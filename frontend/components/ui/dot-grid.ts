// Fixed-position dot grid for the hero background. Positions are a regular
// grid (never move); only per-dot flicker timing is randomized so each dot
// twinkles independently instead of in sync.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DOT_GRID_WIDTH = 2400;
export const DOT_GRID_HEIGHT = 1400;
const SPACING = 38;

const rand = mulberry32(7);

export const DOT_GRID = (() => {
  const dots: { x: number; y: number; delay: number; duration: number }[] = [];
  for (let y = SPACING / 2; y < DOT_GRID_HEIGHT; y += SPACING) {
    for (let x = SPACING / 2; x < DOT_GRID_WIDTH; x += SPACING) {
      dots.push({
        x,
        y,
        delay: -rand() * 1.2, // negative delay starts mid-animation, desyncing dots immediately
        duration: 0.4 + rand() * 0.8,
      });
    }
  }
  return dots;
})();

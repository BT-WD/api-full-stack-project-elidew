// ============================================================
//  utils.js — Small pure helper functions
// ============================================================

/**
 * Random integer in [min, max] (inclusive).
 */
export function pickRandom(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick an index from [0, length) with a slight bias toward
 * the middle positions (so the anchor isn't always first/last).
 */
export function pickWeighted(length) {
  // Build weights: middle indices get double weight
  const weights = Array.from({ length }, (_, i) => {
    const mid = (length - 1) / 2;
    const dist = Math.abs(i - mid) / mid;  // 0 at center, 1 at edges
    return 1 + (1 - dist);                  // 1 at edges, 2 at center
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;

  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return length - 1;
}

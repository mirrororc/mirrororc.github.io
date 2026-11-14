/* Pure filter, shared by the drawing engine and replay tests. Units are logical pixels/ms.
 * 0–90 retains the v2 time constants. 91–300 adds a progressively wider spatial
 * stabilizer and longer time constant. Strength is an artistic control, not a multiplier.
 */
const FrequencySmoothing = Object.freeze({
  advance(previous, input, strength, elapsed) {
    const value = Math.max(0, Math.min(300, strength));
    if (value === 0) return {x: input.x, y: input.y};
    const extreme = Math.max(0, value - 90) / 210;
    const radius = 110 * extreme * extreme;
    const dx = input.x - previous.x, dy = input.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius) return {...previous};
    const targetRatio = (distance - radius) / distance;
    const tau = 3 + value * 0.22 + 180 * extreme * extreme;
    const alpha = 1 - Math.exp(-Math.max(1, elapsed) / tau);
    return {x: previous.x + dx * targetRatio * alpha,
      y: previous.y + dy * targetRatio * alpha};
  }
});
if (typeof module !== 'undefined' && module.exports) module.exports = FrequencySmoothing;

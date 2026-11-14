/* Continuous Gaussian emissions, each carrying its own deposition time.
 * A monotone kernel avoids outline/ring passes. Pure helpers also support tests.
 */
const FrequencyPigment = (() => {
  function kernelAlpha(size) {
    const alpha = new Uint8ClampedArray(size * size), edge = Math.exp(-5);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1;
      alpha[y * size + x] = Math.max(0, (Math.exp(-5 * (nx * nx + ny * ny)) - edge) / (1 - edge)) * 255;
    }
    return alpha;
  }
  function emissions(points, spacing) {
    const marks = [{...points[0]}];
    let walked = 0, next = spacing;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      while (length > 0 && next <= walked + length) {
        const t = (next - walked) / length;
        marks.push({x:a.x + (b.x - a.x) * t, y:a.y + (b.y - a.y) * t,
          born:a.born + (b.born - a.born) * t});
        next += spacing;
      }
      walked += length;
    }
    return marks;
  }
  function state(mark, time, config) {
    const t = config.reduced ? 1 : Math.min(1, Math.max(0, time - mark.born) / config.duration);
    const progress = 1 - Math.pow(1 - t, 3);
    const sigma = Math.sqrt(config.initialSigma ** 2 + config.spread ** 2 * progress);
    const seed = mark.x * .017 + mark.y * .029;
    return {sigma, progress,
      opacity:Math.min(.7, config.opacity * config.spacing / (Math.sqrt(2 * Math.PI) * sigma)),
      dx:Math.sin(seed * 1.7) * progress * config.spread * .12,
      dy:Math.cos(seed * 1.3) * progress * config.spread * .09,
      stretch:1 + Math.sin(seed * 2.1) * .14,
      angle:Math.sin(seed) * .65};
  }
  return Object.freeze({kernelAlpha, emissions, state});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FrequencyPigment;

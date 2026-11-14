/* A continuous alpha-density field. Three sliding box convolutions approximate
 * diffusion in linear time; adjacent radii are interpolated, so growth never jumps
 * between integer blur widths. The field contains no nested outline/ring passes.
 */
const FrequencyPigment = (() => {
  function box(source, width, height, radius, horizontal) {
    const out = new Float32Array(source.length);
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const stride = horizontal ? 1 : width;
    const divisor = radius * 2 + 1;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * width : line;
      let sum = 0;
      for (let x = 0; x <= Math.min(radius, length - 1); x++) sum += source[base + x * stride];
      for (let x = 0; x < length; x++) {
        out[base + x * stride] = sum / divisor;
        const remove = x - radius, add = x + radius + 1;
        if (remove >= 0) sum -= source[base + remove * stride];
        if (add < length) sum += source[base + add * stride];
      }
    }
    return out;
  }
  function atRadius(source, width, height, radius) {
    let field = source;
    for (let pass = 0; pass < 3; pass++) {
      field = box(field, width, height, radius, true);
      field = box(field, width, height, radius, false);
    }
    return field;
  }
  function diffuse(source, width, height, sigma, cache = {}) {
    const radius = Math.max(0, Math.sqrt(sigma * sigma + 0.25) - 0.5);
    const lower = Math.floor(radius), fraction = radius - lower;
    if (cache.radius !== lower) {
      const reused = cache.radius === lower - 1 ? cache.upper : null;
      cache.lower = reused || atRadius(source, width, height, lower);
      cache.upper = atRadius(source, width, height, lower + 1);
      cache.radius = lower;
    }
    const result = new Float32Array(source.length);
    for (let i = 0; i < result.length; i++) result[i] = cache.lower[i] * (1 - fraction) + cache.upper[i] * fraction;
    return result;
  }
  return Object.freeze({diffuse});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FrequencyPigment;

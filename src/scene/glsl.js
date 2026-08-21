// ============================================================
// SHARED GLSL CHUNKS
// Value-noise fBm used by the nebula and the stellar surface.
//
// Fixed-octave variants rather than a loop with a break: the
// nebula shell covers the whole screen, so this shader is the
// most fill-rate-expensive thing on the page and the compiler
// unrolls these cleanly on low-end GPUs.
// ============================================================

export const NOISE_CHUNK = /* glsl */ `
  float cxHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float cxNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(cxHash(i + vec3(0.0, 0.0, 0.0)), cxHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(cxHash(i + vec3(0.0, 1.0, 0.0)), cxHash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(cxHash(i + vec3(0.0, 0.0, 1.0)), cxHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(cxHash(i + vec3(0.0, 1.0, 1.0)), cxHash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float cxFbm2(vec3 p) {
    return 0.5 * cxNoise(p) + 0.25 * cxNoise(p * 2.03);
  }

  float cxFbm3(vec3 p) {
    float v = 0.5 * cxNoise(p);
    p *= 2.03; v += 0.25 * cxNoise(p);
    p *= 2.03; v += 0.125 * cxNoise(p);
    return v;
  }

  float cxFbm4(vec3 p) {
    float v = 0.5 * cxNoise(p);
    p *= 2.03; v += 0.25 * cxNoise(p);
    p *= 2.03; v += 0.125 * cxNoise(p);
    p *= 2.03; v += 0.0625 * cxNoise(p);
    return v;
  }
`;

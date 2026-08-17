/**
 * Minimal plain-object vector math. Deliberately not Three.js `Vector3`:
 * the rope model, threshold math and benchmark harness all run headlessly in
 * Node unit tests, and none of them should have to import a rendering
 * library to add two vectors. Three.js types are used only in the render
 * layer.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

/** Returns a zero vector for zero-length input rather than NaN, so a
 * degenerate rope (attachment exactly at the puller) reports no force
 * instead of poisoning the solver. */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

/** Rotates `v` by unit quaternion `q` (q * v * q⁻¹). */
export function rotateByQuat(v: Vec3, q: Quat): Vec3 {
  // t = 2 * (q_vec x v); result = v + q_w * t + q_vec x t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx)
  };
}

/** Body-local point -> world point, given the body's translation/rotation. */
export const localToWorld = (local: Vec3, translation: Vec3, rotation: Quat): Vec3 =>
  add(rotateByQuat(local, rotation), translation);

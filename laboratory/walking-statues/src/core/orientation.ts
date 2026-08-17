import * as THREE from "three";

export interface RollPitchYaw {
  /** Rotation about world x (side-to-side tilt), radians. */
  roll: number;
  /** Rotation about world y (forward-backward tilt), radians. */
  pitch: number;
  /** Rotation about world z, radians. */
  yaw: number;
}

const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();

/**
 * Decomposes a world-space quaternion into roll/pitch/yaw using an
 * 'XYZ'-ordered Euler sequence. This is an approximation, not an exact
 * inverse: any three-angle decomposition degenerates near gimbal lock, and
 * roll/pitch stop being independent once either grows large. It is adequate
 * for this project because a run is already flagged as fallen well before
 * that regime (see PHYSICS_MODEL.md).
 */
export function quaternionToRollPitchYaw(
  x: number,
  y: number,
  z: number,
  w: number
): RollPitchYaw {
  scratchQuat.set(x, y, z, w);
  scratchEuler.setFromQuaternion(scratchQuat, "XYZ");
  return { roll: scratchEuler.x, pitch: scratchEuler.y, yaw: scratchEuler.z };
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

import * as THREE from "three";

/**
 * Rapier's Cylinder shape (and Three's CylinderGeometry) both put the
 * height axis along local Y by convention. The A4 family needs that axis
 * along body-local X (forward) so the round cross-section faces the y-z
 * plane and the body can roll side to side on it. This -90 degree rotation
 * about Z maps local Y onto local X; used identically for the collider and
 * the visual mesh so they always stay aligned.
 */
export function cylinderAxisAlongXQuaternion(): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
}

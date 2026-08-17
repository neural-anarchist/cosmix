import * as THREE from "three";
import { STATUE_BASE_MATERIAL } from "../materials";
import { cylinderAxisAlongXQuaternion } from "./geometryUtils";
import type { BaseDims, BaseGeometryModule } from "./types";

const RADIAL_SEGMENTS = 28;

/**
 * A4: lateral cylindrical rocker, axis along x (forward), round
 * cross-section in the y-z plane so the body can roll side to side on it.
 *
 * A cylinder's height is fixed by its radius (topZ = 2r); baseHeightRatio
 * does not apply to this family and is ignored (the UI disables it when
 * A4 is selected — see ControlPanel.tsx).
 *
 * Using a full 360-degree cylinder rather than a partial rocking-chair arc
 * is a documented Phase 1 simplification: it removes any hard geometric
 * roll limit from the base shape itself, so the maximum practical rocking
 * amplitude in this family is set entirely by the torso/head COM and the
 * applied forces, not by a heel/toe facet catching the ground. See
 * PHYSICS_MODEL.md.
 */
export const a4LateralRocker: BaseGeometryModule = {
  id: "A4",
  label: "A4 — Lateral cylindrical rocker",

  dims(params): BaseDims {
    const { heightM: H, totalMassKg: M } = params;
    const radius = (params.baseWidthRatio * H) / 2;
    return {
      lengthX: params.baseLengthRatio * H,
      widthY: 2 * radius,
      topZ: 2 * radius,
      massKg: params.baseMassFraction * M,
      // Line contact: no finite tipping lever arm, so no static tipping
      // threshold exists for this family. Stability is a rolling-equilibrium
      // question instead (PHYSICS_MODEL.md).
      contactHalfWidthY: 0,
      contactKind: "rocker"
    };
  },

  colliderDescs(params, RAPIER) {
    const d = this.dims(params);
    const radius = d.widthY / 2;
    const density = d.massKg / (Math.PI * radius * radius * d.lengthX);
    const rotation = cylinderAxisAlongXQuaternion();

    return [
      RAPIER.ColliderDesc.cylinder(d.lengthX / 2, radius)
        .setTranslation(0, 0, radius)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
        .setDensity(density)
    ];
  },

  visual(params) {
    const d = this.dims(params);
    const radius = d.widthY / 2;
    const rotation = cylinderAxisAlongXQuaternion();

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, d.lengthX, RADIAL_SEGMENTS),
      STATUE_BASE_MATERIAL
    );
    mesh.quaternion.copy(rotation);
    mesh.position.set(0, 0, radius);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
};

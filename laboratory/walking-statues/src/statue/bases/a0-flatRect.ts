import * as THREE from "three";
import { STATUE_BASE_MATERIAL } from "../materials";
import { validateSharedBaseParams } from "./shared";
import type { BaseDims, BaseGeometryModule } from "./types";

/**
 * A0: flat rectangular prism base — the validated Phase 1 reference.
 *
 * Deliberately NOT rebuilt on the shared polytope path the other flat families
 * use. Its collider is the exact analytic cuboid the static-equilibrium,
 * force-ramp, sliding and rocking benchmarks were validated against, and
 * re-expressing it as a hull of mesh vertices would change the simulated shape
 * by whatever the two constructions disagree about, however small. A0's job is
 * to be the fixed point everything else is measured from.
 */
export const a0FlatRect: BaseGeometryModule = {
  id: "A0",
  label: "A0 — Flat rectangular prism",
  summary: "The validated Phase 1 baseline: a plain box, symmetric in both directions.",
  usesParameters: [
    "baseWidthRatio",
    "baseLengthRatio",
    "baseHeightRatio",
    "baseMassFraction"
  ],
  colliderApproximation: () => "Exact: a single analytic cuboid, identical to the visual mesh.",

  validate(params) {
    validateSharedBaseParams(params, this.usesParameters);
  },

  polytope: () => null,
  colliderPolytopes: () => null,

  dims(params): BaseDims {
    const { heightM: H, totalMassKg: M } = params;
    const lengthX = params.baseLengthRatio * H;
    const widthY = params.baseWidthRatio * H;
    const heightZ = params.baseHeightRatio * H;
    return {
      lengthX,
      widthY,
      topZ: heightZ,
      massKg: params.baseMassFraction * M,
      // A flat bottom face tips about its own edge, so the restoring lever
      // arm is the full lateral half-extent.
      contactHalfWidthY: widthY / 2,
      contactHalfWidthYLeft: widthY / 2,
      contactHalfWidthYRight: widthY / 2,
      contactKind: "flat",
      volumeM3: lengthX * widthY * heightZ,
      footprintAreaM2: lengthX * widthY,
      mountLeanRad: 0,
      offsetX: 0,
      minX: -lengthX / 2,
      maxX: lengthX / 2,
      minY: -widthY / 2,
      maxY: widthY / 2,
      // A uniform rectangular prism's centroid is at half its height.
      comLocal: { x: 0, y: 0, z: heightZ / 2 }
    };
  },

  colliderDescs(params, RAPIER) {
    const d = this.dims(params);
    const halfH = d.topZ / 2;
    const density = d.massKg / (d.lengthX * d.widthY * d.topZ);

    return [
      RAPIER.ColliderDesc.cuboid(d.lengthX / 2, d.widthY / 2, halfH)
        .setTranslation(0, 0, halfH)
        .setDensity(density)
    ];
  },

  visual(params) {
    const d = this.dims(params);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.lengthX, d.widthY, d.topZ), STATUE_BASE_MATERIAL);
    mesh.position.set(0, 0, d.topZ / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
};

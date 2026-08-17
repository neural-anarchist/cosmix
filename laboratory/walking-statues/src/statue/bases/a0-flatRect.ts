import * as THREE from "three";
import { STATUE_BASE_MATERIAL } from "../materials";
import type { BaseDims, BaseGeometryModule } from "./types";

/** A0: flat rectangular prism base. */
export const a0FlatRect: BaseGeometryModule = {
  id: "A0",
  label: "A0 — Flat rectangular prism",

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
      contactKind: "flat"
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

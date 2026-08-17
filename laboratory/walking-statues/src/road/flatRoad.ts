import * as THREE from "three";
import type { BuildContext } from "../physics/types";
import { createRoadBody } from "./body";
import type { RoadBuild, RoadParams } from "./types";

const SURFACE_COLOR = 0x1b2438;
const CENTERLINE_COLOR = 0xd7b470;
const BOUNDARY_COLOR = 0x83b8d7;

/**
 * Builds the flat rigid road: the fixed collider from `createRoadBody` (top
 * face at z = 0) plus a matching Three.js visual (surface, centerline,
 * left/right boundary markers).
 */
export function buildFlatRoad(ctx: BuildContext, params: RoadParams): RoadBuild {
  const { RAPIER, world, scene } = ctx;
  const body = createRoadBody(RAPIER, world, params);
  const halfWidth = params.widthM / 2;

  const visual = new THREE.Group();
  visual.name = "road";

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(params.lengthM, params.widthM),
    new THREE.MeshStandardMaterial({ color: SURFACE_COLOR, roughness: 0.95, metalness: 0 })
  );
  surface.receiveShadow = true;
  visual.add(surface);

  const centerline = makeStripe(params.lengthM, 0.04, CENTERLINE_COLOR, 0.7);
  centerline.position.set(0, 0, 0.005);
  visual.add(centerline);

  for (const side of [-1, 1] as const) {
    const boundary = makeStripe(params.lengthM, 0.06, BOUNDARY_COLOR, 0.55);
    boundary.position.set(0, side * halfWidth, 0.005);
    visual.add(boundary);
  }

  scene.add(visual);

  return {
    visual,
    collider: body.collider,
    dispose(): void {
      scene.remove(visual);
      disposeGroup(visual);
      world.removeRigidBody(body.rigidBody);
    }
  };
}

function makeStripe(lengthM: number, widthM: number, color: number, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(lengthM, widthM),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
  );
  return mesh;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const material = obj.material;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
    }
  });
}

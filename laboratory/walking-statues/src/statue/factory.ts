import * as THREE from "three";
import type { BuildContext } from "../physics/types";
import { getBaseModule } from "./bases/registry";
import { createStatueBody } from "./body";
import { STATUE_STONE_MATERIAL } from "./materials";
import type { StatueBuild, StatueParams } from "./types";

const COM_MARKER_RADIUS_M = 0.08;
const COM_MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xd7b470 });

const COLLIDER_WIREFRAME_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x83b8d7,
  wireframe: true,
  transparent: true,
  opacity: 0.85
});

/**
 * Builds the simulated statue: the physics body (delegated to
 * `createStatueBody`, which the headless benchmarks share) plus the
 * display-only meshes, collider wireframe overlay and COM marker.
 *
 * The display geometry is never used for collision and the collision
 * geometry is never rendered except through the explicit overlay — both
 * derive from the same `StatueGeometry` scalars so they cannot drift.
 */
export function createStatue(
  params: StatueParams,
  ctx: BuildContext,
  contactFrictionCoefficient: number,
  contactRestitution: number
): StatueBuild {
  const { RAPIER, world, scene } = ctx;

  const body = createStatueBody(params, RAPIER, world, contactFrictionCoefficient, contactRestitution);
  const { geometry } = body;
  const { torso, head } = geometry;

  // ---- Display meshes.
  const baseVisual = getBaseModule(params.baseFamily).visual(params);

  const visual = new THREE.Group();
  visual.name = "statue-visual";
  visual.add(baseVisual);

  const torsoMesh = new THREE.Mesh(
    new THREE.BoxGeometry(torso.depthX, torso.widthY, torso.heightZ),
    STATUE_STONE_MATERIAL
  );
  torsoMesh.position.set(0, 0, torso.centerZ);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  visual.add(torsoMesh);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(head.radius, 20, 16), STATUE_STONE_MATERIAL);
  headMesh.position.set(0, 0, head.centerZ);
  headMesh.castShadow = true;
  visual.add(headMesh);

  scene.add(visual);

  // ---- Collider-visibility overlay: wireframe proxies, one per collider,
  // toggled independently of the display mesh above.
  const colliderVisual = new THREE.Group();
  colliderVisual.name = "statue-collider-overlay";
  colliderVisual.visible = false;
  for (const child of baseVisual.children.length ? baseVisual.children : [baseVisual]) {
    colliderVisual.add(cloneAsWireframe(child));
  }
  const torsoWire = new THREE.Mesh(torsoMesh.geometry, COLLIDER_WIREFRAME_MATERIAL);
  torsoWire.position.copy(torsoMesh.position);
  torsoWire.quaternion.copy(torsoMesh.quaternion);
  colliderVisual.add(torsoWire);
  const headWire = new THREE.Mesh(headMesh.geometry, COLLIDER_WIREFRAME_MATERIAL);
  headWire.position.copy(headMesh.position);
  colliderVisual.add(headWire);
  scene.add(colliderVisual);

  const comMarker = new THREE.Mesh(new THREE.SphereGeometry(COM_MARKER_RADIUS_M, 12, 10), COM_MARKER_MATERIAL);
  comMarker.visible = false;
  scene.add(comMarker);

  return {
    visual,
    colliderVisual,
    comMarker,
    rigidBody: body.rigidBody,
    colliders: body.colliders,
    geometry,
    dispose(): void {
      scene.remove(visual);
      scene.remove(colliderVisual);
      scene.remove(comMarker);
      disposeObject3D(visual);
      disposeObject3D(colliderVisual);
      comMarker.geometry.dispose();
      world.removeRigidBody(body.rigidBody);
    }
  };
}

function cloneAsWireframe(source: THREE.Object3D): THREE.Object3D {
  if (source instanceof THREE.Mesh) {
    const wire = new THREE.Mesh(source.geometry, COLLIDER_WIREFRAME_MATERIAL);
    wire.position.copy(source.position);
    wire.quaternion.copy(source.quaternion);
    return wire;
  }
  const group = new THREE.Group();
  source.children.forEach((child) => group.add(cloneAsWireframe(child)));
  return group;
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    }
  });
}

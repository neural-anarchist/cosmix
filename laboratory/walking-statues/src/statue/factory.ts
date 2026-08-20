import * as THREE from "three";
import type { BuildContext } from "../physics/types";
import { polytopeToGeometry } from "./bases/polytope";
import { getBaseModule } from "./bases/registry";
import { createStatueBody, type StatueComponent } from "./body";
import { STATUE_STONE_MATERIAL } from "./materials";
import { buildHeadVisual, buildTorsoVisual } from "./procedural";
import type { StatueBuild, StatueParams } from "./types";

const COM_MARKER_RADIUS_M = 0.08;
const COM_MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xd7b470 });
/** An overridden COM is an abstract probe rather than a derived property, so it
 * is drawn in a different colour to stop it reading as a measurement. */
const COM_OVERRIDE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x9b6bff });

/**
 * One wireframe colour per compound component, so the collider overlay answers
 * "which primitive is which" at a glance instead of showing an undifferentiated
 * cage. Matches the legend in the diagnostics panel.
 */
export const COMPONENT_COLORS: Record<StatueComponent, number> = {
  base: 0x83b8d7,
  torso: 0xd7b470,
  head: 0xd68c70
};

const COMPONENT_MATERIALS: Record<StatueComponent, THREE.Material> = {
  base: wireframeMaterial(COMPONENT_COLORS.base),
  torso: wireframeMaterial(COMPONENT_COLORS.torso),
  head: wireframeMaterial(COMPONENT_COLORS.head)
};

function wireframeMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 });
}

/**
 * Builds the simulated statue: the physics body (delegated to
 * `createStatueBody`, which the headless benchmarks share) plus the
 * display-only meshes, collider wireframe overlay and COM marker.
 *
 * The display geometry is never used for collision and the collision geometry
 * is never rendered except through the explicit overlay. Both are placed from
 * the same `Placement` values in `StatueGeometry`, so the drawn statue and the
 * simulated statue cannot end up in different poses — including under an
 * intrinsic forward lean, which moves the upper body relative to the base.
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
  const { torso, head, torsoPlacement, headPlacement } = geometry;

  const baseModule = getBaseModule(params.baseFamily);

  // ---- Display meshes.
  const visual = new THREE.Group();
  visual.name = "statue-visual";

  const baseVisual = baseModule.visual(params);
  visual.add(baseVisual);

  const torsoVisual = buildTorsoVisual(
    {
      depthBottomX: torso.depthBottomX,
      widthBottomY: torso.widthBottomY,
      depthTopX: torso.depthTopX,
      widthTopY: torso.widthTopY,
      heightZ: torso.heightZ,
      detail: params.visualDetail
    },
    STATUE_STONE_MATERIAL
  );
  applyPlacement(torsoVisual, torsoPlacement);
  visual.add(torsoVisual);

  const headVisual = buildHeadVisual(
    { depthX: head.depthX, widthY: head.widthY, heightZ: head.heightZ, detail: params.visualDetail },
    STATUE_STONE_MATERIAL
  );
  applyPlacement(headVisual, headPlacement);
  visual.add(headVisual);

  scene.add(visual);

  // ---- Collider overlay: one wireframe proxy per actual collider, built from
  // the collider's own dimensions rather than from the display mesh, and
  // coloured by component.
  const colliderVisual = new THREE.Group();
  colliderVisual.name = "statue-collider-overlay";
  colliderVisual.visible = false;

  // The overlay draws the *colliders*, not the display mesh. For a
  // flat-bottomed family those are the wedges the solver actually has, which is
  // the whole point of a collider view — showing the undivided display solid
  // here would hide the one place the collision model departs from the drawing.
  const baseColliderPolytopes = baseModule.colliderPolytopes(params);
  if (baseColliderPolytopes) {
    for (const piece of baseColliderPolytopes) {
      colliderVisual.add(new THREE.Mesh(polytopeToGeometry(piece), COMPONENT_MATERIALS.base));
    }
  } else {
    // A0 and A4: the collider is an analytic primitive identical to the mesh.
    colliderVisual.add(cloneAsWireframe(baseVisual, COMPONENT_MATERIALS.base));
  }

  const torsoWire = new THREE.Mesh(
    new THREE.BoxGeometry(torso.depthX, torso.widthY, torso.heightZ),
    COMPONENT_MATERIALS.torso
  );
  applyPlacement(torsoWire, torsoPlacement);
  colliderVisual.add(torsoWire);

  const headWire = new THREE.Mesh(
    new THREE.SphereGeometry(head.radius, 16, 12),
    COMPONENT_MATERIALS.head
  );
  applyPlacement(headWire, headPlacement);
  colliderVisual.add(headWire);

  scene.add(colliderVisual);

  const comMarker = new THREE.Mesh(
    new THREE.SphereGeometry(COM_MARKER_RADIUS_M, 12, 10),
    body.mass.comOverridden ? COM_OVERRIDE_MATERIAL : COM_MARKER_MATERIAL
  );
  comMarker.visible = false;
  scene.add(comMarker);

  return {
    visual,
    colliderVisual,
    comMarker,
    rigidBody: body.rigidBody,
    colliders: body.colliders,
    colliderInfo: body.colliderInfo,
    geometry,
    mass: body.mass,
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

function applyPlacement(
  object: THREE.Object3D,
  placement: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } }
): void {
  object.position.set(placement.position.x, placement.position.y, placement.position.z);
  object.quaternion.set(placement.rotation.x, placement.rotation.y, placement.rotation.z, placement.rotation.w);
}

function cloneAsWireframe(source: THREE.Object3D, material: THREE.Material): THREE.Object3D {
  if (source instanceof THREE.Mesh) {
    const wire = new THREE.Mesh(source.geometry, material);
    wire.position.copy(source.position);
    wire.quaternion.copy(source.quaternion);
    wire.scale.copy(source.scale);
    return wire;
  }
  const group = new THREE.Group();
  group.position.copy(source.position);
  group.quaternion.copy(source.quaternion);
  source.children.forEach((child) => group.add(cloneAsWireframe(child, material)));
  return group;
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    }
  });
}

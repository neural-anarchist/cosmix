import * as THREE from "three";
import type { VisualDetail } from "./types";

/**
 * Procedural display geometry for the statue's upper body. Everything here is
 * generated from Three.js primitives and hand-built buffer geometry — there is
 * no external mesh, scan, model download or texture anywhere in this project.
 *
 * None of this is ever used for collision. The collision model stays a compound
 * of three simple primitives (see `statue/body.ts`), and the collider overlay
 * draws those separately so the difference is always inspectable rather than
 * implied.
 */

/** Tessellation levels. These affect triangle counts only; a unit test asserts
 * that mass, COM and inertia are identical across all three. */
const DETAIL_SEGMENTS: Record<VisualDetail, number> = { low: 6, medium: 12, high: 24 };

export const detailSegments = (detail: VisualDetail): number => DETAIL_SEGMENTS[detail];

/**
 * A rectangular frustum: a box whose top face may differ in width and depth
 * from its bottom face. Built explicitly rather than via a 4-segment cylinder
 * so that width (y) and depth (x) taper independently and the corners land
 * exactly on the axes.
 *
 * Centred on the origin, `height` tall along z.
 */
export function taperedBoxGeometry(
  bottomDepthX: number,
  bottomWidthY: number,
  topDepthX: number,
  topWidthY: number,
  height: number
): THREE.BufferGeometry {
  const hz = height / 2;
  const bx = bottomDepthX / 2;
  const by = bottomWidthY / 2;
  const tx = topDepthX / 2;
  const ty = topWidthY / 2;

  // 8 corners: 0-3 bottom (CCW seen from +z), 4-7 top.
  const v: number[][] = [
    [-bx, -by, -hz],
    [bx, -by, -hz],
    [bx, by, -hz],
    [-bx, by, -hz],
    [-tx, -ty, hz],
    [tx, -ty, hz],
    [tx, ty, hz],
    [-tx, ty, hz]
  ];

  // Each face listed as two triangles, wound outward.
  const faces: number[][] = [
    [0, 1, 2],
    [0, 2, 3], // bottom (normal -z; wound for outward below)
    [4, 6, 5],
    [4, 7, 6], // top
    [0, 5, 1],
    [0, 4, 5], // -y side
    [2, 7, 3],
    [2, 6, 7], // +y side
    [1, 6, 2],
    [1, 5, 6], // +x side
    [3, 4, 0],
    [3, 7, 4] // -x side
  ];

  const positions: number[] = [];
  for (const [a, b, c] of faces) {
    positions.push(...v[a!]!, ...v[b!]!, ...v[c!]!);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Flat-shaded normals from the triangle winding: correct for a faceted stone
  // silhouette and avoids hand-writing a normal per vertex.
  geometry.computeVertexNormals();
  return geometry;
}

export interface TorsoVisualSpec {
  depthBottomX: number;
  widthBottomY: number;
  depthTopX: number;
  widthTopY: number;
  heightZ: number;
  detail: VisualDetail;
}

/**
 * The tapered torso, plus a shallow shoulder shelf and the long arms-at-sides
 * relief that reads as a Moai body. Centred on its own origin so the caller can
 * place it with the geometry module's `Placement`.
 */
export function buildTorsoVisual(spec: TorsoVisualSpec, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = "statue-torso-visual";

  const body = new THREE.Mesh(
    taperedBoxGeometry(spec.depthBottomX, spec.widthBottomY, spec.depthTopX, spec.widthTopY, spec.heightZ),
    material
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Arm relief: a slim vertical slab down each side, standing slightly proud of
  // the torso surface. Purely decorative silhouette work.
  const armDepth = spec.depthTopX * 0.34;
  const armWidth = spec.widthTopY * 0.1;
  const armHeight = spec.heightZ * 0.62;
  for (const side of [-1, 1] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armDepth, armWidth, armHeight), material);
    // Ride the taper: place each arm at the local half-width for its height.
    const armCenterZ = -spec.heightZ * 0.06;
    const t = (armCenterZ + spec.heightZ / 2) / spec.heightZ;
    const halfWidthHere = (spec.widthBottomY + (spec.widthTopY - spec.widthBottomY) * t) / 2;
    arm.position.set(spec.depthTopX * 0.08, side * (halfWidthHere - armWidth * 0.15), armCenterZ);
    arm.castShadow = true;
    group.add(arm);
  }

  // Shoulder shelf, a thin wider slab at the very top.
  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(spec.depthTopX * 1.04, spec.widthTopY * 1.02, spec.heightZ * 0.05),
    material
  );
  shelf.position.set(0, 0, spec.heightZ / 2 - spec.heightZ * 0.025);
  shelf.castShadow = true;
  group.add(shelf);

  return group;
}

export interface HeadVisualSpec {
  depthX: number;
  widthY: number;
  heightZ: number;
  detail: VisualDetail;
}

/**
 * The head: an elongated tapered block with the features a Moai is recognisable
 * by — heavy brow ridge, long straight nose, recessed eye sockets, thin lips and
 * elongated ears. All of it is display-only relief on top of a shape the physics
 * treats as a single sphere.
 */
export function buildHeadVisual(spec: HeadVisualSpec, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = "statue-head-visual";

  // Skull: slightly wider at the brow than at the jaw.
  const skull = new THREE.Mesh(
    taperedBoxGeometry(spec.depthX * 0.92, spec.widthY * 0.9, spec.depthX, spec.widthY, spec.heightZ),
    material
  );
  skull.castShadow = true;
  skull.receiveShadow = true;
  group.add(skull);

  const front = spec.depthX / 2;

  // Brow ridge: the defining Moai feature, a heavy bar across the upper face.
  const brow = new THREE.Mesh(
    new THREE.BoxGeometry(spec.depthX * 0.22, spec.widthY * 0.94, spec.heightZ * 0.13),
    material
  );
  brow.position.set(front * 0.92, 0, spec.heightZ * 0.16);
  brow.castShadow = true;
  group.add(brow);

  // Eye sockets: shallow recesses tucked under the brow.
  for (const side of [-1, 1] as const) {
    const socket = new THREE.Mesh(
      new THREE.BoxGeometry(spec.depthX * 0.1, spec.widthY * 0.3, spec.heightZ * 0.09),
      material
    );
    socket.position.set(front * 0.86, side * spec.widthY * 0.26, spec.heightZ * 0.05);
    group.add(socket);
  }

  // Nose: long, straight, running from the brow down past mid-face.
  const noseHeight = spec.heightZ * 0.34;
  const nose = new THREE.Mesh(
    taperedBoxGeometry(
      spec.depthX * 0.3,
      spec.widthY * 0.3,
      spec.depthX * 0.22,
      spec.widthY * 0.16,
      noseHeight
    ),
    material
  );
  nose.position.set(front * 0.95, 0, -spec.heightZ * 0.04);
  nose.castShadow = true;
  group.add(nose);

  // Lips: a thin bar low on the face.
  const lips = new THREE.Mesh(
    new THREE.BoxGeometry(spec.depthX * 0.14, spec.widthY * 0.38, spec.heightZ * 0.055),
    material
  );
  lips.position.set(front * 0.9, 0, -spec.heightZ * 0.3);
  group.add(lips);

  // Ears: the elongated slabs down each side of the head.
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Mesh(
      new THREE.BoxGeometry(spec.depthX * 0.16, spec.widthY * 0.08, spec.heightZ * 0.46),
      material
    );
    ear.position.set(-spec.depthX * 0.02, side * (spec.widthY / 2), -spec.heightZ * 0.06);
    ear.castShadow = true;
    group.add(ear);
  }

  return group;
}

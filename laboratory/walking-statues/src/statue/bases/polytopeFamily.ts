import * as THREE from "three";
import type { BaseFamilyId, StatueParams } from "../types";
import { STATUE_BASE_MATERIAL } from "../materials";
import { footprintArea, footprintBounds, wedgeDecomposition } from "./footprints";
import {
  extrudeFootprint,
  polytopeBounds,
  polytopeCentroid,
  polytopePoints,
  polytopeToGeometry,
  polytopeVolume,
  translatePolytopeX,
  type Polytope,
  type Vec2
} from "./polytope";
import { resolveSharedBaseParams, validateSharedBaseParams, type ResolvedBaseParams, type SharedBaseParameterId } from "./shared";
import type { BaseContactKind, BaseDims, BaseGeometryModule } from "./types";

/**
 * What a polytope-backed family has to produce: one closed convex solid, plus
 * enough context for the generic machinery to derive its contact and mass
 * properties.
 */
export interface BaseShape {
  polytope: Polytope;
  contactKind: BaseContactKind;
  /** Ground-plane outline for a flat-bottomed family; null for a rocker,
   * which touches along a line and has no contact area or tipping edge. */
  footprint: Vec2[] | null;
  /** Fore-aft tilt imparted to the upper body, radians. Non-zero only for a
   * family whose top face is deliberately cut at an angle. */
  mountLeanRad: number;
  /** The top surface, needed to rebuild the solid as wedges. Defaults to the
   * polytope's flat top. */
  topZAt?: (point: Vec2) => number;
  /** Set by `definePolytopeFamily` when it applies the family's x-offset, so
   * the wedge rebuild lands in the same place as the whole solid. */
  appliedOffsetX?: number;
  /**
   * Height at which the upper body is mounted, when that is not simply the
   * top of the solid. A base whose top face is cut at an angle is taller at
   * the back than at the front, and mounting the torso on its highest corner
   * would leave it floating; the mount plane's height on the centerline is the
   * meaningful figure instead.
   */
  topZOverride?: number;
}

export interface PolytopeFamilySpec {
  id: BaseFamilyId;
  label: string;
  summary: string;
  usesParameters: readonly SharedBaseParameterId[];
  colliderApproximation(params: StatueParams): string;
  /** Family-specific validation, run after the shared range checks. */
  validate?(params: StatueParams, resolved: ResolvedBaseParams): void;
  build(params: StatueParams, resolved: ResolvedBaseParams): BaseShape;
}

/**
 * Builds a `BaseGeometryModule` from a shape definition.
 *
 * Every family expressed this way gets the same treatment: the collider is the
 * convex hull of the polytope's own vertices, the display mesh is the same
 * polytope's own triangles, and the density is derived from the same polytope's
 * exact volume. There is no per-family opportunity for the simulated shape, the
 * drawn shape and the assumed volume to disagree, which is the failure mode
 * that a dozen hand-written families would otherwise invite.
 */
export function definePolytopeFamily(spec: PolytopeFamilySpec): BaseGeometryModule {
  const shapeOf = (params: StatueParams): BaseShape => {
    const resolved = resolveSharedBaseParams(params);
    const shape = spec.build(params, resolved);
    if (!spec.usesParameters.includes("baseOffsetXRatio") || resolved.offsetX === 0) {
      return shape;
    }
    return {
      ...shape,
      polytope: translatePolytopeX(shape.polytope, resolved.offsetX),
      appliedOffsetX: resolved.offsetX
    };
  };

  return {
    id: spec.id,
    label: spec.label,
    summary: spec.summary,
    usesParameters: spec.usesParameters,
    colliderApproximation: spec.colliderApproximation,

    validate(params) {
      validateSharedBaseParams(params, spec.usesParameters);
      spec.validate?.(params, resolveSharedBaseParams(params));
    },

    polytope(params) {
      this.validate(params);
      return shapeOf(params).polytope;
    },

    colliderPolytopes(params) {
      this.validate(params);
      const shape = shapeOf(params);
      if (!shape.footprint) return [shape.polytope];

      // Flat-bottomed families are handed to the solver as a fan of wedges
      // rather than as one solid — see `wedgeDecomposition` for the measured
      // contact-patch collapse that makes this necessary. The union is the same
      // outline extruded to the same top surface, so the geometry is unchanged.
      const topZAt = shape.topZAt ?? (() => polytopeBounds(shape.polytope).maxZ);
      return wedgeDecomposition(shape.footprint, CONTACT_WEDGE_COUNT).map((wedge) =>
        translatePolytopeX(extrudeFootprint(wedge, topZAt), shape.appliedOffsetX ?? 0)
      );
    },

    dims(params): BaseDims {
      this.validate(params);
      const resolved = resolveSharedBaseParams(params);
      const shape = shapeOf(params);
      const bounds = polytopeBounds(shape.polytope);
      const volumeM3 = polytopeVolume(shape.polytope);

      if (!(volumeM3 > 0)) {
        throw new Error(
          `Base family "${spec.id}" produced a solid of non-positive volume (${volumeM3}). ` +
            "Check W_base/H, L_base/H and H_base/H."
        );
      }

      // A flat base tips about the edge of its own footprint. When the
      // footprint is laterally asymmetric the two sides give way at different
      // loads, so both arms are reported and the smaller one governs.
      const left = shape.footprint ? footprintBounds(shape.footprint).maxY : 0;
      const right = shape.footprint ? -footprintBounds(shape.footprint).minY : 0;

      return {
        lengthX: bounds.maxX - bounds.minX,
        widthY: bounds.maxY - bounds.minY,
        topZ: shape.topZOverride ?? bounds.maxZ,
        massKg: resolved.massKg,
        contactHalfWidthY: Math.min(left, right),
        contactHalfWidthYLeft: left,
        contactHalfWidthYRight: right,
        contactKind: shape.contactKind,
        volumeM3,
        footprintAreaM2: shape.footprint ? footprintArea(shape.footprint) : null,
        mountLeanRad: shape.mountLeanRad,
        offsetX: spec.usesParameters.includes("baseOffsetXRatio") ? resolved.offsetX : 0,
        comLocal: polytopeCentroid(shape.polytope)
      };
    },

    colliderDescs(params, RAPIER) {
      const d = this.dims(params);
      // One uniform density across every piece, so however the solid is
      // subdivided each piece carries exactly its share of the base's mass and
      // the aggregate is unchanged.
      const density = d.massKg / d.volumeM3;
      const pieces = this.colliderPolytopes(params) ?? [];
      return pieces.map((piece) => {
        const desc = RAPIER.ColliderDesc.convexHull(polytopePoints(piece));
        if (!desc) {
          throw new Error(
            `Base family "${spec.id}" produced a degenerate point set that Rapier could not hull. ` +
              "This usually means a dimension collapsed to zero; check W_base/H, L_base/H and H_base/H."
          );
        }
        return desc.setDensity(density);
      });
    },

    visual(params) {
      const shape = shapeOf(params);
      const mesh = new THREE.Mesh(polytopeToGeometry(shape.polytope), STATUE_BASE_MATERIAL);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
  };
}

/** Facet counts for the curved families. Fixed rather than tied to
 * `visualDetail`, because these triangles are the collider as well as the
 * mesh — letting a display setting change them would make the simulation
 * depend on a cosmetic control, which is precisely what Step 1 established
 * must never happen. */
export const FOOTPRINT_SEGMENTS = 32;
export const ROCKER_ARC_SEGMENTS = 48;
/**
 * How many wedges a flat-bottomed base's collision solid is split into.
 *
 * This is a discretisation parameter, chosen the way a timestep is: by refining
 * it until the answer stops changing. Rapier keeps at most four solver contacts
 * per collider pair, so the count sets how many contact constraints the base
 * gets. Measured drift of the D-base under a steady sub-threshold pull held for
 * five seconds, against a 0.5 mm rest tolerance:
 *
 *   4 wedges  -> 4.1 mm     6 wedges -> 2.8 mm
 *   8 wedges  -> 0.00 mm   12 wedges -> 0.09 mm   16 wedges -> 0.02 mm
 *
 * Eight is the first value in the converged region, and twelve and sixteen
 * confirm that nothing further is gained. The other flat families are already
 * at rest by four; the D-base needs more because its support region is
 * fore-aft asymmetric, so its contact constraints have to be spread further to
 * hold the same pull.
 */
export const CONTACT_WEDGE_COUNT = 8;

/** Odd on purpose: an even count straddles the centreline, so no station would
 * sit at the widest point and the built base would come out narrower than the
 * W_base it reports. */
export const ROCKER_STATIONS = 13;

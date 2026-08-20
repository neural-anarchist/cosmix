import type { StatueParams } from "../types";
import { convexHull2D } from "./footprints";
import type { Vec2 } from "./polytope";
import { getBaseModule } from "./registry";

/**
 * The base's outline seen from above, for the plan-view diagram.
 *
 * Two different things can be meant by "the footprint", and conflating them
 * would misinform exactly where it matters most: for a flat-bottomed family the
 * outline *is* the ground-contact patch and the tipping edge, whereas a rocker's
 * plan silhouette is just its widest cross-section — it touches the road along a
 * line through the middle of that outline and has no tipping edge at all. The
 * flag says which one is being returned so the caption can too.
 */
export function basePlanOutline(params: StatueParams): {
  outline: Vec2[];
  isContactFootprint: boolean;
} {
  const module = getBaseModule(params.baseFamily);
  const dims = module.dims(params);
  const polytope = module.polytope(params);

  if (!polytope) {
    // A0's cuboid and A4's cylinder both present a rectangle in plan.
    const hx = dims.lengthX / 2;
    const hy = dims.widthY / 2;
    return {
      outline: [
        { x: -hx, y: -hy },
        { x: hx, y: -hy },
        { x: hx, y: hy },
        { x: -hx, y: hy }
      ],
      isContactFootprint: dims.contactKind === "flat"
    };
  }

  if (dims.contactKind === "flat") {
    // The bottom ring of the extruded prism, which is the contact patch itself.
    const bottom = polytope.vertices.filter((v) => Math.abs(v.z) < 1e-9).map((v) => ({ x: v.x, y: v.y }));
    if (bottom.length >= 3) return { outline: convexHull2D(bottom), isContactFootprint: true };
  }

  return {
    outline: convexHull2D(polytope.vertices.map((v) => ({ x: v.x, y: v.y }))),
    isContactFootprint: false
  };
}

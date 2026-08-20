import { basePlanOutline } from "../../statue/bases/planOutline";
import { useSimStore } from "../../state/store";

const W = 460;
const H = 300;
const PAD = 34;

/**
 * Plan view looking down the +z axis, so the reader can check the rope layout
 * against the coordinate convention directly: x (forward) runs right, y
 * (lateral, + is left) runs up.
 *
 * Everything drawn here comes from the same rope solution the solver consumed,
 * so a rope pointing the wrong way on screen means the physics is pointing the
 * wrong way too.
 */
export function TopViewDiagram() {
  const readout = useSimStore((s) => s.readout);
  const ropeParams = useSimStore((s) => s.ropeParams);
  const statueParams = useSimStore((s) => s.statueParams);

  const anchors = [ropeParams.left.externalAnchor, ropeParams.right.externalAnchor];
  const attachments = readout
    ? [readout.ropes.left.attachmentWorld, readout.ropes.right.attachmentWorld]
    : [ropeParams.left.attachmentLocal, ropeParams.right.attachmentLocal];

  // The real outline of the base as built, not a rectangle standing in for it.
  // A plan view whose footprint is always a box would hide the one thing this
  // phase is varying.
  const { outline, isContactFootprint } = basePlanOutline(statueParams);
  const xs = [...anchors.map((a) => a.x), ...attachments.map((a) => a.x), ...outline.map((p) => p.x)];
  const ys = [...anchors.map((a) => a.y), ...attachments.map((a) => a.y), ...outline.map((p) => p.y)];
  const footprintMinY = Math.min(...outline.map((p) => p.y));
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const scale = Math.min((W - 2 * PAD) / Math.max(spanX, 0.5), (H - 2 * PAD) / Math.max(spanY, 0.5));

  // world (x fwd, y lat) -> svg (right, up)
  const px = (x: number) => W / 2 + (x - centerX) * scale;
  const py = (y: number) => H / 2 - (y - centerY) * scale;

  const com = readout?.comWorld ?? { x: 0, y: 0, z: 0 };

  return (
    <figure className="diagram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Top view of rope layout">
        {/* road forward axis */}
        <line x1={PAD / 2} y1={py(0)} x2={W - PAD / 2} y2={py(0)} className="dg-axis" strokeDasharray="5 5" />
        <polygon
          points={`${W - PAD / 2},${py(0)} ${W - PAD / 2 - 9},${py(0) - 4.5} ${W - PAD / 2 - 9},${py(0) + 4.5}`}
          className="dg-axis-head"
        />
        <text x={W - PAD / 2 - 12} y={py(0) - 10} className="dg-label dg-label-end">
          +x forward
        </text>
        {/* Axis legend pinned to the corner rather than to the axis itself:
            the +y label sat on top of whichever hauler marker was nearest the
            top of the frame. */}
        <text x={PAD / 2} y={PAD - 16} className="dg-label">
          +y left ↑
        </text>
        <line x1={px(centerX)} y1={PAD - 10} x2={px(centerX)} y2={H - PAD + 10} className="dg-axis-faint" />

        {/* statue base outline, as actually built */}
        <polygon
          points={outline.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
          className="dg-footprint"
        />
        {!isContactFootprint && (
          <line x1={px(Math.min(...outline.map((p) => p.x)))} y1={py(0)} x2={px(Math.max(...outline.map((p) => p.x)))} y2={py(0)} className="dg-contact-line" />
        )}
        <text x={px(0)} y={py(footprintMinY) + 30} className="dg-label dg-label-mid">
          {isContactFootprint ? "contact footprint" : "plan silhouette (rocker)"}
        </text>

        {(["left", "right"] as const).map((side) => {
          const anchor = ropeParams[side].externalAnchor;
          const attach = readout ? readout.ropes[side].attachmentWorld : ropeParams[side].attachmentLocal;
          const dir = readout?.ropes[side].direction;
          const active = readout?.ropes[side].active ?? false;
          const cls = side === "left" ? "dg-left" : "dg-right";

          // Force direction arrow, drawn from the attachment, fixed screen length.
          const arrowLen = 46;
          const horiz = dir ? Math.hypot(dir.x, dir.y) : 0;
          const ux = dir && horiz > 1e-6 ? dir.x / horiz : 0;
          const uy = dir && horiz > 1e-6 ? dir.y / horiz : 0;
          const ax2 = px(attach.x) + ux * arrowLen;
          const ay2 = py(attach.y) - uy * arrowLen;

          return (
            <g key={side} className={`${cls}${active ? " is-active" : ""}`}>
              <line
                x1={px(attach.x)}
                y1={py(attach.y)}
                x2={px(anchor.x)}
                y2={py(anchor.y)}
                className="dg-rope"
              />
              <line x1={px(attach.x)} y1={py(attach.y)} x2={ax2} y2={ay2} className="dg-force" />
              <circle cx={ax2} cy={ay2} r={3} className="dg-force-tip" />
              <circle cx={px(anchor.x)} cy={py(anchor.y)} r={5.5} className="dg-anchor" />
              <circle cx={px(attach.x)} cy={py(attach.y)} r={4} className="dg-attach" />
              <text x={px(anchor.x)} y={py(anchor.y) - 11} className="dg-label dg-label-mid">
                {side} haulers
              </text>
            </g>
          );
        })}

        {/* COM projected onto the road plane */}
        <g className="dg-com">
          <circle cx={px(com.x)} cy={py(com.y)} r={5} />
          <line x1={px(com.x) - 9} y1={py(com.y)} x2={px(com.x) + 9} y2={py(com.y)} />
          <line x1={px(com.x)} y1={py(com.y) - 9} x2={px(com.x)} y2={py(com.y) + 9} />
        </g>
        <text x={px(com.x) + 12} y={py(com.y) - 12} className="dg-label">
          COM projection
        </text>
      </svg>
      <figcaption>
        Plan view. Solid lines are the ropes as the solver sees them; the short
        arrows are the horizontal part of each force direction, starting at the
        attachment. A rope with no <em>x</em> extent can produce no forward
        component at all.{" "}
        {isContactFootprint
          ? "The outline is the base's real ground-contact patch, so its edge is the tipping edge."
          : "This family is a rocker: the outline is its widest cross-section, not a contact patch — it touches the road along the dashed centre line and has no tipping edge."}
      </figcaption>
    </figure>
  );
}

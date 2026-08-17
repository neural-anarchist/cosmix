import { useSimStore } from "../../state/store";

const W = 460;
const H = 300;
const PAD = 34;

/**
 * Rear elevation looking along the +x axis: y (lateral, + is left) runs right,
 * z (up) runs up. This is the view in which the tipping problem is actually
 * two-dimensional — the moment arm from the rope down to the contact edge, and
 * the restoring arm from the COM to the same edge, are both visible at once.
 */
export function SideViewDiagram() {
  const readout = useSimStore((s) => s.readout);
  const ropeParams = useSimStore((s) => s.ropeParams);

  const activeSide = readout?.ropes.left.active
    ? "left"
    : readout?.ropes.right.active
      ? "right"
      : "left";
  const rope = readout?.ropes[activeSide];
  const attach = rope?.attachmentWorld ?? ropeParams[activeSide].attachmentLocal;
  const com = readout?.comWorld ?? { x: 0, y: 0, z: 1.6 };
  const b = readout?.baseHalfWidthM ?? 0.56;
  const isRocker = readout?.contactKind === "rocker";

  const maxZ = Math.max(attach.z, com.z, 0.5) * 1.25;
  const maxY = Math.max(Math.abs(attach.y), Math.abs(com.y), b, 0.5) * 1.9;

  const scale = Math.min((W - 2 * PAD) / (2 * maxY), (H - 2 * PAD) / maxZ);
  const groundY = H - PAD;
  const originX = W / 2;

  const py = (z: number) => groundY - z * scale;
  const px = (y: number) => originX + y * scale;

  // The contact edge the pull is tipping the statue about.
  const dirY = rope?.direction.y ?? 0;
  const edgeSign = dirY >= 0 ? 1 : -1;
  const edgeY = edgeSign * b;

  const forceLen = 58;
  const vert = rope ? Math.hypot(rope.direction.y, rope.direction.z) : 0;
  const uy = rope && vert > 1e-6 ? rope.direction.y / vert : 0;
  const uz = rope && vert > 1e-6 ? rope.direction.z / vert : 0;

  return (
    <figure className="diagram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rear view of rope height and torque arm">
        {/* ground */}
        <line x1={PAD / 2} y1={groundY} x2={W - PAD / 2} y2={groundY} className="dg-ground" />
        <text x={W - PAD / 2} y={groundY + 16} className="dg-label dg-label-end">
          road (z = 0)
        </text>
        <line x1={originX} y1={PAD - 12} x2={originX} y2={groundY} className="dg-axis-faint" />
        <text x={originX + 6} y={PAD - 16} className="dg-label">
          +z up
        </text>

        {/* contact half-width b, or the rocker's line contact */}
        {isRocker ? (
          <g className="dg-edge">
            <circle cx={originX} cy={groundY} r={4} />
            <text x={originX + 10} y={groundY - 8} className="dg-label">
              line contact — no lever arm b
            </text>
          </g>
        ) : (
          <g className="dg-edge">
            <line x1={originX} y1={groundY} x2={px(edgeY)} y2={groundY} />
            <circle cx={px(edgeY)} cy={groundY} r={4} />
            <text x={px(edgeY / 2)} y={groundY - 8} className="dg-label dg-label-mid">
              b = {b.toFixed(2)} m
            </text>
          </g>
        )}

        {/* COM height and its restoring arm to the pivot edge */}
        <g className="dg-com">
          <circle cx={px(com.y)} cy={py(com.z)} r={5} />
          <line x1={px(com.y) - 9} y1={py(com.z)} x2={px(com.y) + 9} y2={py(com.z)} />
          <line x1={px(com.y)} y1={py(com.z) - 9} x2={px(com.y)} y2={py(com.z) + 9} />
        </g>
        <line
          x1={px(com.y)}
          y1={py(com.z)}
          x2={px(com.y)}
          y2={groundY}
          className="dg-dim"
          strokeDasharray="4 4"
        />
        <text x={px(com.y) - 8} y={py(com.z) - 12} className="dg-label dg-label-end">
          COM z = {com.z.toFixed(2)} m
        </text>
        {/* weight vector */}
        <line x1={px(com.y)} y1={py(com.z)} x2={px(com.y)} y2={py(com.z) + 40} className="dg-weight" />
        <text x={px(com.y) + 7} y={py(com.z) + 34} className="dg-label">
          Mg
        </text>

        {/* torque arm: pivot edge -> attachment */}
        {!isRocker ? (
          <line x1={px(edgeY)} y1={groundY} x2={px(attach.y)} y2={py(attach.z)} className="dg-arm" />
        ) : null}

        {/* rope attachment, height dimension, and force vector */}
        <line
          x1={px(attach.y)}
          y1={py(attach.z)}
          x2={px(attach.y)}
          y2={groundY}
          className="dg-dim"
          strokeDasharray="4 4"
        />
        <text x={px(attach.y) + 8} y={py(attach.z) - 12} className="dg-label">
          z_anchor = {attach.z.toFixed(2)} m
        </text>
        <circle cx={px(attach.y)} cy={py(attach.z)} r={4.5} className="dg-attach" />

        <g className={activeSide === "left" ? "dg-left" : "dg-right"}>
          <line
            x1={px(attach.y)}
            y1={py(attach.z)}
            x2={px(attach.y) + uy * forceLen}
            y2={py(attach.z) - uz * forceLen}
            className="dg-force"
          />
          <circle
            cx={px(attach.y) + uy * forceLen}
            cy={py(attach.z) - uz * forceLen}
            r={3}
            className="dg-force-tip"
          />
        </g>
      </svg>
      <figcaption>
        Rear elevation of the {activeSide} rope. The thin line from the contact
        edge up to the attachment is the torque arm; tipping begins when{" "}
        <em>T·d̂<sub>y</sub>·z_anchor</em> overcomes the restoring{" "}
        <em>Mg·b</em>. A rocker base has no <em>b</em> at all, which is why no
        static tipping threshold is reported for it.
      </figcaption>
    </figure>
  );
}

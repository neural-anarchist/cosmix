import { useSimStore } from "../../state/store";
import { HEAD_HEIGHT_RATIO } from "../../statue/constants";

const VIEW_W = 320;
const VIEW_H = 240;
const GROUND_Y = 205;
const CX = 160;
const TARGET_PX_HEIGHT = 150;

/**
 * A live front-view (y-z plane) schematic, driven by the same engine state
 * as the main viewport — this section's analog to the "spring-mass" /
 * "side by side" companion views on the other Cosmix pages. It rotates a
 * simplified upright silhouette about the ground contact point by the
 * current roll angle; it does not re-derive contact geometry from Rapier,
 * so treat it as illustrative rather than a second physics engine. Real
 * geometry comparison across base families is Phase 3's matched-comparison
 * mode.
 */
export function RockingDiagram() {
  const statueParams = useSimStore((s) => s.statueParams);
  const readout = useSimStore((s) => s.readout);

  const H = statueParams.heightM;
  const scale = TARGET_PX_HEIGHT / H;
  const isA4 = statueParams.baseFamily === "A4";

  const baseWidthM = statueParams.baseWidthRatio * H;
  const halfWidthM = baseWidthM / 2;
  const baseTopZ = isA4 ? baseWidthM : statueParams.baseHeightRatio * H;
  const headHeightM = HEAD_HEIGHT_RATIO * H;
  const torsoTopZ = H - headHeightM;

  const comHeightM = readout?.comHeightM ?? 0.5 * H;
  const rollDeg = readout?.rollDeg ?? 0;

  // Prefer the engine's own published tipping angle so this diagram and the
  // diagnostics panel can never quote different numbers; fall back to the local
  // derivation only before the first frame arrives.
  const critAngleDeg =
    readout?.tippingAngleDeg ??
    (isA4 ? null : (Math.atan2(halfWidthM, Math.max(comHeightM, 0.01)) * 180) / Math.PI);

  const toPx = (zMeters: number) => GROUND_Y - zMeters * scale;

  const baseHalfWidthPx = halfWidthM * scale;
  const baseTopPx = toPx(baseTopZ);
  const torsoHalfWidthPx = (statueParams.torsoWidthRatio * H * 0.5) * scale;
  const torsoTopPx = toPx(torsoTopZ);
  const headRadiusPx = (headHeightM / 2) * scale;
  const headCenterPx = toPx(torsoTopZ + headHeightM / 2);
  const comPx = toPx(comHeightM);

  const critLineLengthPx = 90;

  return (
    <div>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Live rocking-geometry schematic" width="100%">
        <line x1={0} y1={GROUND_Y} x2={VIEW_W} y2={GROUND_Y} stroke="var(--line-strong)" strokeWidth={1.5} />

        {!isA4 && critAngleDeg !== null && (
          <g stroke="var(--rust)" strokeWidth={1} strokeDasharray="4 4" opacity={0.65}>
            <line
              x1={CX}
              y1={GROUND_Y}
              x2={CX + critLineLengthPx * Math.sin((critAngleDeg * Math.PI) / 180)}
              y2={GROUND_Y - critLineLengthPx * Math.cos((critAngleDeg * Math.PI) / 180)}
            />
            <line
              x1={CX}
              y1={GROUND_Y}
              x2={CX - critLineLengthPx * Math.sin((critAngleDeg * Math.PI) / 180)}
              y2={GROUND_Y - critLineLengthPx * Math.cos((critAngleDeg * Math.PI) / 180)}
            />
          </g>
        )}

        <g transform={`rotate(${rollDeg} ${CX} ${GROUND_Y})`}>
          {isA4 ? (
            <circle
              cx={CX}
              cy={GROUND_Y - baseHalfWidthPx}
              r={baseHalfWidthPx}
              fill="var(--panel-strong)"
              stroke="var(--blue)"
              strokeWidth={1.5}
            />
          ) : (
            <rect
              x={CX - baseHalfWidthPx}
              y={baseTopPx}
              width={baseHalfWidthPx * 2}
              height={GROUND_Y - baseTopPx}
              fill="var(--panel-strong)"
              stroke="var(--blue)"
              strokeWidth={1.5}
            />
          )}
          <rect
            x={CX - torsoHalfWidthPx}
            y={torsoTopPx}
            width={torsoHalfWidthPx * 2}
            height={baseTopPx - torsoTopPx}
            fill="var(--panel-strong)"
            stroke="var(--line-strong)"
            strokeWidth={1}
          />
          <circle cx={CX} cy={headCenterPx} r={headRadiusPx} fill="var(--panel-strong)" stroke="var(--line-strong)" strokeWidth={1} />
          <circle cx={CX} cy={comPx} r={4} fill="var(--gold)" />
          <line x1={CX} y1={comPx} x2={CX} y2={GROUND_Y} stroke="var(--gold)" strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
        </g>
      </svg>
      {isA4 ? (
        <p className="diagram-note">
          A4 is a rolling rocker, not an edge-tipping base: there is no fixed
          critical angle. Stability instead depends on whether the COM (gold
          dot) stays over the rolling contact patch as the body rocks —
          qualitative, not a single threshold. See Theory §5.
        </p>
      ) : (
        <p className="diagram-note">
          Dashed rust lines mark ±θ_crit ≈ {critAngleDeg?.toFixed(1)}° — the flat
          base's static tipping angle at the current COM height ({comHeightM.toFixed(2)} m).
          Past this roll, the weight vector (gold, dashed) falls outside the base
          footprint and gravity's torque flips from restoring to overturning. See
          Theory §4.
        </p>
      )}
    </div>
  );
}

import { ALL_BASE_FAMILY_IDS, isBaseFamilyImplemented } from "../statue/bases/registry";
import { useSimStore } from "../state/store";
import type { BaseFamilyId } from "../statue/types";
import { SliderField } from "./SliderField";

const BASE_FAMILY_LABELS: Record<BaseFamilyId, string> = {
  A0: "A0 — Flat rectangular prism",
  A4: "A4 — Lateral cylindrical rocker",
  A5: "A5 — Ellipsoidal rocker (Phase 2)",
  B0: "B0 — D-shaped base (Phase 2)",
  B2: "B2 — Forward teardrop (Phase 2)",
  B6: "B6 — Moai D-base + lean (Phase 2)"
};

export function ControlPanel() {
  const statueParams = useSimStore((s) => s.statueParams);
  const setStatueParams = useSimStore((s) => s.setStatueParams);
  const resetStatueParams = useSimStore((s) => s.resetStatueParams);
  const roadParams = useSimStore((s) => s.roadParams);
  const setRoadParams = useSimStore((s) => s.setRoadParams);
  const resetRoadParams = useSimStore((s) => s.resetRoadParams);

  const isA4 = statueParams.baseFamily === "A4";

  return (
    <div className="controls">
      <div className="control-card">
        <h3>Statue &amp; mass</h3>
        <SliderField
          label="Height H"
          unit="m"
          value={statueParams.heightM}
          min={1.5}
          max={7}
          step={0.05}
          onChange={(v) => setStatueParams({ heightM: v })}
          title="Total statue height, base to crown."
        />
        <SliderField
          label="Mass M"
          unit="kg"
          precision={0}
          value={statueParams.totalMassKg}
          min={500}
          max={14000}
          step={50}
          onChange={(v) => setStatueParams({ totalMassKg: v })}
          title="Total statue mass."
        />
        <SliderField
          label="Base mass fraction"
          value={statueParams.baseMassFraction}
          min={0.05}
          max={0.75}
          step={0.01}
          onChange={(v) => setStatueParams({ baseMassFraction: v })}
          title="Fraction of total mass carried by the base."
        />
        <SliderField
          label="Head mass fraction"
          value={statueParams.headMassFraction}
          min={0.05}
          max={0.5}
          step={0.01}
          onChange={(v) => setStatueParams({ headMassFraction: v })}
          title="Fraction of total mass carried by the head. Remainder goes to the torso."
        />
        <SliderField
          label="Torso width / H"
          value={statueParams.torsoWidthRatio}
          min={0.08}
          max={0.4}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoWidthRatio: v })}
        />
        <SliderField
          label="Torso depth / H"
          value={statueParams.torsoDepthRatio}
          min={0.08}
          max={0.4}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoDepthRatio: v })}
        />
        <p className="hint">
          Torso is a simple box stand-in in Phase 1 — the tapered, lathe-generated
          Moai silhouette lands in Phase 2 without changing any physics below.
        </p>
        <div className="reset-row">
          <button className="btn" type="button" onClick={resetStatueParams}>
            Restore defaults
          </button>
        </div>
      </div>

      <div className="control-card">
        <h3>Base geometry</h3>
        <div className="field">
          <label title="Base family — only A0 and A4 are implemented in Phase 1.">
            <span>Base family</span>
          </label>
          <select
            value={statueParams.baseFamily}
            onChange={(e) => setStatueParams({ baseFamily: e.target.value as BaseFamilyId })}
          >
            {ALL_BASE_FAMILY_IDS.map((id) => (
              <option key={id} value={id} disabled={!isBaseFamilyImplemented(id)}>
                {BASE_FAMILY_LABELS[id]}
              </option>
            ))}
          </select>
        </div>
        <SliderField
          label={isA4 ? "Rocker diameter / H" : "Base width / H"}
          value={statueParams.baseWidthRatio}
          min={0.12}
          max={0.6}
          step={0.01}
          onChange={(v) => setStatueParams({ baseWidthRatio: v })}
          title="W_base / H (A4: full rocker diameter along y)."
        />
        <SliderField
          label="Base length / H"
          value={statueParams.baseLengthRatio}
          min={0.1}
          max={0.5}
          step={0.01}
          onChange={(v) => setStatueParams({ baseLengthRatio: v })}
          title="L_base / H, extent along x (forward)."
        />
        <SliderField
          label="Base height / H"
          value={statueParams.baseHeightRatio}
          min={0.06}
          max={0.35}
          step={0.01}
          onChange={(v) => setStatueParams({ baseHeightRatio: v })}
          disabled={isA4}
          title={
            isA4
              ? "Not used by A4 — a cylinder's height is fixed by its radius (rocker diameter, above)."
              : "H_base / H."
          }
        />
        {isA4 && (
          <p className="hint">
            Base height is disabled for A4: a cylindrical rocker's height equals its
            diameter, so it is set entirely by the rocker-diameter control above.
          </p>
        )}
      </div>

      <div className="control-card">
        <h3>Road &amp; contact</h3>
        <SliderField
          label="Road length"
          unit="m"
          precision={0}
          value={roadParams.lengthM}
          min={15}
          max={100}
          step={1}
          onChange={(v) => setRoadParams({ lengthM: v })}
        />
        <SliderField
          label="Road width"
          unit="m"
          precision={1}
          value={roadParams.widthM}
          min={2}
          max={16}
          step={0.5}
          onChange={(v) => setRoadParams({ widthM: v })}
        />
        <SliderField
          label="Friction coefficient μ"
          value={roadParams.frictionCoefficient}
          min={0.05}
          max={1.4}
          step={0.01}
          onChange={(v) => setRoadParams({ frictionCoefficient: v })}
          title="Applied to every statue/road contact pair (Phase 1: one shared value)."
        />
        <SliderField
          label="Restitution"
          value={roadParams.restitution}
          min={0}
          max={0.6}
          step={0.01}
          onChange={(v) => setRoadParams({ restitution: v })}
          title="Contact bounciness. Keep low for a statue that should settle, not bounce."
        />
        <p className="hint">
          Flat road only in Phase 1 — concave and rough modes are Phase 3/5 (see PLAN.md).
        </p>
        <div className="reset-row">
          <button className="btn" type="button" onClick={resetRoadParams}>
            Restore defaults
          </button>
        </div>
      </div>
    </div>
  );
}

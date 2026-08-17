import { ALL_BASE_FAMILY_IDS, isBaseFamilyImplemented } from "../statue/bases/registry";
import { useSimStore } from "../state/store";
import type { BaseFamilyId, VisualDetail } from "../statue/types";
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
  const readout = useSimStore((s) => s.readout);

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
          label="Shoulder width / H"
          value={statueParams.torsoWidthRatio}
          min={0.08}
          max={0.4}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoWidthRatio: v })}
          title="Torso width (y) at the shoulders, the widest point of the upper body."
        />
        <SliderField
          label="Body depth / H"
          value={statueParams.torsoDepthRatio}
          min={0.08}
          max={0.4}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoDepthRatio: v })}
          title="Torso depth (x) at the shoulders."
        />
        <SliderField
          label="Torso taper"
          value={statueParams.torsoTaper}
          min={0}
          max={0.6}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoTaper: v })}
          title="Fractional narrowing from shoulders down to the torso base. 0 reproduces the Phase 1 uniform box."
        />
        <SliderField
          label="Forward lean"
          unit="deg"
          precision={1}
          value={statueParams.forwardLeanDeg}
          min={-15}
          max={30}
          step={0.5}
          onChange={(v) => setStatueParams({ forwardLeanDeg: v })}
          title="Intrinsic lean of the upper body, baked into the geometry. Distinct from dynamic pitch."
        />
        <p className="hint">
          Taper and lean are <em>mechanical</em> parameters: they move real
          material, so they change the collider cross-section, the COM and the
          inertia. Setting both to zero reproduces the validated Phase 1 body
          exactly. Intrinsic lean pivots the upper body at the top of the base
          and is reported separately from dynamic pitch in the diagnostics.
        </p>
        <div className="reset-row">
          <button className="btn" type="button" onClick={resetStatueParams}>
            Restore defaults
          </button>
        </div>
      </div>

      <div className="control-card">
        <h3>Center of mass</h3>
        <p className="inline-note">
          {statueParams.comOverrideEnabled
            ? `Overridden — COM forced to (${(statueParams.comOffsetXRatio * statueParams.heightM).toFixed(3)}, ${(statueParams.comOffsetYRatio * statueParams.heightM).toFixed(3)}, ${(statueParams.comHeightRatio * statueParams.heightM).toFixed(3)}) m`
            : `Derived from geometry — z_COM = ${(readout?.comLocal.z ?? 0).toFixed(3)} m`}
        </p>
        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={statueParams.comOverrideEnabled}
            onChange={(e) => setStatueParams({ comOverrideEnabled: e.target.checked })}
          />
          <span>Override COM explicitly</span>
        </label>
        <SliderField
          label="Forward COM offset x/H"
          precision={3}
          value={statueParams.comOffsetXRatio}
          min={-0.15}
          max={0.15}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comOffsetXRatio: v })}
        />
        <SliderField
          label="Lateral COM offset y/H"
          precision={3}
          value={statueParams.comOffsetYRatio}
          min={-0.15}
          max={0.15}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comOffsetYRatio: v })}
        />
        <SliderField
          label="COM height z/H"
          precision={3}
          value={statueParams.comHeightRatio}
          min={0.15}
          max={0.8}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comHeightRatio: v })}
        />
        <p className="hint">
          An override discards the derived mass properties and places the COM
          where you ask, for sweeps where COM is the independent variable.
          Collider shapes are untouched, so contact is unchanged — but the
          rotational inertia is carried over from the derived body rather than
          recomputed, so an overridden statue is an <em>abstract probe, not a
          self-consistent rigid body</em>. The COM marker turns violet to say so.
        </p>
      </div>

      <div className="control-card">
        <h3>Visual detail</h3>
        <div className="field">
          <label title="Mesh tessellation only — provably cannot affect the physics.">
            <span>Tessellation</span>
          </label>
          <select
            value={statueParams.visualDetail}
            onChange={(e) => setStatueParams({ visualDetail: e.target.value as VisualDetail })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <p className="hint">
          Affects triangle counts only. A unit test asserts that mass, COM,
          inertia and the collider set are byte-identical across all three
          levels, so the good-looking version and the simulated version can
          never be different statues.
        </p>
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

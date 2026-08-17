import { useState } from "react";
import { DEFAULT_FORCE_RAMP, runForceRamp, type ForceRampResult } from "../benchmark/forceRamp";
import {
  DEFAULT_STATIC_EQUILIBRIUM,
  runStaticEquilibriumBenchmark,
  type StaticEquilibriumResult
} from "../benchmark/staticEquilibrium";
import { getRapier } from "../physics/rapierSetup";
import { useSimStore } from "../state/store";

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/**
 * Runs the two validation experiments against the *current* statue and road
 * settings, in their own throwaway physics worlds, so the live simulation is
 * untouched.
 *
 * Both run synchronously on the main thread. The static benchmark is ~1.3k
 * steps and the ramp ~8k, which together take well under a second on the
 * default statue — not enough to warrant a Web Worker yet. Batch sweeps, which
 * are orders of magnitude larger, get one in Phase 4 (see PLAN.md).
 */
export function BenchmarkPanel() {
  const statueParams = useSimStore((s) => s.statueParams);
  const roadParams = useSimStore((s) => s.roadParams);

  const [busy, setBusy] = useState<null | "equilibrium" | "ramp">(null);
  const [equilibrium, setEquilibrium] = useState<StaticEquilibriumResult | null>(null);
  const [ramp, setRamp] = useState<ForceRampResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: "equilibrium" | "ramp") => {
    setBusy(which);
    setError(null);
    try {
      const RAPIER = await getRapier();
      // Yield a frame so the button's busy state paints before we block.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (which === "equilibrium") {
        setEquilibrium(
          runStaticEquilibriumBenchmark(RAPIER, { statueParams, roadParams, ...DEFAULT_STATIC_EQUILIBRIUM })
        );
      } else {
        setRamp(runForceRamp(RAPIER, { statueParams, roadParams, ...DEFAULT_FORCE_RAMP }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="control-card control-card-wide">
      <h3>Validation benchmarks</h3>

      <div className="transport benchmark-buttons">
        <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => run("equilibrium")}>
          {busy === "equilibrium" ? "Running…" : "Run static equilibrium benchmark"}
        </button>
        <button className="btn" type="button" disabled={busy !== null} onClick={() => run("ramp")}>
          {busy === "ramp" ? "Running…" : "Run force-ramp test"}
        </button>
      </div>

      {error ? <p className="benchmark-error">{error}</p> : null}

      {equilibrium ? (
        <div className="benchmark-result">
          <h4>
            Static equilibrium
            {equilibrium.notApplicableReason ? (
              <span className="verdict verdict-na">NOT APPLICABLE</span>
            ) : (
              <span className={`verdict ${equilibrium.pass ? "verdict-pass" : "verdict-fail"}`}>
                {equilibrium.pass ? "PASS" : "FAIL"}
              </span>
            )}
          </h4>

          {equilibrium.notApplicableReason ? (
            <p className="hint">{equilibrium.notApplicableReason}</p>
          ) : (
            <>
              <p className="benchmark-meta">
                M = {fmt(equilibrium.massKg, 0)} kg · b = {fmt(equilibrium.baseHalfWidthM, 3)} m ·
                z_anchor = {fmt(equilibrium.attachmentHeightM, 3)} m · μ ={" "}
                {fmt(equilibrium.frictionCoefficient, 2)} · COM z ={" "}
                {fmt(equilibrium.comHeightM, 3)} m
              </p>
              <p className="benchmark-meta">
                F_slide = {fmt(equilibrium.thresholds.fSlideRefN, 0)} N · F_tip ={" "}
                {equilibrium.thresholds.fTipRefN === null
                  ? "n/a"
                  : `${fmt(equilibrium.thresholds.fTipRefN, 0)} N`}{" "}
                · applied {fmt(equilibrium.appliedTensionN, 0)} N ={" "}
                {fmt(equilibrium.tensionFraction * 100, 0)}% of threshold, held{" "}
                {equilibrium.holdSeconds} s · {equilibrium.contactCount} contact pairs
              </p>
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Measured</th>
                    <th>Limit</th>
                    <th>Margin</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {equilibrium.checks.map((c) => (
                    <tr key={c.name} className={c.pass ? "" : "row-fail"}>
                      <td>{c.name}</td>
                      <td className="num">
                        {c.measured.toExponential(2)} {c.unit}
                      </td>
                      <td className="num">
                        {c.limit} {c.unit}
                      </td>
                      <td className="num">
                        {c.measured > 0 ? `${fmt(c.limit / c.measured, 1)}×` : "∞"}
                      </td>
                      <td className="num">{c.pass ? "pass" : "FAIL"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : null}

      {ramp ? (
        <div className="benchmark-result">
          <h4>Force ramp</h4>
          <p className="benchmark-meta">
            Predicted F_slide = {fmt(ramp.thresholds.fSlideRefN, 0)} N · predicted F_tip ={" "}
            {ramp.thresholds.fTipRefN === null ? "n/a" : `${fmt(ramp.thresholds.fTipRefN, 0)} N`} ·
            governing {ramp.thresholds.governingRef}
            {ramp.tippingAngleDeg !== null ? ` · θ_crit = ${fmt(ramp.tippingAngleDeg, 2)}°` : ""}
          </p>
          <p className="benchmark-meta">
            <strong>
              Observed onset:{" "}
              {ramp.onsetTensionN === null
                ? "no motion up to the highest level tested"
                : `${fmt(ramp.onsetTensionN, 0)} N (${fmt((ramp.onsetFraction ?? 0) * 100, 0)}% of prediction) — ${ramp.onsetMode}`}
            </strong>
          </p>
          <table className="benchmark-table">
            <thead>
              <tr>
                <th>% of threshold</th>
                <th>Tension</th>
                <th>Displacement</th>
                <th>Δroll</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {ramp.points.map((p) => (
                <tr key={p.fraction} className={p.moved ? "row-moved" : ""}>
                  <td className="num">{fmt(p.fraction * 100, 0)}%</td>
                  <td className="num">{fmt(p.tensionN, 0)} N</td>
                  <td className="num">{fmt(p.displacementM * 1000, 2)} mm</td>
                  <td className="num">{fmt(p.rollDeltaDeg, 3)}°</td>
                  <td className="num">{p.moved ? p.mode : "held"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="hint">
        Both experiments arrange the rope <em>purely laterally</em>, which is the
        case the classical formulas <code>F_slide = μMg</code> and{" "}
        <code>F_tip = Mgb/z_anchor</code> are derived for, so the measured onset
        is directly comparable to the prediction. Each ramp level is an
        independent trial from a fresh reset rather than one continuous sweep, so
        no sub-threshold micro-motion carries into the level above.
      </p>
    </div>
  );
}

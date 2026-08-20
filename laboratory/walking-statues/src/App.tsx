import { BaselineNotice } from "./ui/BaselineNotice";
import { BenchmarkPanel } from "./ui/BenchmarkPanel";
import { ComparisonPanel } from "./ui/ComparisonPanel";
import { ControlPanel } from "./ui/ControlPanel";
import { DiagnosticsPanel } from "./ui/DiagnosticsPanel";
import { ReadoutPanel } from "./ui/ReadoutPanel";
import { RopeControls } from "./ui/RopeControls";
import { TheorySection } from "./ui/theory/TheorySection";
import { Viewport } from "./ui/Viewport";

export function App() {
  return (
    <div className="page">
      <a className="skip-link" href="#section-statue">
        Skip to the simulation
      </a>

      <a className="back-link" href="../../../">
        ← Back to Cosmix
      </a>

      <header className="page-header">
        <p className="eyebrow">Rigid-body dynamics · Walking-Moai hypothesis</p>
        <h1>Walking Statues</h1>
        <p className="lede">
          A free six-degree-of-freedom statue on a road, driven only by
          gravity, friction, ground contact, and rope forces pulled by hand.
          Forward motion — if it happens — has to emerge from side-to-side
          rocking; nothing here scripts a step.
        </p>
      </header>

      <nav className="section-nav" aria-label="Section navigation">
        <a href="#section-statue">1 · The Statue</a>
        <a href="#section-theory">2 · Rocking Geometry &amp; Theory</a>
      </nav>

      <section className="section" id="section-statue">
        <div className="section-head">
          <p className="section-kicker">Section one</p>
          <h2>The Statue</h2>
          <p className="section-lede">
            Rapier steps a fixed-primitive compound rigid body at 1/240 s,
            decoupled from the render frame rate. Hold a rope button to haul on
            one rope at the tension set below: below the statue's sliding and
            tipping thresholds it must not budge, and above them it rocks. Both
            thresholds are predicted, displayed, and checked by the benchmarks.
          </p>
        </div>

        <Viewport />
        <BaselineNotice />
        <ReadoutPanel />
        <DiagnosticsPanel />
        <div className="controls">
          <RopeControls />
          <BenchmarkPanel />
        </div>
        <div className="controls">
          <ComparisonPanel />
        </div>
        <ControlPanel />
      </section>

      <section className="section" id="section-theory">
        <div className="section-head">
          <p className="section-kicker">Section two</p>
          <h2>Rocking Geometry &amp; Theory</h2>
          <p className="section-lede">
            From Newton-Euler rigid-body dynamics to the two Phase 1 base
            families' very different stability conditions, with a live
            diagram driven by the statue above.
          </p>
        </div>

        <TheorySection />
      </section>

      <footer className="page-footer">
        <p>
          Cosmix Laboratory · Vite + React + TypeScript, Three.js rendering,
          Rapier3D (WASM) rigid-body physics. Phase 1 of 5 — see PLAN.md and
          PHYSICS_MODEL.md for what is and isn't implemented yet.
        </p>
      </footer>
    </div>
  );
}

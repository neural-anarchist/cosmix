import { useState } from "react";
import { BenchmarkPanel } from "./BenchmarkPanel";

/**
 * Collapsed by default, and sits below the simulation and its controls. This
 * is where the checks the project uses to catch its own regressions live —
 * they compare the simulation against its own equations, not against a real
 * statue, and pulling ropes and reading the panels above never require
 * opening this section.
 */
export function DeveloperTools() {
  const [open, setOpen] = useState(false);

  return (
    <div className="diagnostics developer-tools">
      <button
        className="diagnostics-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="diagnostics-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        Developer &amp; verification tools
      </button>

      {open ? (
        <div className="diagnostics-body">
          <p className="hint">
            These checks compare the running simulation against the formulas
            it is supposed to satisfy — for example, that a pull below the
            calculated threshold really does leave the statue at rest. A
            passing check means the code does what its own equations say, not
            that those equations match a real statue.
          </p>
          <BenchmarkPanel />
        </div>
      ) : null}
    </div>
  );
}

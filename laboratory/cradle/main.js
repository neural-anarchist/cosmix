'use strict';

// =============================================================================
// Magnetic pendulum cradle
//
// Units: SI (m, kg, s, rad); dipole moments in A·m²; damping b in s⁻¹.
// Coordinates: θ_i is the rod angle from the downward vertical, positive toward
// +x. The dipole angle α is measured anticlockwise from +x, y pointing up.
//
// Model assumptions
//   - N (2–5) point-mass bobs on massless rods of common length L, with pivots
//     spaced d apart on a horizontal line.
//   - Every dipole axis ŝ = (cos α, sin α) is CONSTRAINED to stay fixed in the
//     laboratory frame. A magnet glued to a swinging bob would rotate with it;
//     holding the axes parallel needs an external field, a gimbal or active
//     control. This is an idealization, not a generic magnet-on-pendulum result.
//   - Pair energy is a softened point dipole (see SOFTENING_FRACTION).
//   - No aerodynamic coupling, pivot friction, rod flexibility or hysteresis.
//     Damping is viscous: −b m_i L² θ̇_i.
//
// Pair energy, with r = r_j − r_i (unsoftened form):
//   U_ij = (μ0 μ_i μ_j / 4π) [1 − 3(ŝ·r̂)²] / r³
// For bobs at equal height ŝ·r̂ = cos α, so U_ij → C G(α) / u³ with
//   G(α) = 1 − 3cos²α,   u = (j−i)d + L(θ_j − θ_i).
// G > 0 repels (α = 90°), G < 0 attracts (α = 0°), and G = 0 at the magic angle
// α = arccos(1/√3) ≈ 54.74° in the point-dipole limit.
//
// Equation of motion (integrated with nonlinear gravity):
//   m_i L² θ̈_i = −m_i g L sin θ_i − b m_i L² θ̇_i + Σ_{j≠i} τ_ij(θ),
//   τ_ij = −∂U_ij/∂θ_i.
//
// Linearization about the resting state θ*, with η = θ − θ*:
//   M η̈ + K η = 0 (plus the same viscous damping), K = −∂τ/∂θ at θ*,
// where K is obtained by central differences of the torque, so it is the
// linearization of the regularized model actually integrated. Expanding the
// point-dipole energy in δ = L(θ_j − θ_i) gives the nearest-pair coupling
//   κ_ij = 12 μ0 μ_i μ_j G L² / (4π u*⁵),
// with u* the gap at the resting state, not the nominal (j−i)d.
//
// Numerical checks live in runDiagnostics() at the end of this file; call
// cradleDiagnostics() from the browser console.
// =============================================================================

// -----------------------------------------------------------------------------
// Constants and helpers
// -----------------------------------------------------------------------------

const MU0_OVER_4PI = 1e-7; // μ0/4π, in T·m/A

/**
 * Softening length ε as a fraction of the pivot spacing.
 *
 * The pair energy is evaluated at q = √(r² + ε²) instead of r. This is a
 * regularization that keeps the 1/r⁵ force finite when bobs meet; ε represents
 * finite magnet size only qualitatively and is not calibrated to any magnet.
 * Because q enters the potential itself, the torques are the exact analytical
 * gradient of the regularized potential (checked in runDiagnostics).
 */
const SOFTENING_FRACTION = 0.03;

// Coupling vanishes here: cos²α = 1/3.
const MAGIC_ANGLE_DEG = (Math.acos(1 / Math.sqrt(3)) * 180) / Math.PI; // 54.7356°

const PALETTE = {
  space: '#070b14',
  panel: '#111a2c',
  ink: '#f4efe5',
  muted: '#acb4c5',
  gold: '#d7b470',
  blue: '#83b8d7',
  violet: '#9b6bff',
  rust: '#d68c70',
  green: '#8fc7a4',
  line: 'rgba(244,239,229,0.16)'
};

const ACCENTS = [PALETTE.gold, PALETTE.blue, PALETTE.violet, PALETTE.rust, PALETTE.green];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const zeros = (n) => new Array(n).fill(0);
const zeros2 = (n) => Array.from({ length: n }, () => new Array(n).fill(0));
const deg2rad = (d) => (d * Math.PI) / 180;

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** The geometric factor that controls the sign and size of the coupling. */
function geometryFactor(alphaDeg) {
  const c = Math.cos(deg2rad(alphaDeg));
  return 1 - 3 * c * c;
}

/** Gaussian elimination with partial pivoting. Solves A x = b for small A. */
function solveLinear(Ain, bin) {
  const n = bin.length;
  const A = Ain.map((row, i) => row.concat([bin[i]]));

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-14) return null; // singular
    if (pivot !== col) {
      const tmp = A[pivot];
      A[pivot] = A[col];
      A[col] = tmp;
    }
    for (let r = col + 1; r < n; r++) {
      const factor = A[r][col] / A[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) A[r][c] -= factor * A[col][c];
    }
  }

  const x = zeros(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = A[i][n];
    for (let j = i + 1; j < n; j++) sum -= A[i][j] * x[j];
    x[i] = sum / A[i][i];
  }
  return x;
}

/**
 * Jacobi eigenvalue algorithm for real symmetric matrices. Hand-written
 * because the matrices are at most 5×5 and this keeps the page free of
 * numerical dependencies. Eigenvectors are the COLUMNS of `vectors`.
 */
function jacobiEigen(input, maxSweeps = 100, tol = 1e-14) {
  const n = input.length;
  const A = input.map((row) => row.slice());
  const V = zeros2(n);
  for (let i = 0; i < n; i++) V[i][i] = 1;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    }
    if (Math.sqrt(off) < tol) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;

        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        let t;
        if (theta === 0) t = 1;
        else {
          const sgn = theta > 0 ? 1 : -1;
          t = sgn / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        }
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; k++) {
          const akp = A[k][p];
          const akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k];
          const aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: A.map((row, i) => row[i]), vectors: V };
}

// -----------------------------------------------------------------------------
// Nonlinear magnetic pendulum model
// -----------------------------------------------------------------------------

class MagneticCradle {
  constructor(params) {
    this.params = params;
    this.reset();
  }

  /**
   * Restart the run. θ₀ and ω₀ apply to the left-most pendulum only and are
   * measured from the resting position; all other pendulums start at rest there.
   */
  reset(equilibrium) {
    const { N, theta0, omega0 } = this.params;
    const rest = equilibrium && equilibrium.length === N ? equilibrium : zeros(N);
    this.theta = rest.slice();
    this.omega = zeros(N);
    this.theta[0] = rest[0] + theta0;
    this.omega[0] = omega0;
    this.time = 0;
  }

  /** Bob position in metres relative to pendulum i's pivot, y measured UP. */
  bobOffset(theta) {
    const L = this.params.L;
    return { x: L * Math.sin(theta), y: -L * Math.cos(theta) };
  }

  /**
   * Dipole torques for every pair: the analytical gradient of the regularized
   * potential (not a numerical derivative).
   *
   * U = K [ 1/q³ − 3p²/q⁵ ],  q² = |r|² + ε²,  p = r·ŝ,  K = μ0μiμj/4π
   * dU = K [ −3 dq/q⁴ − 6 p dp/q⁵ + 15 p² dq/q⁶ ]
   */
  magneticTorques(theta) {
    const { N, L, mu, d, alpha } = this.params;
    const out = zeros(N);

    const ca = Math.cos(deg2rad(alpha));
    const sa = Math.sin(deg2rad(alpha));

    const eps = SOFTENING_FRACTION * d;
    const epsSq = eps * eps;
    this.contactHit = false;
    let closest = Infinity;

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const D = (j - i) * d;

        const dx = D + L * (Math.sin(theta[j]) - Math.sin(theta[i]));
        const dy = -L * (Math.cos(theta[j]) - Math.cos(theta[i]));

        // r below is the softened separation q; trueR is the geometric gap.
        const trueR = Math.hypot(dx, dy);
        closest = Math.min(closest, trueR);
        if (trueR < 3 * eps) this.contactHit = true;
        const r = Math.sqrt(trueR * trueR + epsSq);

        const p = dx * ca + dy * sa;
        const K = MU0_OVER_4PI * mu[i] * mu[j];

        const r4 = r * r * r * r;
        const r5 = r4 * r;
        const r6 = r5 * r;

        // dU/dθ for a given (∂dx, ∂dy)
        const grad = (ddx, ddy) => {
          const dr = (dx * ddx + dy * ddy) / r;
          const dp = ca * ddx + sa * ddy;
          return K * (-3 * dr / r4 - 6 * p * dp / r5 + 15 * p * p * dr / r6);
        };

        // ∂(dx,dy)/∂θi and ∂(dx,dy)/∂θj
        out[i] -= grad(-L * Math.cos(theta[i]), -L * Math.sin(theta[i]));
        out[j] -= grad(L * Math.cos(theta[j]), L * Math.sin(theta[j]));
      }
    }
    this.closestApproach = closest;
    return out;
  }

  /** Net torque on each pendulum, excluding damping. Zero at equilibrium. */
  staticTorques(theta) {
    const { N, L, m, g } = this.params;
    const magnetic = this.magneticTorques(theta);
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      out[i] = -m[i] * g * L * Math.sin(theta[i]) + magnetic[i];
    }
    return out;
  }

  derivatives(theta, omega) {
    const { N, L, m, damping } = this.params;
    const torque = this.staticTorques(theta);
    const dOmega = new Array(N);
    for (let i = 0; i < N; i++) {
      dOmega[i] = torque[i] / (m[i] * L * L) - damping * omega[i];
    }
    return { dTheta: omega.slice(), dOmega };
  }

  rk4Step(h) {
    const N = this.params.N;
    const th = this.theta;
    const om = this.omega;
    const shift = (base, delta, f) => {
      const out = new Array(N);
      for (let i = 0; i < N; i++) out[i] = base[i] + delta[i] * f;
      return out;
    };

    const k1 = this.derivatives(th, om);
    const k2 = this.derivatives(shift(th, k1.dTheta, h / 2), shift(om, k1.dOmega, h / 2));
    const k3 = this.derivatives(shift(th, k2.dTheta, h / 2), shift(om, k2.dOmega, h / 2));
    const k4 = this.derivatives(shift(th, k3.dTheta, h), shift(om, k3.dOmega, h));

    for (let i = 0; i < N; i++) {
      this.theta[i] += (h / 6) * (k1.dTheta[i] + 2 * k2.dTheta[i] + 2 * k3.dTheta[i] + k4.dTheta[i]);
      this.omega[i] += (h / 6) * (k1.dOmega[i] + 2 * k2.dOmega[i] + 2 * k3.dOmega[i] + k4.dOmega[i]);
    }
    this.time += h;
  }

  /**
   * Numerical-safety policy: advance by dt with fixed-step RK4, splitting dt
   * into substeps. The dipole force scales as 1/r⁵, so the system stiffens
   * sharply when bobs approach; the substep count grows as (d / closest gap)^2.5,
   * capped at 120× the base rate and 4000 substeps per call. RK4 is not
   * symplectic, so undamped energy drifts slowly (reported in the UI and
   * bounded in runDiagnostics).
   */
  advance(dt) {
    const baseRate = 1440;
    const gap = this.closestApproach || this.params.d;
    const ratio = Math.max(1, this.params.d / Math.max(gap, 1e-4));
    const factor = clamp(Math.pow(ratio, 2.5), 1, 120);

    // The gap, not the field strength, drives refinement: a large pull brings
    // bobs together whatever the sign of the coupling.
    const steps = clamp(Math.ceil(dt * baseRate * factor), 1, 4000);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.rk4Step(h);
  }

  /** Regularized interaction energy; the potential whose gradient is magneticTorques. */
  magneticEnergy(theta) {
    const { N, L, mu, d, alpha } = this.params;
    const ca = Math.cos(deg2rad(alpha));
    const sa = Math.sin(deg2rad(alpha));
    const epsSq = (SOFTENING_FRACTION * d) ** 2;
    let total = 0;

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const D = (j - i) * d;
        const dx = D + L * (Math.sin(theta[j]) - Math.sin(theta[i]));
        const dy = -L * (Math.cos(theta[j]) - Math.cos(theta[i]));
        const r = Math.sqrt(dx * dx + dy * dy + epsSq);
        const p = dx * ca + dy * sa;
        total += MU0_OVER_4PI * mu[i] * mu[j] * (1 / r ** 3 - (3 * p * p) / r ** 5);
      }
    }
    return total;
  }

  /** Total mechanical energy (kinetic + gravity + magnetic). The magnetic term has an arbitrary offset. */
  energy() {
    const { N, L, m, g } = this.params;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const v = L * this.omega[i];
      total += 0.5 * m[i] * v * v;
      total += m[i] * g * L * (1 - Math.cos(this.theta[i]));
    }
    return total + this.magneticEnergy(this.theta);
  }

  /**
   * Excitation energy: mechanical energy above the resting configuration at
   * zero velocity. Unlike energy(), it does not depend on the magnetic offset.
   */
  excitationEnergy(equilibriumTheta) {
    const { N } = this.params;
    const { L, m, g } = this.params;
    let rest = this.magneticEnergy(equilibriumTheta);
    for (let i = 0; i < N; i++) rest += m[i] * g * L * (1 - Math.cos(equilibriumTheta[i]));
    return this.energy() - rest;
  }

  /**
   * Stiffness matrix K = −∂τ/∂θ by central differences (h = 1e-6) of the
   * analytical torque, so it linearizes the model that is actually integrated.
   * Pass { raw: true } to skip the symmetrization used by the eigensolver.
   */
  stiffness(theta, { raw = false } = {}) {
    const N = this.params.N;
    const h = 1e-6;
    const K = zeros2(N);

    for (let j = 0; j < N; j++) {
      const plus = theta.slice();
      const minus = theta.slice();
      plus[j] += h;
      minus[j] -= h;
      const tp = this.staticTorques(plus);
      const tm = this.staticTorques(minus);
      for (let i = 0; i < N; i++) K[i][j] = -(tp[i] - tm[i]) / (2 * h);
    }

    if (raw) return K;
    // Symmetric in exact arithmetic; average away finite-difference noise.
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const avg = 0.5 * (K[i][j] + K[j][i]);
        K[i][j] = avg;
        K[j][i] = avg;
      }
    }
    return K;
  }

  /**
   * Static equilibrium by damped Newton–Raphson.
   *
   * The magnets exert a net torque at θ = 0, so the resting state is generally
   * not vertical; linearization is taken about this state.
   *
   * Since J = ∂F/∂θ = −K, the Newton step is θ ← θ + K⁻¹F.
   */
  findEquilibrium(guess) {
    const N = this.params.N;
    let theta = (guess || zeros(N)).slice(0, N);

    for (let iter = 0; iter < 80; iter++) {
      const F = this.staticTorques(theta);
      const residual = Math.max(...F.map(Math.abs));
      if (residual < 1e-13) return { theta, converged: true, residual };

      const K = this.stiffness(theta);
      const step = solveLinear(K, F);
      if (!step) return { theta, converged: false, residual };

      // Limit the step to 0.25 rad to avoid overshooting toward bob contact.
      let scale = 1;
      const maxStep = Math.max(...step.map(Math.abs));
      if (maxStep > 0.25) scale = 0.25 / maxStep;

      for (let i = 0; i < N; i++) theta[i] = clamp(theta[i] + scale * step[i], -1.4, 1.4);
    }

    const F = this.staticTorques(theta);
    return { theta, converged: false, residual: Math.max(...F.map(Math.abs)) };
  }

  /**
   * Pair coupling κ_ij, the second derivative of the regularized potential
   * along the row. Point-dipole limit: 12 μ0 μi μj G(α) L² / (4π u⁵).
   * `reference` supplies the resting angles so u is the resting gap u*.
   */
  analyticKappa(i, j, reference) {
    const { L, mu, d, alpha } = this.params;
    let u = Math.abs(j - i) * d;
    if (reference && reference.length > Math.max(i, j)) {
      u += L * (Math.sin(reference[j]) - Math.sin(reference[i])) * Math.sign(j - i);
    }
    // Second derivative of the softened potential with respect to u
    // (retaken, since ∂q/∂u ≠ 1):
    //   κ = L²C[ −(3+6c)q⁻⁵ + (15+75c)u²q⁻⁷ − 105c·u⁴q⁻⁹ ],  c = cos²α
    // which reduces to 12CGL²/u⁵ as ε → 0.
    const c = Math.cos(deg2rad(alpha)) ** 2;
    const eps = SOFTENING_FRACTION * d;
    const q = Math.sqrt(u * u + eps * eps);
    const C = MU0_OVER_4PI * mu[i] * mu[j];

    return (
      L * L * C *
      (-(3 + 6 * c) / q ** 5 + ((15 + 75 * c) * u * u) / q ** 7 - (105 * c * u ** 4) / q ** 9)
    );
  }

  /**
   * Diagonal "tilt" term for oblique dipoles: it shifts each pendulum's own
   * restoring torque (with opposite sign on the two members of a pair) but
   * does not couple coordinates. It vanishes at α = 0° and 90°.
   *
   *   σ_i = Σ_j sgn(j−i) · 3 μ0 μi μj L sin(2α) / (4π u_ij⁴)
   */
  tiltTerm(i, reference) {
    const { N, L, mu, d, alpha } = this.params;
    const sin2a = Math.sin(2 * deg2rad(alpha));
    if (Math.abs(sin2a) < 1e-15) return 0;

    let total = 0;
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      let u = Math.abs(j - i) * d;
      if (reference && reference.length > Math.max(i, j)) {
        u += L * (Math.sin(reference[j]) - Math.sin(reference[i])) * Math.sign(j - i);
      }
      // Softened form of σ; reduces to 3CL·sin2α/u⁴ as ε → 0.
      const q = Math.sqrt(u * u + (SOFTENING_FRACTION * d) ** 2);
      total += Math.sign(j - i) * (3 * MU0_OVER_4PI * mu[i] * mu[j] * L * Math.abs(u) * sin2a) / q ** 5;
    }
    return total;
  }
}

// -----------------------------------------------------------------------------
// Normal-mode analysis
// -----------------------------------------------------------------------------

class NormalModeAnalyzer {
  /**
   * Solves K v = λ M v about the resting state. With S = M^(−1/2), the matrix
   * A = S K S is symmetric with the same eigenvalues; eigenvectors map back as
   * v = S u and are M-orthonormal (vᵀMv = 1).
   */
  analyze(system) {
    const { N, L, m } = system.params;

    const equilibrium = system.findEquilibrium(system.equilibriumHint);
    const K = system.stiffness(equilibrium.theta);

    const massDiag = new Array(N);
    for (let i = 0; i < N; i++) massDiag[i] = m[i] * L * L;

    const s = massDiag.map((v) => 1 / Math.sqrt(v));
    const A = zeros2(N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) A[i][j] = K[i][j] * s[i] * s[j];
    }

    const { values, vectors } = jacobiEigen(A);

    const modes = values.map((lambda, k) => {
      const raw = new Array(N);
      for (let i = 0; i < N; i++) raw[i] = s[i] * vectors[i][k];

      let biggest = 0;
      for (let i = 0; i < N; i++) {
        if (Math.abs(raw[i]) > Math.abs(raw[biggest])) biggest = i;
      }
      const sign = raw[biggest] < 0 ? -1 : 1;
      const vecM = raw.map((v) => v * sign);

      const peak = Math.max(...vecM.map(Math.abs)) || 1;
      const vecDisplay = vecM.map((v) => v / peak);

      const stable = lambda > 0;
      const omega = stable ? Math.sqrt(lambda) : 0;

      return {
        lambda,
        omega,
        stable,
        growth: stable ? 0 : Math.sqrt(-lambda),
        frequency: stable ? omega / (2 * Math.PI) : 0,
        period: stable && omega > 1e-9 ? (2 * Math.PI) / omega : Infinity,
        vecM,
        vecDisplay,
        ...NormalModeAnalyzer.describe(vecDisplay)
      };
    });

    modes.sort((a, b) => a.lambda - b.lambda);

    return { equilibrium, K, massDiag, modes, analytic: this.analytic(system, equilibrium) };
  }

  /**
   * Uniform-chain closed form. Assumes equal masses and moments, nearest-
   * neighbour coupling only, cos θ* ≈ 1 and no oblique tilt term, so that
   * K ≈ mgL·I + κ·(path-graph Laplacian). The Laplacian spectrum
   *   eigenvalues 4 sin²(kπ/2N),  eigenvectors v_k[i] = cos(kπ(i+½)/N)
   * gives ω_k² = g/L + (4κ / mL²) sin²(kπ/2N), k = 0 … N−1.
   * It is an approximation to the numerical modes whenever any assumption fails.
   */
  analytic(system, equilibrium) {
    const { N, L, m, mu, g, alpha } = system.params;

    const uniformMass = m.slice(0, N).every((v) => Math.abs(v - m[0]) < 1e-12);
    const uniformMu = mu.slice(0, N).every((v) => Math.abs(v - mu[0]) < 1e-12);
    // The tilt term (∝ sin 2α) is absent from the closed form.
    const symmetric = Math.abs(Math.sin(2 * deg2rad(alpha))) < 1e-9;
    const applicable = uniformMass && uniformMu;

    const kappa = system.analyticKappa(0, 1, equilibrium && equilibrium.theta);
    const inertia = m[0] * L * L;

    const frequencies = [];
    for (let k = 0; k < N; k++) {
      const shape = Math.sin((k * Math.PI) / (2 * N)) ** 2;
      const omegaSq = g / L + ((4 * kappa) / inertia) * shape;
      const vector = [];
      for (let i = 0; i < N; i++) vector.push(Math.cos((k * Math.PI * (i + 0.5)) / N));
      const peak = Math.max(...vector.map(Math.abs)) || 1;

      frequencies.push({
        k,
        omegaSq,
        omega: omegaSq > 0 ? Math.sqrt(omegaSq) : NaN,
        stable: omegaSq > 0,
        vector: vector.map((v) => v / peak)
      });
    }

    // Sort ascending to pair with the sorted numerical modes (for κ < 0 the
    // frequency decreases with k).
    frequencies.sort((a, b) => {
      if (a.stable && b.stable) return a.omega - b.omega;
      return a.omegaSq - b.omegaSq;
    });

    return { applicable, symmetric, kappa, frequencies, uniformMass, uniformMu };
  }

  static describe(vector) {
    let changes = 0;
    for (let i = 1; i < vector.length; i++) {
      if (vector[i] * vector[i - 1] < 0) changes++;
    }
    let description;
    if (changes === 0) description = 'All bobs swing in phase';
    else if (changes === 1) description = 'The two halves swing in opposition';
    else description = `${changes} sign changes — a ${changes}-node pattern`;
    return { nodes: changes, description };
  }

  /**
   * Decompose the live state into modal amplitudes measured from equilibrium.
   * a_k = v_kᵀ M η with η = θ − θ*, and E_k = ½(ȧ_k² + λ_k a_k²).
   */
  decompose(analysis, theta, omega) {
    const { modes, massDiag, equilibrium } = analysis;
    const contributions = modes.map((mode) => {
      let a = 0;
      let aDot = 0;
      for (let i = 0; i < massDiag.length; i++) {
        a += mode.vecM[i] * massDiag[i] * (theta[i] - equilibrium.theta[i]);
        aDot += mode.vecM[i] * massDiag[i] * omega[i];
      }
      return { amplitude: a, velocity: aDot, energy: 0.5 * (aDot * aDot + Math.max(mode.lambda, 0) * a * a) };
    });

    const total = contributions.reduce((sum, c) => sum + c.energy, 0);
    contributions.forEach((c) => {
      c.share = total > 1e-16 ? c.energy / total : 0;
    });
    return contributions;
  }
}

// -----------------------------------------------------------------------------
// Spring–mass coordinates and the independent linear model
// -----------------------------------------------------------------------------

/**
 * Spring–mass coordinates x_i = L·η_i, with η measured from the resting state.
 * Dividing M η̈ + K η = 0 by L gives x̃¨_i = −Σ_j K_ij x_j / (m_i L²): a chain of
 * unit-length-scaled oscillators. `derived` reports the gravity and pair-spring
 * constants used to draw the springs; the full K also contains cos θ* and tilt
 * terms on its diagonal.
 *
 * `sampleFrom` maps the nonlinear state into these coordinates. It is a
 * visualization only — it is not an independent simulation (see LinearModel).
 */
class SpringMassSystem {
  constructor() {
    this.x = [];
    this.v = [];
  }

  derived(system, analysis) {
    const { N, L, m, g } = system.params;
    const masses = new Array(N);
    const ground = new Array(N);
    const coupling = zeros2(N);

    for (let i = 0; i < N; i++) {
      masses[i] = m[i];
      ground[i] = (m[i] * g) / L;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        coupling[i][j] = -analysis.K[i][j] / (L * L); // K_ij = −κ_ij
      }
    }
    return { masses, ground, coupling };
  }

  sampleFrom(system, analysis) {
    const { N, L } = system.params;
    this.x = new Array(N);
    this.v = new Array(N);
    for (let i = 0; i < N; i++) {
      this.x[i] = L * (system.theta[i] - analysis.equilibrium.theta[i]);
      this.v[i] = L * system.omega[i];
    }
  }
}

/**
 * Independent linearized model: η¨_i = −Σ_j K_ij η_j / (m_i L²) − b η̇_i, with η
 * measured from the resting state (spring coordinates are x_i = L·η_i). It is
 * integrated with fixed-step RK4 on the same clock as the nonlinear cradle and
 * never reads the nonlinear state after reset(), so the two can separate.
 */
class LinearModel {
  constructor() {
    this.eta = [];
    this.etaDot = [];
    this.time = 0;
  }

  /** Initialize from the nonlinear state, projected about the resting state. */
  reset(system, analysis) {
    const N = system.params.N;
    this.eta = new Array(N);
    this.etaDot = new Array(N);
    for (let i = 0; i < N; i++) {
      this.eta[i] = system.theta[i] - analysis.equilibrium.theta[i];
      this.etaDot[i] = system.omega[i];
    }
    this.time = system.time;
  }

  /** Keep the same absolute angles when the resting state moves (parameter edit). */
  rebase(oldEq, newEq) {
    if (oldEq.length !== newEq.length || oldEq.length !== this.eta.length) return;
    for (let i = 0; i < this.eta.length; i++) this.eta[i] += oldEq[i] - newEq[i];
  }

  /** Spring coordinates x_i = L·η_i, in metres. */
  coordinates(L) {
    return this.eta.map((e) => L * e);
  }

  accel(eta, etaDot, analysis, damping) {
    const { K, massDiag } = analysis;
    const N = eta.length;
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      let force = 0;
      for (let j = 0; j < N; j++) force -= K[i][j] * eta[j];
      out[i] = force / massDiag[i] - damping * etaDot[i];
    }
    return out;
  }

  rk4Step(h, analysis, damping) {
    const N = this.eta.length;
    const shift = (base, delta, f) => base.map((b, i) => b + delta[i] * f);
    const y = this.eta;
    const v = this.etaDot;
    const a1 = this.accel(y, v, analysis, damping);
    const y2 = shift(y, v, h / 2);
    const v2 = shift(v, a1, h / 2);
    const a2 = this.accel(y2, v2, analysis, damping);
    const y3 = shift(y, v2, h / 2);
    const v3 = shift(v, a2, h / 2);
    const a3 = this.accel(y3, v3, analysis, damping);
    const y4 = shift(y, v3, h);
    const v4 = shift(v, a3, h);
    const a4 = this.accel(y4, v4, analysis, damping);
    for (let i = 0; i < N; i++) {
      this.eta[i] += (h / 6) * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i]);
      this.etaDot[i] += (h / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]);
    }
    this.time += h;
  }

  /** Advance by dt in RK4 steps of at most 1/720 s (the linear system is not stiff). */
  advance(dt, analysis, damping) {
    if (this.eta.length !== analysis.K.length) return;
    const steps = clamp(Math.ceil(dt * 720), 1, 400);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.rk4Step(h, analysis, damping);
  }
}

/** RMS difference between two coordinate vectors, sqrt(mean((a_i − b_i)²)). */
function rmsDifference(a, b) {
  const N = a.length;
  if (!N || b.length !== N) return NaN;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / N);
}

/**
 * Analytic solution of one mode of the linearized, uniformly damped system for
 * η(0) = a·v, η̇(0) = 0. Returns the scalar factors (position, velocity) that
 * multiply a·v. Underdamped: e^(−bt/2)(cos ω_d t + (b/2ω_d) sin ω_d t) with
 * ω_d² = λ − b²/4. If ω_d² ≤ 0 the mode is treated as undamped.
 */
function modeEnvelope(lambda, damping, t) {
  const wd2 = lambda - (damping * damping) / 4;
  const damped = wd2 > 1e-12;
  const wd = damped ? Math.sqrt(wd2) : Math.sqrt(Math.max(lambda, 0));
  const beta = damped ? damping / 2 : 0;
  const env = Math.exp(-beta * t);
  const c = Math.cos(wd * t);
  const sn = Math.sin(wd * t);
  return {
    position: env * (c + (wd > 0 ? (beta / wd) * sn : 0)),
    velocity: -env * (wd > 0 ? ((wd * wd + beta * beta) / wd) * sn : 0)
  };
}

// -----------------------------------------------------------------------------
// Rendering (draw routines take a viewport {x, y, w, h})
// -----------------------------------------------------------------------------

function syncCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function fillBackground(ctx, w, h) {
  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(0, 0, w, h);
}

function glow(ctx, x, y, radius, color, blur = 14) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function captionText(ctx, text, x, y, color = PALETTE.muted, size = 10) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A bob magnet, drawn with its axis fixed in the laboratory frame (see model assumptions). */
function drawMagnetBob(ctx, x, y, radius, alphaDeg, mu, accent) {
  // Physics α measures from +x with y up; canvas y runs down.
  const dirX = Math.cos(deg2rad(alphaDeg));
  const dirY = -Math.sin(deg2rad(alphaDeg));
  const phi = Math.atan2(dirY, dirX);

  const north = mu >= 0 ? PALETTE.rust : PALETTE.blue;
  const south = mu >= 0 ? PALETTE.blue : PALETTE.rust;

  ctx.save();
  ctx.shadowColor = hexToRgba(accent, 0.9);
  ctx.shadowBlur = 15;
  ctx.fillStyle = north;
  ctx.beginPath();
  ctx.arc(x, y, radius, phi - Math.PI / 2, phi + Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = south;
  ctx.beginPath();
  ctx.arc(x, y, radius, phi + Math.PI / 2, phi + (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Little arrow through the bob showing the dipole axis.
  const ax = dirX * radius * 1.85;
  const ay = dirY * radius * 1.85;
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - ax * 0.55, y - ay * 0.55);
  ctx.lineTo(x + ax * 0.55, y + ay * 0.55);
  ctx.stroke();

  const head = 3.4;
  const angle = Math.atan2(ay, ax);
  ctx.fillStyle = hexToRgba(PALETTE.ink, 0.75);
  ctx.beginPath();
  ctx.moveTo(x + ax * 0.55, y + ay * 0.55);
  ctx.lineTo(
    x + ax * 0.55 - head * Math.cos(angle - Math.PI / 6),
    y + ay * 0.55 - head * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x + ax * 0.55 - head * Math.cos(angle + Math.PI / 6),
    y + ay * 0.55 - head * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSpring(ctx, x1, y1, x2, y2, coils, amplitude, color, width = 1.4) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const segments = coils * 2;
  const lead = Math.min(10, length * 0.16);
  const body = length - lead * 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * lead, y1 + uy * lead);
  for (let i = 1; i <= segments; i++) {
    const t = lead + (body * i) / segments;
    const side = i % 2 === 0 ? -1 : 1;
    const offset = i === segments ? 0 : side * amplitude;
    ctx.lineTo(x1 + ux * t + px * offset, y1 + uy * t + py * offset);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawCradle(ctx, system, analysis, vp, options = {}) {
  const p = system.params;
  const N = p.N;
  const compact = !!options.compact;

  ctx.save();
  ctx.translate(vp.x, vp.y);
  ctx.beginPath();
  ctx.rect(0, 0, vp.w, vp.h);
  ctx.clip();

  const spanX = (N - 1) * p.d + 2 * p.L * 0.72;
  const spanY = p.L * 1.2;
  const scale = Math.min((vp.w * 0.86) / Math.max(spanX, 1e-6), (vp.h * 0.82) / Math.max(spanY, 1e-6));

  const pivotY = clamp((vp.h - p.L * scale) / 2, compact ? 22 : 34, vp.h * 0.34);
  const firstX = vp.w / 2 - ((N - 1) * p.d * scale) / 2;

  // Support beam
  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.28);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(firstX - 22, pivotY);
  ctx.lineTo(firstX + (N - 1) * p.d * scale + 22, pivotY);
  ctx.stroke();
  ctx.restore();

  const bobs = [];
  for (let i = 0; i < N; i++) {
    const offset = system.bobOffset(system.theta[i]);
    bobs.push({
      pivotX: firstX + i * p.d * scale,
      x: firstX + i * p.d * scale + offset.x * scale,
      y: pivotY - offset.y * scale // offset.y is negative (below pivot)
    });
  }

  // Equilibrium ghosts — where the magnets hold the cradle at rest.
  if (analysis && !compact) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.14);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const eq = system.bobOffset(analysis.equilibrium.theta[i]);
      const px = firstX + i * p.d * scale;
      ctx.beginPath();
      ctx.moveTo(px, pivotY);
      ctx.lineTo(px + eq.x * scale, pivotY - eq.y * scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Interaction links, tinted by whether the pair attracts or repels.
  const G = geometryFactor(p.alpha);
  if (Math.abs(G) > 1e-6) {
    let strongest = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        strongest = Math.max(strongest, Math.abs(system.analyticKappa(i, j)));
      }
    }
    if (strongest > 1e-16) {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const strength = Math.abs(system.analyticKappa(i, j)) / strongest;
          if (strength < 0.05) continue;
          const attracting = G < 0;
          ctx.save();
          ctx.strokeStyle = hexToRgba(attracting ? PALETTE.rust : PALETTE.violet, 0.12 + strength * 0.4);
          ctx.lineWidth = 0.6 + strength * 1.7;
          if (attracting) ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(bobs[i].x, bobs[i].y);
          ctx.lineTo(bobs[j].x, bobs[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  for (let i = 0; i < N; i++) {
    const accent = ACCENTS[i % ACCENTS.length];
    ctx.save();
    ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.45);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bobs[i].pivotX, pivotY);
    ctx.lineTo(bobs[i].x, bobs[i].y);
    ctx.stroke();
    ctx.restore();

    glow(ctx, bobs[i].pivotX, pivotY, 2.6, hexToRgba(PALETTE.ink, 0.6), 5);

    const radius = compact
      ? clamp(Math.sqrt(p.m[i]) * 18, 7, 15)
      : clamp(Math.sqrt(p.m[i]) * 26, 9, 22);
    drawMagnetBob(ctx, bobs[i].x, bobs[i].y, radius, p.alpha, p.mu[i], accent);
  }

  if (!compact) {
    captionText(ctx, `α = ${p.alpha.toFixed(0)}°   G(α) = ${G.toFixed(3)}`, 14, vp.h - 14, hexToRgba(PALETTE.muted, 0.8));
  }
  ctx.restore();
}

function drawSprings(ctx, springs, system, derived, vp, options = {}) {
  const p = system.params;
  const N = p.N;
  const compact = !!options.compact;

  ctx.save();
  ctx.translate(vp.x, vp.y);
  ctx.beginPath();
  ctx.rect(0, 0, vp.w, vp.h);
  ctx.clip();

  const trackY = vp.h * (compact ? 0.38 : 0.42);
  const groundY = vp.h * (compact ? 0.84 : 0.82);
  const slotWidth = (vp.w * 0.82) / N;
  const firstX = vp.w / 2 - (slotWidth * (N - 1)) / 2;
  const scale = (slotWidth * 0.34) / Math.max(p.L * 0.6, 1e-6);

  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.28);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(vp.w * 0.06, groundY);
  ctx.lineTo(vp.w * 0.94, groundY);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.14);
  ctx.lineWidth = 1;
  for (let x = vp.w * 0.06; x < vp.w * 0.94; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x - 6, groundY + 7);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.1);
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(vp.w * 0.06, trackY);
  ctx.lineTo(vp.w * 0.94, trackY);
  ctx.stroke();
  ctx.restore();

  const positions = [];
  for (let i = 0; i < N; i++) {
    positions.push(firstX + i * slotWidth + (springs.x[i] || 0) * scale);
  }

  for (let i = 0; i < N - 1; i++) {
    const negative = derived.coupling[i][i + 1] < 0;
    drawSpring(
      ctx,
      positions[i], trackY, positions[i + 1], trackY,
      7, compact ? 4 : 5,
      hexToRgba(negative ? PALETTE.rust : PALETTE.violet, 0.6),
      1.5
    );
  }

  for (let i = 0; i < N; i++) {
    const accent = ACCENTS[i % ACCENTS.length];
    const home = firstX + i * slotWidth;
    drawSpring(ctx, home, groundY, positions[i], trackY, 8, compact ? 4 : 5, hexToRgba(PALETTE.ink, 0.3), 1.2);

    const size = compact ? clamp(Math.sqrt(p.m[i]) * 32, 14, 28) : clamp(Math.sqrt(p.m[i]) * 42, 18, 38);
    ctx.save();
    ctx.shadowColor = hexToRgba(accent, 0.8);
    ctx.shadowBlur = 13;
    ctx.fillStyle = hexToRgba(accent, 0.85);
    ctx.fillRect(positions[i] - size / 2, trackY - size / 2, size, size);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(home, trackY - size / 2 - 8);
    ctx.lineTo(home, trackY - size / 2 - 2);
    ctx.stroke();
    ctx.restore();
  }

  if (!compact) {
    captionText(ctx, 'xᵢ = L·ηᵢ   (ηᵢ measured from equilibrium)', 14, 20, hexToRgba(PALETTE.muted, 0.6));
  }
  ctx.restore();
}

// -----------------------------------------------------------------------------
// Application
// -----------------------------------------------------------------------------

// Per-pendulum sliders. Initial conditions are global: they apply to the
// left-most pendulum only and take effect on Reset.
const LIMITS = {
  m: { min: 0.05, max: 0.5, step: 0.005, digits: 3, unit: ' kg', label: 'Mass m' },
  mu: { min: 0, max: 20, step: 0.25, digits: 2, unit: ' A·m²', label: 'Dipole μ' }
};

// Amplitude and error thresholds for the linear-model warnings.
const LARGE_AMPLITUDE_RAD = 0.3;
const LINEAR_ERROR_THRESHOLD = 0.1; // RMS difference / RMS displacement

// Mismatch pattern for "Introduce a small mismatch": relative offsets per bob.
const MISMATCH_MASS = [0, 0.1, -0.1, 0.05, -0.05];
const MISMATCH_MU = [0, -0.08, 0.08, -0.04, 0.04];

function defaultParams() {
  return {
    N: 3,
    L: 0.32, // common to every pendulum
    m: [0.18, 0.18, 0.18, 0.18, 0.18],
    // Illustrative default moment. Larger values at α = 0 pull the bobs close
    // enough that the 1/r⁵ force becomes very stiff.
    mu: [5, 5, 5, 5, 5],
    theta0: 0.22, // left-most pendulum only, applied on Reset
    omega0: 0,
    g: 9.81,
    d: 0.16,
    alpha: 90, // degrees anticlockwise from +x; 90° = every north pole up
    damping: 0.02
  };
}

// Presets only set existing parameters.
const PRESETS = {
  repulsive: (p) => {
    p.alpha = 90;
  },
  decoupled: (p) => {
    p.alpha = MAGIC_ANGLE_DEG;
  },
  attractive: (p) => {
    p.alpha = 0;
  },
  unequal: (p) => {
    p.N = 3;
    p.alpha = 90;
    p.m = [0.18, 0.12, 0.26, 0.18, 0.18];
    p.mu = [5, 3.5, 6.5, 5, 5];
  },
  // At α = 0° and μ = 7 A·m² the softest mode has λ ≈ 3.7 s⁻² against g/L ≈ 30.7 s⁻².
  near: (p) => {
    p.N = 3;
    p.alpha = 0;
    p.mu = [7, 7, 7, 7, 7];
  }
};

const fmtAngle = (v) => `${v.toFixed(2)}°`;
const fmtRad = (v) => `${v.toFixed(2)} rad`;
const fmtRate = (v) => `${v.toFixed(2)} rad/s`;

class App {
  constructor() {
    this.params = defaultParams();
    this.system = new MagneticCradle(this.params);
    this.springs = new SpringMassSystem();
    this.linear = new LinearModel();
    this.analyzer = new NormalModeAnalyzer();

    this.canvases = {
      cradle: document.getElementById('cradle-canvas'),
      spring: document.getElementById('spring-canvas'),
      compare: document.getElementById('compare-canvas')
    };

    this.playing = true;
    this.viewMode = 'mapped'; // 'mapped' | 'independent'
    this.modeIndex = null;
    this.modeTime = 0;
    this.modeAmplitude = 0.26;
    this.lastFrame = performance.now();
    this.uiClock = 0;
    this.initialsPending = false;
    this.energyBase = 0;
    this.energyMaxDrift = 0;
    this.staticWarnings = [];
    this.warningKey = '';
    this.analysis = null;

    this.cacheDom();
    this.buildPendulumControls();
    this.bindControls();
    this.recompute();
    this.fullReset();

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reducedMotion) this.setPlaying(false);

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.addEventListener('resize', () => this.render());
  }

  cacheDom() {
    const id = (x) => document.getElementById(x);
    this.dom = {
      pendulumControls: id('pendulum-controls'),
      playToggle: id('play-toggle'),
      resetBtn: id('reset-btn'),
      defaultsBtn: id('defaults-btn'),
      nudgeBtn: id('nudge-btn'),
      makeEqualBtn: id('make-equal-btn'),
      mismatchBtn: id('mismatch-btn'),
      presetButtons: Array.from(document.querySelectorAll('[data-preset]')),
      viewButtons: Array.from(document.querySelectorAll('[data-view]')),
      inputTheta0: id('input-theta0'), valTheta0: id('val-theta0'),
      inputOmega0: id('input-omega0'), valOmega0: id('val-omega0'),
      initialPending: id('initial-pending'),
      clock: id('clock-readout'),
      energy: id('energy-readout'),
      energyDetail: id('energy-detail'),
      energyCheck: id('energy-check'),
      validation: id('validation'),
      readoutG: id('readout-G'), readoutGNote: id('readout-G-note'),
      readoutFreq: id('readout-freq'), readoutFreqNote: id('readout-freq-note'),
      readoutError: id('readout-error'), readoutErrorNote: id('readout-error-note'),
      compareReadout: id('compare-readout'),
      compareNote: id('compare-note'),
      springDetails: id('spring-view'),
      analogTable: document.querySelector('#analog-table tbody'),
      analogNote: id('analog-note'),
      analogMirror: id('analog-mirror'),
      matrixM: id('matrix-M'),
      matrixK: id('matrix-K'),
      modeTable: document.querySelector('#mode-table tbody'),
      modeStatus: id('mode-status'),
      freeMotionBtn: id('free-motion-btn'),
      decomposition: id('decomposition'),
      equilibriumReadout: id('equilibrium-readout'),
      geometryReadout: id('geometry-readout'),
      theoryMirror: id('theory-mirror'),
      inputN: id('input-N'), valN: id('val-N'),
      inputL: id('input-L'), valL: id('val-L'),
      inputG: id('input-g'), valG: id('val-g'),
      inputD: id('input-d'), valD: id('val-d'),
      inputAlpha: id('input-alpha'), valAlpha: id('val-alpha'),
      inputB: id('input-b'), valB: id('val-b')
    };
  }

  buildPendulumControls() {
    const host = this.dom.pendulumControls;
    host.innerHTML = '';
    const keys = Object.keys(LIMITS);

    for (let i = 0; i < this.params.N; i++) {
      const card = document.createElement('div');
      card.className = 'control-card';
      card.style.setProperty('--accent', ACCENTS[i % ACCENTS.length]);

      const heading = document.createElement('h4');
      heading.innerHTML = `<span class="dot" aria-hidden="true"></span>Pendulum ${i + 1}`;
      card.appendChild(heading);

      keys.forEach((key) => {
        const spec = LIMITS[key];
        const inputId = `input-${key}-${i}`;
        const wrap = document.createElement('div');
        wrap.className = 'field';

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        label.innerHTML = `${spec.label} <span class="val"></span>`;

        const input = document.createElement('input');
        input.type = 'range';
        input.id = inputId;
        input.min = spec.min;
        input.max = spec.max;
        input.step = spec.step;
        input.value = this.params[key][i];

        const readout = label.querySelector('.val');
        const paint = () => {
          readout.textContent = Number(input.value).toFixed(spec.digits) + spec.unit;
        };
        paint();

        input.addEventListener('input', () => {
          this.params[key][i] = Number(input.value);
          paint();
          this.recompute();
        });

        wrap.appendChild(label);
        wrap.appendChild(input);
        card.appendChild(wrap);
      });

      host.appendChild(card);
    }
  }

  bindControls() {
    const { dom } = this;

    dom.inputN.addEventListener('input', () => {
      const next = clamp(Math.round(Number(dom.inputN.value)), 2, 5);
      dom.valN.textContent = String(next);
      if (next === this.params.N) return;
      this.params.N = next;
      this.buildPendulumControls();
      this.system.equilibriumHint = null;
      this.fullReset();
    });

    const bindScalar = (input, readout, key, format) => {
      input.addEventListener('input', () => {
        this.params[key] = Number(input.value);
        readout.textContent = format(this.params[key]);
        this.recompute();
      });
    };

    bindScalar(dom.inputL, dom.valL, 'L', (v) => `${v.toFixed(3)} m`);
    bindScalar(dom.inputG, dom.valG, 'g', (v) => `${v.toFixed(2)} m/s²`);
    bindScalar(dom.inputD, dom.valD, 'd', (v) => `${v.toFixed(3)} m`);
    bindScalar(dom.inputB, dom.valB, 'damping', (v) => `${v.toFixed(3)} s⁻¹`);
    bindScalar(dom.inputAlpha, dom.valAlpha, 'alpha', fmtAngle);

    // Initial conditions describe the NEXT run, so they only mark themselves pending.
    const bindInitial = (input, readout, key, format) => {
      input.addEventListener('input', () => {
        this.params[key] = Number(input.value);
        readout.textContent = format(this.params[key]);
        this.setInitialsPending(true);
      });
    };
    bindInitial(dom.inputTheta0, dom.valTheta0, 'theta0', fmtRad);
    bindInitial(dom.inputOmega0, dom.valOmega0, 'omega0', fmtRate);

    dom.playToggle.addEventListener('click', () => this.setPlaying(!this.playing));
    dom.resetBtn.addEventListener('click', () => this.fullReset());

    dom.defaultsBtn.addEventListener('click', () => {
      this.params = defaultParams();
      this.system.params = this.params;
      this.system.equilibriumHint = null;
      this.syncControlsFromParams();
      this.buildPendulumControls();
      this.recompute();
      this.fullReset();
    });

    dom.nudgeBtn.addEventListener('click', () => {
      this.modeIndex = null;
      this.system.omega[0] += 1.2;
      this.linear.etaDot[0] += 1.2;
      this.rebaseEnergy();
      this.updateModeStatus();
    });

    dom.freeMotionBtn.addEventListener('click', () => {
      this.modeIndex = null;
      this.updateModeStatus();
      this.renderModeTable();
    });

    dom.presetButtons.forEach((button) => {
      button.addEventListener('click', () => this.applyPreset(button.dataset.preset));
    });

    dom.viewButtons.forEach((button) => {
      button.addEventListener('click', () => this.setViewMode(button.dataset.view));
    });

    dom.makeEqualBtn.addEventListener('click', () => {
      const p = this.params;
      for (let i = 1; i < p.m.length; i++) {
        p.m[i] = p.m[0];
        p.mu[i] = p.mu[0];
      }
      this.buildPendulumControls();
      this.recompute();
    });

    dom.mismatchBtn.addEventListener('click', () => {
      const p = this.params;
      const clampTo = (v, spec) => clamp(Math.round(v / spec.step) * spec.step, spec.min, spec.max);
      for (let i = 0; i < p.m.length; i++) {
        p.m[i] = clampTo(p.m[0] * (1 + MISMATCH_MASS[i]), LIMITS.m);
        p.mu[i] = clampTo(p.mu[0] * (1 + MISMATCH_MU[i]), LIMITS.mu);
      }
      this.buildPendulumControls();
      this.recompute();
    });
  }

  setPlaying(playing) {
    this.playing = playing;
    this.dom.playToggle.textContent = playing ? 'Pause' : 'Play';
    this.dom.playToggle.setAttribute('aria-pressed', String(playing));
  }

  setViewMode(mode) {
    this.viewMode = mode === 'independent' ? 'independent' : 'mapped';
    this.dom.viewButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.view === this.viewMode));
    });
    this.renderCompareNote();
    this.render();
  }

  applyPreset(key) {
    const apply = PRESETS[key];
    if (!apply) return;
    apply(this.params);
    this.system.equilibriumHint = null;
    this.syncControlsFromParams();
    this.buildPendulumControls();
    this.fullReset();
  }

  setInitialsPending(pending) {
    this.initialsPending = pending;
    if (this.dom.initialPending) this.dom.initialPending.hidden = !pending;
  }

  /**
   * Restart: leave mode playback, clear the clock, re-solve the resting state,
   * and relaunch both the nonlinear and the independent linear run from the
   * same displacement and velocity about that state. Parameters are untouched.
   */
  fullReset() {
    this.modeIndex = null;
    this.modeTime = 0;
    this.system.equilibriumHint = null;
    this.recompute();
    this.system.reset(this.analysis.equilibrium.theta);
    this.linear.reset(this.system, this.analysis);
    this.rebaseEnergy();
    this.setInitialsPending(false);
    this.updateModeStatus();
    this.renderModeTable();
    this.render();
    this.updateReadouts();
  }

  /** Push params back into every slider — used after presets and Restore defaults. */
  syncControlsFromParams() {
    const { dom, params } = this;
    const set = (input, readout, value, format) => {
      input.value = value;
      readout.textContent = format(value);
    };
    set(dom.inputN, dom.valN, params.N, (v) => String(v));
    set(dom.inputL, dom.valL, params.L, (v) => `${v.toFixed(3)} m`);
    set(dom.inputG, dom.valG, params.g, (v) => `${v.toFixed(2)} m/s²`);
    set(dom.inputD, dom.valD, params.d, (v) => `${v.toFixed(3)} m`);
    set(dom.inputAlpha, dom.valAlpha, params.alpha, fmtAngle);
    set(dom.inputB, dom.valB, params.damping, (v) => `${v.toFixed(3)} s⁻¹`);
    set(dom.inputTheta0, dom.valTheta0, params.theta0, fmtRad);
    set(dom.inputOmega0, dom.valOmega0, params.omega0, fmtRate);
  }

  /** Energy baseline for the drift readout: excitation energy above the resting state. */
  rebaseEnergy() {
    this.energyBase = this.system.excitationEnergy(this.analysis.equilibrium.theta);
    this.energyMaxDrift = 0;
  }

  recompute() {
    this.system.params = this.params;
    const N = this.params.N;

    while (this.system.theta.length < N) {
      this.system.theta.push(0);
      this.system.omega.push(0);
    }
    this.system.theta.length = N;
    this.system.omega.length = N;

    const previousEq = this.analysis ? this.analysis.equilibrium.theta.slice() : null;
    this.analysis = this.analyzer.analyze(this.system);
    this.system.equilibriumHint = this.analysis.equilibrium.theta.slice();
    this.derived = this.springs.derived(this.system, this.analysis);

    // A parameter edit moves the resting state; keep the linear run on the same
    // absolute angles and re-baseline the energy drift.
    if (previousEq) this.linear.rebase(previousEq, this.analysis.equilibrium.theta);
    this.rebaseEnergy();

    if (this.modeIndex !== null && this.modeIndex >= this.analysis.modes.length) {
      this.modeIndex = null;
    }

    this.renderAnalogTable();
    this.renderMatrices();
    this.renderModeTable();
    this.renderMirrors();
    this.buildStaticWarnings();
    this.renderCompareNote();
    this.updateModeStatus();
    this.updateReadouts();
  }

  /** Warnings that depend only on parameters, grouped by category. */
  buildStaticWarnings() {
    const list = [];
    const { modes, equilibrium } = this.analysis;
    const { analytic } = this.analysis;
    const G = geometryFactor(this.params.alpha);
    const unstable = modes.filter((m) => !m.stable);

    if (unstable.length > 0) {
      list.push({
        cat: 'physical',
        text:
          `${unstable.length} linear mode${unstable.length > 1 ? 's have' : ' has'} λ ≤ 0. ` +
          'The magnets overpower gravity along that pattern, so the resting state is unstable. ' +
          'Reduce μ, increase d, or move α toward the magic angle.'
      });
    }
    if (G < -0.02) {
      list.push({
        cat: 'physical',
        text: 'Attractive coupling (G < 0): the anti-phase mode is the soft one and the resting state is pulled together.'
      });
    }
    if (Math.abs(G) < 0.02) {
      list.push({
        cat: 'physical',
        text:
          `Point-dipole coupling vanishes at the magic angle (${MAGIC_ANGLE_DEG.toFixed(2)}°). ` +
          'With the current finite-size regularization, the residual is small but not identically zero.'
      });
    }

    if (!analytic.applicable) {
      list.push({
        cat: 'linear',
        text: 'Unequal masses or moments: the closed-form comparison does not apply; use the numerical modes.'
      });
    } else if (!analytic.symmetric) {
      list.push({
        cat: 'linear',
        text:
          'Oblique orientation adds a diagonal tilt term that the closed form omits; ' +
          'the closed-form column is an approximation here.'
      });
    }

    if (!equilibrium.converged) {
      list.push({
        cat: 'numerical',
        text:
          'The resting-state solver did not converge, so no nearby resting state was found. ' +
          'Mode results are indicative only.'
      });
    }
    this.staticWarnings = list;
    this.updateWarnings();
  }

  /** Static warnings plus those that depend on the running state. */
  updateWarnings() {
    const list = this.staticWarnings.slice();
    const { params, analysis } = this;

    let maxEta = 0;
    for (let i = 0; i < params.N; i++) {
      maxEta = Math.max(maxEta, Math.abs(this.system.theta[i] - analysis.equilibrium.theta[i]));
    }
    if (maxEta > LARGE_AMPLITUDE_RAD) {
      list.push({
        cat: 'linear',
        text:
          `Displacements reach ${((maxEta * 180) / Math.PI).toFixed(0)}° from rest; the small-angle ` +
          'approximation is expected to degrade at this amplitude.'
      });
    }

    const error = this.linearError();
    if (error && error.relative > LINEAR_ERROR_THRESHOLD) {
      list.push({
        cat: 'linear',
        text:
          `The independent linear run differs from the nonlinear motion by ${(error.relative * 100).toFixed(0)}% ` +
          `(RMS), above the ${LINEAR_ERROR_THRESHOLD * 100}% threshold.`
      });
    }

    if (this.system.contactHit) {
      list.push({
        cat: 'numerical',
        text:
          'Two bobs are within about three softening lengths of each other, where the regularization ' +
          'dominates the interaction. Treat this regime as qualitative.'
      });
    }

    const labels = { physical: 'Physical regime', linear: 'Linear-model limit', numerical: 'Model / numerical limit' };
    const order = ['physical', 'linear', 'numerical'];
    list.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
    const html = list
      .map((w) => `<span class="msg msg-${w.cat}"><strong>${labels[w.cat]}</strong> ${w.text}</span>`)
      .join('');
    if (html === this.warningKey) return;
    this.warningKey = html;
    this.dom.validation.hidden = list.length === 0;
    this.dom.validation.innerHTML = html;
  }

  /** RMS coordinate difference between the nonlinear state and the independent linear run. */
  linearError() {
    const { L } = this.params;
    const mapped = this.system.theta.map((t, i) => L * (t - this.analysis.equilibrium.theta[i]));
    const linear = this.linear.coordinates(L);
    const rms = rmsDifference(mapped, linear);
    if (!Number.isFinite(rms)) return null;
    const scale = Math.sqrt(mapped.reduce((s, v) => s + v * v, 0) / mapped.length);
    return { rms, relative: scale > 1e-4 ? rms / scale : 0, scale };
  }

  renderAnalogTable() {
    const N = this.params.N;
    const { masses, ground, coupling } = this.derived;
    const rows = [];
    for (let i = 0; i < N; i++) {
      const neighbour = i < N - 1 ? coupling[i][i + 1].toExponential(3) : '—';
      rows.push(`
        <tr>
          <td><span class="swatch" style="background:${ACCENTS[i % ACCENTS.length]}"></span>${i + 1}</td>
          <td>${masses[i].toFixed(3)}</td>
          <td>${ground[i].toFixed(3)}</td>
          <td>${neighbour}</td>
          <td>${Math.sqrt(ground[i] / masses[i]).toFixed(3)}</td>
        </tr>`);
    }
    this.dom.analogTable.innerHTML = rows.join('');
  }

  renderMirrors() {
    const p = this.params;
    const G = geometryFactor(p.alpha);
    const eqTheta = this.analysis.equilibrium.theta;
    const kappa = p.N > 1 ? this.system.analyticKappa(0, 1, eqTheta) : 0;

    const entries = [
      ['Pendulums <em>N</em>', p.N],
      ['Length <em>L</em>', `${p.L.toFixed(3)} m`],
      ['Gravity <em>g</em>', `${p.g.toFixed(2)} m/s²`],
      ['Separation <em>d</em>', `${p.d.toFixed(3)} m`],
      ['Orientation <em>α</em>', `${p.alpha.toFixed(2)}°`],
      ['<em>G</em>(α) = 1 − 3cos²α', G.toFixed(4)],
      ['Damping <em>b</em>', `${p.damping.toFixed(3)} s⁻¹`],
      ['κ (adjacent, at rest)', `${kappa.toExponential(3)} N·m/rad`],
      ['κ / m₁gL', (kappa / (p.m[0] * p.g * p.L)).toFixed(4)],
      ['Resting gap u*', `${(p.d + p.L * (Math.sin(eqTheta[1] || 0) - Math.sin(eqTheta[0]))).toFixed(4)} m`]
    ];
    const html = entries.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.dom.analogMirror.innerHTML = html;
    if (this.dom.theoryMirror) this.dom.theoryMirror.innerHTML = html;

    this.dom.equilibriumReadout.innerHTML = eqTheta
      .map((t, i) => `<span class="chip" style="--accent:${ACCENTS[i % ACCENTS.length]}">θ*<sub>${i + 1}</sub> = ${((t * 180) / Math.PI).toFixed(2)}°</span>`)
      .join('');

    this.dom.geometryReadout.innerHTML =
      `<strong>G(α) = ${G.toFixed(4)}</strong> — ` +
      (Math.abs(G) < 0.02
        ? 'the magic angle: point-dipole coupling vanishes.'
        : G < 0
          ? 'negative: the magnets attract along the row, the coupling springs are inverted, and the anti-phase mode is the soft one.'
          : 'positive: the magnets repel, the coupling acts like ordinary springs, and the in-phase mode is the soft one.');
  }

  renderMatrices() {
    const N = this.params.N;
    const { massDiag, K } = this.analysis;
    const M = zeros2(N);
    for (let i = 0; i < N; i++) M[i][i] = massDiag[i];

    const fmt = (v) => (v !== 0 && Math.abs(v) < 1e-4 ? v.toExponential(2) : v.toFixed(4));
    const table = (matrix) =>
      `<table class="matrix-table">${matrix
        .map((row) => `<tr>${row.map((v) => `<td>${fmt(v)}</td>`).join('')}</tr>`)
        .join('')}</table>`;

    this.dom.matrixM.innerHTML = table(M);
    this.dom.matrixK.innerHTML = table(K);
  }

  renderModeTable() {
    const { modes, analytic } = this.analysis;

    this.dom.modeTable.innerHTML = modes
      .map((mode, k) => {
        const components = mode.vecDisplay
          .map((v, i) => `<span class="component" style="--accent:${ACCENTS[i % ACCENTS.length]}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}</span>`)
          .join('');

        const numeric = mode.stable ? mode.omega.toFixed(4) : `unstable (${mode.growth.toFixed(2)} s⁻¹)`;

        let analyticCell = '<span class="dim">n/a</span>';
        let deltaCell = '<span class="dim">—</span>';
        if (analytic.applicable && analytic.frequencies[k]) {
          const a = analytic.frequencies[k];
          if (a.stable) {
            analyticCell = a.omega.toFixed(4);
            if (mode.stable) {
              const delta = ((mode.omega - a.omega) / a.omega) * 100;
              deltaCell = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`;
            }
          } else {
            analyticCell = 'unstable';
          }
        }

        return `
          <tr class="${this.modeIndex === k ? 'is-active' : ''}">
            <td>${k + 1}</td>
            <td>${numeric}</td>
            <td class="analytic">${analyticCell}</td>
            <td class="delta">${deltaCell}</td>
            <td>${mode.stable ? mode.period.toFixed(3) : '—'}</td>
            <td class="components">${components}</td>
            <td class="character">${mode.description}</td>
            <td><button class="btn btn-small" type="button" data-play-mode="${k}" ${mode.stable ? '' : 'disabled'}>Play</button></td>
          </tr>`;
      })
      .join('');

    this.dom.modeTable.querySelectorAll('[data-play-mode]').forEach((button) => {
      button.addEventListener('click', () => this.startMode(Number(button.dataset.playMode)));
    });
  }

  /** Begin pure-mode playback: seat the nonlinear display and the linear run on the mode's initial state. */
  startMode(index) {
    const mode = this.analysis.modes[index];
    if (!mode || !mode.stable) return;
    this.modeIndex = index;
    this.modeTime = 0;
    const eq = this.analysis.equilibrium.theta;
    for (let i = 0; i < this.params.N; i++) {
      this.system.theta[i] = eq[i] + this.modeAmplitude * mode.vecDisplay[i];
      this.system.omega[i] = 0;
      this.linear.eta[i] = this.modeAmplitude * mode.vecDisplay[i];
      this.linear.etaDot[i] = 0;
    }
    this.rebaseEnergy();
    this.setPlaying(true);
    this.updateModeStatus();
    this.renderModeTable();
  }

  updateModeStatus() {
    if (!this.dom.modeStatus) return;
    if (this.modeIndex === null) {
      this.dom.modeStatus.textContent = 'Free motion — all modes superposed';
      return;
    }
    const mode = this.analysis.modes[this.modeIndex];
    this.dom.modeStatus.textContent =
      `Pure mode ${this.modeIndex + 1} at ω = ${mode.omega.toFixed(4)} rad/s: the analytic solution of the ` +
      'linearized system, not of the full nonlinear cradle except at small amplitude.';
  }

  renderCompareNote() {
    if (!this.dom.compareNote) return;
    this.dom.compareNote.innerHTML =
      this.viewMode === 'mapped'
        ? '<strong>Coordinate map of the nonlinear state — not an independent simulation.</strong> ' +
          'The right panel shows x<sub>i</sub> = L(θ<sub>i</sub> − θ*<sub>i</sub>) of the left panel. ' +
          'The independent run below still integrates in the background.'
        : '<strong>Independent linear model.</strong> The right panel integrates ' +
          'M η̈ + K η = 0 (with the same damping) from the reset state, without reading the nonlinear cradle again.';
  }

  renderDecomposition() {
    const contributions = this.analyzer.decompose(this.analysis, this.system.theta, this.system.omega);
    this.dom.decomposition.innerHTML = contributions
      .map((c, k) => `
        <div class="decomp-row">
          <span class="decomp-label">Mode ${k + 1}</span>
          <span class="decomp-bar"><span style="width:${Math.max(c.share * 100, 0.4)}%"></span></span>
          <span class="decomp-value">${(c.share * 100).toFixed(1)}%</span>
        </div>`)
      .join('');
  }

  /** Pure-mode playback: analytic damped solution of the linearized system about the resting state. */
  driveMode(dt) {
    const mode = this.analysis.modes[this.modeIndex];
    if (!mode || !mode.stable) return;
    this.modeTime += dt;
    const { position, velocity } = modeEnvelope(mode.lambda, this.params.damping, this.modeTime);
    const eq = this.analysis.equilibrium.theta;
    for (let i = 0; i < this.params.N; i++) {
      this.system.theta[i] = eq[i] + this.modeAmplitude * mode.vecDisplay[i] * position;
      this.system.omega[i] = this.modeAmplitude * mode.vecDisplay[i] * velocity;
    }
    this.system.time += dt;
  }

  /** Slow readouts, refreshed a few times per second. */
  updateReadouts() {
    const { dom, params, analysis, system } = this;
    const G = geometryFactor(params.alpha);

    dom.clock.textContent = `t = ${system.time.toFixed(2)} s`;

    // Energy
    const E = system.excitationEnergy(analysis.equilibrium.theta);
    dom.energy.textContent = `Mechanical energy: ${E.toFixed(5)} J`;
    const pure = this.modeIndex !== null;
    const measurable = this.energyBase > 1e-9;
    const change = measurable ? ((E - this.energyBase) / this.energyBase) * 100 : NaN;
    const changeText = Number.isFinite(change)
      ? `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(2)} %`
      : '—';
    const note = params.damping > 0
      ? 'Expected to decrease: viscous damping is active.'
      : 'Numerical diagnostic: monitor drift; RK4 is not symplectic.';
    dom.energyDetail.textContent =
      `Energy above the resting state; change since reset: ${changeText}. ${pure ? 'Pure-mode playback is analytic, so this is not an integration diagnostic.' : note}`;

    if (params.damping === 0 && !system.contactHit && !pure && this.playing && measurable) {
      this.energyMaxDrift = Math.max(this.energyMaxDrift, Math.abs(change));
    }
    if (dom.energyCheck) {
      dom.energyCheck.textContent =
        params.damping === 0 && !system.contactHit && !pure
          ? `Maximum sampled drift since reset: ${this.energyMaxDrift.toFixed(4)} % (undamped, no close-approach warning).`
          : 'Applies only to undamped runs with no close-approach warning and no pure-mode playback.';
    }

    // Headline readouts
    dom.readoutG.textContent = (Math.abs(G) < 5e-4 ? 0 : G).toFixed(3);
    dom.readoutGNote.textContent =
      Math.abs(G) < 0.02 ? 'decoupled (point dipole)' : G < 0 ? 'attractive' : 'repulsive';

    const stable = analysis.modes.find((m) => m.stable);
    const free = Math.sqrt(params.g / params.L);
    if (stable) {
      dom.readoutFreq.textContent = `${stable.omega.toFixed(3)} rad/s`;
      const unstableCount = analysis.modes.filter((m) => !m.stable).length;
      dom.readoutFreqNote.textContent =
        `uncoupled √(g/L) = ${free.toFixed(3)}` + (unstableCount ? ` · ${unstableCount} unstable` : '');
    } else {
      dom.readoutFreq.textContent = 'none stable';
      dom.readoutFreqNote.textContent = `uncoupled √(g/L) = ${free.toFixed(3)} rad/s`;
    }

    const error = this.linearError();
    const errText = error ? `${(error.rms * 1000).toFixed(2)} mm` : '—';
    dom.readoutError.textContent = errText;
    dom.readoutErrorNote.textContent = error && error.scale > 1e-4
      ? `RMS, ${(error.relative * 100).toFixed(1)}% of displacement`
      : 'RMS, independent run';
    dom.compareReadout.textContent = error
      ? `RMS difference ${errText} · elapsed ${system.time.toFixed(2)} s`
      : 'RMS difference —';

    this.updateWarnings();
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.05);

    if (this.playing) {
      if (this.modeIndex !== null) this.driveMode(dt);
      else this.system.advance(dt);
      this.linear.advance(dt, this.analysis, this.params.damping);
    }

    this.render();

    this.uiClock += dt;
    if (this.uiClock > 0.12) {
      this.uiClock = 0;
      this.updateReadouts();
      this.renderDecomposition();
    }
  }

  /** Spring-coordinate source for the right-hand views, per the view mode. */
  springSource() {
    if (this.viewMode === 'independent') return { x: this.linear.coordinates(this.params.L) };
    return this.springs;
  }

  render() {
    this.springs.sampleFrom(this.system, this.analysis);
    const source = this.springSource();

    const cradle = syncCanvas(this.canvases.cradle);
    fillBackground(cradle.ctx, cradle.w, cradle.h);
    drawCradle(cradle.ctx, this.system, this.analysis, { x: 0, y: 0, w: cradle.w, h: cradle.h });

    if (this.dom.springDetails.open) {
      const spring = syncCanvas(this.canvases.spring);
      fillBackground(spring.ctx, spring.w, spring.h);
      drawSprings(spring.ctx, source, this.system, this.derived, { x: 0, y: 0, w: spring.w, h: spring.h });
    }

    const compare = syncCanvas(this.canvases.compare);
    fillBackground(compare.ctx, compare.w, compare.h);
    const half = compare.w / 2;
    const top = 26;
    drawCradle(compare.ctx, this.system, this.analysis,
      { x: 0, y: top, w: half, h: compare.h - top }, { compact: true });
    drawSprings(compare.ctx, source, this.system, this.derived,
      { x: half, y: top, w: half, h: compare.h - top }, { compact: true });

    const c = compare.ctx;
    c.save();
    c.strokeStyle = hexToRgba(PALETTE.ink, 0.14);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(half, 8);
    c.lineTo(half, compare.h - 8);
    c.stroke();
    c.restore();

    const narrow = compare.w < 480;
    captionText(c, narrow ? 'NONLINEAR' : 'NONLINEAR CRADLE', 16, 18, hexToRgba(PALETTE.gold, 0.85), 10);
    const right = this.viewMode === 'independent'
      ? (narrow ? 'INDEPENDENT LINEAR' : 'INDEPENDENT LINEAR MODEL')
      : (narrow ? 'MAPPED COORDINATES' : 'MAPPED NONLINEAR COORDINATES');
    captionText(c, right, half + 16, 18, hexToRgba(PALETTE.blue, 0.85), 10);
  }
}

// -----------------------------------------------------------------------------
// Diagnostics
//
// Console-callable regression checks: cradleDiagnostics(). Each result reports
// the measured value against a stated tolerance; nothing here is shown as
// "verified" in the UI.
// -----------------------------------------------------------------------------

function runDiagnostics() {
  const results = [];
  const check = (name, value, tolerance) => {
    results.push({ name, value, tolerance, pass: Number.isFinite(value) && value <= tolerance });
  };
  const make = (over = {}) => new MagneticCradle({ ...defaultParams(), ...over });
  const maxAbs = (arr) => arr.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  // 1. Zero dipole moment reduces to independent pendulums.
  {
    const sys = make({ mu: [0, 0, 0, 0, 0] });
    const theta = [0.3, -0.2, 0.1];
    const { L, m, g } = sys.params;
    const torque = sys.staticTorques(theta);
    const err = theta.map((t, i) => torque[i] + m[i] * g * L * Math.sin(t));
    check('zero moment: torque = −m g L sin θ (abs error, N·m)', maxAbs(err), 1e-12);
  }

  // 2. Magic angle: off-diagonal stiffness relative to the α = 90° value.
  {
    const off = (alpha) => Math.abs(make({ alpha }).stiffness([0, 0, 0], { raw: true })[0][1]);
    check('magic angle: |K01(54.74°)| / |K01(90°)|', off(MAGIC_ANGLE_DEG) / off(90), 5e-3);
  }

  // 3. Raw finite-difference stiffness matrix is symmetric (oblique α, at rest).
  {
    const sys = make({ alpha: 60 });
    const eq = sys.findEquilibrium().theta;
    const K = sys.stiffness(eq, { raw: true });
    let asym = 0;
    let scale = 0;
    for (let i = 0; i < K.length; i++) {
      for (let j = 0; j < K.length; j++) {
        asym = Math.max(asym, Math.abs(K[i][j] - K[j][i]));
        scale = Math.max(scale, Math.abs(K[i][j]));
      }
    }
    check('stiffness symmetry: max |Kij − Kji| / max |K|', asym / scale, 1e-6);
  }

  // 4. Modes are mass-orthonormal.
  {
    const sys = make({ alpha: 30, mu: [5, 4, 6, 5, 5], m: [0.18, 0.2, 0.15, 0.18, 0.18] });
    const analysis = new NormalModeAnalyzer().analyze(sys);
    let worst = 0;
    analysis.modes.forEach((a, k) => {
      analysis.modes.forEach((b, l) => {
        let dot = 0;
        for (let i = 0; i < analysis.massDiag.length; i++) dot += a.vecM[i] * analysis.massDiag[i] * b.vecM[i];
        worst = Math.max(worst, Math.abs(dot - (k === l ? 1 : 0)));
      });
    });
    check('mode M-orthonormality: max |vkᵀ M vl − δkl|', worst, 1e-9);
  }

  // 5. Torques are the gradient of the regularized energy.
  {
    const sys = make({ alpha: 35 });
    const theta = [0.12, -0.05, 0.2];
    const torque = sys.magneticTorques(theta);
    const h = 1e-6;
    const err = theta.map((_, i) => {
      const plus = theta.slice();
      const minus = theta.slice();
      plus[i] += h;
      minus[i] -= h;
      const numeric = -(sys.magneticEnergy(plus) - sys.magneticEnergy(minus)) / (2 * h);
      return torque[i] - numeric;
    });
    check('torque vs −dE/dθ (central difference): max error / max |τ|', maxAbs(err) / maxAbs(torque), 1e-6);
  }

  // 6. Independent linear run against the analytic mode solution.
  [0, 0.1].forEach((damping) => {
    const sys = make({ damping, theta0: 0 });
    const analysis = new NormalModeAnalyzer().analyze(sys);
    const mode = analysis.modes.find((m) => m.stable);
    const amp = 1e-3;
    const linear = new LinearModel();
    linear.eta = mode.vecDisplay.map((v) => amp * v);
    linear.etaDot = linear.eta.map(() => 0);
    let worst = 0;
    const dt = 1 / 60;
    const steps = Math.ceil((3 * mode.period) / dt);
    for (let s = 1; s <= steps; s++) {
      linear.advance(dt, analysis, damping);
      const { position } = modeEnvelope(mode.lambda, damping, s * dt);
      linear.eta.forEach((e, i) => {
        worst = Math.max(worst, Math.abs(e - amp * mode.vecDisplay[i] * position));
      });
    }
    check(`linear model vs analytic mode, b = ${damping}: max error / amplitude`, worst / amp, 1e-6);
  });

  // 7. Undamped small-amplitude energy drift over 20 s.
  {
    const sys = make({ damping: 0, theta0: 0.05 });
    const analysis = new NormalModeAnalyzer().analyze(sys);
    sys.reset(analysis.equilibrium.theta);
    const e0 = sys.excitationEnergy(analysis.equilibrium.theta);
    let drift = 0;
    for (let s = 0; s < 1200; s++) {
      sys.advance(1 / 60);
      drift = Math.max(drift, Math.abs(sys.excitationEnergy(analysis.equilibrium.theta) - e0) / e0);
    }
    check('undamped θ₀ = 0.05 rad, 20 s: max relative energy drift', drift, 1e-6);
  }

  // 8. Small-amplitude agreement between the nonlinear and linear runs over 5 s.
  {
    const sys = make({ damping: 0.02, theta0: 0.01 });
    const analysis = new NormalModeAnalyzer().analyze(sys);
    sys.reset(analysis.equilibrium.theta);
    const linear = new LinearModel();
    linear.reset(sys, analysis);
    let worst = 0;
    for (let s = 0; s < 300; s++) {
      sys.advance(1 / 60);
      linear.advance(1 / 60, analysis, sys.params.damping);
      const mapped = sys.theta.map((t, i) => t - analysis.equilibrium.theta[i]);
      worst = Math.max(worst, rmsDifference(mapped, linear.eta) / 0.01);
    }
    check('θ₀ = 0.01 rad, 5 s: RMS(nonlinear − linear) / θ₀', worst, 1e-2);
  }

  if (typeof console !== 'undefined' && console.table) console.table(results);
  return results;
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------

function renderMath() {
  // KaTeX loads from a CDN; without it the raw TeX stays readable.
  if (typeof window.renderMathInElement !== 'function') {
    document.body.classList.add('katex-missing');
    return;
  }
  window.renderMathInElement(document.body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false }
    ],
    throwOnError: false
  });
}

window.cradleDiagnostics = runDiagnostics;

document.addEventListener('DOMContentLoaded', () => {
  renderMath();
  window.cradleApp = new App();
});

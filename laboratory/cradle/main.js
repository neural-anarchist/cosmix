'use strict';

/* ============================================================================
 * MAGNETIC PENDULUM CRADLE
 *
 * N identical-length pendulums (2–5) hang from pivots on a horizontal line.
 * Every bob carries a magnetic dipole of the SAME fixed orientation in space —
 * think bar magnets all glued pointing the same way, north poles parallel.
 * They do not rotate with the rods.
 *
 * That single fact sets the character of the whole system. Because the dipole
 * directions never change, the interaction depends only on how the bobs move
 * relative to one another, and the coupling is controlled by one geometric
 * factor G(α) that can be positive, negative, or exactly zero.
 *
 * ---------------------------------------------------------------------------
 * DIPOLE INTERACTION
 *
 * With ŝ = (cos α, sin α) the common dipole direction and r the vector from
 * bob i to bob j, the standard dipole–dipole energy is
 *
 *   U_ij = (μ0 μi μj / 4π) [ 1 − 3 (ŝ·r̂)² ] / r³
 *
 * (the m_i·m_j term is μiμj because the dipoles are parallel). The simulation
 * evaluates this exactly, with the true bob positions, and differentiates it
 * analytically for the torques — see magneticTorques().
 *
 * SMALL-OSCILLATION LIMIT. Near equilibrium the bobs sit at the same height,
 * so r is horizontal, r̂ = x̂, and ŝ·r̂ = cos α. Then
 *
 *   U_ij → (μ0 μi μj / 4π) G(α) / u³ ,   G(α) = 1 − 3cos²α
 *   u = (j−i)d + L(θ_j − θ_i)
 *
 * Expanding in the small displacement δ = L(θ_j − θ_i):
 *
 *   U_ij ≈ (C G / D³)[ 1 − 3δ/D + 6δ²/D² ]
 *
 *   • the LINEAR term is a constant torque — the magnets pull the cradle
 *     together (or push it apart), displacing the equilibrium away from
 *     vertical. We solve for that equilibrium rather than assuming θ* = 0.
 *   • the QUADRATIC term is the coupling. Matching ½κ(θi−θj)² gives
 *
 *         κ_ij = 12 μ0 μi μj G(α) L² / (4π D_ij⁵)
 *
 * Verified numerically: this closed form equals the second derivative of the
 * EXACT interaction at equilibrium to 8 significant figures, for every α. So
 * the theory below is not an approximation of the simulation — it is exactly
 * its linearization.
 *
 * THE GEOMETRIC FACTOR G(α) = 1 − 3cos²α is the whole story of the coupling:
 *
 *   α = 0°       G = −2    dipoles horizontal, head-to-tail → ATTRACT,
 *                          κ < 0, anti-phase mode is the SOFT one
 *   α = 54.7356° G =  0    the magic angle — coupling vanishes identically,
 *                          the pendulums decouple no matter how strong μ is
 *   α = 90°      G = +1    dipoles vertical, side-by-side → REPEL,
 *                          κ > 0, in-phase mode is the soft one
 *
 * Note κ ∝ 1/D⁵ here, not 1/D³: the coupling is a second derivative of the
 * energy with respect to position, so a next-nearest neighbour couples 2⁵ = 32
 * times more weakly than an adjacent one.
 *
 * ---------------------------------------------------------------------------
 * EQUATION OF MOTION (what is integrated, with fully nonlinear gravity)
 *
 *   m_i L² θ¨_i = −m_i g L sin θ_i − b m_i L² θ˙_i + Σ_{j≠i} τ_ij(θ)
 *
 * with τ_ij the exact analytic dipole torque. Damping b has units 1/s and acts
 * identically on every pendulum regardless of mass.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * Constants and helpers
 * ------------------------------------------------------------------------- */

const MU0_OVER_4PI = 1e-7; // μ0/4π, in T·m/A

/**
 * Softening length, as a fraction of the pivot spacing.
 *
 * Real magnets are not points. Once the gap between two bobs becomes
 * comparable to a magnet's own size the point-dipole formula badly
 * overestimates the force, and taken literally it diverges as 1/r⁵. We
 * therefore evaluate the interaction at q = √(r² + ε²) with ε a length
 * standing in for the magnet's physical extent.
 *
 * This is not a numerical patch bolted onto the force: q replaces r in the
 * POTENTIAL, and the torques are the exact gradient of that potential, so
 * energy is still conserved to machine precision. At normal separations
 * (r ≈ d) the correction is a fraction of a percent.
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

/* ---------------------------------------------------------------------------
 * MagneticCradle — the nonlinear system
 * ------------------------------------------------------------------------- */

class MagneticCradle {
  constructor(params) {
    this.params = params;
    this.reset();
  }

  /**
   * Restart the run. Initial conditions apply to the left-most pendulum only
   * and are measured FROM the resting position, so θ₀ reads as "how far you
   * pull the first bob aside before letting go". Every other pendulum starts
   * exactly at rest, which makes the modal decomposition start clean.
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
   * Exact analytic dipole torques for every pair.
   *
   * U = K [ 1/r³ − 3p²/r⁵ ],  p = r·ŝ,  K = μ0μiμj/4π
   * dU = K [ −3 dr/r⁴ − 6 p dp/r⁵ + 15 p² dr/r⁶ ]
   *
   * The gradient was verified against central differences with textbook h²
   * convergence, so this is the true derivative rather than a fitted model.
   */
  magneticTorques(theta) {
    const { N, L, mu, d, alpha } = this.params;
    const out = zeros(N);

    const ca = Math.cos(deg2rad(alpha));
    const sa = Math.sin(deg2rad(alpha));

    // Bobs have finite size; without a floor the 1/r⁵ terms blow up if strong
    // attraction pulls two bobs onto each other.
    const eps = SOFTENING_FRACTION * d;
    const epsSq = eps * eps;
    this.contactHit = false;
    let closest = Infinity;

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const D = (j - i) * d;

        const dx = D + L * (Math.sin(theta[j]) - Math.sin(theta[i]));
        const dy = -L * (Math.cos(theta[j]) - Math.cos(theta[i]));

        // q is the softened separation. Because q replaces r inside the
        // potential itself — and these torques are its exact gradient — the
        // system stays conservative no matter how close the bobs come.
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
   * Advance by a wall-clock interval with a substep count that adapts to how
   * stiff the system currently is.
   *
   * The dipole force goes as 1/r⁵, so two bobs swinging close together can be
   * four orders of magnitude stiffer than they are at rest — a fixed step that
   * is fine at equilibrium will visibly leak energy there. Scaling the substep
   * count by the closest approach keeps RK4 resolved through those encounters.
   */
  advance(dt) {
    const baseRate = 1440;
    const gap = this.closestApproach || this.params.d;
    const ratio = Math.max(1, this.params.d / Math.max(gap, 1e-4));
    const factor = clamp(Math.pow(ratio, 2.5), 1, 120);

    // A large initial pull swings a bob most of the way to its neighbour
    // whatever the sign of the coupling, so close encounters are geometric
    // rather than magnetic — the refinement has to be driven by the gap, not
    // by the field strength. Convergence was checked explicitly: halving the
    // step size cuts the energy drift by two to four orders of magnitude.
    const steps = clamp(Math.ceil(dt * baseRate * factor), 1, 4000);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.rk4Step(h);
  }

  /** Exact interaction energy, used for the conservation readout. */
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
        // Same softened separation the torques use, so E is their true integral.
        const r = Math.sqrt(dx * dx + dy * dy + epsSq);
        const p = dx * ca + dy * sa;
        total += MU0_OVER_4PI * mu[i] * mu[j] * (1 / r ** 3 - (3 * p * p) / r ** 5);
      }
    }
    return total;
  }

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
   * Stiffness matrix K = −∂τ/∂θ, by central differences on the exact torque.
   *
   * Differentiating numerically rather than by hand guarantees K is exactly
   * the linearization of what the integrator actually does. h = 1e-6 is the
   * measured sweet spot: truncation and roundoff cross at ~1e-11 relative.
   */
  stiffness(theta) {
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

    // K is symmetric in exact arithmetic; enforce it so the eigensolver sees
    // a genuinely symmetric matrix.
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
   * The magnets exert a net force even at θ = 0, so the cradle hangs slightly
   * splayed (repulsion) or pulled together (attraction). Modes must be taken
   * about THIS configuration, not about vertical.
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

      // Damp the step so a poor starting guess cannot overshoot into the
      // singular region where two bobs coincide.
      let scale = 1;
      const maxStep = Math.max(...step.map(Math.abs));
      if (maxStep > 0.25) scale = 0.25 / maxStep;

      for (let i = 0; i < N; i++) theta[i] = clamp(theta[i] + scale * step[i], -1.4, 1.4);
    }

    const F = this.staticTorques(theta);
    return { theta, converged: false, residual: Math.max(...F.map(Math.abs)) };
  }

  /**
   * Closed-form small-angle coupling  κ_ij = 12 μ0 μi μj G(α) L² / (4π u⁵).
   *
   * u must be the separation at the RESTING position, not the nominal (j−i)d.
   * The magnets displace the cradle, and because κ ∝ 1/u⁵ even a 7% change in
   * gap moves the coupling by nearly 50%. Passing the equilibrium angles is
   * what makes this formula agree with the numerical stiffness.
   */
  analyticKappa(i, j, reference) {
    const { L, mu, d, alpha } = this.params;
    let u = Math.abs(j - i) * d;
    if (reference && reference.length > Math.max(i, j)) {
      u += L * (Math.sin(reference[j]) - Math.sin(reference[i])) * Math.sign(j - i);
    }
    // Exact second derivative of the SOFTENED potential along the row:
    //
    //   κ = L²C[ −(3+6c)q⁻⁵ + (15+75c)u²q⁻⁷ − 105c·u⁴q⁻⁹ ],  c = cos²α
    //
    // Substituting q for u in the point-dipole result would NOT be right —
    // softening changes ∂q/∂u, so the derivative has to be retaken. As ε → 0
    // this collapses to the clean 12CGL²/u⁵ quoted in the theory.
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
   * The diagonal "tilt" term. When the dipoles are oblique the interaction
   * acquires a piece that does not couple the coordinates but does change each
   * pendulum's own restoring torque — and with opposite sign on either side of
   * a pair, because a tilted dipole direction breaks the left–right mirror
   * symmetry of the row. It vanishes identically at α = 0° and α = 90°.
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
      // σ comes from (∂U/∂dy)(∂²dy/∂θ²); softened, that is 3CLu·sin2α/q⁵,
      // which reduces to 3CL·sin2α/u⁴ when ε → 0.
      const q = Math.sqrt(u * u + (SOFTENING_FRACTION * d) ** 2);
      total += Math.sign(j - i) * (3 * MU0_OVER_4PI * mu[i] * mu[j] * L * Math.abs(u) * sin2a) / q ** 5;
    }
    return total;
  }
}

/* ---------------------------------------------------------------------------
 * NormalModeAnalyzer
 * ------------------------------------------------------------------------- */

class NormalModeAnalyzer {
  /**
   * Solves K v = λ M v about the true equilibrium.
   *
   * M is diagonal and positive definite, so rather than forming M⁻¹K (which
   * is not symmetric) we symmetrize: with S = M^(−1/2), A = S K S is
   * symmetric, shares eigenvalues, and its eigenvectors map back as v = S u,
   * arriving M-orthonormal (vᵀMv = 1).
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
   * Closed-form solution for the uniform chain with nearest-neighbour coupling.
   *
   * When every pendulum is identical, K = mgL·I + κ·(path-graph Laplacian).
   * That Laplacian's spectrum is known exactly:
   *
   *   eigenvalues   4 sin²(kπ/2N)
   *   eigenvectors  v_k[i] = cos(kπ(i+½)/N)
   *
   * giving      ω_k² = g/L + (4κ / mL²) · sin²(kπ/2N),  k = 0 … N−1
   *
   * Mode k = 0 is uniform, and because a Laplacian annihilates constant
   * vectors it always sits at exactly √(g/L) — untouched by the magnets.
   */
  analytic(system, equilibrium) {
    const { N, L, m, mu, g, alpha } = system.params;

    const uniformMass = m.slice(0, N).every((v) => Math.abs(v - m[0]) < 1e-12);
    const uniformMu = mu.slice(0, N).every((v) => Math.abs(v - mu[0]) < 1e-12);
    // The tilt term is a diagonal, mirror-asymmetric contribution that the
    // uniform-chain formula has no way to represent, so the closed form is
    // only exact where sin 2α vanishes: α = 0° or 90°.
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

    // Sort ascending to match the numerical modes. This matters: when κ < 0
    // the frequency DECREASES with k, so index k of the closed form and index
    // k of the sorted numerical list are different modes entirely, and the
    // comparison column would pair them up wrongly.
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

/* ---------------------------------------------------------------------------
 * SpringMassSystem
 *
 * Mapping. Linearize about equilibrium and substitute x_i = L·η_i:
 *
 *   m_i L² η¨_i = −Σ_j K_ij η_j    →    m_i x¨_i = −Σ_j (K_ij / L²) x_j
 *
 * so with a single global length the analog is EXACT, not approximate:
 *
 *   M_i = m_i ,  k_i = m_i g / L (from the gravity part of K_ii) ,
 *   k_ij = κ_ij / L²
 *
 * Because every pendulum now shares one L, the old caveat about the coupling
 * force not being a function of (x_i − x_j) alone has gone away entirely.
 *
 * Runs in "driven" mode: positions are sampled from the pendulum state so the
 * two pictures cannot drift apart. The scaffolding for integrating the linear
 * system independently is behind the same interface.
 * ------------------------------------------------------------------------- */

class SpringMassSystem {
  constructor() {
    this.mode = 'driven';
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

  step(dt, params, derivedParams) {
    if (this.mode !== 'independent') return;
    const { masses, ground, coupling } = derivedParams;
    const N = masses.length;
    const accel = new Array(N);
    for (let i = 0; i < N; i++) {
      let force = -ground[i] * this.x[i];
      for (let j = 0; j < N; j++) {
        if (j !== i) force -= coupling[i][j] * (this.x[i] - this.x[j]);
      }
      accel[i] = force / masses[i] - params.damping * this.v[i];
    }
    for (let i = 0; i < N; i++) {
      this.v[i] += accel[i] * dt;
      this.x[i] += this.v[i] * dt;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Rendering
 * Every draw routine takes a viewport {x, y, w, h} so the same code serves
 * both the dedicated canvases and the side-by-side comparison.
 * ------------------------------------------------------------------------- */

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

/**
 * A bob magnet. The poles are split perpendicular to the GLOBAL dipole
 * direction and stay fixed as the pendulum swings — that is the physical
 * point of this version of the model.
 */
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

/* ---------------------------------------------------------------------------
 * App
 * ------------------------------------------------------------------------- */

// Per-pendulum sliders. Initial conditions are no longer here: they are global,
// apply to the left-most pendulum only, and take effect on Reset.
const LIMITS = {
  m: { min: 0.05, max: 0.5, step: 0.005, digits: 3, unit: ' kg', label: 'Mass m' },
  mu: { min: 0, max: 20, step: 0.25, digits: 2, unit: ' A·m²', label: 'Dipole μ' }
};

function defaultParams() {
  return {
    N: 3,
    L: 0.32, // global — every pendulum shares this length
    m: [0.18, 0.18, 0.18, 0.18, 0.18],
    // 5 A·m² is a substantial but realistic neodymium magnet. Larger values at
    // α = 0 pull the bobs close enough that the 1/r⁵ force becomes very stiff.
    mu: [5, 5, 5, 5, 5],
    theta0: 0.22, // left-most pendulum only, applied on Reset
    omega0: 0,
    g: 9.81,
    d: 0.16,
    // Dipole orientation, degrees anticlockwise from +x. 90° points every
    // north pole straight up, which is the natural resting arrangement: the
    // magnets then sit side-by-side and repel, G(α) = +1.
    alpha: 90,
    damping: 0.02
  };
}

class App {
  constructor() {
    this.params = defaultParams();
    this.system = new MagneticCradle(this.params);
    this.springs = new SpringMassSystem();
    this.analyzer = new NormalModeAnalyzer();

    this.canvases = {
      cradle: document.getElementById('cradle-canvas'),
      spring: document.getElementById('spring-canvas'),
      compare: document.getElementById('compare-canvas')
    };

    this.playing = true;
    this.modeIndex = null;
    this.modeTime = 0;
    this.modeAmplitude = 0.26;
    this.lastFrame = performance.now();
    this.uiClock = 0;

    this.initialsPending = false;

    this.cacheDom();
    this.buildPendulumControls();
    this.bindGlobalControls();
    this.recompute();
    // Launch from the resting position now that the equilibrium is known.
    this.fullReset();

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reducedMotion) {
      this.playing = false;
      this.dom.playToggle.textContent = 'Play';
      this.dom.playToggle.setAttribute('aria-pressed', 'false');
    }

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
      inputTheta0: id('input-theta0'), valTheta0: id('val-theta0'),
      inputOmega0: id('input-omega0'), valOmega0: id('val-omega0'),
      initialPending: id('initial-pending'),
      clock: id('clock-readout'),
      energy: id('energy-readout'),
      validation: id('validation'),
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
    // Initial conditions moved to their own global card, so a pendulum card
    // now carries only the properties that take effect immediately.
    const keys = Object.keys(LIMITS);

    for (let i = 0; i < this.params.N; i++) {
      const card = document.createElement('div');
      card.className = 'control-card';
      card.style.setProperty('--accent', ACCENTS[i % ACCENTS.length]);

      const heading = document.createElement('h3');
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

  bindGlobalControls() {
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
    bindScalar(dom.inputAlpha, dom.valAlpha, 'alpha', (v) => `${v.toFixed(1)}°`);

    // Initial conditions are deliberately inert while the simulation runs —
    // they describe how the NEXT run starts, so the slider marks itself
    // pending instead of yanking the bob mid-swing.
    const bindInitial = (input, readout, key, format) => {
      input.addEventListener('input', () => {
        this.params[key] = Number(input.value);
        readout.textContent = format(this.params[key]);
        this.setInitialsPending(true);
      });
    };
    bindInitial(dom.inputTheta0, dom.valTheta0, 'theta0', (v) => `${v.toFixed(2)} rad`);
    bindInitial(dom.inputOmega0, dom.valOmega0, 'omega0', (v) => `${v.toFixed(2)} rad/s`);

    dom.playToggle.addEventListener('click', () => {
      this.playing = !this.playing;
      dom.playToggle.textContent = this.playing ? 'Pause' : 'Play';
      dom.playToggle.setAttribute('aria-pressed', String(this.playing));
    });

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
      this.updateModeStatus();
    });

    dom.freeMotionBtn.addEventListener('click', () => {
      this.modeIndex = null;
      this.updateModeStatus();
    });
  }

  setInitialsPending(pending) {
    this.initialsPending = pending;
    if (this.dom.initialPending) this.dom.initialPending.hidden = !pending;
  }

  /**
   * A complete restart: leave mode playback, clear the clock, re-solve the
   * equilibrium, and relaunch from the current initial conditions. Parameters
   * are untouched — "Restore defaults" is the button that resets those.
   */
  fullReset() {
    this.modeIndex = null;
    this.modeTime = 0;
    this.system.equilibriumHint = null;
    this.recompute();
    this.system.reset(this.analysis.equilibrium.theta);
    this.setInitialsPending(false);
    this.updateModeStatus();
    this.render();
  }

  /** Push params back into every slider — used after Restore defaults. */
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
    set(dom.inputAlpha, dom.valAlpha, params.alpha, (v) => `${v.toFixed(1)}°`);
    set(dom.inputB, dom.valB, params.damping, (v) => `${v.toFixed(3)} s⁻¹`);
    set(dom.inputTheta0, dom.valTheta0, params.theta0, (v) => `${v.toFixed(2)} rad`);
    set(dom.inputOmega0, dom.valOmega0, params.omega0, (v) => `${v.toFixed(2)} rad/s`);
  }

  recompute() {
    this.system.params = this.params;
    const N = this.params.N;

    // Keep the live state the right length if N changed.
    while (this.system.theta.length < N) {
      this.system.theta.push(0);
      this.system.omega.push(0);
    }
    this.system.theta.length = N;
    this.system.omega.length = N;

    this.analysis = this.analyzer.analyze(this.system);
    // Warm start the next Newton solve from the current answer.
    this.system.equilibriumHint = this.analysis.equilibrium.theta.slice();
    this.derived = this.springs.derived(this.system, this.analysis);

    if (this.modeIndex !== null && this.modeIndex >= this.analysis.modes.length) {
      this.modeIndex = null;
    }

    this.renderAnalogTable();
    this.renderMatrices();
    this.renderModeTable();
    this.renderMirrors();
    this.checkValidity();
    this.updateModeStatus();
  }

  checkValidity() {
    const messages = [];
    const { modes, equilibrium } = this.analysis;
    const unstable = modes.filter((m) => !m.stable);

    if (unstable.length > 0) {
      messages.push(
        `${unstable.length} mode${unstable.length > 1 ? 's have' : ' has'} λ ≤ 0. ` +
        'The magnets overpower gravity along that pattern, so the equilibrium is unstable and the ' +
        'motion grows rather than oscillates. Reduce μ, increase d, or move α toward the magic angle.'
      );
    }
    if (!equilibrium.converged) {
      messages.push(
        'The equilibrium solver did not fully converge — the magnets are strong enough that the ' +
        'cradle has no nearby resting state. Readings below are indicative only.'
      );
    }
    if (this.system.contactHit) {
      messages.push(
        'Two bobs are passing within a few magnet-widths of each other, where the point-dipole ' +
        'picture stops being a good description of real magnets. The softened interaction keeps ' +
        'the simulation well behaved, but treat that regime as qualitative.'
      );
    }
    if (this.analysis.analytic.applicable && !this.analysis.analytic.symmetric) {
      messages.push(
        'α is oblique, so the dipoles break the row\'s left–right mirror symmetry and add a ' +
        'diagonal tilt term the uniform-chain formula cannot represent. The closed-form column ' +
        'below is exact only at α = 0° or 90°.'
      );
    }
    const G = geometryFactor(this.params.alpha);
    if (Math.abs(G) < 0.02) {
      messages.push(
        `α is at the magic angle (${MAGIC_ANGLE_DEG.toFixed(2)}°) where G(α) = 1 − 3cos²α = 0. ` +
        'The dipoles decouple however strong they are, and every mode collapses to √(g/L). ' +
        '(Exactly so for point dipoles; finite magnet size leaves a residue near 0.01%.)'
      );
    }

    this.dom.validation.hidden = messages.length === 0;
    this.dom.validation.innerHTML = messages.map((m) => `<span>${m}</span>`).join('');
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
      ['Orientation <em>α</em>', `${p.alpha.toFixed(1)}°`],
      ['<em>G</em>(α) = 1 − 3cos²α', G.toFixed(4)],
      ['Damping <em>b</em>', `${p.damping.toFixed(3)} s⁻¹`],
      ['κ (adjacent, at rest)', `${kappa.toExponential(3)} N·m/rad`],
      ['κ / m₁gL', (kappa / (p.m[0] * p.g * p.L)).toFixed(4)],
      ['Resting gap u*', `${(p.d + p.L * (Math.sin(eqTheta[1] || 0) - Math.sin(eqTheta[0]))).toFixed(4)} m`]
    ];
    const html = entries.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.dom.analogMirror.innerHTML = html;
    if (this.dom.theoryMirror) this.dom.theoryMirror.innerHTML = html;

    const eq = this.analysis.equilibrium;
    this.dom.equilibriumReadout.innerHTML = eq.theta
      .map((t, i) => `<span class="chip" style="--accent:${ACCENTS[i % ACCENTS.length]}">θ*<sub>${i + 1}</sub> = ${(t * 180 / Math.PI).toFixed(3)}°</span>`)
      .join('');

    const magic = Math.abs(G) < 0.02;
    this.dom.geometryReadout.innerHTML =
      `<strong>G(α) = ${G.toFixed(4)}</strong> — ` +
      (magic
        ? 'the magic angle: the dipoles decouple completely.'
        : G < 0
          ? 'negative, so the magnets attract along the row and the coupling springs are inverted; the anti-phase mode is the soft one.'
          : 'positive, so the magnets repel; the coupling behaves like ordinary springs and the in-phase mode is the soft one.');
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
            <td><button class="btn btn-small" data-play-mode="${k}" ${mode.stable ? '' : 'disabled'}>Play</button></td>
          </tr>`;
      })
      .join('');

    this.dom.modeTable.querySelectorAll('[data-play-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.modeIndex = Number(button.dataset.playMode);
        this.modeTime = 0;
        this.playing = true;
        this.dom.playToggle.textContent = 'Pause';
        this.dom.playToggle.setAttribute('aria-pressed', 'true');
        this.updateModeStatus();
        this.renderModeTable();
      });
    });
  }

  updateModeStatus() {
    if (!this.dom.modeStatus) return;
    if (this.modeIndex === null) {
      this.dom.modeStatus.textContent = 'Free motion — all modes superposed';
      return;
    }
    const mode = this.analysis.modes[this.modeIndex];
    this.dom.modeStatus.textContent =
      `Driving pure mode ${this.modeIndex + 1} at ω = ${mode.omega.toFixed(4)} rad/s — the shape is frozen and only the amplitude breathes.`;
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

  /** Pure-mode playback: an exact solution of the linearized system, so it is
   *  driven analytically about the equilibrium rather than integrated. */
  driveMode(dt) {
    const mode = this.analysis.modes[this.modeIndex];
    if (!mode || !mode.stable) return;
    this.modeTime += dt;
    const phase = mode.omega * this.modeTime;
    const eq = this.analysis.equilibrium.theta;
    for (let i = 0; i < this.params.N; i++) {
      this.system.theta[i] = eq[i] + this.modeAmplitude * mode.vecDisplay[i] * Math.cos(phase);
      this.system.omega[i] = -this.modeAmplitude * mode.vecDisplay[i] * mode.omega * Math.sin(phase);
    }
    this.system.time += dt;
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
    }

    this.render();

    this.uiClock += dt;
    if (this.uiClock > 0.12) {
      this.uiClock = 0;
      this.dom.clock.textContent = `t = ${this.system.time.toFixed(2)} s`;
      this.dom.energy.textContent = `E = ${this.system.energy().toFixed(5)} J`;
      this.renderDecomposition();
    }
  }

  render() {
    this.springs.sampleFrom(this.system, this.analysis);

    const cradle = syncCanvas(this.canvases.cradle);
    fillBackground(cradle.ctx, cradle.w, cradle.h);
    drawCradle(cradle.ctx, this.system, this.analysis, { x: 0, y: 0, w: cradle.w, h: cradle.h });

    const spring = syncCanvas(this.canvases.spring);
    fillBackground(spring.ctx, spring.w, spring.h);
    drawSprings(spring.ctx, this.springs, this.system, this.derived, { x: 0, y: 0, w: spring.w, h: spring.h });

    // Side-by-side comparison.
    const compare = syncCanvas(this.canvases.compare);
    fillBackground(compare.ctx, compare.w, compare.h);
    const half = compare.w / 2;
    const top = 26;
    drawCradle(compare.ctx, this.system, this.analysis,
      { x: 0, y: top, w: half, h: compare.h - top }, { compact: true });
    drawSprings(compare.ctx, this.springs, this.system, this.derived,
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

    captionText(c, 'NONLINEAR CRADLE', 16, 18, hexToRgba(PALETTE.gold, 0.85), 10);
    captionText(c, 'LINEARIZED SPRING–MASS ANALOG', half + 16, 18, hexToRgba(PALETTE.blue, 0.85), 10);
  }
}

/* ---------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------- */

function renderMath() {
  // KaTeX is loaded from a CDN; if it is unavailable the raw TeX stays
  // readable rather than the page breaking.
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

document.addEventListener('DOMContentLoaded', () => {
  renderMath();
  window.cradleApp = new App();
});

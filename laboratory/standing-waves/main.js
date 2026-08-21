'use strict';

/* ============================================================================
 * STRINGS — FROM IDEAL WAVES TO REAL STRINGS
 *
 * Four models of one vibrating string, all reading the same parameter set so
 * that their predictions can be compared directly:
 *
 *   1 IDEAL      f_n = (n/2L)sqrt(T/mu), the perfectly flexible small-amplitude
 *                string. The baseline everything else is measured against.
 *
 *   2 FRETTED    Equal-tempered fret placement x_f = L(1 - 2^(-f/12)) sets the
 *                speaking length; the side-view path of the pressed string sets
 *                the extension, and dT = (EA/L0) dL sets the tension rise.
 *                Because the nominal fret positions make the length change
 *                exactly right, the whole predicted intonation error reduces to
 *                600 log2(1 + dT/T0).
 *
 *   3 STIFF      Bending stiffness adds an E I y'''' term to the wave equation,
 *                giving f_n = n f_1 sqrt(1 + B n^2) with B = pi^3 E r^4/(4 T L^2).
 *
 *   4 AMPLITUDE  A displaced string is longer, so tension — and therefore pitch —
 *                depends on how hard it was plucked. A triangular pluck is
 *                decomposed into normal modes, and the small-slope extension
 *                integral collapses to a closed form over those modes.
 *
 * UNITS. Everything inside the physics is SI: metres, newtons, kilograms per
 * metre, pascals, seconds. The controls and readouts convert at the boundary,
 * because nobody sets a string diameter in metres.
 *
 * COST. Model quantities are recomputed only when a control changes (see
 * App.refresh); the animation frame does nothing but advance the clock, sum a
 * few dozen cached mode shapes, and draw.
 * ========================================================================== */

/* ============================================================================
   1 · CONSTANTS AND SMALL HELPERS
   ========================================================================== */

const TAU = Math.PI * 2;
const MAX_FRET = 24;
const STEEL_DENSITY = 7850;     // kg/m^3, for the "mu from diameter" helper
const SAMPLES = 240;            // sample points along the drawn string

/* Normal modes kept for a plucked string. A perfect triangular corner needs
   infinitely many: the tension sum converges only as 1/n^2, so truncating at N
   under-counts the extension by roughly 0.63/N — about 1 % here. That is not
   purely a numerical compromise. A real plectrum or fingertip has width and
   leaves a rounded corner, which suppresses exactly the high modes being
   dropped, so a truncated sum is arguably the more physical object. */
const MAX_MODES = 64;
const A4 = 440;                 // Hz, concert pitch for the note-name readout

/* Roughly the smallest pitch difference a careful listener resolves on a
   sustained tone. Used only to word the insight card, never in the physics. */
const AUDIBLE_CENTS = 5;

const PALETTE = {
  space: '#070b14',
  ink: '#f4efe5',
  muted: '#acb4c5',
  gold: '#d7b470',
  blue: '#83b8d7',
  violet: '#9b6bff',
  rust: '#d68c70',
  green: '#8fcf9d'
};

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hypot = Math.hypot;

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** Interval between two frequencies in cents; 1200 cents is one octave. */
function centsBetween(frequency, reference) {
  if (!(frequency > 0) || !(reference > 0)) return 0;
  return 1200 * Math.log2(frequency / reference);
}

/** Frequency ratio of `semitones` equal-tempered steps. */
const semitoneRatio = (semitones) => Math.pow(2, semitones / 12);

function formatCents(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(digits)} ¢`;
}

function formatHz(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return `${value.toFixed(0)} Hz`;
  if (value >= 100) return `${value.toFixed(2)} Hz`;
  return `${value.toFixed(3)} Hz`;
}

/** Nearest equal-tempered note name and the offset from it, for a readout. */
function noteName(frequency) {
  if (!(frequency > 0)) return '—';
  const midi = 69 + 12 * Math.log2(frequency / A4);
  const nearest = Math.round(midi);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;
  const offset = (midi - nearest) * 100;
  return `${name}${octave} ${formatCents(offset, 0)}`;
}

/* ============================================================================
   2 · IDEAL STRING
   ========================================================================== */

/** Transverse wave speed on a perfectly flexible string. */
function waveSpeed(tension, linearDensity) {
  return Math.sqrt(tension / linearDensity);
}

/** f_n = (n / 2L) sqrt(T / mu). */
function idealFrequency(mode, length, tension, linearDensity) {
  return (mode / (2 * length)) * waveSpeed(tension, linearDensity);
}

/* ============================================================================
   3 · FRETTED STRING GEOMETRY

   Side view, x measured from the nut toward the bridge and y measured UP from
   the plane of the fingerboard. The resting string is the straight line from
   the nut slot to the saddle. Fretted, it becomes three straight segments:
   nut -> finger contact -> fret crown -> saddle. The difference between those
   two path lengths is the extension that raises the tension.
   ========================================================================== */

/** Nut-to-fret distance for equal temperament. */
function fretOffset(scaleLength, fret) {
  return scaleLength * (1 - Math.pow(2, -fret / 12));
}

/**
 * The resting string line, fixed by the nut height and by the action at one
 * reference fret. An open string gives no reference, so fret 12 stands in —
 * the action control is then read as the action at the twelfth fret.
 */
function restingStringLine(geometry) {
  const refFret = geometry.fret >= 1 ? geometry.fret : 12;
  const xRef = fretOffset(geometry.scaleLength, refFret);
  const yRef = geometry.fretHeight + geometry.action;
  const slope = (yRef - geometry.nutHeight) / xRef;
  return {
    refFret,
    yNut: geometry.nutHeight,
    slope,
    heightAt: (x) => geometry.nutHeight + slope * x,
    ySaddle: geometry.nutHeight + slope * geometry.scaleLength
  };
}

/**
 * Path length of the string pressed to one fret, and the extension over its
 * resting length. All lengths in metres.
 *
 * The finger contacts the string a distance `pressOffset` behind the fret and
 * pushes it a fraction `press` of the fret's height below the crown, so
 * press = 1 means pressed flat onto the fingerboard. That fraction, rather
 * than an absolute depth, is what makes fret height matter: a taller fret
 * gives the same firmness more room to stretch the string.
 */
function frettedPath(geometry, line, fret) {
  const scale = geometry.scaleLength;

  if (fret < 1) {
    // An open string is not fretted at all: no contact, no extension.
    const rest = hypot(scale, line.ySaddle - line.yNut);
    return {
      applies: false, fret: 0, xFret: 0, vibrating: scale,
      restPath: rest, path: rest, extension: 0,
      xPress: 0, yPress: 0, pressOffset: 0, action: 0
    };
  }

  const xFret = fretOffset(scale, fret);
  const vibrating = scale - xFret;

  // The finger cannot sit behind the previous fret, and the gap closes fast up
  // the neck, so the offset is capped at most of the way to the fret below.
  const spacing = xFret - fretOffset(scale, fret - 1);
  const offset = clamp(geometry.pressOffset, 1e-4, Math.max(1e-4, 0.85 * spacing));
  const xPress = xFret - offset;
  const yPress = geometry.fretHeight * (1 - clamp(geometry.press, 0, 1));

  const restPath = hypot(scale, line.ySaddle - line.yNut);
  const toFinger = hypot(xPress, line.yNut - yPress);
  const overCrown = hypot(offset, geometry.fretHeight - yPress);
  const toSaddle = hypot(vibrating, line.ySaddle - geometry.fretHeight);
  const path = toFinger + overCrown + toSaddle;

  return {
    applies: true,
    fret,
    xFret,
    vibrating,
    restPath,
    path,
    extension: Math.max(0, path - restPath),
    xPress,
    yPress,
    pressOffset: offset,
    pressOffsetClamped: offset < geometry.pressOffset - 1e-9,
    action: line.heightAt(xFret) - geometry.fretHeight,
    segments: { toFinger, overCrown, toSaddle }
  };
}

/**
 * Axial elasticity of a stretched rod: dT = (EA/L0) dL.
 *
 * L0 is taken as the full speaking length, and A as the area of the
 * load-bearing core. A real string is anchored beyond the nut and the bridge,
 * so the length actually free to stretch is longer and the true tension rise
 * is smaller — this convention makes the prediction an upper bound.
 */
function tensionFromExtension(youngs, coreArea, originalLength, extension) {
  return (youngs * coreArea / originalLength) * extension;
}

/* ============================================================================
   4 · STIFF STRING

   Bending stiffness adds a fourth-derivative term to the wave equation and
   pushes the high partials sharp, because a higher mode is more sharply
   curved and therefore pays more bending energy.
   ========================================================================== */

/** B = pi^3 E r^4 / (4 T L^2), dimensionless. r is the load-bearing radius. */
function inharmonicityCoefficient(youngs, coreRadius, tension, length) {
  const num = Math.PI ** 3 * youngs * Math.pow(coreRadius, 4);
  const den = 4 * tension * length * length;
  return den > 0 ? num / den : 0;
}

/** f_n = n f_1 sqrt(1 + B n^2). */
function stiffPartial(mode, fundamental, B) {
  return mode * fundamental * Math.sqrt(1 + B * mode * mode);
}

/* ============================================================================
   5 · PLUCKED STRING AND DYNAMIC TENSION
   ========================================================================== */

/**
 * Normal-mode amplitudes of a triangular pluck of height `amplitude` at
 * x0 = position * L, released from rest:
 *
 *   A_n = 2 a L^2 / (pi^2 n^2 x0 (L - x0)) * sin(n pi x0 / L)
 *
 * The 1/n^2 fall-off is why a pluck excites a whole spectrum, and the sine
 * factor is why plucking on a mode's node silences that mode entirely.
 */
function pluckModeAmplitudes(count, amplitude, position, length) {
  const p = clamp(position, 0.01, 0.99);
  const x0 = p * length;
  const rest = length - x0;
  const scale = (2 * amplitude * length * length) / (Math.PI ** 2 * x0 * rest);
  const out = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const n = k + 1;
    out[k] = (scale / (n * n)) * Math.sin(n * Math.PI * p);
  }
  return out;
}

/**
 * Small-slope extra length of a modal sum:
 *
 *   dL = 1/2 integral (dy/dx)^2 dx = (pi^2 / 4L) sum n^2 a_n^2
 *
 * The mode shapes are orthogonal, so every cross term integrates to zero and
 * the integral collapses to this sum — exact for the modal sum, and cheap
 * enough to evaluate every frame. At t = 0 it reproduces the exact extra
 * length of the triangle, which is a useful check on the decomposition.
 */
function modalExtension(coefficients, length) {
  let sum = 0;
  for (let k = 0; k < coefficients.length; k++) {
    const n = k + 1;
    sum += n * n * coefficients[k] * coefficients[k];
  }
  return (Math.PI ** 2 / (4 * length)) * sum;
}

/* ============================================================================
   6 · PARAMETERS AND MODEL EVALUATION
   ========================================================================== */

const DEFAULTS = {
  model: 'ideal',
  preset: 'plain',
  // String
  mu: 1.02,          // g/m
  diameter: 0.41,    // mm, overall
  core: 1.0,         // load-bearing fraction of the diameter
  youngs: 200,       // GPa
  tension: 104,      // N, open string
  // Length and fret
  scale: 648,        // mm, nut to saddle
  fret: 5,
  action: 1.0,       // mm, clearance over the selected fret's crown
  fretHeight: 1.0,   // mm, crown above the fingerboard
  nutHeight: 1.4,    // mm, string above the fingerboard at the nut
  pressOffset: 8,    // mm, finger contact behind the fret
  press: 0.35,       // fraction of the fret height pressed below the crown
  // Motion and view
  mode: 2,
  amplitude: 1.5,    // mm, display amplitude for the single-mode views
  partials: 10,
  pluck: 2.0,        // mm
  pluckPos: 0.2,
  damping: 3.0,      // 1/s
  slow: 300,
  components: true,
  envelope: true,
  superpose: true
};

/* Representative strings, not measurements. The wound entry in particular
   carries a core fraction that should be fitted rather than trusted. */
const STRING_PRESETS = {
  plain: { mu: 1.02, diameter: 0.41, core: 1.0, youngs: 200, tension: 104 },
  wound: { mu: 5.41, diameter: 0.91, core: 0.45, youngs: 200, tension: 110 }
};

/* Coherent parameter sets for the inharmonicity comparison. Each keeps a
   plausible pitch while moving B over orders of magnitude. */
const STIFFNESS_PRESETS = {
  'thin-long':    { mu: 0.39, diameter: 0.25, core: 1, tension: 80,  scale: 900 },
  'thick-short':  { mu: 8.88, diameter: 1.20, core: 1, tension: 180, scale: 520 },
  'high-tension': { tension: 220 },
  'low-tension':  { tension: 45 }
};

const MODEL_BLURBS = {
  ideal: 'The clamped string of the textbook: perfectly flexible, uniformly tensioned, and displaced so little that its length never changes. Two travelling waves run in opposite directions and add to a wave that goes nowhere.',
  fret: 'Pressing the string to a fret does two things at once. It shortens the speaking length, which is exactly what equal-tempered fret placement intends, and it lengthens the string’s total path, which raises the tension and was not intended at all.',
  stiff: 'A real wire resists bending as well as stretching. Higher partials are more sharply curved, so they pay more bending energy and run sharp — the overtones are no longer an exact harmonic series.',
  pluck: 'A strongly displaced string is measurably longer than a straight one, so a hard pluck raises its own tension and its own pitch, then relaxes as the motion decays.',
  all: 'Every correction applied together: the fretted length and tension, the stiffness-shifted partials, and the amplitude-dependent tension of the decaying pluck.'
};

/**
 * Everything the page reports, computed from one parameter set. Called only
 * when a control changes; the animation loop reads the result.
 */
function evaluate(p) {
  // --- SI, with bounds that keep every downstream expression finite ---
  const mu = clamp(p.mu, 0.02, 40) * 1e-3;
  const tension = clamp(p.tension, 1, 500);
  const youngs = clamp(p.youngs, 1, 400) * 1e9;
  const diameter = clamp(p.diameter, 0.05, 5) * 1e-3;
  const coreFraction = clamp(p.core, 0.05, 1);
  const coreRadius = (diameter * coreFraction) / 2;
  const coreArea = Math.PI * coreRadius * coreRadius;
  const scale = clamp(p.scale, 100, 1200) * 1e-3;
  const fret = clamp(Math.round(p.fret), 0, MAX_FRET);
  const mode = clamp(Math.round(p.mode), 1, 12);
  const partialCount = clamp(Math.round(p.partials), 2, 12);
  const length = scale * Math.pow(2, -fret / 12);

  const geometry = {
    scaleLength: scale,
    fret,
    action: clamp(p.action, 0.05, 10) * 1e-3,
    fretHeight: clamp(p.fretHeight, 0.1, 4) * 1e-3,
    nutHeight: clamp(p.nutHeight, 0.2, 6) * 1e-3,
    pressOffset: clamp(p.pressOffset, 0.5, 40) * 1e-3,
    press: clamp(p.press, 0, 1)
  };

  // --- Model 1: ideal string ---
  const speed = waveSpeed(tension, mu);
  const fundamental = idealFrequency(1, length, tension, mu);
  const openFundamental = idealFrequency(1, scale, tension, mu);
  const ideal = {
    speed,
    length,
    fundamental,
    openFundamental,
    mode,
    frequency: mode * fundamental,
    wavelength: (2 * length) / mode,
    nodes: mode + 1,
    antinodes: mode,
    period: 1 / fundamental
  };

  // --- Model 2: fretted geometry ---
  const line = restingStringLine(geometry);
  const path = frettedPath(geometry, line, fret);
  const deltaT = path.applies
    ? tensionFromExtension(youngs, coreArea, scale, path.extension)
    : 0;
  // Nominal fret placement makes the length change exact, so the target is the
  // open pitch transposed by the fret number and the whole error is tension.
  const targetFrequency = openFundamental * semitoneRatio(fret);
  const frettedFrequency = idealFrequency(1, length, tension + deltaT, mu);
  const fretting = {
    applies: path.applies,
    line,
    path,
    deltaT,
    targetFrequency,
    frequency: frettedFrequency,
    deltaHz: frettedFrequency - targetFrequency,
    cents: path.applies ? 600 * Math.log2(1 + deltaT / tension) : 0,
    tensionRatio: deltaT / tension
  };

  // --- Model 3: stiff string ---
  const B = inharmonicityCoefficient(youngs, coreRadius, tension, length);
  const partials = [];
  for (let n = 1; n <= partialCount; n++) {
    const idealHz = n * fundamental;
    const stiffHz = stiffPartial(n, fundamental, B);
    partials.push({
      n,
      ideal: idealHz,
      stiff: stiffHz,
      deltaHz: stiffHz - idealHz,
      cents: centsBetween(stiffHz, idealHz),
      // Which ideal partial the stretched one now sits closest to. Once this
      // stops being n, the overtone has drifted out of its own harmonic slot.
      nearest: Math.max(1, Math.round(stiffHz / fundamental))
    });
  }
  const stiff = {
    B,
    partials,
    selected: partials[Math.min(mode, partials.length) - 1] || partials[0],
    top: partials[partials.length - 1],
    fundamentalCents: 600 * Math.log2(1 + B)
  };

  // --- Model 4: amplitude-dependent tension ---
  const pluckAmplitude = clamp(p.pluck, 0.05, 20) * 1e-3;
  const pluckPosition = clamp(p.pluckPos, 0.02, 0.98);
  const damping = clamp(p.damping, 0.05, 40);
  const modeAmplitudes = pluckModeAmplitudes(MAX_MODES, pluckAmplitude, pluckPosition, length);
  const peakExtension = modalExtension(modeAmplitudes, length);      // all modes in phase, t = 0
  const peakDeltaT = tensionFromExtension(youngs, coreArea, length, peakExtension);
  const pluck = {
    amplitude: pluckAmplitude,
    position: pluckPosition,
    damping,
    modeAmplitudes,
    peakExtension,
    peakDeltaT,
    // Over one cycle <cos^2> = 1/2, so the sustained shift is half the peak.
    peakCents: 600 * Math.log2(1 + peakDeltaT / tension),
    meanCents: 600 * Math.log2(1 + 0.5 * peakDeltaT / tension),
    // The shift decays at twice the amplitude's rate, because it goes as the
    // square of the displacement.
    window: Math.min(4, 3 / damping)
  };

  // --- Combined ---
  const combinedTension = tension + deltaT + 0.5 * peakDeltaT;
  const combined = {
    tension: combinedTension,
    frequency: idealFrequency(1, length, combinedTension, mu) * Math.sqrt(1 + B),
    targetFrequency
  };
  combined.cents = centsBetween(combined.frequency, targetFrequency);

  // `fret` stays the fret NUMBER throughout; the geometry model is `fretting`.
  const model = {
    p, mu, tension, youngs, diameter, coreFraction, coreRadius, coreArea,
    scale, fret, length, mode, partialCount, geometry,
    ideal, fretting, stiff, pluck, combined,
    stress: tension / coreArea
  };
  model.warnings = collectWarnings(model);
  model.insight = buildInsight(model);
  return model;
}

/** Physical sanity checks on the described setup, surfaced to the reader. */
function collectWarnings(m) {
  const out = [];
  const line = m.fretting.line;

  // Does the resting string actually clear every fret it passes over?
  let worst = Infinity;
  let worstFret = 0;
  for (let f = 1; f <= MAX_FRET; f++) {
    const gap = line.heightAt(fretOffset(m.scale, f)) - m.geometry.fretHeight;
    if (gap < worst) { worst = gap; worstFret = f; }
  }
  if (worst <= 0) {
    out.push(`This setup puts the resting string ${(Math.abs(worst) * 1000).toFixed(2)} mm below the crown of fret ${worstFret}. A real string would rest on the fret rather than vibrate over it — raise the nut or the action.`);
  } else if (worst < 0.1e-3) {
    out.push(`The resting string clears fret ${worstFret} by only ${(worst * 1000).toFixed(2)} mm, which a real string would buzz against.`);
  }

  if (line.ySaddle > 8e-3) {
    out.push(`The implied saddle height is ${(line.ySaddle * 1000).toFixed(1)} mm, well above a normal setup. The action or nut height is probably unrealistic for this scale length.`);
  }

  if (m.fretting.path.pressOffsetClamped) {
    out.push(`At fret ${m.fret}, the frets are ${(m.fretting.path.pressOffset * 1000).toFixed(1)} mm apart at most, so the finger contact has been capped at that distance behind the fret.`);
  }

  if (m.fretting.tensionRatio > 0.35) {
    out.push(`The predicted tension rise is ${(m.fretting.tensionRatio * 100).toFixed(0)} % of the open tension. The linear elastic approximation dT = (EA/L₀)dL is only trustworthy for small fractional changes, so read this figure as an order of magnitude.`);
  }

  // Music wire yields somewhere around 2–3 GPa; past that the string breaks
  // rather than playing, which is worth saying out loud.
  if (m.stress > 2.5e9) {
    out.push(`The core stress is ${(m.stress / 1e9).toFixed(2)} GPa, above the tensile strength of ordinary music wire. A real string at these settings would break.`);
  }

  if (m.stiff.B > 0.02) {
    out.push(`The inharmonicity coefficient is B = ${m.stiff.B.toExponential(2)}. The expression f_n = n f₁√(1+Bn²) is derived for small B, so treat the high partials here as qualitative.`);
  }

  if (m.pluck.amplitude > 0.02 * m.length) {
    out.push(`The pluck amplitude is ${(100 * m.pluck.amplitude / m.length).toFixed(1)} % of the string length. The small-slope extension integral starts to lose accuracy well before this becomes large.`);
  }

  return out;
}

/* ============================================================================
   7 · THE INSIGHT CARD
   Ranked from the model outputs — never hard-coded, and deliberately hedged.
   ========================================================================== */

function buildInsight(m) {
  const candidates = [
    {
      key: 'fret',
      cents: m.fretting.applies ? m.fretting.cents : null,
      name: 'fretting geometry',
      phrase: `pressing the string to fret ${m.fret} stretches it by ${(m.fretting.path.extension * 1e6).toFixed(0)} µm and adds ${m.fretting.deltaT.toFixed(2)} N of tension`
    },
    {
      key: 'stiff',
      cents: m.stiff.fundamentalCents,
      name: 'bending stiffness',
      phrase: `a bending-stiffness coefficient of B = ${m.stiff.B.toExponential(2)} lifts even the fundamental`
    },
    {
      key: 'pluck',
      cents: m.pluck.meanCents,
      name: 'amplitude-dependent tension',
      phrase: `a ${(m.pluck.amplitude * 1000).toFixed(1)} mm pluck adds up to ${m.pluck.peakDeltaT.toFixed(2)} N at the peak of each cycle`
    }
  ].filter((c) => c.cents !== null);

  candidates.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
  const top = candidates[0];
  const second = candidates[1];

  const topPartial = m.stiff.top;
  let headline;
  let body;

  if (Math.abs(top.cents) < AUDIBLE_CENTS * 0.4) {
    headline = 'None of the modelled effects moves the fundamental much under these parameters.';
    body = `The largest predicted shift of the fundamental is ${formatCents(top.cents)} from ${top.name}, comfortably below the roughly ${AUDIBLE_CENTS}-cent difference most listeners can resolve on a sustained tone. `;
  } else {
    headline = `Under these parameters the dominant modelled shift of the fundamental is ${top.name}, at ${formatCents(top.cents)}.`;
    body = `That is the prediction because ${top.phrase}. `;
    if (second) {
      const ratio = Math.abs(second.cents) > 1e-9 ? Math.abs(top.cents / second.cents) : Infinity;
      body += ratio > 3
        ? `The next largest, ${second.name}, is ${formatCents(second.cents)} — smaller by a factor of about ${ratio < 100 ? ratio.toFixed(0) : '100 or more'}. `
        : `${second.name.charAt(0).toUpperCase()}${second.name.slice(1)} is close behind at ${formatCents(second.cents)}, so neither one dominates cleanly here. `;
    }
  }

  // Stiffness barely touches the fundamental but can dominate the overtones,
  // which is a different claim and worth making separately.
  const fretCents = m.fretting.applies ? Math.abs(m.fretting.cents) : 0;
  if (Math.abs(topPartial.cents) > Math.max(fretCents, AUDIBLE_CENTS)) {
    body += `Look higher up the spectrum and the ranking changes: partial ${topPartial.n} is predicted ${formatCents(topPartial.cents)} away from its harmonic position, ${m.fretting.applies ? `larger than the ${formatCents(m.fretting.cents)} that fretting moves the fundamental` : 'a shift the fundamental never sees'}. Stiffness is heard as a change in timbre and in how octaves must be tuned, not as a change in the note itself.`;
  } else if (Math.abs(topPartial.cents) > 1) {
    body += `Across the ${m.partialCount} partials shown, the largest departure from the harmonic series is ${formatCents(topPartial.cents)} at partial ${topPartial.n}.`;
  } else {
    body += `The partials stay within ${formatCents(topPartial.cents)} of the harmonic series over the ${m.partialCount} shown, so this string is close to harmonic.`;
  }

  return { headline, body, ranked: candidates };
}

/* ============================================================================
   8 · CANVAS HELPERS
   ========================================================================== */

function syncCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const tw = Math.round(w * dpr);
  const th = Math.round(h * dpr);
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw;
    canvas.height = th;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function fillBackground(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* A faint deterministic starfield, tying the instrument back to the rest of
   the site without pulling focus from the physics. */
function makeStars(count, seed) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({ x: rand(), y: rand(), r: rand() * 0.9 + 0.25, a: rand() * 0.3 + 0.06 });
  }
  return stars;
}

function drawStars(ctx, stars, w, h) {
  ctx.save();
  ctx.fillStyle = PALETTE.ink;
  for (const star of stars) {
    ctx.globalAlpha = star.a;
    ctx.beginPath();
    ctx.arc(star.x * w, star.y * h, star.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function glowDot(ctx, x, y, radius, color, blur = 12) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function caption(ctx, text, x, y, color = PALETTE.muted, size = 10, align = 'left') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px "DM Sans", system-ui, sans-serif`;
  ctx.letterSpacing = '0.1em';
  ctx.textAlign = align;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

function plainText(ctx, text, x, y, color = PALETTE.muted, size = 10, align = 'left') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A dimension line with end ticks and a label, for the fretboard schematic. */
function dimension(ctx, x1, x2, y, text, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y - 4);
  ctx.lineTo(x1, y + 4);
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.moveTo(x2, y - 4);
  ctx.lineTo(x2, y + 4);
  ctx.stroke();
  ctx.restore();
  plainText(ctx, text, (x1 + x2) / 2, y - 6, color, 9.5, 'center');
}

/* Mode shapes sin(n pi u) sampled once at construction. u = x/L, so the table
   does not depend on the string's length and never has to be rebuilt. */
const SHAPE_TABLE = (() => {
  const table = [];
  for (let n = 1; n <= MAX_MODES; n++) {
    const row = new Float64Array(SAMPLES + 1);
    for (let i = 0; i <= SAMPLES; i++) row[i] = Math.sin(n * Math.PI * (i / SAMPLES));
    table.push(row);
  }
  return table;
})();

const shapeBuffer = new Float64Array(SAMPLES + 1);

/** Sums cached mode shapes into the shared buffer. Displacement in metres. */
function sumModes(coefficients, count) {
  shapeBuffer.fill(0);
  const n = Math.min(count, coefficients.length, MAX_MODES);
  for (let k = 0; k < n; k++) {
    const c = coefficients[k];
    if (c === 0) continue;
    const row = SHAPE_TABLE[k];
    for (let i = 0; i <= SAMPLES; i++) shapeBuffer[i] += c * row[i];
  }
  return shapeBuffer;
}

/* ============================================================================
   9 · MODEL RENDERERS
   Each takes the cached model, the physical time, and the canvas box. Nothing
   here recomputes a model quantity; they only place cached numbers on screen.
   ========================================================================== */

const STARS = makeStars(46, 23);

/** Instantaneous modal coefficients for a decaying pluck, in metres. */
function pluckCoefficients(m, t, frequencies, out) {
  const decay = Math.exp(-m.pluck.damping * t);
  for (let k = 0; k < MAX_MODES; k++) {
    out[k] = m.pluck.modeAmplitudes[k] * decay * Math.cos(TAU * frequencies[k] * t);
  }
  return out;
}

const coefBuffer = new Float64Array(MAX_MODES);
const freqBuffer = new Float64Array(MAX_MODES);

/** Partial frequencies for the plucked views, with or without stiffness. */
function fillFrequencies(m, includeStiffness, tension) {
  const f1 = idealFrequency(1, m.length, tension, m.mu);
  for (let k = 0; k < MAX_MODES; k++) {
    const n = k + 1;
    freqBuffer[k] = includeStiffness ? stiffPartial(n, f1, m.stiff.B) : n * f1;
  }
  return freqBuffer;
}

/* ---------- Model 1 · ideal string ---------- */

function drawIdeal(ctx, w, h, m, t, view) {
  const padX = w * 0.08;
  const spanX = w - padX * 2;
  const midY = h * 0.5;
  const ampPx = h * 0.28;

  const amplitude = m.p.amplitude * 1e-3;               // metres
  const n = m.mode;
  const f = m.ideal.frequency;
  const phase = TAU * f * t;
  const toPx = (value) => (value / amplitude) * ampPx;  // metres -> pixels

  // --- envelope ---
  if (view.envelope) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(PALETTE.blue, 0.22);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (const sign of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const y = midY - sign * Math.abs(Math.sin(n * Math.PI * u)) * ampPx;
        const x = padX + u * spanX;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- the two counter-propagating components, each of half the amplitude ---
  if (view.components) {
    ctx.save();
    ctx.lineWidth = 1;
    const tints = [hexToRgba(PALETTE.violet, 0.4), hexToRgba(PALETTE.gold, 0.4)];
    [1, -1].forEach((direction, index) => {
      ctx.strokeStyle = tints[index];
      ctx.beginPath();
      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const x = padX + u * spanX;
        const y = midY - 0.5 * Math.sin(n * Math.PI * u - direction * phase) * ampPx;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  // --- equilibrium axis ---
  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.1);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, midY);
  ctx.lineTo(padX + spanX, midY);
  ctx.stroke();
  ctx.restore();

  // --- the resultant standing wave ---
  const swing = Math.cos(phase);
  ctx.save();
  ctx.strokeStyle = PALETTE.blue;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = PALETTE.blue;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const x = padX + u * spanX;
    const y = midY - Math.sin(n * Math.PI * u) * swing * ampPx;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // --- nodes and antinodes: meaningful, because this is one pure mode ---
  for (let k = 0; k <= n; k++) {
    glowDot(ctx, padX + (k / n) * spanX, midY, 2.8, PALETTE.gold, 10);
  }
  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.gold, 0.4);
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const x = padX + u * spanX;
    ctx.beginPath();
    ctx.moveTo(x, midY);
    ctx.lineTo(x, midY - Math.sin(n * Math.PI * u) * swing * ampPx);
    ctx.stroke();
  }
  ctx.restore();

  drawClamps(ctx, padX, padX + spanX, midY, h);
  drawScaleBar(ctx, padX, padX + spanX, h - 26, m.length, spanX, toPx(1e-3));

  caption(ctx, `n = ${n}`, padX, 22, PALETTE.gold, 10);
  plainText(ctx, `${formatHz(f)} · ${noteName(f)}`, padX + spanX, 22, PALETTE.muted, 10, 'right');
}

function drawClamps(ctx, xLeft, xRight, midY, h) {
  for (const x of [xLeft, xRight]) {
    ctx.save();
    ctx.fillStyle = hexToRgba(PALETTE.ink, 0.55);
    ctx.fillRect(x - 2, midY - h * 0.11, 4, h * 0.22);
    ctx.restore();
  }
}

/** Horizontal scale bar plus the vertical exaggeration the drawing uses. */
function drawScaleBar(ctx, xLeft, xRight, y, lengthMetres, spanPx, pxPerMm) {
  const pxPerMetre = spanPx / lengthMetres;
  const exaggeration = (pxPerMm * 1000) / pxPerMetre;
  dimension(ctx, xLeft, xRight, y,
    `L = ${(lengthMetres * 1000).toFixed(1)} mm`, hexToRgba(PALETTE.ink, 0.35));
  plainText(ctx, `vertical scale ×${exaggeration.toFixed(0)}`,
    xRight, y + 14, hexToRgba(PALETTE.ink, 0.3), 9, 'right');
}

/* ---------- Model 2 and combined · fretted geometry ---------- */

/**
 * Side-view schematic of the neck. `displacement(u, i)` returns the vibrating
 * segment's transverse displacement in metres at fraction u of the speaking
 * length; it is clamped to zero at both ends by construction. `headroom` is
 * the largest displacement it will return, so the vertical scale can be sized
 * once instead of guessed.
 */
function drawFretboard(ctx, w, h, m, displacement, label, headroom) {
  const padX = w * 0.06;
  const spanX = w - padX * 2;
  const boardY = h * 0.74;
  const scale = m.scale;
  const line = m.fretting.line;
  const path = m.fretting.path;

  const xOf = (metres) => padX + (metres / scale) * spanX;

  // One vertical scale for the whole schematic, sized so the saddle and the
  // vibrating string both fit. Heights here are millimetres on a string that
  // is hundreds of millimetres long, so the exaggeration is large and stated.
  const tallest = Math.max(line.ySaddle, m.geometry.nutHeight) + headroom * 1.6 + 1e-3;
  const vex = (h * 0.6) / tallest;                 // pixels per metre of height
  const yOf = (metres) => boardY - metres * vex;

  // --- fingerboard ---
  ctx.save();
  ctx.fillStyle = hexToRgba(PALETTE.ink, 0.05);
  ctx.fillRect(padX, boardY, spanX, h - boardY - 18);
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.18);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, boardY);
  ctx.lineTo(padX + spanX, boardY);
  ctx.stroke();
  ctx.restore();

  // --- frets ---
  for (let f = 1; f <= MAX_FRET; f++) {
    const x = xOf(fretOffset(scale, f));
    if (x > padX + spanX) break;
    const active = f === m.fret;
    ctx.save();
    ctx.strokeStyle = active ? PALETTE.gold : hexToRgba(PALETTE.ink, 0.22);
    ctx.lineWidth = active ? 2.4 : 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, boardY);
    ctx.lineTo(x, yOf(m.geometry.fretHeight));
    ctx.stroke();
    ctx.restore();
    if (active) plainText(ctx, String(f), x, boardY + 14, PALETTE.gold, 9.5, 'center');
    else if (f % 12 === 0 || f === 5 || f === 7) {
      plainText(ctx, String(f), x, boardY + 14, hexToRgba(PALETTE.ink, 0.25), 9, 'center');
    }
  }

  // --- nut and saddle ---
  ctx.save();
  ctx.fillStyle = hexToRgba(PALETTE.ink, 0.5);
  ctx.fillRect(padX - 3, yOf(line.yNut), 5, boardY - yOf(line.yNut));
  ctx.fillRect(padX + spanX - 2, yOf(line.ySaddle), 5, boardY - yOf(line.ySaddle));
  ctx.restore();
  caption(ctx, 'nut', padX, boardY + 30, hexToRgba(PALETTE.ink, 0.32), 9);
  caption(ctx, 'bridge', padX + spanX, boardY + 30, hexToRgba(PALETTE.ink, 0.32), 9, 'right');

  // --- resting string line ---
  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.28);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(line.yNut));
  ctx.lineTo(xOf(scale), yOf(line.ySaddle));
  ctx.stroke();
  ctx.restore();

  // --- the static side of the fretted path: real string, but not vibrating ---
  if (path.applies) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(PALETTE.rust, 0.75);
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(line.yNut));
    ctx.lineTo(xOf(path.xPress), yOf(path.yPress));
    ctx.lineTo(xOf(path.xFret), yOf(m.geometry.fretHeight));
    ctx.stroke();
    ctx.restore();
    glowDot(ctx, xOf(path.xPress), yOf(path.yPress), 3, PALETTE.rust, 8);
    caption(ctx, 'static — sets tension, not pitch',
      xOf(path.xPress * 0.45), yOf(line.yNut) - 16, hexToRgba(PALETTE.rust, 0.65), 8.5, 'center');
  }

  // --- the vibrating segment ---
  const xStart = path.applies ? path.xFret : 0;
  const yStart = path.applies ? m.geometry.fretHeight : line.yNut;
  const vibrating = scale - xStart;

  ctx.save();
  ctx.strokeStyle = PALETTE.blue;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = PALETTE.blue;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const base = lerp(yStart, line.ySaddle, u);
    const x = xOf(xStart + u * vibrating);
    const y = yOf(base + displacement(u, i));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // --- annotations ---
  const dimY = Math.max(18, yOf(tallest) + 10);
  dimension(ctx, xOf(xStart), xOf(scale), dimY,
    `vibrating length ${(vibrating * 1000).toFixed(1)} mm`, hexToRgba(PALETTE.blue, 0.7));

  if (path.applies) {
    // Action at the fret: from the crown up to the resting string. Drawn on
    // the nut side, because the vibrating segment rises away from the crown
    // and would sit underneath a label placed to the right of it.
    const xa = xOf(path.xFret);
    const yCrown = yOf(m.geometry.fretHeight);
    const yString = yOf(m.geometry.fretHeight + path.action);
    ctx.save();
    ctx.strokeStyle = hexToRgba(PALETTE.gold, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa - 10, yCrown);
    ctx.lineTo(xa - 10, yString);
    ctx.moveTo(xa - 13, yCrown);
    ctx.lineTo(xa - 7, yCrown);
    ctx.moveTo(xa - 13, yString);
    ctx.lineTo(xa - 7, yString);
    ctx.stroke();
    ctx.restore();
    plainText(ctx, `action ${(path.action * 1000).toFixed(2)} mm`,
      xa - 16, (yCrown + yString) / 2 + 3, hexToRgba(PALETTE.gold, 0.8), 9, 'right');

    plainText(ctx,
      `ΔL = ${(m.fretting.path.extension * 1e6).toFixed(1)} µm  →  ΔT = ${m.fretting.deltaT.toFixed(2)} N`,
      padX, h - 8, hexToRgba(PALETTE.rust, 0.85), 10);
  } else {
    plainText(ctx, 'open string — no fretting, no added tension',
      padX, h - 8, hexToRgba(PALETTE.ink, 0.35), 10);
  }

  plainText(ctx, `vertical scale ×${(vex / (spanX / scale)).toFixed(0)}`,
    padX + spanX, h - 8, hexToRgba(PALETTE.ink, 0.3), 9, 'right');

  if (label) caption(ctx, label, padX, 20, hexToRgba(PALETTE.ink, 0.45), 10);
}

/* ---------- Model 3 · stiff string ---------- */

function drawStiff(ctx, w, h, m, t, view) {
  const padX = w * 0.08;
  const spanX = w - padX * 2;
  const midY = h * 0.5;
  const ampPx = h * 0.28;
  const amplitude = m.p.amplitude * 1e-3;

  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.1);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, midY);
  ctx.lineTo(padX + spanX, midY);
  ctx.stroke();
  ctx.restore();

  if (view.superpose) {
    // Equal-amplitude partials at their stiffness-shifted frequencies. Because
    // those are not integer multiples of anything, the sum never repeats — the
    // point of the view. Fixed nodes no longer exist, so none are drawn.
    const count = m.partialCount;
    const norm = amplitude / count;

    // A dim ghost of the same sum with perfectly harmonic partials, so the
    // drift between the two is visible rather than merely asserted. Both sums
    // take their per-mode cosine once, outside the sample loop.
    for (let k = 0; k < MAX_MODES; k++) {
      coefBuffer[k] = k < count ? norm * Math.cos(TAU * m.stiff.partials[k].ideal * t) : 0;
    }
    const harmonic = Float64Array.from(sumModes(coefBuffer, count));

    ctx.save();
    ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const x = padX + (i / SAMPLES) * spanX;
      const py = midY - (harmonic[i] / amplitude) * ampPx;
      if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
    ctx.restore();

    for (let k = 0; k < MAX_MODES; k++) {
      coefBuffer[k] = k < count ? norm * Math.cos(TAU * m.stiff.partials[k].stiff * t) : 0;
    }
    const y = sumModes(coefBuffer, count);

    ctx.save();
    ctx.strokeStyle = PALETTE.violet;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.shadowColor = PALETTE.violet;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const x = padX + (i / SAMPLES) * spanX;
      const py = midY - (y[i] / amplitude) * ampPx;
      if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
    ctx.restore();

    caption(ctx, `${count} partials superposed`, padX, 22, PALETTE.violet, 10);
  } else {
    // A single partial is still a standing wave, so its nodes are real.
    const partial = m.stiff.selected;
    const n = partial.n;
    const swing = Math.cos(TAU * partial.stiff * t);
    ctx.save();
    ctx.strokeStyle = PALETTE.violet;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.shadowColor = PALETTE.violet;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const u = i / SAMPLES;
      const x = padX + u * spanX;
      const py = midY - Math.sin(n * Math.PI * u) * swing * ampPx;
      if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
    ctx.restore();

    for (let k = 0; k <= n; k++) {
      glowDot(ctx, padX + (k / n) * spanX, midY, 2.6, PALETTE.gold, 10);
    }
    caption(ctx, `partial n = ${n}`, padX, 22, PALETTE.violet, 10);
    plainText(ctx,
      `${formatHz(partial.stiff)} vs ${formatHz(partial.ideal)} ideal · ${formatCents(partial.cents)}`,
      padX + spanX, 22, PALETTE.muted, 10, 'right');
  }

  drawClamps(ctx, padX, padX + spanX, midY, h);
  drawScaleBar(ctx, padX, padX + spanX, h - 26, m.length, spanX, ampPx / (m.p.amplitude));
  plainText(ctx, `B = ${m.stiff.B.toExponential(2)}`, padX, h - 40, hexToRgba(PALETTE.violet, 0.8), 10);
}

/* ---------- Model 4 · plucked string ---------- */

function drawPluck(ctx, w, h, m, t) {
  const padX = w * 0.08;
  const spanX = w - padX * 2;
  const midY = h * 0.5;
  const ampPx = h * 0.3;
  const reference = Math.max(1e-6, m.pluck.amplitude);

  const frequencies = fillFrequencies(m, false, m.tension);
  const coefficients = pluckCoefficients(m, t, frequencies, coefBuffer);
  const y = sumModes(coefficients, MAX_MODES);

  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.ink, 0.1);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, midY);
  ctx.lineTo(padX + spanX, midY);
  ctx.stroke();
  ctx.restore();

  // The initial triangle, as a reminder of where the motion came from.
  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.gold, 0.3);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(padX, midY);
  ctx.lineTo(padX + m.pluck.position * spanX, midY - ampPx);
  ctx.lineTo(padX + spanX, midY);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = PALETTE.rust;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = PALETTE.rust;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const x = padX + (i / SAMPLES) * spanX;
    const py = midY - (y[i] / reference) * ampPx;
    if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
  }
  ctx.stroke();
  ctx.restore();

  // Where the pluck was applied.
  const xp = padX + m.pluck.position * spanX;
  ctx.save();
  ctx.strokeStyle = hexToRgba(PALETTE.gold, 0.35);
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(xp, midY - ampPx * 1.15);
  ctx.lineTo(xp, midY + ampPx * 1.15);
  ctx.stroke();
  ctx.restore();
  plainText(ctx, `pluck at ${(m.pluck.position * 100).toFixed(0)} % of L`,
    xp + 6, midY + ampPx * 1.15, hexToRgba(PALETTE.gold, 0.6), 9);

  drawClamps(ctx, padX, padX + spanX, midY, h);
  drawScaleBar(ctx, padX, padX + spanX, h - 26, m.length, spanX, ampPx / (m.pluck.amplitude * 1000));

  const extension = modalExtension(coefficients, m.length);
  const deltaT = tensionFromExtension(m.youngs, m.coreArea, m.length, extension);
  caption(ctx, `t = ${(t * 1000).toFixed(1)} ms`, padX, 22, PALETTE.rust, 10);
  plainText(ctx, `ΔT = ${deltaT.toFixed(3)} N  ·  ${formatCents(600 * Math.log2(1 + deltaT / m.tension))}`,
    padX + spanX, 22, PALETTE.muted, 10, 'right');
}

/* ---------- Combined ---------- */

function drawCombined(ctx, w, h, m, t) {
  // The vibrating segment carries every correction at once: the fretted
  // tension sets the frequencies, stiffness stretches them, and the pluck's
  // own tension is reported alongside. The displacement is drawn at its true
  // size against the schematic's height scale — no separate exaggeration.
  const frequencies = fillFrequencies(m, true, m.tension + m.fretting.deltaT);
  const coefficients = pluckCoefficients(m, t, frequencies, coefBuffer);
  const y = sumModes(coefficients, MAX_MODES);

  drawFretboard(ctx, w, h, m, (u, i) => y[i], 'all effects combined', m.pluck.amplitude);
}

/* ============================================================================
   10 · SMALL PLOT RENDERER
   Axes, ticks, one or more series, and a hover crosshair with a live readout.
   Hand-written; no charting dependency.
   ========================================================================== */

class SmallPlot {
  constructor(canvas, readoutEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.readout = readoutEl;
    this.spec = null;
    this.hover = null;

    canvas.addEventListener('pointermove', (e) => this.onHover(e));
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      if (this.readout && this.spec) this.readout.textContent = this.spec.idleText || '';
      this.render();
    });
  }

  setSpec(spec) {
    this.spec = spec;
    this.hover = null;
    if (this.readout) this.readout.textContent = spec.idleText || '';
    this.render();
  }

  onHover(event) {
    if (!this.spec || !this.spec.series.length) return;
    const rect = this.canvas.getBoundingClientRect();
    this.hover = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.render();
  }

  render() {
    const spec = this.spec;
    const { ctx, w, h } = syncCanvas(this.canvas);
    ctx.clearRect(0, 0, w, h);
    if (!spec) return;

    const pad = { l: 54, r: 14, t: 14, b: 32 };
    const pw = Math.max(10, w - pad.l - pad.r);
    const ph = Math.max(10, h - pad.t - pad.b);
    const [x0, x1] = spec.xRange;
    const [y0, y1] = spec.yRange;
    const spanX = (x1 - x0) || 1;
    const spanY = (y1 - y0) || 1;
    const px = (x) => pad.l + ((x - x0) / spanX) * pw;
    const py = (y) => pad.t + ph - ((y - y0) / spanY) * ph;

    // --- grid, ticks and axis labels ---
    const ticks = 4;
    const fmtX = tickFormatter(x0, x1, ticks);
    const fmtY = tickFormatter(y0, y1, ticks);

    ctx.save();
    ctx.strokeStyle = 'rgba(244, 239, 229, 0.09)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(172, 180, 197, 0.75)';
    ctx.font = '500 9px "JetBrains Mono", ui-monospace, monospace';
    for (let i = 0; i <= ticks; i++) {
      const yv = lerp(y0, y1, i / ticks);
      const y = py(yv);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(fmtY(yv), pad.l - 7, y + 3);
    }
    for (let i = 0; i <= ticks; i++) {
      const xv = lerp(x0, x1, i / ticks);
      const x = px(xv);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(fmtX(xv), x, pad.t + ph + 15);
    }
    ctx.fillStyle = 'rgba(172, 180, 197, 0.9)';
    ctx.font = '600 9px "DM Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (spec.xLabel) ctx.fillText(spec.xLabel, pad.l + pw / 2, h - 4);
    if (spec.yLabel) {
      ctx.save();
      ctx.translate(12, pad.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(spec.yLabel, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // --- reference lines ---
    for (const line of spec.hLines || []) {
      if (line.y < y0 || line.y > y1) continue;
      ctx.save();
      ctx.strokeStyle = line.color || 'rgba(244, 239, 229, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, py(line.y));
      ctx.lineTo(pad.l + pw, py(line.y));
      ctx.stroke();
      if (line.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = line.color || 'rgba(244, 239, 229, 0.45)';
        ctx.font = '500 9px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(line.label, pad.l + 5, py(line.y) - 4);
      }
      ctx.restore();
    }
    for (const line of spec.vLines || []) {
      if (line.x < x0 || line.x > x1) continue;
      ctx.save();
      ctx.strokeStyle = line.color || 'rgba(244, 239, 229, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px(line.x), pad.t);
      ctx.lineTo(px(line.x), pad.t + ph);
      ctx.stroke();
      ctx.restore();
    }

    // --- series ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    for (const s of spec.series) {
      if (!s.points || !s.points.length) continue;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width || 1.4;

      if (s.type === 'stem') {
        const base = clamp(0, y0, y1);
        for (const pt of s.points) {
          ctx.beginPath();
          ctx.moveTo(px(pt.x), py(base));
          ctx.lineTo(px(pt.x), py(pt.y));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px(pt.x), py(pt.y), s.radius || 2.2, 0, TAU);
          ctx.fill();
        }
      } else if (s.type === 'scatter') {
        for (const pt of s.points) {
          ctx.beginPath();
          ctx.arc(px(pt.x), py(pt.y), s.radius || 2.4, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        s.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(px(pt.x), py(pt.y));
          else ctx.lineTo(px(pt.x), py(pt.y));
        });
        ctx.stroke();
        if (s.dots) {
          for (const pt of s.points) {
            ctx.beginPath();
            ctx.arc(px(pt.x), py(pt.y), s.radius || 2.2, 0, TAU);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();

    // --- legend ---
    if (spec.legend && spec.legend.length) {
      ctx.save();
      ctx.font = '500 9px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      let ly = pad.t + 10;
      for (const entry of spec.legend) {
        ctx.fillStyle = entry.color;
        ctx.fillRect(pad.l + pw - 96, ly - 6, 8, 2);
        ctx.fillStyle = 'rgba(244, 239, 229, 0.55)';
        ctx.fillText(entry.label, pad.l + pw - 84, ly - 2);
        ly += 12;
      }
      ctx.restore();
    }

    // --- hover crosshair ---
    if (this.hover && spec.series[0] && spec.series[0].points.length) {
      const dataX = x0 + ((this.hover.x - pad.l) / pw) * spanX;
      const pts = spec.series[0].points;
      let nearest = pts[0];
      let best = Infinity;
      for (const pt of pts) {
        const d = Math.abs(pt.x - dataX);
        if (d < best) { best = d; nearest = pt; }
      }
      const hx = px(nearest.x);
      const hy = py(nearest.y);
      if (hx >= pad.l - 1 && hx <= pad.l + pw + 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(244, 239, 229, 0.3)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, pad.t);
        ctx.lineTo(hx, pad.t + ph);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.arc(hx, clamp(hy, pad.t, pad.t + ph), 3, 0, TAU);
        ctx.fill();
        ctx.restore();
        if (this.readout && spec.format) this.readout.textContent = spec.format(nearest);
      }
    }

    if (spec.empty) {
      ctx.save();
      ctx.fillStyle = 'rgba(172, 180, 197, 0.55)';
      ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(spec.empty, pad.l + pw / 2, pad.t + ph / 2);
      ctx.restore();
    }
  }
}

/** One decimal count for a whole axis, chosen from its tick spacing. */
function tickFormatter(lo, hi, ticks) {
  const step = Math.abs(hi - lo) / Math.max(1, ticks);
  let decimals = 0;
  if (step < 0.005) decimals = 4;
  else if (step < 0.05) decimals = 3;
  else if (step < 0.5) decimals = 2;
  else if (step < 5) decimals = 1;
  return (v) => (Object.is(v, -0) ? 0 : v).toFixed(decimals);
}

/* ============================================================================
   11 · PAGE CONTROLLER
   ========================================================================== */

/* Every slider, with the parameter it writes and how its value is displayed.
   Two entries are derived rather than stored: the vibrating length and the
   scale length are one geometry seen through the selected fret, so writing
   either one rewrites the other. */
const FIELDS = [
  { id: 'mu', key: 'mu', fmt: (v) => `${v.toFixed(2)} g/m`, group: 'string' },
  { id: 'diameter', key: 'diameter', group: 'string',
    fmt: (v) => `${v.toFixed(2)} mm · .${String(Math.round((v / 25.4) * 1000)).padStart(3, '0')}″` },
  { id: 'core', key: 'core', fmt: (v) => `${(v * 100).toFixed(0)} % of d`, group: 'string' },
  { id: 'youngs', key: 'youngs', fmt: (v) => `${v.toFixed(0)} GPa`, group: 'string' },
  { id: 'tension', key: 'tension', fmt: (v) => `${v.toFixed(1)} N`, group: 'string' },
  { id: 'scale', key: 'scale', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'fret', key: 'fret', fmt: (v) => (v === 0 ? 'open string' : `fret ${v}`) },
  { id: 'length', key: null, fmt: (v) => `${v.toFixed(3)} m` },
  { id: 'action', key: 'action', fmt: (v) => `${v.toFixed(2)} mm` },
  { id: 'fretheight', key: 'fretHeight', fmt: (v) => `${v.toFixed(2)} mm` },
  { id: 'nutheight', key: 'nutHeight', fmt: (v) => `${v.toFixed(2)} mm` },
  { id: 'pressoffset', key: 'pressOffset', fmt: (v) => `${v.toFixed(1)} mm` },
  { id: 'press', key: 'press', fmt: (v) => `${(v * 100).toFixed(0)} % of fret height` },
  { id: 'mode', key: 'mode', fmt: (v) => `n = ${v}` },
  { id: 'amplitude', key: 'amplitude', fmt: (v) => `${v.toFixed(1)} mm` },
  { id: 'partials', key: 'partials', fmt: (v) => `${v} partials` },
  { id: 'pluck', key: 'pluck', fmt: (v) => `${v.toFixed(1)} mm` },
  { id: 'pluckpos', key: 'pluckPos', fmt: (v) => `${(v * 100).toFixed(0)} % of L` },
  { id: 'damping', key: 'damping', fmt: (v) => `${v.toFixed(1)} s⁻¹` },
  { id: 'slow', key: 'slow', fmt: (v) => `1 : ${v.toFixed(0)}` }
];

const TOGGLES = [
  { id: 'components', key: 'components' },
  { id: 'envelope', key: 'envelope' },
  { id: 'superpose', key: 'superpose' }
];

const LEGENDS = {
  ideal: [
    { label: 'Standing wave (resultant)', color: PALETTE.blue },
    { label: 'Travelling component →', color: PALETTE.violet, dashed: false },
    { label: 'Travelling component ←', color: PALETTE.gold },
    { label: 'Envelope', color: PALETTE.blue, dashed: true },
    { label: 'Nodes', color: PALETTE.gold }
  ],
  fret: [
    { label: 'Vibrating segment', color: PALETTE.blue },
    { label: 'Static fretted path', color: PALETTE.rust },
    { label: 'Resting string', color: PALETTE.ink, dashed: true },
    { label: 'Selected fret', color: PALETTE.gold }
  ],
  stiff: [
    { label: 'Stiff string', color: PALETTE.violet },
    { label: 'Perfectly harmonic partials', color: PALETTE.ink, dashed: true },
    { label: 'Nodes (single partial only)', color: PALETTE.gold }
  ],
  pluck: [
    { label: 'Plucked string', color: PALETTE.rust },
    { label: 'Initial triangle', color: PALETTE.gold, dashed: true }
  ],
  all: [
    { label: 'Vibrating segment, all effects', color: PALETTE.blue },
    { label: 'Static fretted path', color: PALETTE.rust },
    { label: 'Resting string', color: PALETTE.ink, dashed: true }
  ]
};

const STAGE_NOTES = {
  ideal: 'The two faint waves travel in opposite directions; their sum is the bright string. Where they always cancel there is a node, which is why only whole numbers of half-wavelengths fit between the clamps.',
  fret: 'The nut-to-fret side of the string is drawn but never vibrates: it contributes to the stretched path, and therefore to the tension, but not to the pitch. Heights are exaggerated by the stated factor — a millimetre of action on a half-metre string would otherwise be invisible.',
  stiff: 'The dim trace behind the string is the same superposition with perfectly harmonic partials. The two drift apart because the stiff partials share no common period, so the waveform never exactly repeats.',
  pluck: `The string is released from the dashed triangle at rest and evolves as a sum of ${MAX_MODES} normal modes. The reported tension is recomputed from the instantaneous shape every frame.`,
  all: 'The fretted length and tension set the frequencies, bending stiffness stretches them, and the decaying pluck adds its own tension on top.'
};

class App {
  constructor() {
    this.params = { ...DEFAULTS };
    this.t = 0;
    this.playing = true;
    this.uiClock = 0;

    this.canvas = document.getElementById('string-canvas');
    this.dom = {
      metrics: document.getElementById('metrics'),
      validation: document.getElementById('validation'),
      legend: document.getElementById('legend'),
      blurb: document.getElementById('model-blurb'),
      stageNote: document.getElementById('stage-note'),
      clock: document.getElementById('clock-readout'),
      slow: document.getElementById('slow-readout'),
      play: document.getElementById('play-toggle'),
      insightHeadline: document.getElementById('insight-headline'),
      insightBody: document.getElementById('insight-body'),
      compareBody: document.querySelector('#compare-table tbody'),
      partialBody: document.querySelector('#partial-table tbody')
    };

    this.plots = {
      frets: new SmallPlot(document.getElementById('plot-frets'), document.getElementById('readout-frets')),
      spectrum: new SmallPlot(document.getElementById('plot-spectrum'), document.getElementById('readout-spectrum')),
      deviation: new SmallPlot(document.getElementById('plot-deviation'), document.getElementById('readout-deviation')),
      tension: new SmallPlot(document.getElementById('plot-tension'), document.getElementById('readout-tension'))
    };

    this.bindControls();
    this.refresh();

    this.loop = this.loop.bind(this);
    this.lastFrame = performance.now();
    requestAnimationFrame(this.loop);

    // Plots are static between parameter changes, so they only redraw on
    // resize; the main canvas redraws every frame anyway.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        Object.values(this.plots).forEach((plot) => plot.render());
      });
      observer.observe(document.getElementById('plot-grid'));
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPlaying(false);
    });
  }

  /* ---------- control binding ---------- */

  bindControls() {
    for (const field of FIELDS) {
      const input = document.getElementById(`in-${field.id}`);
      if (!input) continue;
      field.input = input;
      field.valueEl = document.getElementById(`val-${field.id}`);
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (field.id === 'length') this.setVibratingLength(value);
        else if (field.key) this.params[field.key] = value;
        if (field.group === 'string') this.params.preset = 'custom';
        this.refresh();
      });
    }

    for (const toggle of TOGGLES) {
      const input = document.getElementById(`in-${toggle.id}`);
      if (!input) continue;
      toggle.input = input;
      input.addEventListener('change', () => {
        this.params[toggle.key] = input.checked;
        this.refresh();
      });
    }

    const preset = document.getElementById('in-preset');
    preset.addEventListener('change', () => {
      this.params.preset = preset.value;
      Object.assign(this.params, STRING_PRESETS[preset.value] || {});
      this.refresh();
    });
    this.presetSelect = preset;

    document.querySelectorAll('.model-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.setModel(tab.dataset.model));
    });

    document.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        Object.assign(this.params, STIFFNESS_PRESETS[button.dataset.preset] || {});
        this.params.preset = 'custom';
        this.refresh();
      });
    });

    document.querySelectorAll('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => this.runTool(button.dataset.tool));
    });

    document.getElementById('play-toggle')
      .addEventListener('click', () => this.setPlaying(!this.playing));
    document.getElementById('reset-btn')
      .addEventListener('click', () => { this.t = 0; });
    document.getElementById('defaults-btn').addEventListener('click', () => {
      const model = this.params.model;
      this.params = { ...DEFAULTS, model };
      this.t = 0;
      this.refresh();
    });
  }

  runTool(tool) {
    if (tool === 'mu-from-diameter') {
      // Mass per unit length of a solid steel cylinder of the overall diameter.
      const d = this.params.diameter * 1e-3;
      this.params.mu = clamp(STEEL_DENSITY * Math.PI * d * d / 4 * 1000, 0.15, 9);
      this.params.preset = 'custom';
    } else if (tool === 'tune') {
      // Set the tension that puts the open string on the nearest semitone.
      const m = this.model;
      const midi = Math.round(69 + 12 * Math.log2(m.ideal.openFundamental / A4));
      const target = A4 * Math.pow(2, (midi - 69) / 12);
      const tension = m.mu * Math.pow(2 * m.scale * target, 2);
      this.params.tension = clamp(tension, 20, 260);
      this.params.preset = 'custom';
    } else if (tool === 'replay') {
      this.t = 0;
      this.setPlaying(true);
      return;
    }
    this.refresh();
  }

  /**
   * The vibrating length and the scale length are one geometry seen through
   * the selected fret, so setting either rewrites the other. Rounding to whole
   * millimetres keeps the scale-length slider honest about what it shows.
   */
  setVibratingLength(metres) {
    const ratio = Math.pow(2, -this.params.fret / 12);
    this.params.scale = clamp(Math.round((metres / ratio) * 1000), 500, 900);
  }

  setModel(model) {
    if (!MODEL_BLURBS[model]) return;
    this.params.model = model;
    // The pluck views start from a fresh attack rather than mid-decay.
    if (model === 'pluck' || model === 'all') this.t = 0;
    this.refresh();
  }

  setPlaying(playing) {
    this.playing = playing;
    this.dom.play.textContent = playing ? 'Pause' : 'Play';
    this.dom.play.setAttribute('aria-pressed', String(playing));
  }

  /* ---------- recomputation ---------- */

  refresh() {
    this.model = evaluate(this.params);
    this.syncInputs();
    this.applyModelVisibility();
    this.renderMetrics();
    this.renderValidation();
    this.renderComparison();
    this.renderPartials();
    this.renderInsight();
    this.renderPlots();
    this.renderLegend();
  }

  syncInputs() {
    const p = this.params;
    for (const field of FIELDS) {
      if (!field.input) continue;
      const value = field.id === 'length' ? this.model.length : p[field.key];
      if (Number(field.input.value) !== value) field.input.value = String(value);
      if (field.valueEl) field.valueEl.textContent = field.fmt(value);
    }
    for (const toggle of TOGGLES) {
      if (toggle.input) toggle.input.checked = !!p[toggle.key];
    }
    if (this.presetSelect) this.presetSelect.value = p.preset;
    this.dom.slow.textContent = `1 : ${p.slow} slow motion`;
    this.dom.blurb.textContent = MODEL_BLURBS[p.model];
    this.dom.stageNote.textContent = STAGE_NOTES[p.model];
  }

  /** Only the controls a model actually reads are shown. */
  applyModelVisibility() {
    const model = this.params.model;
    document.querySelectorAll('.model-tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.model === model));
    });
    document.querySelectorAll('[data-models]').forEach((el) => {
      el.hidden = !el.dataset.models.split(' ').includes(model);
    });
    // The ideal string needs no charts, so the whole grid stands down rather
    // than leaving an empty gap behind.
    const grid = document.getElementById('plot-grid');
    grid.hidden = !grid.querySelector('.plot-card:not([hidden])');
  }

  renderMetrics() {
    const m = this.model;
    const model = this.params.model;
    let items;

    if (model === 'ideal') {
      items = [
        { label: 'Wave speed', value: `${m.ideal.speed.toFixed(1)} m/s`, sub: 'v = √(T/μ)' },
        { label: `Wavelength λ${m.mode}`, value: `${(m.ideal.wavelength * 1000).toFixed(1)} mm`, sub: `2L / ${m.mode}` },
        { label: `Frequency f${m.mode}`, value: formatHz(m.ideal.frequency), sub: noteName(m.ideal.frequency) },
        { label: 'Fundamental f₁', value: formatHz(m.ideal.fundamental), sub: noteName(m.ideal.fundamental) },
        { label: 'Nodes', value: String(m.ideal.nodes), sub: 'including both clamps' },
        { label: 'Antinodes', value: String(m.ideal.antinodes), sub: 'one per half-wavelength' },
        { label: 'Vibrating length', value: `${(m.length * 1000).toFixed(1)} mm`, sub: `${m.fret === 0 ? 'open string' : `fret ${m.fret}`}` }
      ];
    } else if (model === 'fret') {
      const applies = m.fretting.applies;
      items = [
        { label: 'Equal-tempered target', value: formatHz(m.fretting.targetFrequency), sub: noteName(m.fretting.targetFrequency) },
        { label: 'Predicted frequency', value: formatHz(m.fretting.frequency), sub: applies ? 'with the added tension' : 'open string' },
        { label: 'Tension rise ΔT', value: applies ? `${m.fretting.deltaT.toFixed(3)} N` : 'n/a', sub: applies ? `${(m.fretting.tensionRatio * 100).toFixed(2)} % of T₀` : 'nothing is pressed' },
        { label: 'Extension ΔL', value: applies ? `${(m.fretting.path.extension * 1e6).toFixed(1)} µm` : 'n/a', sub: 'total path minus resting path' },
        { label: 'Frequency shift', value: applies ? `${m.fretting.deltaHz >= 0 ? '+' : '−'}${Math.abs(m.fretting.deltaHz).toFixed(3)} Hz` : 'n/a', sub: 'against the target' },
        { label: 'Intonation error', value: applies ? formatCents(m.fretting.cents) : 'n/a',
          tone: applies && Math.abs(m.fretting.cents) > AUDIBLE_CENTS ? 'sharp' : 'calm',
          sub: applies
            ? (Math.abs(m.fretting.cents) > AUDIBLE_CENTS ? 'above the audible threshold' : 'below the audible threshold')
            : 'open string' },
        applies
          ? {
            label: 'Reading',
            value: m.fretting.cents >= 0 ? 'sharp' : 'flat',
            sub: `the geometry model predicts this note is ${formatCents(m.fretting.cents, 1)} ${m.fretting.cents >= 0 ? 'sharp' : 'flat'}`
          }
          : {
            label: 'Reading',
            value: 'open',
            sub: 'select a fret from 1 to 24 to press the string down'
          }
      ];
    } else if (model === 'stiff') {
      const sel = m.stiff.selected;
      const top = m.stiff.top;
      items = [
        { label: 'Inharmonicity B', value: m.stiff.B.toExponential(2), sub: 'π³E r⁴ / 4TL²' },
        { label: 'Fundamental f₁', value: formatHz(m.ideal.fundamental), sub: 'ideal, before stiffness' },
        { label: `Partial ${sel.n} · ideal`, value: formatHz(sel.ideal), sub: `${sel.n} × f₁` },
        { label: `Partial ${sel.n} · stiff`, value: formatHz(sel.stiff), sub: `+${sel.deltaHz.toFixed(3)} Hz` },
        { label: `Partial ${sel.n} deviation`, value: formatCents(sel.cents), tone: Math.abs(sel.cents) > AUDIBLE_CENTS ? 'sharp' : 'calm', sub: 'from its harmonic position' },
        { label: `Partial ${top.n} deviation`, value: formatCents(top.cents), tone: Math.abs(top.cents) > AUDIBLE_CENTS ? 'sharp' : 'calm', sub: 'highest partial shown' },
        { label: 'Fundamental shift', value: formatCents(m.stiff.fundamentalCents), sub: 'stiffness lifts even n = 1' }
      ];
    } else if (model === 'pluck') {
      const live = this.liveTension();
      items = [
        { label: 'Initial pitch shift', value: formatCents(m.pluck.meanCents), tone: 'hot', sub: 'cycle-averaged, at t = 0' },
        { label: 'Instantaneous shift', value: formatCents(live.cents), sub: `t = ${(this.t * 1000).toFixed(1)} ms` },
        { label: 'Peak tension rise', value: `${m.pluck.peakDeltaT.toFixed(3)} N`, sub: `${(100 * m.pluck.peakDeltaT / m.tension).toFixed(2)} % of T₀` },
        { label: 'Peak extension', value: `${(m.pluck.peakExtension * 1e6).toFixed(1)} µm`, sub: 'small-slope approximation' },
        { label: 'Nominal pitch', value: formatHz(m.ideal.fundamental), sub: 'once the motion has decayed' },
        { label: 'Current pitch', value: formatHz(live.frequency), sub: 'predicted, not synthesised' },
        { label: 'Model caveat', value: 'approximate', tone: 'hot', sub: 'small-slope, fixed mode shapes, no mode coupling' }
      ];
    } else {
      const live = this.liveTension();
      items = [
        { label: 'Equal-tempered target', value: formatHz(m.combined.targetFrequency), sub: noteName(m.combined.targetFrequency) },
        { label: 'Combined prediction', value: formatHz(m.combined.frequency), sub: 'all three corrections' },
        { label: 'Total deviation', value: formatCents(m.combined.cents), tone: Math.abs(m.combined.cents) > AUDIBLE_CENTS ? 'sharp' : 'calm', sub: 'against the target' },
        { label: 'From fretting', value: m.fretting.applies ? formatCents(m.fretting.cents) : 'n/a', sub: `ΔT = ${m.fretting.deltaT.toFixed(3)} N` },
        { label: 'From stiffness', value: formatCents(m.stiff.fundamentalCents), sub: `B = ${m.stiff.B.toExponential(2)}` },
        { label: 'From amplitude', value: formatCents(m.pluck.meanCents), sub: 'cycle-averaged, at t = 0' },
        { label: 'Instantaneous', value: formatCents(live.cents), sub: `t = ${(this.t * 1000).toFixed(1)} ms` }
      ];
    }

    this.paintMetrics(items);
  }

  /** Tension and pitch from the shape the animation is actually showing. */
  liveTension() {
    const m = this.model;
    const withStiffness = this.params.model === 'all';
    const base = m.tension + (withStiffness ? m.fretting.deltaT : 0);
    const frequencies = fillFrequencies(m, withStiffness, base);
    const coefficients = pluckCoefficients(m, this.t, frequencies, coefBuffer);
    const extension = modalExtension(coefficients, m.length);
    const deltaT = tensionFromExtension(m.youngs, m.coreArea, m.length, extension);
    const tension = base + deltaT;
    let frequency = idealFrequency(1, m.length, tension, m.mu);
    if (withStiffness) frequency *= Math.sqrt(1 + m.stiff.B);
    return {
      deltaT,
      tension,
      frequency,
      cents: 600 * Math.log2(1 + deltaT / m.tension)
    };
  }

  paintMetrics(items) {
    const host = this.dom.metrics;
    if (host.children.length !== items.length) {
      host.innerHTML = items.map(() =>
        '<div class="metric"><span class="metric-label"></span><span class="metric-value"></span><span class="metric-sub"></span></div>'
      ).join('');
    }
    items.forEach((item, index) => {
      const node = host.children[index];
      node.dataset.tone = item.tone || '';
      node.querySelector('.metric-label').textContent = item.label;
      node.querySelector('.metric-value').textContent = item.value;
      node.querySelector('.metric-sub').textContent = item.sub || '';
    });
  }

  renderValidation() {
    const warnings = this.model.warnings;
    const el = this.dom.validation;
    el.hidden = warnings.length === 0;
    el.innerHTML = warnings.map((w) => `<span>${w}</span>`).join('');
  }

  renderLegend() {
    const entries = LEGENDS[this.params.model] || [];
    this.dom.legend.innerHTML = entries.map((entry) =>
      `<span class="key${entry.dashed ? ' is-dashed' : ''}" style="--c:${entry.color}"><i></i>${entry.label}</span>`
    ).join('');
  }

  renderComparison() {
    const m = this.model;
    const rows = [
      {
        model: 'Ideal string',
        quantity: `Fundamental at L = ${(m.length * 1000).toFixed(1)} mm`,
        prediction: formatHz(m.ideal.fundamental),
        shift: '— baseline —',
        cls: 'dim',
        note: `Wave speed ${m.ideal.speed.toFixed(1)} m/s. With nominal fret placement this is also the equal-tempered target, so every other row is read against it.`
      },
      {
        model: 'Fretted geometry',
        quantity: m.fretting.applies ? `Fret ${m.fret}, ΔT = ${m.fretting.deltaT.toFixed(3)} N` : 'Open string',
        prediction: m.fretting.applies ? formatHz(m.fretting.frequency) : 'n/a',
        shift: m.fretting.applies ? formatCents(m.fretting.cents) : 'n/a',
        cls: m.fretting.applies ? (m.fretting.cents >= 0 ? 'sharp' : 'flat') : 'dim',
        note: m.fretting.applies
          ? `The pressed path is ${(m.fretting.path.extension * 1e6).toFixed(1)} µm longer than the resting path, which this model predicts makes the note ${formatCents(m.fretting.cents, 1)} ${m.fretting.cents >= 0 ? 'sharp' : 'flat'}.`
          : 'Nothing is pressed against a fret, so the geometry adds no tension.'
      },
      {
        model: 'Stiff string',
        quantity: `Fundamental, B = ${m.stiff.B.toExponential(2)}`,
        prediction: formatHz(m.ideal.fundamental * Math.sqrt(1 + m.stiff.B)),
        shift: formatCents(m.stiff.fundamentalCents),
        cls: 'sharp',
        note: `Stiffness barely touches the fundamental. Its visible effect is on the overtones: partial ${m.stiff.top.n} is predicted ${formatCents(m.stiff.top.cents, 1)} from its harmonic position.`
      },
      {
        model: 'Amplitude tension',
        quantity: `${(m.pluck.amplitude * 1000).toFixed(1)} mm pluck at ${(m.pluck.position * 100).toFixed(0)} % of L`,
        prediction: formatHz(idealFrequency(1, m.length, m.tension + 0.5 * m.pluck.peakDeltaT, m.mu)),
        shift: formatCents(m.pluck.meanCents),
        cls: 'sharp',
        note: `Cycle-averaged at the moment of release, decaying to zero as the motion dies. The instantaneous peak is ${formatCents(m.pluck.peakCents, 1)}.`
      },
      {
        model: 'All effects',
        quantity: 'Every correction applied together',
        prediction: formatHz(m.combined.frequency),
        shift: formatCents(m.combined.cents),
        cls: m.combined.cents >= 0 ? 'sharp' : 'flat',
        note: 'The three shifts are close to additive in cents because each is small; this row applies them all to the same fundamental.'
      }
    ];

    this.dom.compareBody.innerHTML = rows.map((row) => `
      <tr${row.model.startsWith(this.currentModelName()) ? ' class="is-active"' : ''}>
        <td class="model-cell">${row.model}</td>
        <td>${row.quantity}</td>
        <td>${row.prediction}</td>
        <td class="${row.cls}">${row.shift}</td>
        <td class="note-cell">${row.note}</td>
      </tr>
    `).join('');
  }

  currentModelName() {
    return {
      ideal: 'Ideal', fret: 'Fretted', stiff: 'Stiff', pluck: 'Amplitude', all: 'All'
    }[this.params.model];
  }

  renderPartials() {
    const m = this.model;
    this.dom.partialBody.innerHTML = m.stiff.partials.map((partial) => `
      <tr${partial.n === m.mode ? ' class="is-active"' : ''}>
        <td>${partial.n}</td>
        <td>${formatHz(partial.ideal)}</td>
        <td>${formatHz(partial.stiff)}</td>
        <td>+${partial.deltaHz.toFixed(3)} Hz</td>
        <td class="sharp">${formatCents(partial.cents)}</td>
        <td class="${partial.nearest === partial.n ? 'dim' : 'sharp'}">${partial.nearest}${partial.nearest === partial.n ? '' : ' — drifted'}</td>
      </tr>
    `).join('');
  }

  renderInsight() {
    this.dom.insightHeadline.textContent = this.model.insight.headline;
    this.dom.insightBody.textContent = this.model.insight.body;
  }

  /* ---------- plots ---------- */

  renderPlots() {
    const m = this.model;
    const model = this.params.model;

    if (model === 'fret' || model === 'all') this.renderFretPlot(m);
    if (model === 'stiff' || model === 'all') this.renderSpectrumPlots(m);
    if (model === 'pluck' || model === 'all') this.renderTensionPlot(m);
  }

  renderFretPlot(m) {
    // The setup is held fixed and only the fret varies, so the resting string
    // line is the one already derived — the action at each fret follows from it.
    const points = [];
    for (let f = 1; f <= MAX_FRET; f++) {
      const path = frettedPath(m.geometry, m.fretting.line, f);
      const deltaT = tensionFromExtension(m.youngs, m.coreArea, m.scale, path.extension);
      points.push({ x: f, y: 600 * Math.log2(1 + deltaT / m.tension), deltaT });
    }
    const peak = Math.max(1, ...points.map((pt) => pt.y));

    this.plots.frets.setSpec({
      xRange: [1, MAX_FRET],
      yRange: [0, peak * 1.15],
      xLabel: 'Fret number',
      yLabel: 'Predicted error (cents)',
      series: [{ type: 'line', color: PALETTE.gold, points, dots: true, radius: 2 }],
      vLines: m.fretting.applies ? [{ x: m.fret, color: hexToRgba(PALETTE.blue, 0.5) }] : [],
      hLines: [{ y: AUDIBLE_CENTS, color: hexToRgba(PALETTE.ink, 0.28), label: `${AUDIBLE_CENTS} cents` }],
      idleText: m.fretting.applies
        ? `fret ${m.fret}: ${formatCents(m.fretting.cents)} · ΔT = ${m.fretting.deltaT.toFixed(3)} N`
        : 'open string — select a fret to place the marker',
      format: (pt) => `fret ${pt.x}: ${formatCents(pt.y)} · ΔT = ${pt.deltaT.toFixed(3)} N`
    });
  }

  renderSpectrumPlots(m) {
    const top = m.stiff.top;
    const f1 = m.ideal.fundamental;

    // Plotted against f/f₁ rather than raw hertz, so the ideal partials land on
    // the integers and the stiff ones can be read against them directly. On a
    // hertz axis the two sets differ by well under a pixel for a nearly
    // harmonic string — true, but unreadable. The two series are also mirrored
    // about the axis: they would otherwise sit exactly on top of one another
    // and hide the very comparison the chart exists to make.
    this.plots.spectrum.setSpec({
      xRange: [0.4, m.partialCount + 0.6],
      yRange: [-1.15, 1.15],
      xLabel: 'Frequency in units of the fundamental, f / f₁',
      yLabel: 'ideal ↑    stiff ↓',
      series: [
        {
          type: 'stem', color: PALETTE.violet, width: 1.6, radius: 2.6,
          points: m.stiff.partials.map((p) => ({
            x: p.stiff / f1, y: -1 / Math.sqrt(p.n), n: p.n, hz: p.stiff, cents: p.cents
          }))
        },
        {
          type: 'stem', color: hexToRgba(PALETTE.ink, 0.32), width: 1.2, radius: 2,
          points: m.stiff.partials.map((p) => ({ x: p.n, y: 1 / Math.sqrt(p.n), n: p.n, hz: p.ideal }))
        }
      ],
      vLines: m.stiff.partials.map((p) => ({ x: p.n, color: hexToRgba(PALETTE.ink, 0.14) })),
      legend: [
        { label: 'ideal n f₁', color: hexToRgba(PALETTE.ink, 0.4) },
        { label: 'stiff string', color: PALETTE.violet }
      ],
      idleText: `f₁ = ${formatHz(f1)} · partial ${top.n} lands at ${(top.stiff / f1).toFixed(3)} f₁ instead of ${top.n}`,
      format: (pt) => `partial ${pt.n}: ${formatHz(pt.hz)}` +
        (pt.cents === undefined ? ' (ideal position)' : ` · ${formatCents(pt.cents)} sharp of ${pt.n} f₁`)
    });

    const points = m.stiff.partials.map((p) => ({ x: p.n, y: p.cents, hz: p.stiff }));
    const peak = Math.max(1, ...points.map((pt) => pt.y));
    this.plots.deviation.setSpec({
      xRange: [1, Math.max(2, m.partialCount)],
      yRange: [0, peak * 1.2],
      xLabel: 'Partial number n',
      yLabel: 'Deviation (cents)',
      series: [{ type: 'line', color: PALETTE.violet, points, dots: true, radius: 2.4 }],
      hLines: [{ y: AUDIBLE_CENTS, color: hexToRgba(PALETTE.ink, 0.28), label: `${AUDIBLE_CENTS} cents` }],
      vLines: [{ x: m.mode, color: hexToRgba(PALETTE.gold, 0.4) }],
      idleText: `grows as n² for small B · partial ${top.n}: ${formatCents(top.cents)}`,
      format: (pt) => `partial ${pt.x}: ${formatCents(pt.y)} at ${formatHz(pt.hz)}`
    });
  }

  renderTensionPlot(m) {
    // Analytic over the whole transient rather than recorded frame by frame,
    // so the prediction is complete the moment a control moves.
    const span = Math.max(0.05, m.pluck.window);
    const steps = 160;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * span;
      // Cycle-averaged: <cos^2> = 1/2, and the envelope decays as e^(-2 gamma t).
      const deltaT = 0.5 * m.pluck.peakDeltaT * Math.exp(-2 * m.pluck.damping * t);
      points.push({ x: t * 1000, y: 600 * Math.log2(1 + deltaT / m.tension), deltaT });
    }
    const peak = Math.max(0.5, points[0].y);

    this.plots.tension.setSpec({
      xRange: [0, span * 1000],
      yRange: [0, peak * 1.15],
      xLabel: 'Time after the pluck (ms)',
      yLabel: 'Pitch shift (cents)',
      series: [{ type: 'line', color: PALETTE.rust, points, width: 1.8 }],
      hLines: [{ y: AUDIBLE_CENTS, color: hexToRgba(PALETTE.ink, 0.28), label: `${AUDIBLE_CENTS} cents` }],
      vLines: [{ x: clamp(this.t * 1000, 0, span * 1000), color: hexToRgba(PALETTE.blue, 0.5) }],
      idleText: `starts at ${formatCents(m.pluck.meanCents)} and decays at 2γ = ${(2 * m.pluck.damping).toFixed(1)} s⁻¹`,
      format: (pt) => `${pt.x.toFixed(1)} ms: ${formatCents(pt.y)} · ΔT = ${pt.deltaT.toFixed(3)} N`
    });
  }

  /* ---------- animation ---------- */

  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.05);

    if (this.playing) {
      // Real fundamentals are hundreds of hertz, so physical time advances by
      // the stated slow-motion factor. Every reported number stays physical.
      this.t += dt / Math.max(1, this.params.slow);

      // A decayed pluck has nothing left to show, so it starts again.
      const model = this.params.model;
      if ((model === 'pluck' || model === 'all')
        && Math.exp(-this.model.pluck.damping * this.t) < 0.01) {
        this.t = 0;
      }
    }

    this.render();

    this.uiClock += dt;
    if (this.uiClock > 0.15) {
      this.uiClock = 0;
      this.dom.clock.textContent = `t = ${(this.t * 1000).toFixed(2)} ms`;
      const model = this.params.model;
      if (model === 'pluck' || model === 'all') {
        this.renderMetrics();
        this.renderTensionPlot(this.model);
      }
    }
  }

  render() {
    const { ctx, w, h } = syncCanvas(this.canvas);
    const m = this.model;
    fillBackground(ctx, w, h);
    drawStars(ctx, STARS, w, h);

    switch (this.params.model) {
      case 'ideal':
        drawIdeal(ctx, w, h, m, this.t, this.params);
        break;
      case 'fret': {
        // A single mode on the speaking segment, at the fretted tension.
        const amplitude = m.p.amplitude * 1e-3;
        const frequency = idealFrequency(m.mode, m.length, m.tension + m.fretting.deltaT, m.mu);
        const swing = Math.cos(TAU * frequency * this.t) * amplitude;
        drawFretboard(ctx, w, h, m,
          (u, i) => SHAPE_TABLE[m.mode - 1][i] * swing, 'fretted geometry', amplitude);
        break;
      }
      case 'stiff':
        drawStiff(ctx, w, h, m, this.t, this.params);
        break;
      case 'pluck':
        drawPluck(ctx, w, h, m, this.t);
        break;
      case 'all':
        drawCombined(ctx, w, h, m, this.t);
        break;
      default:
        break;
    }
  }
}

/* ============================================================================
   12 · BOOT
   ========================================================================== */

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
  window.stringApp = new App();
});

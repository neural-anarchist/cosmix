// ============================================================
// TITLE DEBRIS
// The homepage tagline, drawn as one tall line of distant stars: a
// dense cluster of pinpoint lights, like far-off galaxies, that drift
// together into the letterforms, hold, then loosen and dissolve back
// into the dark. Kept faint so the words stay legible without
// competing with anything nearer.
//
// It lives inside the 3D scene, locked to the camera far behind
// everything, so the opaque planets and sun genuinely occlude it and
// the stars draw over it. Depth is sold by three things: the points
// are smaller and dimmer than the real starfield's, the whole line
// slowly recedes (shrinking toward the horizon), and a faint haze sits
// behind the letters like unresolved galactic glow. Glyph positions
// come from rasterising the text offscreen and sampling its opaque
// pixels on a grid; the animation itself runs in the vertex shader off
// a single time uniform.
// ============================================================
import * as THREE from "three";
import { RENDER } from "../config.js";

// Far beyond the outermost orbit even with the camera zoomed out, and
// inside the camera far plane (400) at the end of the recede below.
// Screen size at the start is independent of this: positions are
// projected from this distance, so pushing it out only changes depth.
const LAYER_DISTANCE = 300;

// The line recedes by this many more units over its lifetime, so it
// shrinks toward the horizon as if drifting off into deeper space.
// Keeps LAYER_DISTANCE + RECEDE_DISTANCE under the far plane.
const RECEDE_DISTANCE = 70;

// Between the nebula shell (-10) and the starfield (-8).
const RENDER_ORDER = -9;

// Same palette as the foreground starfield, weighted toward cool
// blue-white: light that has crossed a very long way.
const STAR_COLORS = [
  { color: new THREE.Color(0xffffff), weight: 0.28 },
  { color: new THREE.Color(0xcfe0ff), weight: 0.36 },
  { color: new THREE.Color(0xffe9c4), weight: 0.2 },
  { color: new THREE.Color(0xd7b470), weight: 0.1 },
  { color: new THREE.Color(0xffd0d0), weight: 0.06 }
];
const HAZE_COLOR = new THREE.Color(0x7f95e0);

function pickStarColor() {
  let r = Math.random();
  for (let i = 0; i < STAR_COLORS.length; i += 1) {
    r -= STAR_COLORS[i].weight;
    if (r <= 0) return STAR_COLORS[i].color;
  }
  return STAR_COLORS[0].color;
}

const vertexShader = /* glsl */ `
  attribute vec4 aStart;    // xy start offset, z swirl, w join delay
  attribute vec4 aEnd;      // xy scatter offset, z break delay, w sprite size (css px)
  attribute vec4 aParams;   // x peak alpha, y phase, z twinkle rate, w haze flag
  attribute vec3 aColor;

  uniform float uT;
  uniform float uForm;
  uniform float uHold;
  uniform float uScatter;
  uniform float uPixelRatio;
  uniform float uWobble;
  uniform float uMul;

  varying float vAlpha;
  varying float vSoft;
  varying vec3 vColor;

  float easeOutCubic(float t) {
    float u = 1.0 - t;
    return 1.0 - u * u * u;
  }

  float smooth01(float t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  void main() {
    vec3 pos = position;
    float alpha = aParams.x;
    float grow = 1.0;
    float haze = aParams.w;

    if (uT < uForm) {
      float local = clamp((uT / uForm - aStart.w) / (1.0 - aStart.w), 0.0, 1.0);
      float e = easeOutCubic(local);
      // Rotating the start offset as it shrinks makes the stars
      // spiral in rather than travel in straight lines.
      float rot = aStart.z * (1.0 - e);
      float c = cos(rot);
      float s = sin(rot);
      pos.xy += vec2(aStart.x * c - aStart.y * s, aStart.x * s + aStart.y * c) * (1.0 - e);
      alpha *= smooth01(local * 1.6);
      // Each star swells from a faint speck as it arrives, with a
      // brief flare as it settles, like a light igniting.
      grow = mix(0.45, 1.0, smooth01(local));
      float flare = (local - 0.88) / 0.09;
      alpha *= 1.0 + (1.0 - haze) * 0.7 * exp(-flare * flare);
    } else if (uT > uForm + uHold) {
      float local = clamp(
        ((uT - uForm - uHold) / uScatter - aEnd.z) / (1.0 - aEnd.z), 0.0, 1.0
      );
      pos.xy += aEnd.xy * easeOutCubic(local);
      alpha *= 1.0 - smooth01(local);
      grow = 1.0 - 0.45 * smooth01(local);
    }

    // Stars scintillate at their own rates, so the line glitters
    // instead of pulsing; haze only breathes slowly.
    float sec = uT / 1000.0;
    float tw = sin(sec * (1.4 + aParams.z * 4.6) + aParams.y);
    alpha *= mix(0.6 + 0.4 * tw, 0.9 + 0.1 * sin(sec * 0.7 + aParams.y), haze);
    // Far stars do not jitter; only the faintest drift.
    pos.x += sin(sec * 0.9 + aParams.y) * uWobble;
    pos.y += cos(sec * 0.8 + aParams.y) * uWobble;

    vAlpha = alpha * uMul;
    vSoft = haze;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = max(aEnd.w * grow * uPixelRatio, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vSoft;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    // Stars: a hard bright core inside a faint halo. Haze: a wide,
    // featureless glow.
    float star = exp(-d * d * 9.0) + pow(clamp(1.0 - d, 0.0, 1.0), 3.0) * 0.3;
    float glow = exp(-d * d * 3.2) * clamp(1.0 - d, 0.0, 1.0);
    float a = vAlpha * mix(star, glow, vSoft);
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

// The title is one line, fitted to ~94% of the viewport width, then
// stretched vertically so the letters read tall and condensed.
const WIDTH_FRACTION = 0.94;
const STRETCH = 2.1;

// Vertical centre of the line as a fraction of viewport height from
// the top: the middle of the page raised by a sixth (plus a hair to
// make up for the taller letters), so the sun (which sits at the
// middle) doesn't cover any of the words.
const CENTER_Y_FRACTION = 1 / 2 - 1 / 6 - 0.015;

function sampleGlyphs(text, fontFamily, width, height) {
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const ctx = off.getContext("2d", { willReadFrequently: true });

  const REF = 100;
  ctx.font = "400 " + REF + "px " + fontFamily;
  const size = (REF * width * WIDTH_FRACTION) / ctx.measureText(text).width;

  ctx.font = "400 " + size + "px " + fontFamily;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";

  // Centred horizontally; the vertical scale stretches the glyphs
  // about the line's own centre.
  ctx.translate(width / 2, height * CENTER_Y_FRACTION);
  ctx.scale(1, STRETCH);
  ctx.fillText(text, 0, 0);

  // Grid pitch scales with type size so the star count stays in the
  // tens of thousands whatever the screen. The pitch is fine because
  // each star is only a point or two wide.
  const gap = Math.max(1.1, (size * STRETCH) / 110);
  const data = ctx.getImageData(0, 0, width, height).data;
  const points = [];
  for (let y = 0; y < height; y += gap) {
    for (let x = 0; x < width; x += gap) {
      if (data[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 128) {
        points.push(x, y);
      }
    }
  }
  return { points: points, gap: gap, size: size };
}

// Adds the effect to the scene and returns a promise that resolves
// once it has played out and been removed. Rejects if it can't be
// built, so the caller can fall back to plain text.
export function playTitleDebris(scene, camera, renderer, text, fontFamily, timings) {
  const formMs = timings.form;
  const holdMs = timings.hold;
  const scatterMs = timings.scatter;
  const totalMs = formMs + holdMs + scatterMs;

  return new Promise(function (resolve, reject) {
    let mesh = null;
    try {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const glyphs = sampleGlyphs(text, fontFamily, width, height);
      const count = glyphs.points.length / 2;
      if (count === 0) throw new Error("no glyph pixels");

      // Screen pixels -> world units on the plane the layer sits on.
      const viewHeight = 2 * LAYER_DISTANCE * Math.tan(THREE.MathUtils.degToRad(RENDER.fov / 2));
      const k = viewHeight / height;

      // Three populations share one buffer: the stars that form the
      // letters, a sparse scatter of dim stars just around them (the
      // cluster's ragged edge), and a few very faint wide glows behind
      // the letters, like galaxies too far away to resolve.
      const dustCount = Math.round(count * 0.1);
      const hazeCount = Math.min(110, Math.max(45, Math.round(count / 450)));
      const total = count + dustCount + hazeCount;

      const position = new Float32Array(total * 3);
      const start = new Float32Array(total * 4);
      const end = new Float32Array(total * 4);
      const params = new Float32Array(total * 4);
      const colors = new Float32Array(total * 3);

      // Everything is scaled by type size so the effect looks the
      // same at any resolution.
      const unit = glyphs.size / 100;
      const starScale = Math.min(1.4, Math.max(0.8, unit));

      for (let i = 0; i < total; i += 1) {
        const isHaze = i >= count + dustCount;
        const isDust = !isHaze && i >= count;

        // Letter stars sit on their sampled point, jittered within
        // their grid cell so the grid never shows. Dust and haze hang
        // off a random letter point instead.
        let px;
        let py;
        if (i < count) {
          px = glyphs.points[i * 2] + (Math.random() - 0.5) * glyphs.gap;
          py = glyphs.points[i * 2 + 1] + (Math.random() - 0.5) * glyphs.gap;
        } else {
          const anchor = Math.floor(Math.random() * count);
          const spread = (isHaze ? 10 : 22 + Math.random() * 30) * unit;
          const theta = Math.random() * Math.PI * 2;
          const r = spread * Math.sqrt(Math.random());
          px = glyphs.points[anchor * 2] + Math.cos(theta) * r;
          py = glyphs.points[anchor * 2 + 1] + Math.sin(theta) * r;
        }
        position[i * 3] = (px - width / 2) * k;
        position[i * 3 + 1] = -(py - height / 2) * k;

        const startAngle = Math.random() * Math.PI * 2;
        const startRadius = (90 + Math.random() * 330) * unit;
        start[i * 4] = Math.cos(startAngle) * startRadius * k;
        start[i * 4 + 1] = -Math.sin(startAngle) * startRadius * k;
        start[i * 4 + 2] = (Math.random() - 0.5) * 1.2;
        start[i * 4 + 3] = Math.random() * 0.4;

        // Scatter leans away from the title's centre and dissolves
        // over a short distance, like the cluster thinning out.
        const outward = Math.atan2(py - height * CENTER_Y_FRACTION, px - width / 2);
        const scatterAngle = outward + (Math.random() - 0.5) * 1.6;
        const scatterDist = (18 + Math.random() * 80) * unit;
        end[i * 4] = Math.cos(scatterAngle) * scatterDist * k;
        end[i * 4 + 1] = -Math.sin(scatterAngle) * scatterDist * k;
        end[i * 4 + 2] = Math.random() * 0.4;

        // Bright stars are rare and slightly larger, as in the real
        // starfield; most are faint specks.
        const lum = Math.pow(Math.random(), 2.5);
        let size;
        let alpha;
        if (isHaze) {
          size = (34 + Math.random() * 60) * unit;
          alpha = 0.07 + Math.random() * 0.07;
        } else if (isDust) {
          size = (1.2 + Math.random() * 0.8) * starScale;
          alpha = 0.12 + Math.random() * 0.16;
        } else {
          size = (1.3 + lum * 2.4) * starScale;
          alpha = 0.42 + Math.random() * 0.34 + lum * 0.3;
        }
        end[i * 4 + 3] = size;

        params[i * 4] = alpha;
        params[i * 4 + 1] = Math.random() * Math.PI * 2;
        params[i * 4 + 2] = Math.random();
        params[i * 4 + 3] = isHaze ? 1 : 0;

        const color = isHaze ? HAZE_COLOR : pickStarColor();
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
      geometry.setAttribute("aStart", new THREE.BufferAttribute(start, 4));
      geometry.setAttribute("aEnd", new THREE.BufferAttribute(end, 4));
      geometry.setAttribute("aParams", new THREE.BufferAttribute(params, 4));
      geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
          uT: { value: 0 },
          uForm: { value: formMs },
          uHold: { value: holdMs },
          uScatter: { value: scatterMs },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uWobble: { value: 0.12 * unit * k },
          uMul: { value: 1 }
        }
      });

      mesh = new THREE.Points(geometry, material);
      mesh.renderOrder = RENDER_ORDER;
      mesh.frustumCulled = false;
      mesh.position.set(0, 0, -LAYER_DISTANCE);

      // Receding shrinks the line toward the screen centre, which would
      // drag it down toward the sun. Lifting the layer by the same
      // ratio keeps the line's on-screen height fixed while it shrinks.
      const lineY = (height / 2 - height * CENTER_Y_FRACTION) * k;

      // Being a child of the camera keeps it centred on screen no
      // matter how the user orbits; the camera must be in the scene
      // graph for its children to be drawn.
      if (!camera.parent) scene.add(camera);
      camera.add(mesh);

      const startedAt = performance.now();
      let focusMul = 1;

      const uniforms = material.uniforms;
      mesh.onBeforeRender = function () {
        const elapsed = performance.now() - startedAt;
        uniforms.uT.value = elapsed;
        const distance = LAYER_DISTANCE + RECEDE_DISTANCE * Math.min(elapsed / totalMs, 1);
        mesh.position.z = -distance;
        mesh.position.y = lineY * (distance / LAYER_DISTANCE - 1);
        uniforms.uPixelRatio.value = renderer.getPixelRatio();

        // Fade out while a world is selected, matching the hero.
        const focused = document.body.classList.contains("is-focused");
        focusMul += ((focused ? 0 : 1) - focusMul) * 0.12;
        uniforms.uMul.value = focusMul;

        if (elapsed >= totalMs) {
          // Removing mid-render is unsafe; do it on the next tick.
          setTimeout(finish, 0);
        }
      };

      let finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        window.removeEventListener("resize", finish);
        camera.remove(mesh);
        geometry.dispose();
        material.dispose();
        resolve();
      }

      // Glyph positions were sampled for this viewport size; rather
      // than rebuild mid-flight, end the effect if the window changes.
      window.addEventListener("resize", finish);
    } catch (err) {
      if (mesh) camera.remove(mesh);
      reject(err);
    }
  });
}

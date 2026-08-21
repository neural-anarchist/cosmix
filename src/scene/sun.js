// ============================================================
// THE STAR AT THE CENTRE
// An animated fBm stellar surface wrapped in a Fresnel corona,
// with the original gold wireframe lattice kept as an accent —
// it reads as a *constructed* object, which suits an academy.
// ============================================================
import * as THREE from "three";
import { SUN, PALETTE } from "../config.js";
import { NOISE_CHUNK } from "./glsl.js";
import { makeSunTexture, makeGlowSprite } from "./textures.js";

function createSurface(radius) {
  const material = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: makeSunTexture() },
      uHot: { value: new THREE.Color(0xffeab0) },
      uMid: { value: new THREE.Color(0xf5a94b) },
      uCool: { value: new THREE.Color(0xc44714) }
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalObj;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        // Object space drives the noise, so granulation is fixed to the
        // sphere and turns with it. View space drives limb darkening.
        vNormalObj = normalize(normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uMap;
      uniform vec3 uHot;
      uniform vec3 uMid;
      uniform vec3 uCool;

      varying vec3 vNormalObj;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec2 vUv;

      ${NOISE_CHUNK}

      void main() {
        vec3 n = normalize(vNormalObj);
        float t = uTime * 0.09;

        // Granulation: slow large cells with faster fine structure.
        float cells = cxFbm3(n * 3.6 + vec3(t * 0.4, -t * 0.3, t * 0.2));
        float fine = cxFbm3(n * 11.0 + vec3(-t, t * 0.7, t * 0.5));
        float heat = clamp(cells * 0.75 + fine * 0.45, 0.0, 1.0);

        vec3 col = mix(uCool, uMid, smoothstep(0.18, 0.62, heat));
        col = mix(col, uHot, smoothstep(0.58, 0.95, heat));

        // The procedural map supplies the base tint variation.
        vec3 baseMap = texture2D(uMap, vUv).rgb;
        col = mix(col, col * baseMap * 1.6, 0.35);

        // Bright flare veins that crawl over the surface. Kept
        // restrained — pushed harder they blow the disc out to white
        // once bloom and tone mapping are applied.
        float veins = pow(smoothstep(0.76, 1.0, fine), 2.0);
        col += uHot * veins * 0.28;

        // Limb darkening: the disc edge falls off toward the viewer,
        // which is what stops it reading as a flat pasted circle.
        float limb = abs(dot(normalize(vNormalView), normalize(vViewDir)));
        col *= mix(0.6, 1.0, smoothstep(0.0, 0.8, limb));

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), material);
  return { mesh, material };
}

function createCorona(radius) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffb765) },
      uIntensity: { value: 0.5 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalV;
      varying vec3 vViewDir;

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;

      varying vec3 vNormalV;
      varying vec3 vViewDir;

      void main() {
        float rim = 1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir)));
        float glow = pow(rim, 2.6);
        float breathe = 0.88 + 0.12 * sin(uTime * 0.8);
        gl_FragColor = vec4(uColor, glow * uIntensity * breathe);
      }
    `
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.34, 48, 48),
    material
  );
  return { mesh, material };
}

export function createSun(scene) {
  const group = new THREE.Group();
  const radius = SUN.radius;

  const surface = createSurface(radius);
  const corona = createCorona(radius);

  // Retained from the original design: a gold geodesic cage.
  const lattice = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 1.18, 3),
    new THREE.MeshBasicMaterial({
      color: PALETTE.gold,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      fog: false
    })
  );

  const latticeOuter = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 1.42, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffcf7d,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      fog: false
    })
  );

  const halo = makeGlowSprite(0xffa94c, radius * 4.2);
  halo.renderOrder = -2;

  group.add(surface.mesh, corona.mesh, lattice, latticeOuter, halo);
  group.userData = { world: SUN, isSun: true };
  scene.add(group);

  const light = new THREE.PointLight(0xffe3ab, 260, 90, 2);
  light.position.set(0, 0, 0);
  scene.add(light);

  return {
    group,
    // Only the solid surface should be raycast — the corona and halo
    // are additive shells that would otherwise swallow every click.
    pickTargets: [surface.mesh, lattice],
    update(elapsed, delta, moving) {
      surface.material.uniforms.uTime.value = elapsed;
      corona.material.uniforms.uTime.value = elapsed;

      if (!moving) return;
      const step = delta * 60;
      surface.mesh.rotation.y += 0.0004 * step;
      lattice.rotation.y += 0.0015 * step;
      lattice.rotation.x += 0.0006 * step;
      latticeOuter.rotation.y -= 0.0009 * step;
      latticeOuter.rotation.x -= 0.0004 * step;
    }
  };
}

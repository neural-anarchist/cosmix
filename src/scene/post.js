// ============================================================
// POST-PROCESSING
// Bloom retuned so only genuine highlights bloom (the old
// threshold of 0.15 bloomed essentially the whole frame), then a
// combined vignette + film grain pass to seat everything.
// ============================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RENDER } from "../config.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: RENDER.vignette },
    uGrain: { value: RENDER.grain }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      vec2 p = vUv - 0.5;
      float falloff = smoothstep(0.92, 0.18, length(p) * 1.32);
      color.rgb *= mix(1.0, falloff, uVignette);

      // Animated hash grain — breaks up banding in the dark gradients.
      float g = fract(
        sin(dot(vUv + fract(uTime * 0.37), vec2(12.9898, 78.233))) * 43758.5453
      );
      color.rgb += (g - 0.5) * uGrain;

      gl_FragColor = color;
    }
  `
};

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    RENDER.bloom.strength,
    RENDER.bloom.radius,
    RENDER.bloom.threshold
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    update(elapsed) {
      grade.uniforms.uTime.value = elapsed;
    },
    setSize(width, height) {
      composer.setSize(width, height);
      bloom.setSize(width, height);
    },
    render() {
      composer.render();
    }
  };
}

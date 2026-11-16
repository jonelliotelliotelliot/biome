// Flora: the look. Everything about how the plant is *drawn* lives here; what it is and how it moves is main.js.
//   painted shadows   leaves and flowers drop crisp, flat, hue-shifted shadow shapes on whatever is under them
//   aerial depth      what's further from the camera drifts toward the sky colour
//   a place to stand  a sky wash and a pool of ground tone that fades out, with a palette-tinted shadow on it
//   grain             the same per-pixel paper grain as the original, on every material
import * as THREE from 'three';

// ───────────────────────── tunables
export const SHADOW = {
  size: 3072,          // shadow map resolution (it covers `reach` units either side of the plant)
  reach: 3.5,
  near: 1, far: 25,
  bias: 0.012,         // how far (world units) a caster must be in front of a surface that faces the sun…
  biasAway: 0.11,      // …and of one that faces away (wider than a stem, so a stem never shades its own far side)
};
// ───────────────────────── shared uniforms: every surface material gets these (see shaderMat in main.js)
export const LU = {
  uShadowMap: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadow: { value: new THREE.Vector4(0, 1 / SHADOW.size, 0, 0) },   // on, texel size, bias, bias facing away (both in depth units)
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uGrain: { value: 0.095 },                             // paper grain strength
  uShade: { value: 0.75 },                              // strength of the painted shadows
  uAir: { value: new THREE.Vector3(0, 10, 0.3) },       // aerial depth: starts at, full at, strength
  uShadeCol: { value: new THREE.Vector3(0.72, 0.66, 0.9) },   // (these two are swapped for palette swatches by linkPalette)
  uAirCol: { value: new THREE.Vector3(1, 1, 1) },
};
export function linkPalette({ shade, air }) { LU.uShadeCol = shade; LU.uAirCol = air; }

// ───────────────────────── GLSL shared by every surface material
export const SH_V = 'varying vec3 vWp;\n';
// (a vertex shader works out its world position `wp`, then ends with this)
export const BEND = 'vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;';
// (a fragment shader sets gl_FragColor, then ends with this)
export const FINISH = 'gl_FragColor.rgb = fableFinish(gl_FragColor.rgb);';
export const SH_F = `
uniform float uGrain;
float grainHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
#ifdef FABLE_SURF
varying vec3 vWp;
uniform sampler2D uShadowMap; uniform mat4 uShadowMatrix; uniform vec4 uShadow; uniform vec3 uSunDir;
uniform float uShade; uniform vec3 uShadeCol; uniform vec3 uAir; uniform vec3 uAirCol;
float fDepth(vec2 uv) { return dot(texture2D(uShadowMap, uv), vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0)); }
float fLit(vec2 uv, float z) {   // one bilinear-weighted look at the shadow map
  float t = uShadow.y;
  vec2 st = uv / t - 0.5, f = fract(st), b = (floor(st) + 0.5) * t;
  float l00 = step(z, fDepth(b)), l10 = step(z, fDepth(b + vec2(t, 0.0))), l01 = step(z, fDepth(b + vec2(0.0, t))), l11 = step(z, fDepth(b + vec2(t)));
  return mix(mix(l00, l10, f.x), mix(l01, l11, f.x), f.y);
}
// 0 = in the sun, 1 = in shadow, soft-edged over about "spread" texels. Four bilinear looks in a turned square add up
// to a smooth (quadratic) filter, so when it's thresholded for a crisp painted edge, the edge follows a curve, not texel steps
float fableShadow(float spread) {
  if (uShadow.x < 0.5) return 0.0;
  vec3 n = normalize(cross(dFdx(vWp), dFdy(vWp)));
  if (dot(n, cameraPosition - vWp) < 0.0) n = -n;
  vec4 sc = uShadowMatrix * vec4(vWp + n * 0.004, 1.0);
  if (any(greaterThan(abs(sc.xy - 0.5), vec2(0.495)))) return 0.0;
  float z = sc.z - mix(uShadow.w, uShadow.z, smoothstep(-0.1, 0.6, dot(n, uSunDir)));
  float o = spread * uShadow.y;
  float lit = fLit(sc.xy + vec2(-o, -o * 0.4), z) + fLit(sc.xy + vec2(o, o * 0.4), z)
            + fLit(sc.xy + vec2(o * 0.4, -o), z) + fLit(sc.xy + vec2(-o * 0.4, o), z);
  return 1.0 - lit * 0.25;
}
// the second tone: deeper and more saturated, leaning toward the palette's shade colour (never just greyer)
vec3 fableShade(vec3 c) { return pow(c, vec3(1.25)) * mix(vec3(1.0), uShadeCol, 0.85); }
#endif
vec3 fableFinish(vec3 c) {
#ifdef FABLE_SURF
  float s = fableShadow(0.85);
  float w = clamp(fwidth(s) * 0.9, 0.03, 0.5);
  c = mix(c, fableShade(c), smoothstep(0.5 - w, 0.5 + w, s) * uShade);
  float z = -(viewMatrix * vec4(vWp, 1.0)).z;
  c = mix(c, uAirCol, uAir.z * smoothstep(uAir.x, uAir.y, z));
#endif
  return c + (grainHash(gl_FragCoord.xy) - 0.5) * uGrain;
}
`;

// ───────────────────────── sun: the only light, and it only exists to cast shadows
export function makeSun(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(2.5, 9, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW.size, SHADOW.size);
  Object.assign(sun.shadow.camera, { left: -SHADOW.reach, right: SHADOW.reach, top: SHADOW.reach, bottom: -SHADOW.reach, near: SHADOW.near, far: SHADOW.far });
  scene.add(sun);
  LU.uSunDir.value.copy(sun.position).normalize();
  LU.uShadow.value.z = SHADOW.bias / (SHADOW.far - SHADOW.near);
  LU.uShadow.value.w = SHADOW.biasAway / (SHADOW.far - SHADOW.near);
  return sun;
}
export function syncShadow(sun) {   // each frame, before drawing: hand the materials last frame's shadow map
  const map = sun.shadow.map;
  LU.uShadowMap.value = map ? map.texture : null;
  LU.uShadow.value.x = map ? 1 : 0;
  LU.uShadowMatrix.value.copy(sun.shadow.matrix);
}

// ───────────────────────── backdrop: a sky wash behind everything, and a pool of ground tone that fades out into it
export function makeBackdrop(scene, { sky, skyTop, ground }) {
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uSky: sky, uTop: skyTop },
    vertexShader: `varying vec3 vDir;
void main() {
  vec4 p = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
  vDir = transpose(mat3(viewMatrix)) * (p.xyz / p.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`,
    fragmentShader: `uniform vec3 uSky; uniform vec3 uTop; varying vec3 vDir;
void main() {   // the horizon colour low down, washing up into the top colour (so it shifts as you orbit)
  float t = smoothstep(-0.14, 0.6, normalize(vDir).y);
  gl_FragColor = vec4(mix(uSky, uTop, t) + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0, 1.0);   // (a hair of dither: no banding)
}`,
    depthTest: false, depthWrite: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  skyMesh.frustumCulled = false; skyMesh.renderOrder = -10; skyMesh.raycast = () => {};
  scene.add(skyMesh);

  const pool = { uGround: ground, uPool: { value: new THREE.Vector3(0, 0, 3) } };   // centre x, z and radius of the pool
  const groundMat = new THREE.ShaderMaterial({
    uniforms: { ...LU, ...pool },
    defines: { FABLE_SURF: '' },
    vertexShader: SH_V + `void main() { vec4 wp = modelMatrix * vec4(position, 1.0); ${BEND} }`,
    fragmentShader: SH_F + `uniform vec3 uGround; uniform vec3 uPool;
void main() {
  float r = length(vWp.xz - uPool.xy) / uPool.z;
  float a = 1.0 - smoothstep(0.12, 1.0, r);
  a *= a;
  float s = fableShadow(3.0) * uShade;   // soft here, not crisp: the ground is the quiet part
  float gr = grainHash(gl_FragCoord.xy) - 0.5;
  s *= 1.0 + gr * uGrain * 7.0;                // grain speckles the shadow's edge, as it always has
  vec3 c = mix(uGround, fableShade(uGround), s) + gr * uGrain * a;
  gl_FragColor = vec4(c, max(a, s * 0.9));
}`,
    transparent: true,
  });
  const groundMesh = new THREE.Mesh(new THREE.CircleGeometry(140, 48).rotateX(-Math.PI / 2), groundMat);
  groundMesh.renderOrder = -5;
  scene.add(groundMesh);
  return { sky: skyMesh, ground: groundMesh, setPool(x, z, r) { pool.uPool.value.set(x, z, r); } };
}

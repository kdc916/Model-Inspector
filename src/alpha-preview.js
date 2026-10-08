/** Independent vertex-alpha preview for PBR, checker and UV-grid materials. */
export const ALPHA_OVERLAY_MODES = Object.freeze(['tint','gray','mask']);

export function overlayState(checked, view, strength, hasAlpha, surfaceMode) {
  const active = Boolean(checked && hasAlpha && ['material','checker','uvgrid'].includes(surfaceMode));
  const mode = ALPHA_OVERLAY_MODES.includes(view) ? view : 'tint';
  const opacity = Math.min(1, Math.max(0, Number.isFinite(Number(strength)) ? Number(strength) : 0.55));
  return {
    mode: active ? (mode === 'tint' ? 1 : mode === 'gray' ? 2 : 0) : 0,
    strength: opacity,
    active, modeName: mode,
  };
}
/** Alpha mask is only used for transparency modes; visual overlay does not hide geometry in Opaque. */
export function alphaMaskFactor(active, transparencyMode, hasAlpha, isRGBAAlreadyConsumed = false) {
  return active && hasAlpha && !isRGBAAlreadyConsumed && ['blend','add','premultiply','multiply','screen','mask'].includes(transparencyMode) ? 1 : 0;
}
/** Pure function: keep shader patching checks readable and testable. */
export function overlayShaderSupported(material) {
  return Boolean(material && (material.isMeshBasicMaterial || material.isMeshStandardMaterial || material.isMeshPhysicalMaterial));
}
/** Hook is installed once per material, with the shader uniforms updated in place. */
export function installAlphaShader(material, THREE) {
  if (!overlayShaderSupported(material) || material.userData?.vfxAlphaShader) return;
  const uniforms = {
    vfxAlphaOverlayMode: {value: 0},
    vfxAlphaOverlayStrength: {value: 0.55},
    vfxAlphaMaskFactor: {value: 0},
    vfxMaskWeights: {value: [0,1,0,0]},
    vfxMaskInvert: {value: 0},
  };
  const previous = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function(shader, renderer) {
    if (previous) previous.call(this, shader, renderer);
    if (!shader.vertexShader.includes('#include <begin_vertex>') ||
        !shader.fragmentShader.includes('#include <color_fragment>') ||
        !shader.fragmentShader.includes('#include <alphamap_fragment>')) return;
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float vfxInspectionAlpha; varying float vfxAlphaValue;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vfxAlphaValue = vfxInspectionAlpha;');
    shader.fragmentShader = `varying float vfxAlphaValue; uniform float vfxAlphaOverlayMode; uniform float vfxAlphaOverlayStrength; uniform float vfxAlphaMaskFactor; uniform vec4 vfxMaskWeights; uniform float vfxMaskInvert;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       float vfxA = clamp(vfxAlphaValue,0.0,1.0);
       if (vfxAlphaOverlayMode > 0.5 && vfxAlphaOverlayMode < 1.5) {
         vec3 vfxTint = mix(vec3(0.96,0.16,0.28),vec3(0.14,0.91,0.65),vfxA);
         diffuseColor.rgb = mix(diffuseColor.rgb,vfxTint,vfxAlphaOverlayStrength);
       } else if (vfxAlphaOverlayMode > 1.5) {
         diffuseColor.rgb = mix(diffuseColor.rgb,vec3(vfxA),vfxAlphaOverlayStrength);
       }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>',
      `#ifdef USE_ALPHAMAP
         float vfxTextureMask = dot(texture2D(alphaMap, vAlphaMapUv), vfxMaskWeights);
         diffuseColor.a *= mix(vfxTextureMask, 1.0-vfxTextureMask, vfxMaskInvert);
       #endif
       diffuseColor.a *= mix(1.0,clamp(vfxAlphaValue,0.0,1.0),vfxAlphaMaskFactor);`);
  };
  material.customProgramCacheKey = () => `${priorKey()}|maxvfx-alpha-preview-v2`;
  material.userData.vfxAlphaShader = uniforms;
  material.needsUpdate = true;
}
export function updateAlphaShaderUniforms(material, {mode = 0, strength = 0.55, mask = 0, channel='g', invert=false} = {}) {
  const params=material?.userData?.vfxAlphaShader;
  if (!params) return;
  params.vfxAlphaOverlayMode.value=mode;
  params.vfxAlphaOverlayStrength.value=strength;
  params.vfxAlphaMaskFactor.value=mask;
  params.vfxMaskWeights.value={r:[1,0,0,0],g:[0,1,0,0],b:[0,0,1,0],a:[0,0,0,1]}[channel]||[0,1,0,0];
  params.vfxMaskInvert.value=invert?1:0;
}

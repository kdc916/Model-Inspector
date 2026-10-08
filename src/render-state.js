/** Renderer-side material transitions, independent of DOM, source geometry and UI. */
import { blendSettings } from './production-core.js';
import { effectiveAlphaMode } from './alpha-preview.js';

/** Decide the effective blend state, without mutating imported source materials. */
export function resolvePreviewBlend(mode, overlay, hasAlpha, opacity, cutoff, depthTest, depthWrite, cull) {
  const effective = effectiveAlphaMode(mode, Boolean(overlay), Boolean(hasAlpha));
  const forceAlphaBlend = mode === 'opaque' && effective === 'blend';
  return { ...blendSettings(effective,opacity,cutoff,depthTest,forceAlphaBlend?false:depthWrite,cull),
    requestedMode: mode, autoAlphaBlend: forceAlphaBlend };
}
/** Use normal blending for the standard alpha case. The other blend equations are explicit. */
export function applyPreviewBlend(material, THREE, config) {
  material.transparent=config.transparent;
  material.opacity=config.opacity;
  material.alphaTest=config.alphaTest;
  material.depthTest=config.depthTest;
  material.depthWrite=config.depthWrite;
  material.side=config.cull==='double'?THREE.DoubleSide:config.cull==='front'?THREE.FrontSide:THREE.BackSide;
  material.premultipliedAlpha=config.mode==='premultiply';
  material.blending=config.mode==='add'?THREE.AdditiveBlending:
    config.mode==='multiply'?THREE.MultiplyBlending:THREE.NormalBlending;
  if(config.mode==='premultiply'||config.mode==='screen'){
    material.blending=THREE.CustomBlending;
    material.blendEquation=THREE.AddEquation;
    material.blendSrc=THREE.OneFactor;
    material.blendDst=config.mode==='premultiply'?THREE.OneMinusSrcAlphaFactor:THREE.OneMinusSrcColorFactor;
    material.blendEquationAlpha=THREE.AddEquation;
    material.blendSrcAlpha=THREE.OneFactor;
    material.blendDstAlpha=THREE.OneMinusSrcAlphaFactor;
  }
  // Retain the authored mode so turning the vertex-alpha preview OFF restores it.
  material.userData.vfxAlphaMode=config.requestedMode;
  material.userData.vfxAutoAlphaBlend=config.autoAlphaBlend;
  material.needsUpdate=true;
  return material;
}

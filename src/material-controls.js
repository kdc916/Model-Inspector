/** Pure material-control specs and conversion helpers (no Three.js dependency). */
export const MATERIAL_RANGES=Object.freeze({
  baseStrength:[0,2,1],roughness:[0,1,.65],metalness:[0,1,0],
  normalStrength:[-2,2,1],aoMapIntensity:[0,3,1],emissiveIntensity:[0,15,1],
  bumpScale:[-2,2,.05],displacementScale:[-1,1,0],displacementBias:[-1,1,0],
  opacity:[0,1,1],alphaCutoff:[0,1,.5]
});
export const TEXTURE_SLOTS=Object.freeze(['map','normalMap','roughnessMap','metalnessMap',
  'emissiveMap','alphaMap','aoMap','bumpMap','displacementMap']);
export function materialValue(name,value){
  const [lo,hi,base]=MATERIAL_RANGES[name]||[0,1,0];
  const num=Number(value);return Math.min(hi,Math.max(lo,Number.isFinite(num)?num:base));
}
export function resolveAlphaMode(mode){return ['opaque','blend','mask'].includes(mode)?mode:'opaque';}
export function alphaMaterialSettings(mode,opacity,cutoff){
  const kind=resolveAlphaMode(mode);const factor=materialValue('opacity',opacity);
  return {transparent:kind==='blend'||(kind==='opaque'&&factor<1),alphaTest:kind==='mask'?materialValue('alphaCutoff',cutoff):0,
    opacity:factor,depthWrite:kind!=='blend',alphaMode:kind};
}

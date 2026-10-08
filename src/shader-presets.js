/** Engine-inspired VFX preview looks, not native Unity/Unreal shader asset exports. */
export const SHADER_PRESETS=Object.freeze({
  shield: {label:'Energy Shield · Fresnel', settings:{fxEnabled:true,fxFresnel:true,fxFresnelPower:3.2,fxFresnelStrength:3.0,fxFresnelColor:'#36baf9',fxDissolve:false,fxDepthFade:false,fxNoiseStrength:.08,fxDistort:.025}, material:{matAlphaMode:'add',matDepthWrite:false,matCull:'double',matBloom:true,matBloomStrength:1.2}},
  dissolve: {label:'Dissolve · URP-style',settings:{fxEnabled:true,fxFresnel:false,fxDissolve:true,fxDissolveAmount:.45,fxDissolveWidth:.055,fxDissolveColor:'#ff8f39',fxDissolveGlow:3,fxNoiseStrength:.1,fxNoiseScaleU:2,fxNoiseScaleV:2},material:{matAlphaMode:'blend',matDepthWrite:false,matCull:'double'}},
  aura: {label:'Aura · Niagara-style',settings:{fxEnabled:true,fxFresnel:true,fxFresnelPower:2.1,fxFresnelStrength:2.2,fxFresnelColor:'#b781ff',fxDissolve:false,fxNoiseStrength:.45,fxNoiseMode:'add',fxNoiseScaleU:3,fxNoiseScaleV:2,fxNoiseSpeedV:-.24,fxDistort:.04},material:{matAlphaMode:'add',matDepthWrite:false,matBloom:true,matBloomStrength:1.35}},
  smoke: {label:'Soft Smoke · Depth Fade',settings:{fxEnabled:true,fxFresnel:false,fxDissolve:false,fxDepthFade:true,fxFadeDistance:1.1,fxPlaneVisible:true,fxNoiseStrength:.22,fxNoiseMode:'multiply',fxDistort:.015},material:{matAlphaMode:'blend',matDepthWrite:false,matBloom:false}},
});
export function resolveShaderPreset(key){
  const p=SHADER_PRESETS[key];
  return p?{label:p.label,settings:{...p.settings},material:{...p.material}}:null;
}

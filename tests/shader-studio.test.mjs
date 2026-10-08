import test from 'node:test';
import assert from 'node:assert/strict';
import {SHADER_FIELD_DEFAULTS,normalizeShaderStudio,noiseOffset,supportsShaderStudio,installShaderStudio,updateShaderStudio} from '../src/shader-studio.js';
class V2{constructor(x,y){this.set(x,y)}set(x,y){this.x=x;this.y=y;return this}}
class V4{constructor(x,y,z,w){this.set(x,y,z,w)}set(x,y,z,w){Object.assign(this,{x,y,z,w});return this}}
class C{constructor(v){this.set(v)}set(v){this.hex=v;return this}}
const THREE={Vector2:V2,Vector4:V4,Color:C};
function sampleMaterial(){return {isMeshStandardMaterial:true,userData:{},needsUpdate:false,onBeforeCompile:null,customProgramCacheKey(){return 'base'}}}
function shaderMock(){return {uniforms:{},vertexShader:'void main() { #include <begin_vertex> }',fragmentShader:'void main() { #include <map_fragment> #include <alphatest_fragment> #include <opaque_fragment> }'}}

test('preset defaults are immutable and preserve optional switch defaults',()=>{
  const s=normalizeShaderStudio({});assert.equal(s.fxEnabled,false);assert.equal(s.fxPlaneVisible,true);
  assert.equal(Object.isFrozen(SHADER_FIELD_DEFAULTS),true);
});
test('adversarial values are clamped and NaNs rejected',()=>{
 const s=normalizeShaderStudio({fxEnabled:'true',fxNoiseStrength:8,fxDistort:-1,fxFadeDistance:0,fxNoiseSpeedU:Infinity,fxMaskChannel:'exec',fxFresnelColor:'red'});
 assert.deepEqual([s.fxEnabled,s.fxNoiseStrength,s.fxDistort,s.fxFadeDistance,s.fxNoiseSpeedU,s.fxMaskChannel,s.fxFresnelColor],[true,1,0,.001,0,'r','#58cfff']);
});
test('UV speed remains bounded at long times',()=>{
 const a=normalizeShaderStudio({fxNoiseSpeedU:2,fxNoiseSpeedV:-3});
 assert.deepEqual(noiseOffset(a,0),[0,0]);
 for(const n of noiseOffset(a,1e9))assert.ok(n>=0&&n<1024);
});
test('non-mesh material is not patched',()=>{
 assert.equal(supportsShaderStudio({}),false);assert.equal(supportsShaderStudio(sampleMaterial()),true);
});
test('shader hook chains pre-existing Alpha shader and preserves cache key',()=>{
 const m=sampleMaterial();let called=0;m.onBeforeCompile=s=>{called++;s.fragmentShader+=' /*ALPHA*/';};
 installShaderStudio(m,THREE);installShaderStudio(m,THREE);
 const s=shaderMock();m.onBeforeCompile(s);
 assert.equal(called,1);assert.match(s.fragmentShader,/\/\*ALPHA\*\//);
 assert.match(s.vertexShader,/vfxFxNormal/);assert.match(s.fragmentShader,/vfxFxDepthLinear/);
 assert.match(s.fragmentShader,/discard/);assert.match(m.customProgramCacheKey(),/maxvfx-studio-v1/);
 assert.equal(Object.keys(s.uniforms).length>10,true);
});
test('updates dynamic uniforms without reinstalling shader program',()=>{
 const m=sampleMaterial();installShaderStudio(m,THREE);m.needsUpdate=false;
 const a={isTexture:true},b={isTexture:true},d={isDepthTexture:true};
 updateShaderStudio(m,THREE,{fxEnabled:true,fxFresnel:true,fxFresnelPower:5,fxDissolve:true,fxNoiseStrength:.7,fxMaskInvert:true,fxDepthFade:true,fxMaskChannel:'a'},
  {time:2,noiseTexture:a,maskTexture:b,depthTexture:d,width:600,height:500,near:.1,far:999});
 const u=m.userData.vfxStudio;assert.equal(u.vfxFxEnabled.value,1);assert.equal(u.vfxFxDepthEnabled.value,1);
 assert.equal(u.vfxFxMode.value.x,1);assert.equal(u.vfxFxMode.value.y,1);assert.equal(u.vfxFxLayer.value.x,.7);
 assert.equal(u.vfxFxHasNoise.value,1);assert.equal(u.vfxFxHasMask.value,1);
 assert.equal(u.vfxFxDepthSize.value.x,600);assert.equal(u.vfxFxCamera.value.y,999);
 assert.equal(u.vfxFxMaskChannel.value.w,1);assert.equal(m.needsUpdate,false);
 updateShaderStudio(m,THREE,{fxEnabled:false},{time:1});assert.equal(u.vfxFxEnabled.value,0);
});
test('no texture input uses built-in procedural noise without fake alpha channel',()=>{
 const m=sampleMaterial();installShaderStudio(m,THREE);updateShaderStudio(m,THREE,{fxEnabled:true,fxDissolve:true},{});
 const u=m.userData.vfxStudio;assert.equal(u.vfxFxHasNoise.value,0);
 assert.equal(u.vfxFxHasMask.value,0);assert.equal(u.vfxFxDepthEnabled.value,0);
});

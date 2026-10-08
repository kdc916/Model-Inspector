import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {overlayState,alphaMaskFactor,effectiveAlphaMode,installAlphaShader,updateAlphaShaderUniforms} from '../src/alpha-preview.js';
import {alphaMaterialSettings, resolveAlphaMode} from '../src/material-controls.js';

test('alpha preview remains available on material/checker/uvgrid without replacing surface mode', () => {
  for(const mode of ['material','checker','uvgrid']){
    const x=overlayState(true,'tint',.6,true,mode);
    assert.equal(x.active,true);assert.equal(x.mode,1);assert.equal(x.strength,.6);
    assert.equal(overlayState(true,'gray',1,true,mode).mode,2);
    assert.equal(overlayState(true,'mask',.8,true,mode).mode,0);
  }
  assert.equal(overlayState(true,'gray',.5,false,'checker').active,false);
  assert.equal(overlayState(false,'tint',.5,true,'material').mode,0);
  assert.equal(overlayState(true,'tint',.6,true,'normal').mode,0);
  assert.equal(overlayState(true,'apply',1,true,'checker').mode,0);
});

test('Vertex Alpha drives transparency even from Opaque and never double-multiplies native RGBA', () => {
  for(const mode of ['blend','add','mask']){
    assert.equal(alphaMaskFactor(true,mode,true),1);
    assert.equal(alphaMaskFactor(false,mode,true),0);
    assert.equal(alphaMaskFactor(true,mode,false),0);
    assert.equal(alphaMaskFactor(true,mode,true,true),0);
  }
  assert.equal(alphaMaskFactor(true,'opaque',true),1);
  assert.equal(effectiveAlphaMode('opaque',true,true),'blend');
  assert.equal(effectiveAlphaMode('opaque',false,true),'opaque');
  assert.equal(effectiveAlphaMode('opaque',true,false),'opaque');
  assert.equal(effectiveAlphaMode('add',true,true),'add');
  assert.equal(resolveAlphaMode('add'),'add');
  assert.deepEqual(alphaMaterialSettings('add',.5,.5),{transparent:true,alphaTest:0,opacity:.5,depthWrite:false,alphaMode:'add',blending:'additive'});
  assert.equal(alphaMaterialSettings('opaque',.3,.5).opacity,1);
  assert.equal(alphaMaterialSettings('mask',.6,.2).alphaTest,.2);
});

test('Shader patch injects uniform and alpha attribute once and updates without recompiling',()=>{
  let compileCalls=0;
  const mat={isMeshStandardMaterial:true,userData:{},needsUpdate:false,
    onBeforeCompile(){compileCalls++},customProgramCacheKey(){return 'basic'}};
  installAlphaShader(mat);
  installAlphaShader(mat);
  assert.equal(mat.customProgramCacheKey(),'basic|maxvfx-alpha-preview-v3');
  const shader={uniforms:{},vertexShader:'void main(){\n#include <begin_vertex>\n}',
    fragmentShader:'void main(){\n#include <color_fragment>\n#include <alphamap_fragment>\n#include <alphatest_fragment>\n}'};
  mat.onBeforeCompile(shader,{});
  assert.equal(compileCalls,1);
  assert.match(shader.vertexShader,/attribute float vfxInspectionAlpha/);
  assert.match(shader.fragmentShader,/diffuseColor\.rgb = mix/);
  assert.match(shader.fragmentShader,/diffuseColor\.a \*= mix/);
  const shaderBefore=mat.onBeforeCompile;
  updateAlphaShaderUniforms(mat,{mode:2,strength:.85,mask:1});
  assert.equal(shader.uniforms.vfxAlphaOverlayMode.value,2);
  assert.equal(shader.uniforms.vfxAlphaOverlayStrength.value,.85);
  assert.equal(shader.uniforms.vfxAlphaMaskFactor.value,1);
  assert.equal(mat.onBeforeCompile,shaderBefore);
  updateAlphaShaderUniforms(mat,{channel:'a',invert:true});
  assert.deepEqual(shader.uniforms.vfxMaskWeights.value,[0,0,0,1]);
  assert.equal(shader.uniforms.vfxMaskInvert.value,1);
  assert.match(shader.fragmentShader,/USE_ALPHAMAP/);
});

test('interface offers independent alpha toggle and additive mode with bindings',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  for(const id of ['btnAlphaOverlay','toggleAlphaOverlay','toggleAlphaInspector','alphaOverlayView','alphaOverlayStrength','valueAlphaOverlayStrength']){
    assert.ok(html.includes(`id="${id}"`),`HTML missing ${id}`);
    assert.ok(app.includes(`#${id}`),`JS missing ${id}`);
  }
  assert.match(html,/option value="add">Additive/);
  assert.match(app,/prepareInspectionAlpha\(mesh\)/);
  assert.match(app,/applyBlendToMaterial\(cache\[name\]/);
  assert.match(app,/configureAlphaForMaterial\(mesh,mat\)/);
});

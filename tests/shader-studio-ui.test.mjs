import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHADER_FIELD_DEFAULTS} from '../src/shader-studio.js';
import {materialSnapshot,normalizePreset} from '../src/production-core.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('Shader Studio is a separate tab with all preset fields',()=>{
 for(const key of Object.keys(SHADER_FIELD_DEFAULTS)) {
  assert.match(html,new RegExp(`id="${key}"`),`Missing ${key} element`);
  assert.ok(Object.hasOwn(materialSnapshot({[key]:true}),key),`${key} not in presets`);
 }
 assert.match(html,/data-tab="shader"/);assert.match(html,/id="page-shader"/);
});
test('shader studio preset roundtrip and old v0.8 presets still load',()=>{
 const ui=materialSnapshot({fxEnabled:true,fxFresnel:true,fxFresnelPower:'4',toggleAlphaOverlay:true,pivotSize:'0.5'});
 const p=normalizePreset({schema:'maxvfx-inspector-preset',version:1,ui,slotFlows:{}});
 assert.equal(p.ui.fxEnabled,true);assert.equal(p.ui.fxFresnelPower,'4');assert.equal(p.ui.toggleAlphaOverlay,true);
 const legacy=normalizePreset({schema:'maxvfx-inspector-preset',version:1,ui:{pivotSize:'0.3'},slotFlows:{}});
 assert.equal(legacy.ui.pivotSize,'0.3');
});
test('Shader Studio upload generation cleanup and shader updates are connected',()=>{
 assert.match(app,/shaderUploadSerial/);assert.match(app,/URL\.revokeObjectURL\(uri\)/);
 assert.match(app,/installShaderStudio\(mat,THREE\)/);assert.match(app,/depthPreview\.render\(\)/);
 assert.match(app,/Shader Studio 초기화 완료/);
});

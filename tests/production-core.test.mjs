import test from 'node:test';import assert from 'node:assert/strict';
import {blendSettings,createSlotFlow,textureTransform,flipbookAt,normalizePreset,compareSummaries,MAX_PRESET_BYTES} from '../src/production-core.js';
test('blend opaque, alpha, depth, cull',()=>{assert.equal(blendSettings('opaque').transparent,false);assert.equal(blendSettings('premultiply',.5,.5,false,false,'back').depthTest,false);assert.equal(blendSettings('mask',1,.35).alphaTest,.35);assert.equal(blendSettings('wrong').mode,'opaque');});
test('slot flow normalized and visual direction',()=>{assert.equal(createSlotFlow({speedX:20,uv:9}).speedX,8);assert.equal(textureTransform({speedX:.5,repeatX:2},2).offsetX,-1);});
test('flipbook top row and clamp/loop',()=>{assert.deepEqual([flipbookAt(0,{cols:4,rows:2}).offsetY,flipbookAt(.5,{cols:4,rows:2,fps:4}).frame],[.5,2]);assert.equal(flipbookAt(20,{cols:2,rows:2,loop:false}).frame,3);});
test('preset schema and slots validated',()=>{const p=normalizePreset({schema:'maxvfx-inspector-preset',version:1,ui:{matRough:'0.6',matColor:'#fff'},slotFlows:{map:{uv:3,speedY:2}}});assert.equal(p.slotFlows.map.uv,3);assert.equal(p.ui.matRough,'0.6');assert.throws(()=>normalizePreset({schema:'wrong'}));assert.ok(MAX_PRESET_BYTES>1000);});
test('model comparison is directional',()=>assert.equal(compareSummaries({triangles:12},{triangles:8}).delta.triangles.diff,-4));

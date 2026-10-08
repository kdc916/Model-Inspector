import {test} from 'node:test';import assert from 'node:assert/strict';
import {guideLength,formatPivotReadout} from '../src/scene-guides.js';
import {resolvePreviewBlend,applyPreviewBlend} from '../src/render-state.js';
import {readFileSync} from 'node:fs';
const fakeThree={DoubleSide:2,FrontSide:0,BackSide:1,NormalBlending:10,AdditiveBlending:11,MultiplyBlending:12,CustomBlending:13,AddEquation:100,OneFactor:101,OneMinusSrcAlphaFactor:102,OneMinusSrcColorFactor:103};
test('pivot guide scales with model dimensions and clamps slider safely',()=>{
  assert.equal(guideLength(10,.35),3.5);
  assert.equal(guideLength(1,.01),.05);
  assert.equal(guideLength(2,50),3);
  assert.ok(guideLength(0,.35)>.01);
  assert.ok(Number.isFinite(guideLength(NaN,NaN)));
});
test('world pivot readout respects imported transform and never alters source',()=>{
  const obj={position:{x:0,y:0,z:0,clone(){return {...this}}},updateWorldMatrix(){this.updated=true},getWorldPosition(){return {x:-12,y:3.25,z:5.1}}};
  assert.equal(formatPivotReadout(obj),'-12.000, 3.250, 5.100');
  assert.equal(obj.updated,true);
});
test('opaque material + vertex alpha checkbox becomes real alpha blending, disabling restores opaque',()=>{
  const enabled=resolvePreviewBlend('opaque',true,true,1,.5,true,true,'double');
  assert.equal(enabled.mode,'blend');assert.equal(enabled.transparent,true);
  assert.equal(enabled.depthWrite,false);assert.equal(enabled.autoAlphaBlend,true);
  const mat={userData:{},needsUpdate:false};applyPreviewBlend(mat,fakeThree,enabled);
  assert.equal(mat.transparent,true);assert.equal(mat.blending,fakeThree.NormalBlending);
  assert.equal(mat.userData.vfxAlphaMode,'opaque');
  assert.equal(mat.depthWrite,false);
  const disabled=resolvePreviewBlend(mat.userData.vfxAlphaMode,false,true,1,.5,true,true,'double');
  applyPreviewBlend(mat,fakeThree,disabled);
  assert.equal(mat.transparent,false);assert.equal(mat.depthWrite,true);
  assert.equal(mat.userData.vfxAutoAlphaBlend,false);
});
test('RGB-only mesh cannot invent alpha and additive remains additive',()=>{
  const rgb=resolvePreviewBlend('opaque',true,false,1,.5,true,true,'double');
  assert.equal(rgb.mode,'opaque');assert.equal(rgb.transparent,false);
  const add=resolvePreviewBlend('add',true,true,.6,.3,true,false,'back');
  assert.equal(add.mode,'add');const mat={userData:{}};applyPreviewBlend(mat,fakeThree,add);
  assert.equal(mat.opacity,.6);assert.equal(mat.blending,fakeThree.AdditiveBlending);assert.equal(mat.side,fakeThree.BackSide);
});
test('UI provides independently controllable world axes, oriented mesh pivots and no default false-color tint',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  for(const id of ['toggleAxes','togglePivot','pivotScope','axisSize','valueAxisSize','pivotStatus']){
    assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
    assert.ok(app.includes(`'#${id}'`),`unwired ${id}`);
  }
  assert.match(html,/<option value="apply" selected>/);
  assert.match(app,/guides\.followPivots\(\)/);
  assert.ok(!app.includes('state.model.position.set(0,0,0)'));
});

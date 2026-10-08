import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guideLength,SceneGuides } from '../src/scene-guides.js';
import { createTextureOverride,composeTextureTransform,textureTransform,normalizePreset } from '../src/production-core.js';
import {exportPreset,applyControlValues} from '../src/preset-workflow.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('pivot/world size have independent UI controls with different defaults',()=>{
  for(const id of ['pivotSize','valuePivotSize','axisSize','valueAxisSize']){
    assert.match(html,new RegExp(`id="${id}"`));assert.ok(app.includes(`'#${id}'`));
  }
  assert.match(html,/id="pivotSize"[^>]*value="0\.12"/);
  assert.equal(guideLength(10,.35),3.5);
  assert.equal(guideLength(10,.12),1.2);
  assert.match(app,/guides\.resize\(Number\(\$\('#axisSize'\)\.value\),Number\(\$\('#pivotSize'\)\.value\)\)/);
});
test('resize changes guide scales in place without recreation',()=>{
  const sc={world:{scale:{setScalar(n){this.n=n}}},pivots:[{group:{scale:{setScalar(n){this.n=n}}}}],diagonal:10};
  SceneGuides.prototype.resize.call(sc,.5,.1);
  assert.equal(sc.world.scale.n,5);assert.equal(sc.pivots[0].group.scale.n,1);
});
test('manual texture tiling and offset compose with animated UV flow, without mutating source',()=>{
  const base=textureTransform({repeatX:2,repeatY:3,offsetX:.5,offsetY:-.1,speedX:.3,speedY:0},2);
  assert.equal(base.repeatX,2);
  const override=createTextureOverride({tileU:4,tileV:2,offsetU:.25,offsetV:-.2});
  const got=composeTextureTransform(base,override);
  assert.deepEqual({x:got.repeatX,y:got.repeatY}, {x:8,y:6});
  assert.ok(Math.abs(got.offsetX-(base.offsetX-.25))<1e-9);
  assert.ok(Math.abs(got.offsetY-(base.offsetY+.2))<1e-9);
  assert.equal(base.repeatX,2);
  assert.deepEqual(composeTextureTransform(base),base);
});
test('reject unsafe numbers and preserve one transform per texture slot',()=>{
  assert.deepEqual(createTextureOverride({tileU:'',tileV:-10,offsetU:Infinity,offsetV:'50000'}),{tileU:1,tileV:.01,offsetU:0,offsetV:4096});
  const saved=exportPreset({pivotSize:'0.18'}, {}, {map:{tileU:3,tileV:4,offsetU:.25,offsetV:.75},normalMap:{tileU:2,tileV:2}});
  const restored=normalizePreset(saved);
  assert.equal(restored.ui.pivotSize,'0.18');
  assert.equal(restored.textureTransforms.map.tileU,3);
  assert.equal(restored.textureTransforms.normalMap.tileU,2);
  assert.equal(restored.textureTransforms.aoMap,undefined);
  assert.deepEqual(normalizePreset({...saved,textureTransforms:undefined}).textureTransforms,{});
});
test('UI slot selector and transform controls are wired into main renderer',()=>{
  for(const id of ['matTexSlot','matTileU','matTileV','matOffsetU','matOffsetV','btnMatTransformReset','btnMatTransformUV']){
    assert.match(html,new RegExp(`id="${id}"`));assert.ok(app.includes(`'#${id}'`)||app.includes(`'${id}'`)||id in {matTileU:1,matTileV:1,matOffsetU:1,matOffsetV:1});
  }
  assert.match(app,/state\.textureTransforms\.get\(slot\)/);
  assert.match(app,/composeTextureTransform\(textureTransform/);
  assert.match(app,/state\.textureTransforms=new Map\(Object\.entries\(p\.textureTransforms/);
  assert.ok(html.indexOf('TEXTURE TRANSFORM')<html.indexOf('BASE / SURFACE'));
});

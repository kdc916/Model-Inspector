import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL_RANGES, TEXTURE_SLOTS, ORM_SLOTS, normalScalePair, scopedMaterialIndices, materialValue, alphaMaterialSettings, resolveAlphaMode } from '../src/material-controls.js';
import { analyzeVertexAlpha, extractVertexColors } from '../src/mesh-diagnostics.js';
import { readFileSync } from 'node:fs';
const attr=(data, itemSize)=>({count:data.length/itemSize,itemSize,getX:i=>data[i*itemSize],getY:i=>data[i*itemSize+1],getZ:i=>data[i*itemSize+2],getW:i=>data[i*itemSize+3]});
const geom=(vertex,colors,itemSize=4)=>({getAttribute:name=>name==='position'?attr(vertex,3):name==='color'&&colors?attr(colors,itemSize):null});

test('vertex alpha detects true RGBA and averages values',()=>{
  const g=geom([0,0,0,1,1,1,2,2,2],[1,1,1,0,1,1,1,.5,1,1,1,1]);
  const r=analyzeVertexAlpha(g);
  assert.equal(r.hasAlpha,true);assert.equal(r.min,0);assert.equal(r.max,1);
  assert.equal(r.average,.5);assert.equal(r.zero,1);assert.equal(r.partial,1);assert.equal(r.opaque,1);
  assert.deepEqual([...extractVertexColors(g,'a')],[0,0,0,.5,.5,.5,1,1,1]);
});
test('missing vertex alpha is different from RGB-only channels',()=>{
  const p=[0,0,0],rgb=geom(p,[.2,.3,.4],3),empty=geom(p,null);
  assert.equal(analyzeVertexAlpha(rgb).reason,'rgb-only');
  assert.equal(analyzeVertexAlpha(empty).reason,'missing-color');
  assert.equal(extractVertexColors(empty,'a'),null);
  assert.equal(extractVertexColors(rgb,'a'),null);
});
test('nonfinite vertex alpha is handled safely',()=>{
  const g=geom([0,0,0],[.7,.7,.7,NaN]);
  assert.equal(analyzeVertexAlpha(g).average,null);
  assert.equal(analyzeVertexAlpha(g).reason,'invalid-alpha');
});
test('material values clamp ranges and reject invalid input',()=>{
  assert.equal(materialValue('normalStrength',10),2);
  assert.equal(materialValue('roughness',-2),0);
  assert.equal(materialValue('displacementScale','not a number'),0);
  assert.equal(materialValue('opacity',Infinity),1);
  for(const [n,[lo,hi]] of Object.entries(MATERIAL_RANGES)){
    assert.equal(materialValue(n,lo-100),lo);
    assert.equal(materialValue(n,hi+100),hi);
  }
});
test('alpha modes support opaque, blend and cutoff',()=>{
  assert.equal(alphaMaterialSettings('opaque',1,.5).transparent,false);
  assert.equal(alphaMaterialSettings('blend',.7,.5).transparent,true);
  assert.equal(alphaMaterialSettings('blend',.7,.5).depthWrite,false);
  assert.equal(alphaMaterialSettings('mask',1,.2).alphaTest,.2);
  assert.equal(alphaMaterialSettings('mask',1,.2).transparent,false);
  assert.equal(resolveAlphaMode('garbage'),'opaque');
});
test('all texture slots are unique and mapped into UI',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.equal(new Set(TEXTURE_SLOTS).size,TEXTURE_SLOTS.length);
  for(const key of TEXTURE_SLOTS)assert.match(html,new RegExp(`data-slot="${key}"`));
  for(const id of ['btnWire','toggleWire','wireOpacity','wireColor','wireXray','vertexAlphaHealth',
    'matColor','matBaseStrength','matNormalStrength','matAOIntensity','matEmissiveIntensity',
    'matEmissiveColor','matBumpScale','matDisplacementScale','matDisplacementBias','matOpacity','matAlphaMode','matAlphaCutoff']){
    assert.ok(html.includes(`id="${id}"`),`Missing ${id}`);
  }
});

test('ORM packed channel mapping and normal green inversion use stable PBR conventions',()=>{
  assert.deepEqual([...ORM_SLOTS],['aoMap','roughnessMap','metalnessMap']);
  assert.deepEqual(normalScalePair(1.25,false),[1.25,1.25]);
  assert.deepEqual(normalScalePair(1.25,true),[1.25,-1.25]);
  assert.deepEqual(scopedMaterialIndices(3,-1),[0,1,2]);
  assert.deepEqual(scopedMaterialIndices(3,1),[1]);
  assert.deepEqual(scopedMaterialIndices(3,99),[]);
  assert.deepEqual(scopedMaterialIndices(3,NaN),[0,1,2]);
});
test('v0.4.0 controls referenced in HTML and app code',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  for(const id of ['alphaViewportAlert','btnAlphaReport','ormInput','ormFileName','matNormalFlipGreen','matSlotIndex']){
    assert.ok(html.includes(`id="${id}"`),`Missing HTML ${id}`);
    assert.ok(app.includes(`#${id}`),`Missing app binding ${id}`);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { finite, textureOffsetFromVisual, triangleCount, uvAttributeName, uvBounds, modelStats, wrapPhase } from '../src/uv-utils.js';

test('visual right/up travel uses opposite sampler offset',()=>{
  assert.deepEqual(textureOffsetFromVisual(.25,-.7),{x:-.25,y:.7});
});
test('invalid numeric controls cannot contaminate renderer state',()=>{
  assert.equal(finite('oops'),0);assert.equal(finite('2.4'),2.4);
});
test('indexed triangle count and vertices stay distinct',()=>{
  const g={index:{count:12},getAttribute:(n)=>n==='position'?{count:8}:null};
  assert.equal(triangleCount(g),4);
  assert.deepEqual(modelStats([{geometry:g}]),{triangles:4,vertices:8,meshes:1,withUV:0,withNormals:0});
});
test('UV channel maps to names understood by three',()=>{
  assert.equal(uvAttributeName(0),'uv');assert.equal(uvAttributeName(1),'uv1');assert.equal(uvAttributeName(3),'uv3');
});
test('UV bounds diagnose tiling',()=>{
  const uv={count:3,getX(i){return [0,.5,1.5][i]},getY(i){return [0,1,.5][i]}};
  assert.deepEqual(uvBounds(uv),{minU:0,maxU:1.5,minV:0,maxV:1,outOfRange:1,count:3});
});
test('phase remains bounded in both signed directions',()=>{
  assert.equal(wrapPhase(-.25),4095.75);assert.equal(wrapPhase(4097),1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestEpoch,disposeDetachedRoot} from '../src/lifecycle.js';
test('out-of-order model loads cannot publish stale results',()=>{
  const gate=new RequestEpoch(),one=gate.next(),two=gate.next();
  assert.equal(gate.isCurrent(one),false);assert.equal(gate.isCurrent(two),true);
  gate.invalidate();assert.equal(gate.isCurrent(two),false);
});
test('independent model and comparison requests do not collide',()=>{
  const models=new RequestEpoch(),comparisons=new RequestEpoch();
  const m=models.next(),c=comparisons.next();models.invalidate();
  assert.equal(models.isCurrent(m),false);assert.equal(comparisons.isCurrent(c),true);
});
test('superseded GLTF materials, geometries and textures disposed once',()=>{
  const disposed={geometry:0,material:0,texture:0};
  const geometry={dispose:()=>disposed.geometry++},texture={dispose:()=>disposed.texture++};
  const material={map:texture,dispose:()=>disposed.material++};
  const root={traverse(fn){fn({geometry,material});fn({geometry,material:[material]});}};
  assert.deepEqual(disposeDetachedRoot(root,['map']),{geometries:1,materials:1,textures:1});
  assert.deepEqual(disposed,{geometry:1,material:1,texture:1});
});
test('empty scene or incomplete material supports idempotent cleanup',()=>{
  assert.deepEqual(disposeDetachedRoot(null),{geometries:0,materials:0,textures:0});
  assert.deepEqual(disposeDetachedRoot({traverse(fn){fn({material:null})}}),{geometries:0,materials:0,textures:0});
});
test('latest texture upload wins per material slot, without cancelling unrelated slots',async()=>{
 const {SlotEpochs}=await import('../src/lifecycle.js');
 const gate=new SlotEpochs();
 const old=gate.next('map'),normal=gate.next('normalMap'),fresh=gate.next('map');
 assert.equal(gate.isCurrent('map',old),false);
 assert.equal(gate.isCurrent('map',fresh),true);
 assert.equal(gate.isCurrent('normalMap',normal),true);
 gate.invalidate('map');assert.equal(gate.isCurrent('map',fresh),false);
 gate.invalidateAll();assert.equal(gate.isCurrent('normalMap',normal),false);
});

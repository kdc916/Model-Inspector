import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVertexAlpha, extractVertexColors, readColorComponent, locateVertexAlpha } from '../src/mesh-diagnostics.js';
function at(values,size,extra={}){return {itemSize:size,count:values.length/size,array:values,...extra,getX:i=>values[i*size],getY:i=>values[i*size+1],getZ:i=>values[i*size+2],getW:i=>values[i*size+3]};}
function geo(color,alpha,count=2){return {getAttribute:k=>k==='position'?at(new Float32Array(count*3),3):k==='color'?color:k==='alpha'?alpha:null};}
test('black vertex alpha painted in Max is black in grayscale preview (not RGB)',()=>{
  const g=geo(at(new Float32Array([1,1,1,0,1,1,1,.5]),4));
  assert.deepEqual([...extractVertexColors(g,'a')],[0,0,0,.5,.5,.5]);
  const r=analyzeVertexAlpha(g);
  assert.equal(r.reason,'varying-alpha');assert.equal(r.zero,1);assert.equal(r.average,.25);
});
test('RGB-only models show missing Alpha, even if RGB is white',()=>{
  const g=geo(at(new Float32Array([1,1,1,1,1,1]),3));
  assert.equal(locateVertexAlpha(g).source,null);
  assert.equal(extractVertexColors(g,'a'),null);
  assert.equal(analyzeVertexAlpha(g).reason,'rgb-only');
});
test('RGBA all white is distinct from missing alpha',()=>{
  const r=analyzeVertexAlpha(geo(at(new Float32Array([1,1,1,1,0,0,0,1]),4)));
  assert.equal(r.reason,'all-white');assert.equal(r.hasAlpha,true);
});
test('optional explicit alpha attribute is read when vertex color has RGB only',()=>{
  const g=geo(at(new Float32Array([.2,.3,.4,.1,.2,.3]),3),at(new Float32Array([0,.75]),1));
  assert.equal(locateVertexAlpha(g).source,'alpha');
  assert.deepEqual([...extractVertexColors(g,'a')],[0,0,0,.75,.75,.75]);
});
test('raw unsigned byte channel without normalized flag scales to 0-1',()=>{
  const a=at(new Uint8Array([255,255,255,0,255,255,255,128]),4,{normalized:false});
  assert.equal(readColorComponent(a,1,3),128/255);
  const report=analyzeVertexAlpha(geo(a));
  assert.ok(Math.abs(report.average-(128/255)/2)<1e-6);
});
test('non-finite alpha is reported rather than fabricated',()=>{
  const r=analyzeVertexAlpha(geo(at(new Float32Array([1,1,1,NaN,1,1,1,1]),4)));
  assert.equal(r.invalid,1);assert.equal(r.sampled,1);assert.equal(r.reason,'all-white');
});

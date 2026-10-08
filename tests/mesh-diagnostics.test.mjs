import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUVStretch, extractVertexColors, MAX_STRETCH_TRIANGLES } from '../src/mesh-diagnostics.js';
function attr(array, itemSize){return { count:array.length/itemSize,itemSize,
  getX:i=>array[i*itemSize],getY:i=>array[i*itemSize+1],
  getZ:i=>array[i*itemSize+2],getW:i=>array[i*itemSize+3]};}
function geometry(positions,uvs,indices=null,colors=null){const attrs={position:attr(positions,3)};
 if(uvs)attrs.uv=attr(uvs,2);if(colors)attrs.color=attr(colors,colors.length===positions.length?3:4);
 return {index:indices?attr(indices,1):null,getAttribute:n=>attrs[n]||null};}
test('uniform triangles have zero UV stretch outliers',()=>{
 const g=geometry([0,0,0,1,0,0,0,1,0, 1,0,0,1,1,0,0,1,0],
   [0,0,1,0,0,1, 1,0,1,1,0,1]);
 const x=analyzeUVStretch(g);
 assert.equal(x.validFaces,2);assert.equal(x.outlierFaces,0);assert.equal(x.degenerateUV,0);
 assert.ok(Math.abs(x.medianScale-1)<1e-9);assert.equal(x.colors.length,18);
});
test('zero-area UV face is reported and colored neutral',()=>{
 const g=geometry([0,0,0,1,0,0,0,1,0],[0,0,0,0,0,0]);
 const x=analyzeUVStretch(g);assert.equal(x.degenerateUV,1);assert.equal(x.reason,'no-valid-faces');
});
test('world scaling adjusts world/UV linear scale',()=>{
 const g=geometry([0,0,0,1,0,0,0,1,0],[0,0,1,0,0,1]);
 const mat=[2,0,0,0, 0,2,0,0, 0,0,2,0, 0,0,0,1];
 assert.equal(analyzeUVStretch(g,0,mat).medianScale,2);
});
test('indexed geometry produces colors per triangle corner',()=>{
 const g=geometry([0,0,0,1,0,0,0,1,0,1,1,0],[0,0,1,0,0,1,1,1],[0,1,2,1,3,2]);
 const x=analyzeUVStretch(g);assert.equal(x.faces,2);assert.equal(x.colors.length,18);
});
test('missing UV and large geometry fail gracefully',()=>{
 const g=geometry([0,0,0,1,0,0,0,1,0],null);
 assert.equal(analyzeUVStretch(g).reason,'missing-uv');
 const big={index:{count:(MAX_STRETCH_TRIANGLES+1)*3},getAttribute:n=>n==='position'?attr([0,0,0],3):attr([0,0],2)};
 assert.equal(analyzeUVStretch(big).reason,'limit');
});
test('RGB and alpha vertex channels display expected grayscale',()=>{
 const g=geometry([0,0,0,1,0,0],[0,0,1,1],null,[.2,.4,.6,.75, .9,.8,.7,.1]);
 const red=extractVertexColors(g,'r');const a=extractVertexColors(g,'a');
 assert.deepEqual([...red].map(x=>+x.toFixed(2)),[.2,.2,.2,.9,.9,.9]);
 assert.deepEqual([...a].map(x=>+x.toFixed(2)),[.75,.75,.75,.1,.1,.1]);
 const rgb=extractVertexColors(g,'rgb');assert.equal(rgb.length,6);
});
test('missing alpha in RGB colors is treated as opaque',()=>{
 const g=geometry([0,0,0],[0,0],null,[.2,.4,.6]);
 assert.deepEqual([...extractVertexColors(g,'a')],[1,1,1]);
});

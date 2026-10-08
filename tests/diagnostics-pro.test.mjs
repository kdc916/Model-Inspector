import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectGeometryPro,createDiagnosticSnapshot,summarizeDiagnostics} from '../src/diagnostics-pro.js';
const g=(position,uv,index=null,normal=null)=>({position:new Float32Array(position),uv:uv===null?null:new Float32Array(uv),index:index?new Uint32Array(index):null,normal:normal?new Float32Array(normal):null,name:'Test'});
test('texel density from 1 m square with 1024px UV => 1024px/m',()=>{const a=g([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0],[0,0,1,0,1,1,0,0,1,1,0,1]);const r=inspectGeometryPro(a,{resolution:1024,unitsPerMeter:1});assert.equal(r.faces,2);assert.ok(Math.abs(r.texelDensityPxPerMeter-1024)<.0001);assert.equal(r.overlapPairs,0)});
test('centimeter mesh gives same world texel density when using unitsPerMeter 100',()=>{const a=g([0,0,0,100,0,0,0,100,0],[0,0,1,0,0,1]);assert.ok(Math.abs(inspectGeometryPro(a,{resolution:512,unitsPerMeter:100}).texelDensityPxPerMeter-512)<.0001)});
test('duplicate triangles are counted as UV overlap',()=>{const a=g([0,0,0,1,0,0,0,1,0,0,0,1,1,0,1,0,1,1],[0,0,1,0,0,1,0,0,1,0,0,1]);const r=inspectGeometryPro(a);assert.equal(r.overlapPairs,1)});
test('touching UV triangles without overlapping area do not count',()=>{const a=g([0,0,0,1,0,0,0,1,0,1,0,0,1,1,0,0,1,0],[0,0,1,0,0,1,1,0,1,1,0,1]);assert.equal(inspectGeometryPro(a).overlapPairs,0)});
test('face limit reports partial but still processes selected range',()=>{const a=g([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],[0,0,1,0,0,1,0,0,1,0,0,1]);const r=inspectGeometryPro(a,{maxFaces:1});assert.equal(r.analyzed,1);assert.equal(r.partial,true)});
test('flipped UV orientation and degenerate triangle handled',()=>{const a=g([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],[0,0,0,1,1,0,0,0,0,0,0,0]);const r=inspectGeometryPro(a);assert.equal(r.flippedUV,1);assert.equal(r.degenerateUV,1)});
test('missing UV and invalid normal are separately represented',()=>{const a=g([0,0,0,1,0,0,0,1,0],null,null,[0,0,0,0,0,0,0,0,0]);const r=inspectGeometryPro(a);assert.equal(r.uvMissing,true);assert.equal(r.invalidNormals,1)});
test('indexed geometry and normalized BufferAttribute snapshot',()=>{const attr=(itemSize,data)=>({count:data.length/itemSize,getX:i=>data[itemSize*i],getY:i=>data[itemSize*i+1],getZ:i=>data[itemSize*i+2]});const geo={index:{count:3,getX:i=>[0,1,2][i]},getAttribute:k=>k==='position'?attr(3,[0,0,0,1,0,0,0,1,0]):k==='uv'?attr(2,[0,0,1,0,0,1]):null};const snap=createDiagnosticSnapshot(geo,'A',0);assert.equal(snap.index.length,3);assert.equal(inspectGeometryPro(snap).faces,1)});
test('budget hit does not claim exact complete overlap result',()=>{const arr=[],uv=[];for(let i=0;i<80;i++){arr.push(0,0,i,1,0,i,0,1,i);uv.push(0,0,1,0,0,1)}const r=inspectGeometryPro(g(arr,uv),{maxOverlapTests:1000});assert.equal(r.overlapIncomplete,true);assert.ok(r.overlapPairs>0)});
test('reports summary shows partial and UV absence',()=>{const reports=[inspectGeometryPro(g([0,0,0,1,0,0,0,1,0],null))];const s=summarizeDiagnostics(reports,{resolution:1024});assert.equal(s.summary.missingUVMeshes,1);assert.equal(s.reports.length,1)});

test('world scale transforms are included in texel density',()=>{
 const a={getAttribute(name){const d=name==='position'?[0,0,0,1,0,0,0,1,0]:name==='uv'?[0,0,1,0,0,1]:null;if(!d)return null;const n=name==='position'?3:2;return {count:d.length/n,getX(i){return d[n*i]},getY(i){return d[n*i+1]},getZ(i){return d[n*i+2]}};}};
 const transform=[2,0,0,0,0,2,0,0,0,0,2,0,0,0,0,1];
 const snapshot=createDiagnosticSnapshot(a,'Scaled',0,transform);
 const r=inspectGeometryPro(snapshot,{resolution:1024});assert.ok(Math.abs(r.texelDensityPxPerMeter-512)<.00001);
});

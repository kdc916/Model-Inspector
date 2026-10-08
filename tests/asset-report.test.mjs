import test from 'node:test';import assert from 'node:assert/strict';import {inspectAsset,buildComparison} from '../src/asset-report.js';
const attr=a=>({count:a.length,getX:i=>a[i][0],getY:i=>a[i][1],getZ:i=>a[i][2]||0});
const root=(name,num=3)=>({name,traverse(fn){fn({isMesh:true,name:'Object',geometry:{index:null,getAttribute(k){if(k==='position')return attr(Array.from({length:num},(_,i)=>[i,0,0]));return null}},material:{}})}});
test('asset includes geometry and missing UV',()=>{const r=inspectAsset(root('A'));assert.equal(r.uvMissing,1);assert.equal(r.triangles,1);});
test('compare delta',()=>{const c=buildComparison(root('A',3),root('B',6));assert.equal(c.comparison.delta.triangles.diff,1);});

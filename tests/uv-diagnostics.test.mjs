import test from 'node:test';import assert from 'node:assert/strict';import {diagnoseUV} from '../src/uv-diagnostics.js';
const att=(pairs)=>({count:pairs.length,getX:i=>pairs[i][0],getY:i=>pairs[i][1],getZ:i=>pairs[i][2]||0});
const geo=(uv,pos)=>({getAttribute:k=>k==='uv'?att(uv):k==='position'?att(pos):null,index:null});
test('separated UV triangles do not overlap',()=>{const a=diagnoseUV(geo([[0,0],[1,0],[0,1],[2,2],[3,2],[2,3]],Array.from({length:6},(_,i)=>[i,0,0])));assert.equal(a.overlapPairs,0);});
test('identical triangles overlap',()=>{const a=diagnoseUV(geo([[0,0],[1,0],[0,1],[0,0],[1,0],[0,1]],Array.from({length:6},(_,i)=>[i,0,0])));assert.equal(a.overlapPairs,1);});
test('winding and degeneracy',()=>{const a=diagnoseUV(geo([[0,0],[0,1],[1,0],[0,0],[0,0],[0,0]],Array.from({length:6},(_,i)=>[i,0,0])));assert.equal(a.flipped,1);assert.equal(a.degenerate,1);});

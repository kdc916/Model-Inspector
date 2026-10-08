import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAsciiFbxColorLayers, parseFbxColorLayers, triangulatedAlpha, restoreFBXAlpha } from '../src/fbx-alpha-recovery.js';
import { analyzeVertexAlpha } from '../src/mesh-diagnostics.js';

const source = `; FBX 7.2.0 project file
FBXHeaderExtension: {}
Objects: {
 Geometry: 1, "Geometry::Quad", "Mesh" {
  Vertices: *12 { a: 0,0,0,1,0,0,1,1,0,0,1,0 }
  PolygonVertexIndex: *4 { a: 0,1,2,-4 }
  LayerElementColor: 0 {
   MappingInformationType: "ByPolygonVertex"
   ReferenceInformationType: "IndexToDirect"
   Colors: *16 { a: 1,1,1,0,1,1,1,0.25,1,1,1,0.5,1,1,1,1 }
   ColorIndex: *4 { a: 0,1,2,3 }
  }
 }
}`;
const FakeTHREE={ShapeUtils:{triangulateShape:()=>[[0,1,2],[0,2,3]]},Float32BufferAttribute:class {
  constructor(array,itemSize){this.array=array;this.itemSize=itemSize;this.count=array.length/itemSize;}
  getX(i){return this.array[i*this.itemSize]}
},Vector3:class {constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}normalize(){const l=Math.hypot(this.x,this.y,this.z)||1;this.x/=l;this.y/=l;this.z/=l;return this;}cross(v){const {x,y,z}=this;this.x=y*v.z-z*v.y;this.y=z*v.x-x*v.z;this.z=x*v.y-y*v.x;return this;}clone(){return new FakeTHREE.Vector3(this.x,this.y,this.z);}dot(v){return this.x*v.x+this.y*v.y+this.z*v.z}},Vector2:class {constructor(x,y){this.x=x;this.y=y;}}};
function geometry(count,name='Quad'){
 const attr=new Map([['position',{count}]]);
 return {name,userData:{},getAttribute:k=>attr.get(k),setAttribute:(k,v)=>attr.set(k,v)};
}
test('ASCII FBX indexed polygon-vertex alpha is parsed without RGB substitution',()=>{
 const layers=parseAsciiFbxColorLayers(source);
 assert.equal(layers.length,1);
 assert.deepEqual(layers[0].colors.filter((_,i)=>i%4===3),[0,.25,.5,1]);
 assert.deepEqual([...triangulatedAlpha(layers[0],FakeTHREE)],[0,.25,.5,0,.5,1]);
});
test('FBX alpha becomes standalone BufferAttribute and diagnostics display black-to-white',async()=>{
 const layers=await parseFbxColorLayers(new TextEncoder().encode(source).buffer);
 const g=geometry(6);
 const root={traverse:fn=>fn({isMesh:true,geometry:g})};
 const result=restoreFBXAlpha(root,layers,FakeTHREE);
 assert.deepEqual(result,{sourceLayers:1,restored:1,unmatched:0});
 assert.equal(g.getAttribute('alpha').getX(0),0);
 assert.equal(g.getAttribute('alpha').getX(5),1);
 assert.equal(g.userData.fbxAlphaRecovered,true);
 assert.equal(analyzeVertexAlpha(g).zero,2);
});
test('Refuse alpha mapping if triangulated vertex count does not match the mesh',()=>{
 const g=geometry(5);
 const result=restoreFBXAlpha({traverse:fn=>fn({isMesh:true,geometry:g})},parseAsciiFbxColorLayers(source),FakeTHREE);
 assert.equal(result.restored,0);assert.equal(result.unmatched,1);assert.equal(g.getAttribute('alpha'),undefined);
});
test('Indexed alpha mapping respects nontrivial color index order',()=>{
 const s=source.replace('0,1,2,3 }','3,2,1,0 }');
 assert.deepEqual([...triangulatedAlpha(parseAsciiFbxColorLayers(s)[0],FakeTHREE)],[1,.5,.25,1,.25,0]);
});

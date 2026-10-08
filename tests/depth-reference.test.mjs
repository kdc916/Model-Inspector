import {test} from 'node:test';import assert from 'node:assert/strict';
import {DepthPreview} from '../src/depth-preview.js';
class Scene {constructor(){this.children=[]}add(x){this.children.push(x);x.parent=this}}
class Obj {constructor(geometry,material){this.isMesh=true;this.geometry=geometry;this.material=material;this.visible=true;this.position={set(){},copy(){}};this.scale={set(){},copy(){}};this.rotation={};this.matrix={copy(x){this.source=x}};this.matrixWorld={};}removeFromParent(){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null}}
const T={Scene,PlaneGeometry:class {dispose(){}},Mesh:Obj,MeshBasicMaterial:class {dispose(){}},MeshDepthMaterial:class {dispose(){}},BasicDepthPacking:1,DoubleSide:2,UnsignedIntType:3,NearestFilter:4,DepthTexture:class {dispose(){}},WebGLRenderTarget:class {setSize(){}dispose(){}},Box3:class {},Vector3:class {}};
test('compare scene depth copies transform and does not own original geometry',()=>{
 const renderer={getRenderTarget(){return null},setRenderTarget(){},clear(){},render(){}};
 const scene=new Scene(),d=new DepthPreview(T,renderer,scene,{near:.1,far:100});
 const sharedGeo={getAttribute(k){return k==='position'?{}:null}};
 const source=new Obj(sharedGeo,null);const reference={traverse(fn){fn(source)},updateMatrixWorld(){this.updated=true}};
 d.setReferenceRoot(reference);assert.equal(d.extraProbes.length,1);
 assert.equal(d.extraProbes[0].probe.geometry,sharedGeo);
 d.configure(true,false,'comparison');assert.equal(d.probe.visible,false);assert.equal(d.extraProbes[0].probe.visible,true);
 d.render();assert.equal(d.extraProbes[0].probe.matrix.source,source.matrixWorld);
 d.configure(true,true,'plane');assert.equal(d.extraProbes[0].probe.visible,false);assert.equal(d.probe.visible,true);
 d.setReferenceRoot(null);assert.equal(d.extraProbes.length,0);
 d.dispose();assert.equal(scene.children.length,0);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {DepthPreview} from '../src/depth-preview.js';
class Scene {constructor(){this.children=[]}add(o){this.children.push(o);o.parent=this}}
class Obj {constructor(g,m){this.geometry=g;this.material=m;this.position={set(x,y,z){Object.assign(this,{x,y,z})},copy(o){Object.assign(this,o)}};this.scale={set(x,y,z){Object.assign(this,{x,y,z})},copy(o){Object.assign(this,o)}};this.rotation={};this.visible=true}removeFromParent(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}}
const T={Scene, PlaneGeometry:class {dispose(){}}, Mesh:Obj, MeshBasicMaterial:class{dispose(){}},MeshDepthMaterial:class{dispose(){}},BasicDepthPacking:1,DoubleSide:2,UnsignedIntType:3,NearestFilter:4,DepthTexture:class{dispose(){}},WebGLRenderTarget:class{setSize(w,h){this.size=[w,h]}dispose(){}},Box3:class{setFromObject(){return this}isEmpty(){return false}getSize(){return {x:2,y:3,z:2}}getCenter(){return {x:0,y:0,z:0}}get min(){return {y:0}}},Vector3:class{}};
test('Depth preview does not mutate VFX meshes and isolates occluders',()=>{
 let renderCount=0,cleared=0,prev=null;
 const renderer={getRenderTarget(){return prev},setRenderTarget(t){prev=t},clear(){cleared++},render(scene){assert.equal(scene.children.length,1);renderCount++}};
 const scene=new Scene(),camera={near:0.1,far:200};
 const d=new DepthPreview(T,renderer,scene,camera);assert.equal(scene.children.length,1);
 d.configure(true,true);d.resize(450,250);d.fit({});d.render();
 assert.equal(renderCount,1);assert.equal(cleared,1);assert.equal(prev,null);
 assert.deepEqual(d.target.size,[450,250]);assert.equal(d.uniforms.near,0.1);
 d.dispose();assert.equal(scene.children.length,0);
});

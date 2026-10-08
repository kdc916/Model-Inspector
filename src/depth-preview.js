/** Dedicated test-plane depth prepass. Deliberately samples ONLY the provided preview occluder,
 * not other VFX mesh instances. This avoids self-occlusion and prevents scene gizmos from fading particles.
 */
export class DepthPreview {
  constructor(THREE,renderer,scene,camera){
    this.T=THREE;this.renderer=renderer;this.scene=scene;this.camera=camera;
    this.occluderScene=new THREE.Scene();
    this.geometry=new THREE.PlaneGeometry(1,1);
    this.mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({color:0x344e5c,side:THREE.DoubleSide}));
    this.mesh.rotation.x=-Math.PI/2;this.mesh.visible=false;scene.add(this.mesh);
    this.probe=new THREE.Mesh(this.geometry,new THREE.MeshDepthMaterial({depthPacking:THREE.BasicDepthPacking,side:THREE.DoubleSide}));
    this.probe.rotation.x=-Math.PI/2;this.occluderScene.add(this.probe);
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false});
    this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.target.depthTexture.minFilter=this.target.depthTexture.magFilter=THREE.NearestFilter;
    this.enabled=false;this.width=1;this.height=1;this.sourceMode="plane";this.extraProbes=[];this.referenceRoot=null;
  }
  fit(root){
    const T=this.T;if(!root)return;
    const box=new T.Box3().setFromObject(root);if(box.isEmpty())return;
    const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
    const length=Math.max(size.x,size.z,size.y*0.75,1);
    this.mesh.position.set(center.x,box.min.y+Math.max(size.y*.07,0.005),center.z);
    this.mesh.scale.set(length*2.25,length*2.25,1);
    this.probe.position.copy(this.mesh.position);this.probe.scale.copy(this.mesh.scale);
  }
  /** Optional comparison asset serves as a non-self-occluding scene-depth source. Shared geometry is never disposed here. */
  setReferenceRoot(root){
    for(const p of this.extraProbes)p.probe.removeFromParent();
    this.extraProbes=[];this.referenceRoot=root||null;
    root?.traverse?.(obj=>{
      if(!obj.isMesh||!obj.geometry?.getAttribute?.('position'))return;
      const copy=new this.T.Mesh(obj.geometry,this.probe.material);
      copy.matrixAutoUpdate=false;copy.frustumCulled=false;this.occluderScene.add(copy);
      this.extraProbes.push({source:obj,probe:copy});
    });
    this.updateOccluders();
  }
  updateOccluders(){
    if(this.referenceRoot)this.referenceRoot.updateMatrixWorld(true);
    for(const p of this.extraProbes){
      p.probe.matrix.copy(p.source.matrixWorld);
      p.probe.visible=this.enabled&&(this.sourceMode!=='plane')&&p.source.visible;
    }
  }
  resize(w,h){
    this.width=Math.max(1,Math.floor(w));this.height=Math.max(1,Math.floor(h));
    this.target.setSize(this.width,this.height);
  }
  render(){
    if(!this.enabled)return;
    this.updateOccluders();
    const previous=this.renderer.getRenderTarget();
    try{
      this.renderer.setRenderTarget(this.target);this.renderer.clear(true,true,true);
      this.renderer.render(this.occluderScene,this.camera);
    }finally{this.renderer.setRenderTarget(previous);}
  }
  configure(enabled,visible,sourceMode='plane'){
    this.enabled=!!enabled;this.sourceMode=['plane','comparison','both'].includes(sourceMode)?sourceMode:'plane';
    this.mesh.visible=!!enabled&&!!visible&&(this.sourceMode!=='comparison');
    this.probe.visible=!!enabled&&(this.sourceMode!=='comparison');
    for(const entry of this.extraProbes)entry.probe.visible=!!enabled&&(this.sourceMode!=='plane')&&entry.source.visible;
  }
  get uniforms(){return {depthTexture:this.target.depthTexture,width:this.width,height:this.height,near:this.camera.near,far:this.camera.far};}
  dispose(){this.setReferenceRoot(null);this.mesh.removeFromParent();this.probe.removeFromParent();this.geometry.dispose();this.mesh.material.dispose();this.probe.material.dispose();this.target.dispose();this.target.depthTexture.dispose();}
}

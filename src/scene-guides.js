/** Scene-local pivot guides are decoupled from the imported Mesh and never mutate its geometry. */
export function guideLength(diagonal, relative = .35) {
  const d = Number.isFinite(diagonal) ? Math.max(0, diagonal) : 0;
  const r = Number.isFinite(relative) ? Math.max(.05, Math.min(1.5, relative)) : .35;
  return Math.max(.025, d * r);
}
export function formatPivotReadout(node) {
  if (!node?.getWorldPosition) return '—';
  node.updateWorldMatrix?.(true, false);
  const out = node.getWorldPosition(node.position.clone());
  return [out.x, out.y, out.z].map(v => Number.isFinite(v) ? v.toFixed(3) : '—').join(', ');
}
function disposeTree(group) {
  group.traverse(obj => {
    obj.geometry?.dispose?.();
    if (obj.material) for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      m.map?.dispose?.(); m.dispose?.();
    }
  });
}
/** Pivot XYZ arrows with a real origin marker, rather than camera-sized static lines. */
export class SceneGuides {
  constructor(THREE, scene) {
    this.THREE = THREE;this.scene=scene;this.world=null;this.pivots=[];
  }
  clearPivots() {
    for (const {group} of this.pivots) {group.removeFromParent();disposeTree(group);}
    this.pivots=[];
  }
  dispose() {
    this.clearPivots();
    if (this.world) {this.world.removeFromParent();disposeTree(this.world);this.world=null;}
  }
  makeAxis(length) {
    const T=this.THREE;
    const group=new T.Group();group.name='maxVFX Pivot Gizmo';
    const axes=[[[1,0,0],0xf96b6b,'X'],[[0,1,0],0x70df8e,'Y'],[[0,0,1],0x64a9ff,'Z']];
    for (const [xyz,color,label] of axes) {
      const dir=new T.Vector3(...xyz);
      const arrow=new T.ArrowHelper(dir,new T.Vector3(),length,color,length*.18,length*.075);
      arrow.name=`+${label}`;
      arrow.line.material.depthTest=false; arrow.line.material.transparent=true;
      arrow.cone.material.depthTest=false; arrow.cone.material.transparent=true;
      arrow.renderOrder=1000;
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#0d1624';ctx.beginPath();ctx.roundRect(5,5,54,54,12);ctx.fill();
      ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.fillText(label,32,33);
      const texture=new T.CanvasTexture(canvas);
      const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false}));
      sprite.scale.setScalar(length*.23);sprite.position.copy(dir).multiplyScalar(length*1.18);sprite.renderOrder=1001;
      group.add(arrow,sprite);
    }
    const dot=new T.Mesh(new T.SphereGeometry(length*.035,8,6),new T.MeshBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false}));
    dot.name='Pivot Origin'; dot.renderOrder=1002;group.add(dot);
    return group;
  }
  configure(model,meshes,selected,{size=.35,showWorld=false,showPivot=true,scope='selected'}={}) {
    this.clearPivots();
    if (this.world) {this.world.removeFromParent();disposeTree(this.world);this.world=null;}
    if (!model) return;
    model.updateWorldMatrix(true,true);
    const bounds=new this.THREE.Box3().setFromObject(model);
    const diagonal=bounds.isEmpty()?1:bounds.getSize(new this.THREE.Vector3()).length();
    const length=guideLength(diagonal,size);
    if (showWorld) {this.world=this.makeAxis(length);this.world.name='World Axis (0, 0, 0)';this.scene.add(this.world);}
    if (showPivot) {
      const targets=scope==='root'?[model]:scope==='all'?meshes.slice(0,64):[selected||meshes[0]||model];
      for (const node of targets) {const group=this.makeAxis(length);this.scene.add(group);this.pivots.push({node,group});}
      this.followPivots();
    }
  }
  followPivots() {
    for (const {node,group} of this.pivots) {
      node.updateWorldMatrix(true,false);
      node.getWorldPosition(group.position);
      node.getWorldQuaternion(group.quaternion);
    }
  }
}

import * as THREE from 'three';
export function createDemo() {
  const group = new THREE.Group(); group.name = 'Demo / VFX Study';
  const torus = new THREE.Mesh(new THREE.TorusKnotGeometry(1.3,.32,160,16,2,3), new THREE.MeshStandardMaterial({color:0xc4e6e2,metalness:.15,roughness:.42}));
  torus.name = 'Torus Knot · UV Test';torus.position.set(-1.55,.15,0);group.add(torus);
  // Ribbon: centerline over an arc, UV U spans the ribbon length and V the width.
  const segments=100, positions=[],uv=[],vertexRGBA=[],indices=[];
  for(let i=0;i<=segments;i++){
    const t=i/segments;const a=t*Math.PI*1.4;const center=new THREE.Vector3(Math.cos(a)*1.25,Math.sin(a)*.45+Math.sin(t*8)*.2,Math.sin(a)*.9);
    const width=.34+Math.sin(t*Math.PI)*.1;
    for(let j=0;j<2;j++){
      const s=j===0?-1:1;
      positions.push(center.x,center.y+s*width,center.z);uv.push(t*3,j);vertexRGBA.push(1,1,1,Math.min(1,Math.max(0,t)));
    }
  }
  for(let i=0;i<segments;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexRGBA,4));geometry.setIndex(indices);geometry.computeVertexNormals();
  const ribbon=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x80cbdc,side:THREE.DoubleSide,metalness:.05,roughness:.58}));ribbon.name='VFX Ribbon · UV Flow';ribbon.position.set(1.55,.1,0);group.add(ribbon);
  return group;
}
export function makeCheckerTexture(kind='checker') {
  const cv=document.createElement('canvas');cv.width=cv.height=512;const c=cv.getContext('2d');
  if(kind==='checker'){
    const cells=8,size=cv.width/cells;
    for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){
      c.fillStyle=(x+y)%2?'#263d51':'#a2ced3';c.fillRect(x*size,y*size,size,size);
      c.fillStyle=(x+y)%2?'#8cc0c9':'#2a4551';c.font='bold 14px sans-serif';
      c.fillText(`${x},${y}`,x*size+7,y*size+18);
    }
  }else{
    c.fillStyle='#183247';c.fillRect(0,0,512,512);
    c.strokeStyle='#67bfc0';c.lineWidth=2;
    for(let i=0;i<=16;i++){const p=i*32;c.beginPath();c.moveTo(p,0);c.lineTo(p,512);c.stroke();c.beginPath();c.moveTo(0,p);c.lineTo(512,p);c.stroke()}
    c.strokeStyle='#f3d985';c.lineWidth=5;c.strokeRect(2,2,508,508);
    c.fillStyle='#a8e9e0';c.font='bold 60px sans-serif';c.fillText('U →',160,250);c.save();c.translate(35,345);c.rotate(-Math.PI/2);c.fillText('V →',0,0);c.restore();
    c.fillStyle='#f1c86c';for(let y=0;y<4;y++)for(let x=0;x<4;x++)c.fillText(`${x}${y}`,x*128+16,y*128+48);
  }
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.needsUpdate=true;return tex;
}

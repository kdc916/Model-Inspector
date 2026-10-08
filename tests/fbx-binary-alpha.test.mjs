import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {parseFbxColorLayers} from '../src/fbx-alpha-recovery.js';

function makeProp(v, compress=false){
 if(Array.isArray(v)){
  const type=v.some(x=>!Number.isInteger(x))?'d':'i';
  const stride=type==='i'?4:8;
  const raw=Buffer.alloc(v.length*stride);
  for(let i=0;i<v.length;i++)type==='i'?raw.writeInt32LE(v[i],i*4):raw.writeDoubleLE(v[i],i*8);
  const data=compress?deflateSync(raw):raw;
  const prefix=Buffer.alloc(13);prefix[0]=type.charCodeAt(0);prefix.writeUInt32LE(v.length,1);prefix.writeUInt32LE(compress?1:0,5);prefix.writeUInt32LE(data.length,9);
  return Buffer.concat([prefix,data]);
 }
 if(typeof v==='number'){
  const b=Buffer.alloc(9);b[0]=76;b.writeBigInt64LE(BigInt(v),1);return b;
 }
 const content=Buffer.from(v,'utf8');const b=Buffer.alloc(5);b[0]=83;b.writeUInt32LE(content.length,1);return Buffer.concat([b,content]);
}
function writeNode(node,offset,wide=false){
 const name=Buffer.from(node.name,'utf8');
 const props=(node.props||[]).map(p=>makeProp(p,node.compress)).reduce((a,b)=>Buffer.concat([a,b]),Buffer.alloc(0));
 const headerSize=wide?25:13;
 const children=[];let cursor=offset+headerSize+name.length+props.length;
 for(const c of node.children||[]){const buf=writeNode(c,cursor,wide);children.push(buf);cursor+=buf.length;}
 if(children.length){children.push(Buffer.alloc(headerSize));cursor+=headerSize;}
 const h=Buffer.alloc(headerSize);
 if(wide){h.writeBigUInt64LE(BigInt(cursor),0);h.writeBigUInt64LE(BigInt(node.props?.length||0),8);h.writeBigUInt64LE(BigInt(props.length),16);h[24]=name.length;}
 else{h.writeUInt32LE(cursor,0);h.writeUInt32LE(node.props?.length||0,4);h.writeUInt32LE(props.length,8);h[12]=name.length;}
 return Buffer.concat([h,name,props,...children]);
}
function makeBinaryFBX(version=7400,compressed=false){
 const props = (name,...p)=>({name,props:p});
 const geom={name:'Geometry',props:[44,'Geometry::MeshAlpha','Mesh'],children:[
  props('Vertices',[0,0,0,1,0,0,1,1,0]),props('PolygonVertexIndex',[0,1,-3]),
  {name:'LayerElementColor',props:[0],children:[
   props('MappingInformationType','ByPolygonVertex'),props('ReferenceInformationType','IndexToDirect'),
   {...props('Colors',[1,1,1,0,1,1,1,.5,1,1,1,1]),compress:compressed},
   props('ColorIndex',[0,1,2])]}]};
 const prefix=Buffer.alloc(27);Buffer.from('Kaydara FBX Binary  \0\x1a\0','latin1').copy(prefix,0);prefix.writeUInt32LE(version,23);
 const body=writeNode({name:'Objects',children:[geom]},27,version>=7500);
 return Buffer.concat([prefix,body]);
}
for(const [version,compress] of [[7400,false],[7400,true],[7500,false],[7500,true]]){
 test(`parse binary FBX ${version}, deflate=${compress}`,async()=>{
  const bytes=makeBinaryFBX(version,compress);
  const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const g=await parseFbxColorLayers(raw);
  assert.equal(g.length,1);
  assert.equal(g[0].name,'MeshAlpha');
  assert.deepEqual(g[0].colors.filter((_,i)=>i%4===3),[0,.5,1]);
  assert.deepEqual(g[0].indices,[0,1,2]);
 });
}

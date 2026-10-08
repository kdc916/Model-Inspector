/**
 * FBX vertex alpha recovery (Three.js FBXLoader r186 companion).
 * FBXLoader currently parses 4-channel LayerElementColor but only writes RGB
 * to BufferGeometry. Rebuild alpha per triangulated polygon corner after load.
 * Supports ASCII FBX 7.x and binary FBX 7.x (including zlib FBX arrays).
 * Leaves raw files untouched and refuses ambiguous geometry matches.
 */
const ARRAY_LIMIT = 20_000_000;
const textDecoder = new TextDecoder();

const floats = text => {
  const values = text.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g) || [];
  if (values.length > ARRAY_LIMIT) throw new Error('FBX color array exceeds browser safety limit');
  return values.map(Number);
};
function blockAfter(source, start) {
  const brace = source.indexOf('{', start);
  if (brace < 0) return '';
  let depth = 1, quoted = false;
  for (let i = brace + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '"' && source[i - 1] !== '\\') quoted = !quoted;
    if (quoted) continue;
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(brace + 1, i);
  }
  return '';
}
function asciiArray(block, name) {
  const match = new RegExp(`\\b${name}:\\s*\\*(\\d+)\\s*\\{\\s*a:\\s*([^}]*)\\}`, 's').exec(block);
  if (!match) return null;
  const count = Number(match[1]);
  if (count > ARRAY_LIMIT) throw new Error(`FBX ${name} exceeds browser safety limit`);
  const values = floats(match[2]);
  return count === values.length ? values : null;
}
const quotedField = (s, field) => new RegExp(`\\b${field}:\\s*"([^"]*)"`).exec(s)?.[1] || null;
export function parseAsciiFbxColorLayers(source) {
  if (!source.includes('FBXHeaderExtension:') && !source.startsWith('; FBX')) return [];
  const geometries = [];
  const pattern = /\bGeometry:\s*(-?\d+),\s*"Geometry::([^"]*)",\s*"Mesh"\s*\{/g;
  for (const m of source.matchAll(pattern)) {
    const body = blockAfter(source, m.index);
    const match = /\bLayerElementColor:\s*\d+\s*\{/g.exec(body);
    if (!match) continue;
    const layer = blockAfter(body, match.index);
    const colors = asciiArray(layer,'Colors');
    const indices = asciiArray(layer,'ColorIndex') || [];
    const polygonIndices = asciiArray(body,'PolygonVertexIndex');
    const positions = asciiArray(body,'Vertices');
    if (!positions || !polygonIndices || !colors || colors.length % 4 !== 0) continue;
    geometries.push({id:m[1],name:m[2],positions,polygonIndices,colors,indices,
      mapping:quotedField(layer,'MappingInformationType') || 'ByPolygonVertex',
      reference:quotedField(layer,'ReferenceInformationType') || 'Direct'});
  }
  return geometries;
}

const readBig = (view, off) => {
  const n = view.getBigUint64(off, true);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('FBX offset exceeds safe integer limit');
  return Number(n);
};
async function inflateBinary(raw) {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream unavailable for compressed FBX data');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function parseBinaryFbxLayers(buffer) {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const version = dv.getUint32(23, true);
  const wide = version >= 7500;
  const headerSize = wide ? 25 : 13;
  const fileEnd = bytes.length;
  const getU = off => wide ? readBig(dv,off) : dv.getUint32(off,true);
  const str = (a,b) => textDecoder.decode(bytes.subarray(a,b));
  async function parseProperty(offset) {
    const type = String.fromCharCode(bytes[offset++]);
    if (type === 'S' || type === 'R') {
      const n = dv.getUint32(offset,true);offset+=4;
      if(offset+n>fileEnd) throw new Error('Invalid FBX property length');
      const value=type==='S'?str(offset,offset+n):null;
      return [value,offset+n];
    }
    const scalar = {Y:2,C:1,I:4,F:4,D:8,L:8};
    if (scalar[type]) {
      const n=scalar[type];if(offset+n>fileEnd)throw new Error('Truncated FBX scalar');
      let value;
      if(type==='Y')value=dv.getInt16(offset,true);
      if(type==='C')value=bytes[offset]!==0;
      if(type==='I')value=dv.getInt32(offset,true);
      if(type==='L')value=String(dv.getBigInt64(offset,true));
      if(type==='F')value=dv.getFloat32(offset,true);
      if(type==='D')value=dv.getFloat64(offset,true);
      return [value,offset+n];
    }
    const arrTypes={f:[4,'getFloat32'],d:[8,'getFloat64'],i:[4,'getInt32'],l:[8,'getBigInt64'],b:[1,'getUint8'],c:[1,'getUint8']};
    if(!arrTypes[type])throw new Error(`Unsupported FBX field ${type}`);
    const len=dv.getUint32(offset,true),encoding=dv.getUint32(offset+4,true),compressedBytes=dv.getUint32(offset+8,true);
    offset+=12;
    if(len>ARRAY_LIMIT||offset+compressedBytes>fileEnd)throw new Error('FBX array size invalid');
    const [stride,reader]=arrTypes[type];
    const data=bytes.subarray(offset,offset+compressedBytes);
    const raw=encoding===1?await inflateBinary(data):data;
    if(encoding!==0&&encoding!==1)throw new Error('Unsupported FBX array compression');
    if(raw.byteLength<len*stride)throw new Error('Truncated FBX array data');
    const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
    const values=new Array(len);
    for(let i=0;i<len;i++)values[i]=typeof view[reader](i*stride,true)==='bigint'?Number(view[reader](i*stride,true)):view[reader](i*stride,true);
    return [values,offset+compressedBytes];
  }
  async function nodeAt(start) {
    if(start+headerSize>fileEnd)return null;
    const end=getU(start),properties=getU(start+(wide?8:4)),propBytes=getU(start+(wide?16:8));
    const nameLength=bytes[start+(wide?24:12)];
    if(!end)return null;
    if(end<=start||end>fileEnd||properties>128||propBytes>fileEnd)throw new Error('Invalid FBX node header');
    const name=str(start+headerSize,start+headerSize+nameLength);
    let pos=start+headerSize+nameLength;
    let values=[];
    const wantsProps=['Geometry','LayerElementColor','MappingInformationType','ReferenceInformationType','Vertices','PolygonVertexIndex','Colors','ColorIndex'].includes(name);
    if(wantsProps){for(let i=0;i<properties;i++){const [value,next]=await parseProperty(pos);pos=next;values.push(value);}}
    else pos+=propBytes;
    return {name,values,startChildren:pos,end,next:end};
  }
  const result=[];
  let pos=27;
  while(pos<fileEnd){
    const top=await nodeAt(pos);if(!top)break;
    if(top.name==='Objects'){
      let sub=top.startChildren;
      while(sub<top.end-headerSize){
        const g=await nodeAt(sub);if(!g)break;
        if(g.name==='Geometry'&&g.values[2]==='Mesh'){
          const data={id:String(g.values[0]),name:String(g.values[1]||'').replace(/^Geometry::/,''),positions:null,polygonIndices:null,colors:null,indices:[],mapping:'ByPolygonVertex',reference:'Direct'};
          let childPos=g.startChildren;
          while(childPos<g.end-headerSize){
            const child=await nodeAt(childPos);if(!child)break;
            if(child.name==='Vertices')data.positions=child.values[0];
            if(child.name==='PolygonVertexIndex')data.polygonIndices=child.values[0];
            if(child.name==='LayerElementColor'){
              let layerPos=child.startChildren;
              while(layerPos<child.end-headerSize){
                const field=await nodeAt(layerPos);if(!field)break;
                if(field.name==='Colors')data.colors=field.values[0];
                if(field.name==='ColorIndex')data.indices=field.values[0];
                if(field.name==='MappingInformationType')data.mapping=field.values[0];
                if(field.name==='ReferenceInformationType')data.reference=field.values[0];
                layerPos=field.next;
              }
            }
            childPos=child.next;
          }
          if(data.positions&&data.polygonIndices&&data.colors?.length%4===0)result.push(data);
        }
        sub=g.next;
      }
    }
    pos=top.next;
  }
  return result;
}
export async function parseFbxColorLayers(buffer) {
  const bytes=new Uint8Array(buffer);
  const binaryMagic='Kaydara FBX Binary';
  if(textDecoder.decode(bytes.subarray(0,18))===binaryMagic)return parseBinaryFbxLayers(buffer);
  return parseAsciiFbxColorLayers(textDecoder.decode(bytes));
}

function channelAt(g, polygonCorner, polygonIndex, vertexIndex) {
  const key=g.mapping==='ByPolygonVertex'?polygonCorner:
    ['ByVertice','ByVertex','ByControlPoint'].includes(g.mapping)?vertexIndex:
    g.mapping==='ByPolygon'?polygonIndex:g.mapping==='AllSame'?0:-1;
  if(key<0)return null;
  const direct=g.reference==='IndexToDirect'||g.reference==='Index' ?g.indices[key]:key;
  const v=g.colors[direct*4+3];
  return Number.isFinite(v)?Math.min(1,Math.max(0,v)):null;
}
function projectFace(indices,positions,THREE) {
  const vectors=indices.map(i=>new THREE.Vector3(...positions.slice(i*3,i*3+3)));
  const normal=new THREE.Vector3();
  for(let i=0;i<vectors.length;i++){
    const a=vectors[i],b=vectors[(i+1)%vectors.length];
    normal.x+=(a.y-b.y)*(a.z+b.z);
    normal.y+=(a.z-b.z)*(a.x+b.x);
    normal.z+=(a.x-b.x)*(a.y+b.y);
  }
  normal.normalize();
  const up=Math.abs(normal.z)>.5?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
  const tangent=up.cross(normal).normalize();
  const bitangent=normal.clone().cross(tangent).normalize();
  const coords=vectors.map(v=>new THREE.Vector2(v.dot(tangent),v.dot(bitangent)));
  return THREE.ShapeUtils.triangulateShape(coords,[]);
}
export function triangulatedAlpha(g,THREE) {
  if(!g?.polygonIndices||!g?.positions||!g?.colors)return null;
  const alpha=[];
  const face=[];
  let polygonIndex=0;
  for(let corner=0;corner<g.polygonIndices.length;corner++){
    const raw=g.polygonIndices[corner];
    const vertexIndex=raw<0?(raw^-1):raw;
    if(vertexIndex<0||vertexIndex*3+2>=g.positions.length)return null;
    face.push({vertexIndex,alpha:channelAt(g,corner,polygonIndex,vertexIndex)});
    if(raw>=0)continue;
    const tris=face.length===3?[[0,1,2]]:face.length>3?projectFace(face.map(x=>x.vertexIndex),g.positions,THREE):[];
    for(const tri of tris)for(const i of tri){
      const v=face[i]?.alpha;
      if(v===null||v===undefined)return null;
      alpha.push(v);
    }
    face.length=0;polygonIndex++;
  }
  if(face.length)return null;
  return Float32Array.from(alpha);
}

export function restoreFBXAlpha(root,layers,THREE) {
  const unique = [];
  root.traverse(o=>{if(o.isMesh&&o.geometry?.getAttribute('position')&&!unique.includes(o.geometry))unique.push(o.geometry)});
  const mapped=new Set();let restored=0,unmatched=0;
  for(const layer of layers){
    const values=triangulatedAlpha(layer,THREE);
    if(!values?.length){unmatched++;continue;}
    const candidates=unique.filter(g=>!mapped.has(g)&&g.getAttribute('position').count===values.length&&(!layer.name||g.name===layer.name));
    // Name mismatch can occur when FBX exporters omit Geometry names; count must remain unambiguous.
    const byCount=candidates.length?candidates:unique.filter(g=>!mapped.has(g)&&g.getAttribute('position').count===values.length);
    if(byCount.length!==1){unmatched++;continue;}
    const geometry=byCount[0];mapped.add(geometry);
    geometry.setAttribute('alpha',new THREE.Float32BufferAttribute(values,1));
    geometry.userData.fbxAlphaRecovered=true;
    geometry.userData.fbxAlphaSource='LayerElementColor.a';
    restored++;
  }
  return {sourceLayers:layers.length,restored,unmatched};
}

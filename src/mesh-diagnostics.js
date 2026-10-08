/**
 * Geometry diagnostics use BufferGeometry-compatible attributes without importing Three.js.
 * Per-face UV stretch is relative to the *median linear world-units/UV-unit* of the mesh.
 * This is not texel density: texture resolution is intentionally not part of the metric.
 */
export const MAX_STRETCH_TRIANGLES = 180000;
const EPS = 1e-12;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const resolveIndex = (geometry, k) => geometry.index ? geometry.index.getX(k) : k;
function transformedPosition(position, id, elements) {
  const x=position.getX(id), y=position.getY(id), z=position.getZ(id);
  if (!elements) return [x,y,z];
  const w=elements[3]*x+elements[7]*y+elements[11]*z+elements[15];
  const inv = w && Number.isFinite(w) ? 1/w : 1;
  return [
    (elements[0]*x+elements[4]*y+elements[8]*z+elements[12])*inv,
    (elements[1]*x+elements[5]*y+elements[9]*z+elements[13])*inv,
    (elements[2]*x+elements[6]*y+elements[10]*z+elements[14])*inv
  ];
}
function area3D(a,b,c) {
  const ax=b[0]-a[0], ay=b[1]-a[1], az=b[2]-a[2];
  const bx=c[0]-a[0], by=c[1]-a[1], bz=c[2]-a[2];
  return Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)*0.5;
}
function gradient(logRatio) {
  // Blue = more UV coverage per world unit, green = median, red = less UV coverage.
  const t=clamp(logRatio / 1.5,-1,1);
  const low=[0.17,0.53,0.98], center=[0.17,0.82,0.56], high=[1,0.27,0.17];
  const from=t<0?center:center, to=t<0?low:high, q=Math.abs(t);
  return from.map((v,i)=>v*(1-q)+to[i]*q);
}

export function analyzeUVStretch(geometry, channel=0, matrixElements=null) {
  const position=geometry?.getAttribute('position');
  const uv=geometry?.getAttribute(channel===0?'uv':`uv${channel}`);
  const faces=Math.floor((geometry?.index?.count ?? position?.count ?? 0)/3);
  const common={faces, validFaces:0, degenerateUV:0, degenerateGeometry:0, outlierFaces:0, medianScale:null, colors:null};
  if (!position || !uv) return {...common, reason:'missing-uv'};
  if (faces>MAX_STRETCH_TRIANGLES) return {...common, reason:'limit'};
  const scales=new Float64Array(faces);
  const valid=[];
  for(let face=0;face<faces;face++) {
    const ids=[resolveIndex(geometry,face*3),resolveIndex(geometry,face*3+1),resolveIndex(geometry,face*3+2)];
    if(ids.some(i=>i>=position.count||i>=uv.count||i<0)) { common.degenerateGeometry++;continue; }
    const p=ids.map(i=>transformedPosition(position,i,matrixElements));
    const worldArea=area3D(...p);
    const a=[uv.getX(ids[0]),uv.getY(ids[0])];
    const b=[uv.getX(ids[1]),uv.getY(ids[1])];
    const c=[uv.getX(ids[2]),uv.getY(ids[2])];
    const uvArea=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))*0.5;
    if(!Number.isFinite(worldArea)||worldArea<EPS) {common.degenerateGeometry++;continue;}
    if(!Number.isFinite(uvArea)||uvArea<EPS) {common.degenerateUV++;continue;}
    const scale=Math.sqrt(worldArea/uvArea);
    if(!Number.isFinite(scale)) {common.degenerateUV++;continue;}
    scales[face]=scale;valid.push(scale);
  }
  if(!valid.length) return {...common, reason:'no-valid-faces'};
  valid.sort((a,b)=>a-b);
  const mid=Math.floor(valid.length/2);
  const median=valid.length%2?valid[mid]:(valid[mid-1]+valid[mid])/2;
  const colors=new Float32Array(faces*9);
  for(let f=0;f<faces;f++) {
    const logRatio=scales[f]>0?Math.log2(scales[f]/median):null;
    if(logRatio!==null&&Math.abs(logRatio)>0.75) common.outlierFaces++;
    const color=logRatio===null?[0.38,0.38,0.42]:gradient(logRatio);
    for(let v=0;v<3;v++)colors.set(color,f*9+v*3);
  }
  return {...common, validFaces:valid.length, medianScale:median, colors, reason:null};
}

/**
 * Three.js BufferAttributes can be Float32, normalized Uint8/Uint16, or raw integer data.
 * Never manufacture an opaque alpha from RGB-only colors; missing A is not the same as A=1.
 */
export function readColorComponent(attribute, i, component) {
  if (!attribute || i < 0 || i >= attribute.count || component >= attribute.itemSize) return null;
  const read = ['getX','getY','getZ','getW'][component];
  if (typeof attribute[read] !== 'function') return null;
  let v = attribute[read](i);
  if (!Number.isFinite(v)) return null;
  const data = attribute.array ?? attribute.data?.array;
  if (!attribute.normalized && data instanceof Uint8Array) v /= 255;
  else if (!attribute.normalized && data instanceof Uint16Array) v /= 65535;
  return clamp(v,0,1);
}

/** Explicit standalone geometry alpha is supported, but RGB is NEVER silently read as alpha. */
export function locateVertexAlpha(geometry) {
  const color=geometry?.getAttribute('color');
  const alpha=geometry?.getAttribute('alpha');
  if (color?.itemSize>=4) return {attribute:color,component:3,source:'color.a'};
  if (alpha?.itemSize>=1) return {attribute:alpha,component:0,source:'alpha'};
  return {attribute:null,component:-1,source:null};
}

export function extractVertexColors(geometry, channel='rgb') {
  const position=geometry?.getAttribute('position');
  if(!position)return null;
  const color=geometry.getAttribute('color');
  const alpha=locateVertexAlpha(geometry);
  if(channel==='a' && !alpha.attribute) return null;
  if(channel!=='a' && !color) return null;
  const out=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++) {
    const v=channel==='a' ? readColorComponent(alpha.attribute,i,alpha.component) : null;
    if(channel==='a') { const a=v??0.35; out.set([a,a,a],i*3);continue; }
    const r=readColorComponent(color,i,0)??0.35;
    const g=readColorComponent(color,i,1)??0.35;
    const b=readColorComponent(color,i,2)??0.35;
    if(channel==='rgb')out.set([r,g,b],i*3);
    else {const c=({r,g,b})[channel]??0.35;out.set([c,c,c],i*3);}
  }
  return out;
}

export function analyzeVertexAlpha(geometry) {
  const position=geometry?.getAttribute('position');
  const color=geometry?.getAttribute('color');
  const vertices=position?.count||0;
  const {attribute,component,source}=locateVertexAlpha(geometry);
  const common={vertices,hasColors:!!color,hasAlpha:!!attribute,source,sampled:0,
    min:null,max:null,average:null,zero:0,partial:0,opaque:0,invalid:0,reason:null};
  if(!vertices)return {...common,reason:'no-vertices'};
  if(!attribute)return {...common,reason:color?'rgb-only':'missing-color'};
  const count=Math.min(vertices,attribute.count);
  if(count===0)return {...common,reason:'alpha-empty'};
  const stride=Math.max(1,Math.ceil(count/250000));
  let min=1,max=0,sum=0,zero=0,partial=0,opaque=0,invalid=0,sampled=0;
  for(let i=0;i<count;i+=stride){
    const a=readColorComponent(attribute,i,component);
    if(a===null){invalid++;continue;}
    min=Math.min(min,a);max=Math.max(max,a);sum+=a;sampled++;
    if(a<=0.001)zero++;else if(a>=0.999)opaque++;else partial++;
  }
  const reason=!sampled?'invalid-alpha':max<=.001?'all-black':min>=.999?'all-white':'varying-alpha';
  return {...common,sampled,min:sampled?min:null,max:sampled?max:null,
    average:sampled?sum/sampled:null,zero,partial,opaque,invalid,reason};
}

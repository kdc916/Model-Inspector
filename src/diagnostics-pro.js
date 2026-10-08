/**
 * v0.9.5: deterministic, renderer-independent VFX mesh / UV quality analysis.
 * A negative UV winding or a UV overlap is a diagnostic observation, not an error:
 * mirrored islands and stacked VFX UV shells are common intentional techniques.
 */
export const DIAGNOSTIC_LIMITS = Object.freeze({ maxFaces: 300000, maxOverlapTests: 350000, maxGridCells: 400000 });
const EPS = 1e-10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const area2 = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function intersectionArea(a,b) {
  let polygon = a;
  const sign=Math.sign(area2(...b)) || 1;
  for(let k=0;k<3 && polygon.length;k++) {
    const q=b[k],r=b[(k+1)%3],out=[];
    let prev=polygon[polygon.length-1];
    for(const curr of polygon) {
      const dp=area2(q,r,prev)*sign,dc=area2(q,r,curr)*sign;
      const ip=dp>=-EPS,ic=dc>=-EPS;
      if(ip!==ic){const d=dp-dc; if(Math.abs(d)>1e-20){const t=dp/d;out.push([prev[0]+(curr[0]-prev[0])*t,prev[1]+(curr[1]-prev[1])*t]);}}
      if(ic)out.push(curr);
      prev=curr;
    }
    polygon=out;
  }
  let s=0;
  for(let k=0;k<polygon.length;k++){const a=polygon[k],b=polygon[(k+1)%polygon.length];s+=a[0]*b[1]-a[1]*b[0];}
  return Math.abs(s)*.5;
}
const xyz = (array, i) => [array[3*i],array[3*i+1],array[3*i+2]];
const uvAt = (array,i) => [array[2*i],array[2*i+1]];
/** Snapshot explicitly serializes attributes because normalized/interleaved BufferAttributes are not plain arrays. */
export function createDiagnosticSnapshot(geometry, name='Mesh', channel=0, matrixWorld=null) {
  const p=geometry?.getAttribute?.('position');
  if(!p)throw Error('Position attribute is required');
  if(p.count>6000000)throw Error('Too many vertices for browser analysis (>6M)');
  const position=new Float32Array(p.count*3);
  const m=matrixWorld?.elements||matrixWorld;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(m?.length===16){
      const w=m[3]*x+m[7]*y+m[11]*z+m[15];const q=w?1/w:1;
      position[3*i]=(m[0]*x+m[4]*y+m[8]*z+m[12])*q;
      position[3*i+1]=(m[1]*x+m[5]*y+m[9]*z+m[13])*q;
      position[3*i+2]=(m[2]*x+m[6]*y+m[10]*z+m[14])*q;
    }else{position[3*i]=x;position[3*i+1]=y;position[3*i+2]=z;}
  }
  const rawIndex=geometry.index;
  const index=rawIndex ? new Uint32Array(rawIndex.count) : null;
  if(index)for(let i=0;i<index.length;i++)index[i]=rawIndex.getX(i);
  const u=geometry.getAttribute(channel===0?'uv':`uv${channel}`);
  const uv=u?new Float32Array(u.count*2):null;
  if(u)for(let i=0;i<u.count;i++){uv[2*i]=u.getX(i);uv[2*i+1]=u.getY(i);}
  const n=geometry.getAttribute('normal');
  const normal=n?new Float32Array(n.count*3):null;
  if(n)for(let i=0;i<n.count;i++){normal[3*i]=n.getX(i);normal[3*i+1]=n.getY(i);normal[3*i+2]=n.getZ(i);}
  return {name:String(name).slice(0,150),position,index,uv,normal};
}

export function inspectGeometryPro(s, opts={}) {
  const p=s.position,inds=s.index,u=s.uv,n=s.normal;
  const vertexCount=Math.floor((p?.length||0)/3);
  const faces=Math.floor((inds?.length??vertexCount)/3);
  const limit=Math.min(faces, clamp(Math.floor(Number(opts.maxFaces)||150000),1,DIAGNOSTIC_LIMITS.maxFaces));
  const maxOverlapTests=clamp(Math.floor(Number(opts.maxOverlapTests)||200000),1000,DIAGNOSTIC_LIMITS.maxOverlapTests);
  const resolution=clamp(Math.floor(Number(opts.resolution)||1024),1,32768);
  const unitsPerMeter=clamp(Number(opts.unitsPerMeter)||1,.00001,100000);
  const report={name:s.name||'Mesh',vertices:vertexCount,faces,analyzed:limit,partial:limit<faces,
    uvMissing:!u,normalMissing:!n,invalidIndex:0,degenerateUV:0,flippedUV:0,degenerateGeometry:0,
    overlaps:0,overlapPairs:0,overlapTested:0,overlapIncomplete:false,invalidNormals:0,opposingNormals:0,
    texelDensityPxPerMeter:null,texelDensityMin:null,texelDensityMax:null,duplicatePositionVertices:0,
    uvOutOfBoundsFaces:0,notes:[]};
  if(!p||vertexCount<1)return report;
  const groups=new Set();
  for(let v=0;v<vertexCount;v++) {
    const key=[p[3*v],p[3*v+1],p[3*v+2]].map(x=>Number.isFinite(x)?Math.round(x*100000):'NaN').join(',');
    if(groups.has(key))report.duplicatePositionVertices++;else groups.add(key);
  }
  const perFace=[];const grid=new Map(),tiles=new Set();
  const res=16;let totalWorldArea=0,totalUVArea=0, minDensity=Infinity,maxDensity=0,cellBudget=0;
  for(let f=0;f<limit;f++){
    const ids=[0,1,2].map(k=>inds?inds[3*f+k]:f*3+k);
    if(ids.some(v=>!Number.isInteger(v)||v<0||v>=vertexCount)){report.invalidIndex++;continue;}
    const pts=ids.map(v=>xyz(p,v));
    if(pts.some(v=>v.some(x=>!Number.isFinite(x)))){report.degenerateGeometry++;continue;}
    const v1=pts[1].map((v,j)=>v-pts[0][j]); const v2=pts[2].map((v,j)=>v-pts[0][j]);
    const cross=[v1[1]*v2[2]-v1[2]*v2[1],v1[2]*v2[0]-v1[0]*v2[2],v1[0]*v2[1]-v1[1]*v2[0]];
    const area3d=Math.hypot(...cross)*.5;
    if(!Number.isFinite(area3d)||area3d<EPS){report.degenerateGeometry++;continue;}
    if(n&&ids.every(i=>i*3+2<n.length)){
      const nn=xyz(n,ids[0]),len=Math.hypot(...nn);
      if(!Number.isFinite(len)||len<.5||len>1.5)report.invalidNormals++;
      else if(cross[0]*nn[0]+cross[1]*nn[1]+cross[2]*nn[2]<-EPS)report.opposingNormals++;
    }
    if(!u)continue;
    if(ids.some(v=>v*2+1>=u.length)){report.degenerateUV++;continue;}
    const tri=ids.map(v=>uvAt(u,v));
    if(tri.some(v=>v.some(x=>!Number.isFinite(x)))){report.degenerateUV++;continue;}
    const signed=area2(...tri),uvArea=Math.abs(signed)*.5;
    if(uvArea<EPS){report.degenerateUV++;continue;}
    if(signed<0)report.flippedUV++;
    if(tri.some(c=>c.some(x=>x<-EPS||x>1+EPS)))report.uvOutOfBoundsFaces++;
    totalWorldArea+=area3d;totalUVArea+=uvArea;
    const density=resolution*Math.sqrt(uvArea/area3d)*unitsPerMeter;
    minDensity=Math.min(minDensity,density);maxDensity=Math.max(maxDensity,density);
    // Dedupe candidate tests per face: large triangles span many hash buckets.
    if(report.overlapIncomplete)continue;
    const minX=Math.min(...tri.map(v=>v[0])),maxX=Math.max(...tri.map(v=>v[0]));
    const minY=Math.min(...tri.map(v=>v[1])),maxY=Math.max(...tri.map(v=>v[1]));
    const gx0=Math.floor(minX*res),gx1=Math.floor(maxX*res),gy0=Math.floor(minY*res),gy1=Math.floor(maxY*res);
    const count=(gx1-gx0+1)*(gy1-gy0+1);
    if(count>512||cellBudget+count>DIAGNOSTIC_LIMITS.maxGridCells){report.overlapIncomplete=true;continue;}
    const candidates=new Set();
    for(let gx=gx0;gx<=gx1;gx++)for(let gy=gy0;gy<=gy1;gy++){
      const key=gx+','+gy;
      for(const id of grid.get(key)||[])candidates.add(id);
    }
    for(const i of candidates){
      if(report.overlapTested>=maxOverlapTests){report.overlapIncomplete=true;break;}
      report.overlapTested++;
      if(intersectionArea(perFace[i],tri)>1e-9){report.overlapPairs++;}
    }
    const tid=perFace.length;perFace.push(tri);
    for(let gx=gx0;gx<=gx1;gx++)for(let gy=gy0;gy<=gy1;gy++){
      const key=gx+','+gy; if(!grid.has(key))grid.set(key,[]);grid.get(key).push(tid);cellBudget++;
    }
  }
  if(totalWorldArea>EPS&&totalUVArea>0){
    report.texelDensityPxPerMeter=resolution*Math.sqrt(totalUVArea/totalWorldArea)*unitsPerMeter;
    report.texelDensityMin=minDensity;report.texelDensityMax=maxDensity;
  }
  report.overlaps=report.overlapPairs;
  if(report.partial)report.notes.push(`Scanned first ${limit} of ${faces} faces`);
  if(report.overlapIncomplete)report.notes.push('Overlap scan reached safety budget; pair count is a lower bound');
  if(report.uvMissing)report.notes.push('No UV channel');
  return report;
}
export function summarizeDiagnostics(reports,options={}) {
  const totals={meshes:reports.length,faces:0,analyzed:0,degenerateGeometry:0,degenerateUV:0,flippedUV:0,overlapPairs:0,invalidNormals:0,opposingNormals:0,invalidIndex:0,uvOutOfBoundsFaces:0,duplicatePositionVertices:0,partialMeshes:0,missingUVMeshes:0,overlapIncompleteMeshes:0};
  for(const r of reports){for(const key of ['faces','analyzed','degenerateGeometry','degenerateUV','flippedUV','overlapPairs','invalidNormals','opposingNormals','invalidIndex','uvOutOfBoundsFaces','duplicatePositionVertices'])totals[key]+=r[key]||0;
    totals.partialMeshes+=Number(r.partial);totals.missingUVMeshes+=Number(r.uvMissing);totals.overlapIncompleteMeshes+=Number(r.overlapIncomplete);
  }
  return {version:'0.9.5',options,summary:totals,reports,notes:['UV overlap, mirrored/stacked UVs and duplicated positions may be intentional in game VFX.','Texel density uses user-specified texture resolution and model units per meter.','Overlap pair counts are lower bounds when safety budgets are reached.']};
}

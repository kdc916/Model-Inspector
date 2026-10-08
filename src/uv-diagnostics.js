/** Geometry-only checks; overlapping UVs may be intentional for VFX. */
export const MAX_UV_DIAGNOSTIC_FACES = 5000;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const x=(geo,i)=>geo.index?geo.index.getX(i):i;
function areaOverlap(a,b){
  let poly=a.map(p=>[...p]);
  const winding=Math.sign(cross(b[0],b[1],b[2]))||1;
  for(let edge=0;edge<3&&poly.length;edge++){
    const begin=b[edge],end=b[(edge+1)%3],input=poly;
    poly=[];
    let prev=input[input.length-1];
    for(const curr of input){
      const dp=cross(begin,end,prev)*winding,dc=cross(begin,end,curr)*winding;
      const ip=dp>=-1e-10,ic=dc>=-1e-10;
      if(ip!==ic){
        const t=dp/(dp-dc);poly.push([prev[0]+(curr[0]-prev[0])*t,prev[1]+(curr[1]-prev[1])*t]);
      }
      if(ic)poly.push(curr);
      prev=curr;
    }
  }
  let signed=0;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];signed+=a[0]*b[1]-a[1]*b[0];}
  return Math.abs(signed)*0.5;
}
export function diagnoseUV(geometry,channel=0) {
  const uv=geometry?.getAttribute(channel?'uv'+channel:'uv');
  const pos=geometry?.getAttribute('position'),normal=geometry?.getAttribute('normal');
  const faces=Math.floor((geometry?.index?.count??pos?.count??0)/3);
  const report={faces,analyzed:0,flipped:0,degenerate:0,overlapPairs:0,missingUV:!uv,missingNormal:!normal,invalidNormals:0,opposingNormals:0,partial:false};
  if(!pos)return report;
  const nc=normal?.count??0;
  for(let i=0;i<Math.min(nc,75000);i++){
    const l=Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i));if(!Number.isFinite(l)||l<.5)report.invalidNormals++;
  }
  if(!uv)return report;
  // Limit cost: real-world production meshes can exceed millions of triangles.
  const limit=Math.min(faces,MAX_UV_DIAGNOSTIC_FACES);report.partial=faces>limit;
  const grid=new Map(),checked=new Set();const RES=24;let comparisons=0;
  for(let f=0;f<limit;f++){
    const ids=[x(geometry,f*3),x(geometry,f*3+1),x(geometry,f*3+2)];
    if(ids.some(i=>i>=uv.count||i>=pos.count)){report.degenerate++;continue;}
    const a=ids.map(i=>[uv.getX(i),uv.getY(i)]);
    if(a.some(p=>!p.every(Number.isFinite))){report.degenerate++;continue;}
    const area=cross(a[0],a[1],a[2]);report.analyzed++;
    if(Math.abs(area)<1e-10){report.degenerate++;continue;}
    if(area<0)report.flipped++;
    if(normal&&ids.every(i=>i<normal.count)){
      const p=ids.map(i=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);
      const e=p[1].map((v,j)=>v-p[0][j]),h=p[2].map((v,j)=>v-p[0][j]);
      const gn=[e[1]*h[2]-e[2]*h[1],e[2]*h[0]-e[0]*h[2],e[0]*h[1]-e[1]*h[0]];
      const dot=gn[0]*normal.getX(ids[0])+gn[1]*normal.getY(ids[0])+gn[2]*normal.getZ(ids[0]);
      if(dot< -1e-9)report.opposingNormals++;
    }
    const bounds=[Math.min(...a.map(p=>p[0])),Math.max(...a.map(p=>p[0])),Math.min(...a.map(p=>p[1])),Math.max(...a.map(p=>p[1]))];
    // UV tiles outside 0..1 are still considered; clamp cell indexing to bound memory.
    const cells=[];
    const loX=Math.floor(bounds[0]*RES),hiX=Math.floor(bounds[1]*RES),loY=Math.floor(bounds[2]*RES),hiY=Math.floor(bounds[3]*RES);
    if((hiX-loX+1)*(hiY-loY+1)>2500)continue;
    for(let gx=loX;gx<=hiX;gx++)for(let gy=loY;gy<=hiY;gy++){
      const key=gx+','+gy;cells.push(key);
      for(const prev of (grid.get(key)||[])){
        const pair=prev.id+':'+f;if(checked.has(pair))continue;checked.add(pair);
        if(++comparisons>200000){report.partial=true;break;}
        if(areaOverlap(prev.points,a)>1e-8)report.overlapPairs++;
      }
    }
    for(const key of cells){if(!grid.has(key))grid.set(key,[]);grid.get(key).push({id:f,points:a});}
    if(comparisons>200000)break;
  }
  return report;
}
export function diagnoseMeshes(meshes,channel=0){
  const reports=meshes.map(m=>({name:m.name||'Mesh',...diagnoseUV(m.geometry,channel)}));
  return {reports,summary:reports.reduce((s,r)=>{for(const k of ['faces','analyzed','flipped','degenerate','overlapPairs','invalidNormals','opposingNormals'])s[k]=(s[k]||0)+r[k];return s;},{})};
}

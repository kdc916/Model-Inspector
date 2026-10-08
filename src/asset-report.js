import {diagnoseUV} from './uv-diagnostics.js';
import {analyzeVertexAlpha} from './mesh-diagnostics.js';
import {compareSummaries} from './production-core.js';
export function inspectAsset(root, channel=0) {
  const meshes=[];root?.traverse?.(o=>{if(o.isMesh&&o.geometry?.getAttribute('position'))meshes.push(o)});
  const details=[];let triangles=0,vertices=0,uvMissing=0,alphaMeshes=0,materials=0;
  for(const mesh of meshes){
    const g=mesh.geometry,p=g.getAttribute('position');const faces=Math.floor((g.index?.count??p.count)/3);
    const uv=diagnoseUV(g,channel),a=analyzeVertexAlpha(g);
    triangles+=faces;vertices+=p.count;materials+=Array.isArray(mesh.material)?mesh.material.length:1;
    uvMissing+=Number(uv.missingUV);alphaMeshes+=Number(a.hasAlpha);
    details.push({name:mesh.name||'Mesh',triangles:faces,vertices:p.count,uv,alpha:{present:a.hasAlpha,min:a.min,max:a.max,mean:a.average}});
  }
  return {name:root?.name||'Model',meshes:meshes.length,vertices,triangles,materials,uvMissing,alphaMeshes,details};
}
export function buildComparison(a,b,channel=0){const left=inspectAsset(a,channel),right=inspectAsset(b,channel);return {left,right,comparison:compareSummaries(left,right)};}

import { inspectGeometryPro,summarizeDiagnostics } from './diagnostics-pro.js';
self.onmessage = event => {
  const {id,meshes,options}=event.data;
  try {
    const reports=[];
    for(let i=0;i<meshes.length;i++) {
      const report=inspectGeometryPro(meshes[i],options);
      reports.push(report);
      self.postMessage({id,type:'progress',completed:i+1,total:meshes.length,name:report.name});
    }
    self.postMessage({id,type:'complete',result:summarizeDiagnostics(reports,options)});
  } catch(e) { self.postMessage({id,type:'error',message:String(e?.message||e)}); }
};

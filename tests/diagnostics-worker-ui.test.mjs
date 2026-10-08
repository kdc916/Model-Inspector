import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/diagnostics.worker.js',import.meta.url),'utf8');
test('UI QA analyzer worker, cancel, json and scales are wired',()=>{
 for(const id of ['diagResolution','diagUnits','diagMaxFaces','btnUVAnalyze','btnDiagCancel','btnDiagExport','uvDiagnostics'])assert.ok(html.includes(`id="${id}"`),id);
 for(const needle of ['new Worker(new URL(\'./diagnostics.worker.js\'','createDiagnosticSnapshot','diagnosticWorker.terminate()','inspectGeometryPro','summarizeDiagnostics','downloadJSON(\'maxVFX-UV-Mesh-QA-v0.9.5.json\''])assert.ok(app.includes(needle),needle);
 assert.match(worker,/postMessage\(\{id,type:'progress'/);assert.match(worker,/type:'complete'/);
});
test('shader look controls and compare-occluder UI are wired',()=>{
 for(const id of ['fxLookPreset','fxApplyLook','fxDepthSource'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(app,/depthPreview\.setReferenceRoot\(result\.root\)/);
 assert.match(app,/resolveShaderPreset\(/);
});

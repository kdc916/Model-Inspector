import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackManifest,validatePackManifest,savePack,loadPack,MAX_PACK_IMAGES} from '../src/production-package.js';
import {exportPreset} from '../src/preset-workflow.js';
const sample=exportPreset({matOpacity:'0.75',fxEnabled:true},{});
const texture=(name='fire.png',contents='12345')=>new File([contents],name,{type:'image/png'});
test('builds pack with allowed uploaded materials, shaders',()=>{
  const res=createPackManifest(sample,new Map([['map',texture()]]),new Map([['noise',texture('noise.png')]]));
  assert.equal(res.files.length,2);
  assert.deepEqual(res.manifest.images.map(x=>x.path),['assets/material/map.png','assets/shader/noise.png']);
  assert.equal(res.manifest.preset.ui.matOpacity,'0.75');
});
test('invalid extension is rejected',()=>assert.throws(()=>createPackManifest(sample,new Map([['map',texture('bad.exe')]])),/형식/));
test('size limit is checked before packaging',()=>assert.throws(()=>createPackManifest(sample,new Map([['map',{name:'huge.png',size:50*1024*1024}]])),/32MB/));
test('invalid schema is rejected',()=>assert.throws(()=>validatePackManifest({schema:'other',version:1}),/형식/));
test('path traversal and unknown path are rejected',()=>{
 const {manifest}=createPackManifest(sample,new Map([['map',texture()]]));
 manifest.images[0].path='../map.png';
 assert.throws(()=>validatePackManifest(manifest),/경로/);
});
test('duplicate slots are rejected',()=>{
 const {manifest}=createPackManifest(sample,new Map([['map',texture()]]));
 manifest.images.push({...manifest.images[0]});
 assert.throws(()=>validatePackManifest(manifest),/중복/);
});
test('pack limits number of files',()=>{
 const {manifest}=createPackManifest(sample);
 manifest.images=Array.from({length:MAX_PACK_IMAGES+1},()=>({}));
 assert.throws(()=>validatePackManifest(manifest),/목록/);
});
class MockZip {
 constructor(){this.files={};}
 file(path,content){
  if(arguments.length===1)return this.files[path];
  const value=content instanceof Blob?content:new Blob([content]);
  this.files[path]={name:path,dir:false,_data:{uncompressedSize:value.size},async:async type=>type==='string'?await value.text():value};
  return this;
 }
 async generateAsync(){return new Blob(['zip']);}
 static async loadAsync(){return MockZip.current;}
}
test('pack roundtrip with ZIP-compatible interface keeps names and bytes',async()=>{
 const f=texture('test.png','PIXELS');const z=new MockZip();
 const {manifest,files}=createPackManifest(sample,new Map([['map',f]]));
 z.file('manifest.json',JSON.stringify(manifest));for(const {path,file} of files)z.file(path,file);
 MockZip.current=z;
 const result=await loadPack(new File(['zipbytes'],'test.zip'),MockZip);
 assert.equal(result.files[0].file.name,'test.png');assert.equal(await result.files[0].file.text(),'PIXELS');
});
test('unexpected archive entries are rejected',async()=>{
 const z=new MockZip();z.file('manifest.json',JSON.stringify(createPackManifest(sample).manifest));z.file('unexpected.txt','bad');MockZip.current=z;
 await assert.rejects(()=>loadPack(new File(['zipbytes'],'test.zip'),MockZip),/목록에 없는/);
});
test('tampered texture byte size is rejected',async()=>{
 const z=new MockZip(),{manifest}=createPackManifest(sample,new Map([['map',texture('test.png','ABC')]]));
 z.file('manifest.json',JSON.stringify(manifest));z.file('assets/material/map.png','ABCD');MockZip.current=z;
 await assert.rejects(()=>loadPack(new File(['zipbytes'],'test.zip'),MockZip),/크기가 일치/);
});

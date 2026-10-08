/** Portable material preview pack: no model data, local image files only. */
import {FLOW_SLOTS,normalizePreset} from './production-core.js';
export const PACK_SCHEMA='maxvfx-preview-package';
export const PACK_VERSION=1;
export const MAX_PACK_BYTES=160*1024*1024;
export const MAX_IMAGE_BYTES=32*1024*1024;
export const MAX_PACK_IMAGES=FLOW_SLOTS.length+2;
const MATERIAL_EXT=/\.(png|jpe?g|webp|bmp|gif|avif|tga|dds|ktx2)$/i;
const SHADER_EXT=/\.(png|jpe?g|webp|bmp)$/i;
const SAFE_PATH=/^assets\/(material|shader)\/[A-Za-z][A-Za-z0-9]*\.(?:png|jpg|jpeg|webp|bmp|gif|avif|tga|dds|ktx2)$/;
const BASE=['noise','mask'];
export function createPackManifest(preset,materialFiles=new Map(),shaderFiles=new Map()) {
  const normalized=normalizePreset(preset),entries=[],files=[];
  let total=0;
  for(const [kind,map,keys,allowed] of [['material',materialFiles,FLOW_SLOTS,MATERIAL_EXT],['shader',shaderFiles,BASE,SHADER_EXT]]) {
    for(const slot of keys){
      const file=map.get(slot);if(!file)continue;
      if(!allowed.test(file.name)||!Number.isFinite(file.size)||file.size<=0||file.size>MAX_IMAGE_BYTES)throw Error(`${slot}: 파일 형식 또는 32MB 제한 초과`);
      const extension=file.name.split('.').pop().toLowerCase();
      const path=`assets/${kind}/${slot}.${extension}`;
      entries.push({kind,slot,path,filename:file.name,size:file.size});files.push({path,file});total+=file.size;
    }
  }
  if(total>MAX_PACK_BYTES)throw Error('이미지 총 용량이 160MB를 초과합니다.');
  return {manifest:{schema:PACK_SCHEMA,version:PACK_VERSION,preset:normalized,images:entries},files,total};
}
export function validatePackManifest(raw) {
  if(!raw||typeof raw!=='object'||raw.schema!==PACK_SCHEMA||raw.version!==PACK_VERSION)throw Error('지원하지 않는 패키지 형식입니다.');
  const preset=normalizePreset(raw.preset);
  if(!Array.isArray(raw.images)||raw.images.length>MAX_PACK_IMAGES)throw Error('패키지 이미지 목록이 유효하지 않습니다.');
  let total=0;const names=new Set(),slots=new Set();
  const images=raw.images.map(item=>{
    if(!item||!['material','shader'].includes(item.kind))throw Error('잘못된 텍스처 종류입니다.');
    if(!(item.kind==='material'?FLOW_SLOTS:BASE).includes(item.slot))throw Error('지원하지 않는 텍스처 슬롯입니다.');
    const key=`${item.kind}/${item.slot}`;
    if(slots.has(key))throw Error('중복 텍스처 슬롯입니다.');slots.add(key);
    if(typeof item.path!=='string'||!SAFE_PATH.test(item.path)||item.path!==`assets/${item.kind}/${item.slot}.${item.path.split('.').pop()}`||names.has(item.path))throw Error('위험하거나 중복된 ZIP 경로입니다.');
    const filename=String(item.filename||'');
    if(filename.length>120||!/^[^\\/\0-\x1F]+$/.test(filename)||(item.kind==='shader'?!SHADER_EXT.test(filename):!MATERIAL_EXT.test(filename)))throw Error('올바르지 않은 이미지 파일명입니다.');
    if(!Number.isSafeInteger(item.size)||item.size<=0||item.size>MAX_IMAGE_BYTES)throw Error('텍스처 파일 크기가 허용 범위를 넘습니다.');
    total+=item.size;names.add(item.path);
    return {kind:item.kind,slot:item.slot,path:item.path,filename,size:item.size};
  });
  if(total>MAX_PACK_BYTES)throw Error('압축 해제 허용 크기를 초과했습니다.');
  return {schema:PACK_SCHEMA,version:PACK_VERSION,preset,images};
}
export async function loadPack(zipFile,JSZip){
  if(!zipFile||zipFile.size>MAX_PACK_BYTES||zipFile.size<8)throw Error('ZIP 파일은 최대 160MB까지 지원합니다.');
  // First inspect the central directory WITHOUT inflating payloads (ZIP bomb defense).
  const bytes=await zipFile.arrayBuffer();
  let zip=await JSZip.loadAsync(bytes,{checkCRC32:false,createFolders:false});
  const entries=Object.values(zip.files).filter(f=>!f.dir);
  if(entries.length>MAX_PACK_IMAGES+1)throw Error('ZIP 내부 파일 수가 허용 범위를 넘습니다.');
  let totalExpanded=0;
  for(const entry of entries){
    const size=entry._data?.uncompressedSize;
    if(!Number.isSafeInteger(size)||size<0)throw Error('ZIP 내부 크기 정보를 확인할 수 없습니다.');
    totalExpanded+=size;
    if(totalExpanded>MAX_PACK_BYTES+512*1024)throw Error('ZIP 압축 해제 예상 크기가 160MB를 초과합니다.');
    if(entry.name==='manifest.json'&&size>512*1024)throw Error('프리셋 메타데이터가 너무 큽니다.');
    if(entry.name!=='manifest.json'&&size>MAX_IMAGE_BYTES)throw Error('32MB를 초과하는 텍스처가 있습니다.');
  }
  if(!zip.file('manifest.json'))throw Error('manifest.json이 없습니다.');
  const raw=await zip.file('manifest.json').async('string');
  if(raw.length>512*1024)throw Error('프리셋 메타데이터가 너무 큽니다.');
  let manifest;try{manifest=validatePackManifest(JSON.parse(raw));}catch(e){throw Error(`프리셋 검증 실패: ${e.message}`);}
  const expected=new Set(['manifest.json',...manifest.images.map(i=>i.path)]);
  for(const entry of entries)if(!expected.has(entry.name))throw Error('목록에 없는 ZIP 항목이 있습니다.');
  // Only after the manifest and total expanded-byte limits are trusted, validate all CRC32 values.
  // JSZip's checkCRC32 pass inflates content; performing it earlier could allocate ZIP bombs.
  zip=await JSZip.loadAsync(bytes,{checkCRC32:true,createFolders:false});
  const files=[];
  for(const item of manifest.images){
    const entry=zip.file(item.path);
    if(!entry)throw Error(`누락된 이미지: ${item.slot}`);
    const reported=entry._data?.uncompressedSize;
    if(Number.isFinite(reported)&&reported!==item.size)throw Error(`크기가 일치하지 않습니다: ${item.slot}`);
    const bytes=await entry.async('uint8array');const blob=new Blob([bytes]);
    if(blob.size!==item.size)throw Error(`이미지 검증 실패: ${item.slot}`);
    files.push({...item,file:new File([blob],item.filename,{type:guessType(item.filename)})});
  }
  return {manifest,files};
}
function guessType(name){const e=name.split('.').pop().toLowerCase();return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',bmp:'image/bmp',gif:'image/gif',avif:'image/avif'})[e]||'application/octet-stream';}
export async function savePack(preset,materialFiles,shaderFiles,JSZip){
  const {manifest,files}=createPackManifest(preset,materialFiles,shaderFiles);
  const zip=new JSZip();zip.file('manifest.json',JSON.stringify(manifest,null,2));
  for(const {path,file} of files)zip.file(path,await file.arrayBuffer(),{binary:true});
  return await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
}

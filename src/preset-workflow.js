import {FLOW_SLOTS,normalizePreset,materialSnapshot,MAX_PRESET_BYTES} from './production-core.js';
export function exportPreset(ui,slotFlows){return normalizePreset({schema:'maxvfx-inspector-preset',version:1,ui:materialSnapshot(ui),slotFlows});}
export async function importPreset(file){
 if(!file||file.size>MAX_PRESET_BYTES)throw Error('프리셋 크기가 허용 범위를 넘습니다 (512KB).');
 let parsed;try{parsed=JSON.parse(await file.text());}catch{throw Error('JSON 파싱에 실패했습니다.');}
 return normalizePreset(parsed);
}
export function readControls(ids,get){const ui={};for(const id of ids){const e=get(id);if(e)ui[id]=e.type==='checkbox'?e.checked:e.value;}return ui;}
export function applyControlValues(ui,get){
 const changed=[];for(const [id,value] of Object.entries(ui)){const e=get(id);if(!e)continue;
   if(e.tagName==='SELECT'&&!Array.from(e.options).some(o=>o.value===String(value)))continue;
   if(e.type==='checkbox')e.checked=value===true||value==='true';
   else if(e.type==='number'||e.type==='range'){if(!Number.isFinite(Number(value)))continue;e.value=String(Math.max(e.min===''?-Infinity:Number(e.min),Math.min(e.max===''?Infinity:Number(e.max),Number(value))));}
   else e.value=String(value);
   changed.push(id);
 }
 return changed;
}
export const SLOT_NAMES=FLOW_SLOTS;

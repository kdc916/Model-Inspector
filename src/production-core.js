/** Production control values are deliberately engine-independent and unit-testable. */
export const BLEND_MODES = Object.freeze(['opaque','blend','add','premultiply','multiply','screen','mask']);
export const FLOW_SLOTS = Object.freeze(['map','emissiveMap','alphaMap','normalMap','roughnessMap','metalnessMap','aoMap','bumpMap','displacementMap']);
export const MAX_PRESET_BYTES = 512 * 1024;
const number = (v, fallback = 0) => v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v)) ? Number(v) : fallback;
export const bound = (v,min,max,fallback=min)=>Math.min(max,Math.max(min,number(v,fallback)));
export function blendSettings(mode, opacity=1, cutoff=.5, depthTest=true, depthWrite=false, cull='double') {
  const kind=BLEND_MODES.includes(mode)?mode:'opaque';
  const cut=kind==='mask', solid=kind==='opaque';
  return { mode:kind, opacity:solid?1:bound(opacity,0,1,1), alphaTest:cut?bound(cutoff,0,1,.5):0,
    transparent:!solid&&!cut, depthTest:!!depthTest, depthWrite:!!depthWrite, cull:['front','back','double'].includes(cull)?cull:'double' };
}
export function createSlotFlow(v={}) {
  return { uv:Math.round(bound(v.uv,0,3,0)), speedX:bound(v.speedX,-8,8,0), speedY:bound(v.speedY,-8,8,0),
    offsetX:bound(v.offsetX,-4096,4096,0),offsetY:bound(v.offsetY,-4096,4096,0),repeatX:bound(v.repeatX,.01,128,1), repeatY:bound(v.repeatY,.01,128,1) };
}
export function flipbookAt(t, {cols=1,rows=1,fps=12,loop=true}={}) {
  cols=Math.floor(bound(cols,1,64,1)); rows=Math.floor(bound(rows,1,64,1));
  fps=bound(fps,.01,120,12);const frames=cols*rows;
  const raw=Math.floor(Math.max(0,number(t))*fps);
  const frame=loop?raw%frames:Math.min(raw,frames-1);
  const column=frame%cols,row=Math.floor(frame/cols);
  return {frame,total:frames,column,row,repeatX:1/cols,repeatY:1/rows,offsetX:column/cols,offsetY:1-(row+1)/rows};
}
/** Texture.uvTransform = (flipbook UV tile + tiled flow); positive speed moves visible contents positive. */
export function textureTransform(flow, seconds=0, atlas=null) {
  const f=createSlotFlow(flow);const fx=atlas?.repeatX??1, fy=atlas?.repeatY??1;
  // Use a positive presentation-speed convention, matching the pre-v0.6 viewer.
  return {repeatX:f.repeatX*fx,repeatY:f.repeatY*fy,
    offsetX:(atlas?.offsetX??0) - (f.offsetX+f.speedX*seconds),
    offsetY:(atlas?.offsetY??0) - (f.offsetY+f.speedY*seconds),uv:f.uv};
}
export function materialSnapshot(form={}) {
  const keys=['matColor','matBaseStrength','matRough','matMetal','matNormalStrength','matNormalFlipGreen',
    'matAOIntensity','matEmissiveIntensity','matEmissiveColor','matBumpScale','matDisplacementScale',
    'matDisplacementBias','matOpacity','matAlphaMode','matAlphaCutoff','matDepthTest','matDepthWrite','matCull',
    'matMaskChannel','matMaskInvert','toggleAlphaOverlay','alphaOverlayView','alphaOverlayStrength',
    'matBloom','matBloomStrength','matBloomRadius','matBloomThreshold',
    'flowX','flowY','repeatX','repeatY','offsetX','offsetY','flowAllTextures',
    'slotFlowEnabled','slotFlowSlot','flipbookEnabled','flipbookSlot','flipbookColumns','flipbookRows','flipbookFPS','flipbookLoop'];
  return Object.fromEntries(keys.filter(k=>Object.hasOwn(form,k)).map(k=>[k,form[k]]));
}
export function normalizePreset(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.schema!=='maxvfx-inspector-preset'||raw.version!==1)throw Error('지원하지 않는 프리셋 형식입니다.');
  const rawUI=raw.ui;
  if(!rawUI||typeof rawUI!=='object'||Array.isArray(rawUI))throw Error('프리셋 UI 데이터가 없습니다.');
  const safe={};for(const [k,v] of Object.entries(materialSnapshot(rawUI))){if(typeof v==='boolean')safe[k]=v;else if(typeof v==='string'&&v.length<=100)safe[k]=v;else if(typeof v==='number'&&Number.isFinite(v))safe[k]=String(v);}
  const slotFlows={};for(const k of FLOW_SLOTS)if(raw.slotFlows?.[k])slotFlows[k]=createSlotFlow(raw.slotFlows[k]);
  return {schema:'maxvfx-inspector-preset',version:1,ui:safe,slotFlows,texturesNote:'Texture file contents are not embedded in presets.'};
}
export function compareSummaries(a,b) {
  if(!a||!b)throw Error('두 모델이 필요합니다.');
  const keys=['triangles','vertices','meshes','materials','uvMissing','alphaMeshes'];
  const delta=Object.fromEntries(keys.map(k=>[k,{left:a[k]??0,right:b[k]??0,diff:(b[k]??0)-(a[k]??0)}]));
  return {left:a.name||'Model A',right:b.name||'Model B',delta};
}

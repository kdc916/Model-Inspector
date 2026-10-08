import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VertexNormalsHelper } from 'three/addons/helpers/VertexNormalsHelper.js';
import { VertexTangentsHelper } from 'three/addons/helpers/VertexTangentsHelper.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LocalModelLoader } from './model-loaders.js';
import { createDemo, makeCheckerTexture } from './procedural.js';
import { drawUVLayout, inspectMeshes } from './analysis.js';
import { finite, modelStats, textureOffsetFromVisual, triangleCount } from './uv-utils.js';
import { analyzeUVStretch, extractVertexColors, analyzeVertexAlpha, locateVertexAlpha, readColorComponent } from './mesh-diagnostics.js';
import { overlayState, alphaMaskFactor, installAlphaShader, updateAlphaShaderUniforms } from './alpha-preview.js';
import { TEXTURE_SLOTS, ORM_SLOTS, normalScalePair, scopedMaterialIndices, materialValue, alphaMaterialSettings } from './material-controls.js';
import { FLOW_SLOTS,blendSettings,createSlotFlow,textureTransform,createTextureOverride,composeTextureTransform,flipbookAt,normalizePreset,MAX_PRESET_BYTES } from './production-core.js';
import { exportPreset,importPreset,readControls,applyControlValues } from './preset-workflow.js';
import { savePack, loadPack } from './production-package.js';
import { CanvasRecorder, supportedMime, MAX_CAPTURE_SECONDS } from './capture-workflow.js';
import { diagnoseMeshes } from './uv-diagnostics.js';
import { createDiagnosticSnapshot, inspectGeometryPro, summarizeDiagnostics } from './diagnostics-pro.js';
import { resolveShaderPreset } from './shader-presets.js';
import { inspectAsset,buildComparison } from './asset-report.js';
import { SceneGuides, formatPivotReadout } from './scene-guides.js';
import { resolvePreviewBlend, applyPreviewBlend } from './render-state.js';
import { SHADER_FIELD_DEFAULTS, normalizeShaderStudio, installShaderStudio, updateShaderStudio } from './shader-studio.js';
import { DepthPreview } from './depth-preview.js';
import { RequestEpoch,SlotEpochs,disposeDetachedRoot } from './lifecycle.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('en-US');
const clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));
const light = new THREE.Color();
const state = {
  model:null, meshes:[], selected:null, originalMats:new Map(),
  debugMats:new Map(), wireHelpers:[], normalHelper:null, tangentHelper:null,
  originalGeos:new Map(), previewGeos:new Map(), stretchCache:new Map(),
  mode:'material', uvChannel:0, channelCount:1, load:null,
  localLoader:new LocalModelLoader(),
  sceneMixer:null, clips:[], currentAction:null, animationPlaying:false,
  uvPlaying:false, flowPhaseX:0, flowPhaseY:0, visualOffsetX:0, visualOffsetY:0,
  offsetsDirty:true, editableTextures:new WeakSet(), uploadedURLs:[],
  spin:false, fps:60, lastFpsUpdate:0, frameCount:0,
  pointerDown:null, dragCount:0, loadGeneration:0, slotFiles:new Map(), slotFileBlobs:new Map(), shaderFileBlobs:new Map(),
  slotFlows:new Map(), textureTransforms:new Map(), flowSeconds:0, flipbookSeconds:0, textureKTX2:null,
  compareLoader:null, compareRoot:null, compareMeta:null, compareBasePosition:null, compareMaterialStates:new Map(), shaderMaps:{noise:null,mask:null},shaderSeconds:0,shaderUploadSerial:{noise:0,mask:0}
};
const modelRequests=new RequestEpoch();
const comparisonRequests=new RequestEpoch();
const textureRequests=new SlotEpochs();
const slotNames=TEXTURE_SLOTS;
const textureMapSlots=TEXTURE_SLOTS;
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.setClearColor(0x151b24,1);
renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);
renderer.domElement.id='webglCanvas';
renderer.domElement.setAttribute('aria-label','3D viewer - click a mesh to select');
viewport.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background=new THREE.Color(0x151b24);
const camera=new THREE.PerspectiveCamera(46,1,.01,50000);
camera.position.set(6,4.6,7);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.08;controls.screenSpacePanning=true;
controls.minDistance=.02;controls.maxDistance=40000;
const grid=new THREE.GridHelper(100,100,0x446578,0x2d3a49);grid.position.y=-1.9;grid.material.opacity=.32;grid.material.transparent=true;scene.add(grid);
const guides=new SceneGuides(THREE,scene);
scene.add(new THREE.HemisphereLight(0xe9f7ff,0x3b5367,2.0));
const key = new THREE.DirectionalLight(0xffffff,3.1);key.position.set(8,12,10);scene.add(key);
const fill = new THREE.DirectionalLight(0x76b3dd,1.3);fill.position.set(-8,1,-5);scene.add(fill);
const rim = new THREE.DirectionalLight(0x83f4dc,1.0);rim.position.set(-2,6,8);scene.add(rim);
const raycaster=new THREE.Raycaster();const rayPoint=new THREE.Vector2();
const frameClock=new THREE.Clock();
const checkerBase=makeCheckerTexture('checker');const gridBase=makeCheckerTexture('uvgrid');
state.localLoader.renderer=renderer;
const bloomComposer=new EffectComposer(renderer);
bloomComposer.addPass(new RenderPass(scene,camera));
const bloomPass=new UnrealBloomPass(new THREE.Vector2(512,512),.8,.2,1);
bloomPass.enabled=false;bloomComposer.addPass(bloomPass);bloomComposer.addPass(new OutputPass());
const depthPreview=new DepthPreview(THREE,renderer,scene,camera);
const capture=new CanvasRecorder({
  onStop:blob=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`maxVFX-capture-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('WebM 녹화 저장 완료');},
  onError:error=>status(`녹화 오류: ${error?.message||error}`,true),
  onState:recording=>{const button=$('#btnRecord');if(button){button.textContent=recording?'■ 녹화 중지':'● WebM 녹화';button.classList.toggle('active',recording);}const label=$('#recordStatus');if(label)label.textContent=recording?`녹화 중 · 최대 ${MAX_CAPTURE_SECONDS}초`:'WebM · 최대 30초 · 마이크 사용 안 함';}
});
let zipLibraryPromise=null;
async function getZipLibrary(){
  zipLibraryPromise ||= import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm').then(mod=>mod.default||mod).catch(error=>{zipLibraryPromise=null;throw new Error('ZIP 라이브러리 로딩 실패. 인터넷 연결을 확인하세요: '+error.message);});
  return zipLibraryPromise;
}
function currentPreset(){return exportPreset(readControls(presetFields,getField),Object.fromEntries(state.slotFlows),Object.fromEntries(state.textureTransforms));}
function downloadBlob(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function applyPresetValues(p){
  applyControlValues(p.ui,getField);state.slotFlows=new Map(Object.entries(p.slotFlows));loadSlotFlow();
  state.textureTransforms=new Map(Object.entries(p.textureTransforms||{}));loadManualTransform();
  $('#valueAxisSize').textContent=Number($('#axisSize').value).toFixed(2);
  $('#valuePivotSize').textContent=Number($('#pivotSize').value).toFixed(2);updateSceneGuides();
  state.flowPhaseX=state.flowPhaseY=state.flowSeconds=state.flipbookSeconds=0;
  $('#matAlphaCutoff').disabled=$('#matAlphaMode').value!=='mask';
  applyMaterialInputs(scopeMeshes());updateBloom();setAlphaOverlay($('#toggleAlphaOverlay').checked);state.offsetsDirty=true;
  applyTextureParameters();updateShaderStudioUI();
}
let diagnosticWorker=null,diagnosticJob=0,latestDiagnostic=null;
function cancelDiagnostics(silent=false){
  ++diagnosticJob;
  if(diagnosticWorker){diagnosticWorker.terminate();diagnosticWorker=null;}
  const cancel=$('#btnDiagCancel'),scan=$('#btnUVAnalyze');
  if(cancel)cancel.disabled=true;if(scan)scan.disabled=false;
  if(!silent){$('#uvDiagnostics').textContent='검사 취소됨 · 기존 리포트는 새 모델 또는 재검사 시 갱신됩니다.';status('진단 취소됨');}
}
function formatProDiagnostics(result){
  const s=result.summary,fmtNo=x=>Number(x||0).toLocaleString('en-US');
  const lines=[`UV${result.options.channel||0} / ${result.options.resolution}px · ${result.options.unitsPerMeter} unit/m`,
    `Triangles ${fmtNo(s.analyzed)} / ${fmtNo(s.faces)} · Meshes ${s.meshes}`,
    `UV overlap pairs ${fmtNo(s.overlapPairs)}${s.overlapIncompleteMeshes?' (lower bound)':''} · Mirrored/negative UV ${fmtNo(s.flippedUV)}`,
    `Degenerate UV ${fmtNo(s.degenerateUV)} · Geometry ${fmtNo(s.degenerateGeometry)} · Out-of-0..1 ${fmtNo(s.uvOutOfBoundsFaces)}`,
    `Normals: opposing ${fmtNo(s.opposingNormals)} · invalid ${fmtNo(s.invalidNormals)} · repeated position verts ${fmtNo(s.duplicatePositionVertices)}`];
  for(const r of result.reports.slice(0,12)){
    lines.push(`${r.name}: ${fmtNo(r.analyzed)}/${fmtNo(r.faces)} faces | ${r.texelDensityPxPerMeter===null?'Texel n/a':r.texelDensityPxPerMeter.toFixed(1)+' px/m'} | overlaps ${r.overlapPairs}${r.partial?' (partial)':''}`);
  }
  if(result.reports.length>12)lines.push(`+${result.reports.length-12} more meshes in JSON`);
  if(s.partialMeshes||s.overlapIncompleteMeshes)lines.push(`⚠ Partial results: ${s.partialMeshes} face-limited meshes, ${s.overlapIncompleteMeshes} overlap-budget meshes`);
  lines.push('※ UV 반전·중첩은 VFX에서 의도적인 표현일 수 있습니다.');
  return lines.join('\n');
}
async function scanProDiagnostics(){
  cancelDiagnostics(true);const id=diagnosticJob;
  const input=inspected();if(!input.length){$('#uvDiagnostics').textContent='진단할 메시가 없습니다.';return;}
  const options={channel:state.uvChannel,resolution:Number($('#diagResolution').value),unitsPerMeter:Number($('#diagUnits').value),maxFaces:Number($('#diagMaxFaces').value),maxOverlapTests:200000};
  $('#btnUVAnalyze').disabled=true;$('#btnDiagCancel').disabled=false;$('#btnDiagExport').disabled=true;
  $('#uvDiagnostics').textContent='진단용 메시 데이터 준비 중...';
  try{
    const snapshots=[];
    for(let i=0;i<input.length;i++){
      if(id!==diagnosticJob)return;
      const mesh=input[i],g=state.originalGeos.get(mesh)||mesh.geometry;
      mesh.updateMatrixWorld(true);
      snapshots.push(createDiagnosticSnapshot(g,mesh.name||`Mesh ${i+1}`,options.channel,mesh.matrixWorld));
      if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(id!==diagnosticJob)return;
    const finish=result=>{
      if(id!==diagnosticJob)return;
      latestDiagnostic={...result,asset:$('#assetTitle').textContent,generatedAt:new Date().toISOString()};
      $('#uvDiagnostics').textContent=formatProDiagnostics(latestDiagnostic);
      $('#btnUVAnalyze').disabled=false;$('#btnDiagCancel').disabled=true;$('#btnDiagExport').disabled=false;
      diagnosticWorker?.terminate();diagnosticWorker=null;status('UV / Mesh QA Pro 진단 완료');
    };
    if(typeof Worker!=='undefined'){
      const worker=new Worker(new URL('./diagnostics.worker.js',import.meta.url),{type:'module'});diagnosticWorker=worker;
      worker.onmessage=({data})=>{
        if(data.id!==id||id!==diagnosticJob)return;
        if(data.type==='progress')$('#uvDiagnostics').textContent=`Worker 검사 ${data.completed}/${data.total} meshes · ${data.name}`;
        else if(data.type==='complete')finish(data.result);
        else if(data.type==='error'){cancelDiagnostics(true);$('#uvDiagnostics').textContent='진단 오류: '+data.message;status('진단 오류',true);}
      };
      worker.onerror=event=>{if(id!==diagnosticJob)return;cancelDiagnostics(true);$('#uvDiagnostics').textContent='Worker 오류: '+(event.message||'실행 불가');status('Worker 오류',true);};
      worker.postMessage({id,meshes:snapshots,options},snapshots.flatMap(s=>[s.position.buffer,s.uv?.buffer,s.normal?.buffer,s.index?.buffer].filter(Boolean)));
    }else{
      const results=[];
      for(let i=0;i<snapshots.length;i++){
        if(id!==diagnosticJob)return;
        results.push(inspectGeometryPro(snapshots[i],options));
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      finish(summarizeDiagnostics(results,options));
    }
  }catch(e){if(id!==diagnosticJob)return;cancelDiagnostics(true);$('#uvDiagnostics').textContent='진단 오류: '+String(e.message||e);status('진단 오류',true);}
}

const shaderControls=Object.keys(SHADER_FIELD_DEFAULTS);
function shaderUI(){return Object.fromEntries(shaderControls.map(id=>[id,$('#'+id)?.type==='checkbox'?$('#'+id).checked:$('#'+id)?.value]));}
function shaderSettings(){return normalizeShaderStudio(shaderUI());}
function updateShaderForMaterial(mat){
  if(!$('#fxEnabled').checked)return;
  installShaderStudio(mat,THREE);
  updateShaderStudio(mat,THREE,shaderSettings(),{time:state.shaderSeconds,noiseTexture:state.shaderMaps.noise,maskTexture:state.shaderMaps.mask,...depthPreview.uniforms});
}
function updateShaderStudioUI({rebuild=true}={}){
  const settings=shaderSettings();depthPreview.configure(settings.fxEnabled&&settings.fxDepthFade,settings.fxPlaneVisible,settings.fxDepthSource);
  if(rebuild)updateDisplayMaterial();
  for(const mesh of state.meshes){const cache=state.debugMats.get(mesh)||{};for(const key of ['working','checker','uvgrid'])for(const mat of (cache[key]?(Array.isArray(cache[key])?cache[key]:[cache[key]]):[])){
    if(settings.fxEnabled)updateShaderForMaterial(mat);
    else if(mat.userData.vfxStudio){mat.userData.vfxStudio.vfxFxEnabled.value=0;mat.userData.vfxStudio.vfxFxDepthEnabled.value=0;}
  }}
}
async function loadShaderTexture(slot,file){
  if(!file)return false;
  if(!/\.(png|jpe?g|webp|bmp)$/i.test(file.name)||file.size>32*1024*1024){status('Shader Studio: PNG/JPG/WebP/BMP · 최대 32MB 이미지가 필요합니다.',true);return false;}
  const serial=++state.shaderUploadSerial[slot];
  const uri=URL.createObjectURL(file);
  try{const tex=await new THREE.TextureLoader().loadAsync(uri);
    if(serial!==state.shaderUploadSerial[slot]){tex.dispose();return false;}tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.NoColorSpace;tex.flipY=$('#flipTextureY').checked;tex.needsUpdate=true;
    state.shaderMaps[slot]?.dispose();state.shaderMaps[slot]=tex;state.shaderFileBlobs.set(slot,file);$('#fxLayerStatus').textContent=`${slot}: ${file.name} · 브라우저에서만 사용`;updateShaderStudioUI();return true;
  }catch(e){status(`Shader Texture 실패: ${e.message}`,true);return false;}finally{URL.revokeObjectURL(uri);}
}
const flowFields={uv:'slotFlowUV',speedX:'slotFlowX',speedY:'slotFlowY',offsetX:'slotOffsetX',offsetY:'slotOffsetY',repeatX:'slotRepeatX',repeatY:'slotRepeatY'};
const presetFields=[...shaderControls,'matColor','matBaseStrength','matRough','matMetal','matNormalStrength','matNormalFlipGreen','matAOIntensity','matEmissiveIntensity','matEmissiveColor','matBumpScale','matDisplacementScale','matDisplacementBias','matOpacity','matAlphaMode','matAlphaCutoff','matDepthTest','matDepthWrite','matCull','matMaskChannel','matMaskInvert','toggleAlphaOverlay','alphaOverlayView','alphaOverlayStrength','matBloom','matBloomStrength','matBloomRadius','matBloomThreshold','toggleAxes','togglePivot','axisSize','pivotSize','pivotScope','flowX','flowY','repeatX','repeatY','offsetX','offsetY','flowAllTextures','slotFlowEnabled','slotFlowSlot','flipbookEnabled','flipbookSlot','flipbookColumns','flipbookRows','flipbookFPS','flipbookLoop'];
function getField(id){return $('#'+id);}
function downloadJSON(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function saveSlotFlow(){const values={};for(const [k,id] of Object.entries(flowFields))values[k]=$('#'+id).value;state.slotFlows.set($('#slotFlowSlot').value,createSlotFlow(values));state.offsetsDirty=true;}
function loadSlotFlow(){const flow=state.slotFlows.get($('#slotFlowSlot').value)||createSlotFlow();for(const [k,id] of Object.entries(flowFields))$('#'+id).value=flow[k];}
const manualTransformFields={tileU:'matTileU',tileV:'matTileV',offsetU:'matOffsetU',offsetV:'matOffsetV'};
function loadManualTransform(){
  const values=state.textureTransforms.get($('#matTexSlot').value)||createTextureOverride();
  for(const [key,id] of Object.entries(manualTransformFields))$('#'+id).value=values[key];
}
function saveManualTransform(){
  const slot=$('#matTexSlot').value, values={};
  for(const [key,id] of Object.entries(manualTransformFields))values[key]=$('#'+id).value;
  const next=createTextureOverride(values);
  state.textureTransforms.set(slot,next);state.offsetsDirty=true;applyTextureParameters();
}
function updateBloom(){bloomPass.enabled=$('#matBloom').checked;bloomPass.strength=finite($('#matBloomStrength').value,.8);bloomPass.threshold=finite($('#matBloomThreshold').value,1);bloomPass.radius=finite($('#matBloomRadius').value,.2);}


function status(message,isError=false){
  const el=$('#statusMessage');el.textContent=message;el.style.color=isError?'#f2a9a0':'';
  if(isError) console.warn('[maxVFX Model Inspector]',message);
}
function setLoading(visible,message='모델을 불러오고 있습니다.'){
  $('#loading').hidden=!visible;
  $('#loading').querySelector('strong').textContent=message;
  $('#loading').querySelector('small').textContent='로컬 파일을 브라우저에서 분석합니다.';
}
function gatherMeshes(root){const list=[];root?.traverse(obj=>{if(obj.isMesh && obj.geometry?.getAttribute('position')) list.push(obj)});return list;}
function materials(mesh){return Array.isArray(mesh.material)?mesh.material:[mesh.material];}
/** v0.5: Keep Vertex Alpha on the geometry so it survives debug/UV preview clones. */
function prepareInspectionAlpha(mesh){
  const geo=state.originalGeos.get(mesh)||mesh.geometry;
  if(!geo || geo.hasAttribute('vfxInspectionAlpha'))return;
  const position=geo.getAttribute('position');if(!position)return;
  const {attribute,component}=locateVertexAlpha(geo);
  const out=new Float32Array(position.count);
  if(attribute){for(let i=0;i<position.count;i++)out[i]=readColorComponent(attribute,i,component)??1;}
  geo.setAttribute('vfxInspectionAlpha',new THREE.BufferAttribute(out,1));
  // Warn in the Inspector rather than treating a missing channel as transparent.
}
function applyBlendToMaterial(mat,mode,opacity,cutoff){
  const config=resolvePreviewBlend(mode,$('#toggleAlphaOverlay').checked,
    mat.userData.vfxHasInspectionAlpha,opacity,cutoff,$('#matDepthTest').checked,
    $('#matDepthWrite').checked,$('#matCull').value);
  applyPreviewBlend(mat,THREE,config);
}
/** Works on both PBR materials and checker/grid, independent of the main view mode. */
function configureAlphaForMaterial(mesh,material){
  if(!material)return;
  const attr=locateVertexAlpha(state.originalGeos.get(mesh)||mesh.geometry);
  const hasAlpha=!!attr.attribute;
  const overlay=overlayState($('#toggleAlphaOverlay').checked,$('#alphaOverlayView').value,$('#alphaOverlayStrength').value,hasAlpha,state.mode);
  installAlphaShader(material);
  const mode=material.userData?.vfxAlphaMode||(material.transparent?'blend':'opaque');
  const rgbaColor=(state.originalGeos.get(mesh)||mesh.geometry).getAttribute('color');
  const preConsumed=Boolean(material.vertexColors && rgbaColor?.itemSize>=4);
  const mask=alphaMaskFactor(overlay.active,mode,hasAlpha,preConsumed);
  // Shader masks handle FBX recovered stand-alone alpha; native RGBA is already
  // multiplied inside Three's color_fragment shader and must not be squared.
  material.userData.vfxHasInspectionAlpha=hasAlpha;
  if(material.userData.vfxAlphaMode!==undefined){
    applyBlendToMaterial(material,mode,$('#matOpacity').value,$('#matAlphaCutoff').value);
  } else if(overlay.active && hasAlpha && !material.transparent){
    // A cloned imported opaque PBR material: opt in to alpha blending without
    // modifying the source material or discarding existing texture settings.
    material.transparent=true;material.depthWrite=false;material.blending=THREE.NormalBlending;
    material.needsUpdate=true;
    material.userData.vfxAlphaAutoBlend=true;
  } else if(!overlay.active && material.userData.vfxAlphaAutoBlend){
    material.transparent=false;material.depthWrite=true;material.blending=THREE.NormalBlending;
    material.userData.vfxAlphaAutoBlend=false;material.needsUpdate=true;
  }
  updateAlphaShaderUniforms(material,{mode:overlay.mode,strength:overlay.strength,mask,
    channel:$('#matMaskChannel').value,invert:$('#matMaskInvert').checked});
}
function refreshAlphaOverlayStatus(){
  const checked=$('#toggleAlphaOverlay').checked;
  $('#btnAlphaOverlay').classList.toggle('active',checked);
  $('#toggleAlphaInspector').checked=checked;
  $('#alphaLegend').hidden=state.mode!=='alpha' && !(checked && $('#alphaOverlayView').value==='gray' && ['checker','uvgrid','material'].includes(state.mode));
  refreshAlphaViewportWarning();
}
function setAlphaOverlay(enabled){
  $('#toggleAlphaOverlay').checked=Boolean(enabled);
  updateDisplayMaterial();
  refreshAlphaOverlayStatus();
}
function getStretch(mesh) {
  let byChannel=state.stretchCache.get(mesh);
  if(!byChannel){byChannel=new Map();state.stretchCache.set(mesh,byChannel);}
  if(!byChannel.has(state.uvChannel)){
    mesh.updateWorldMatrix(true,false);
    byChannel.set(state.uvChannel,analyzeUVStretch(
      state.originalGeos.get(mesh)||mesh.geometry,state.uvChannel,mesh.matrixWorld.elements));
  }
  return byChannel.get(state.uvChannel);
}
function restorePreviewGeometry(mesh){
  const existing=state.previewGeos.get(mesh);
  if(!existing)return;
  mesh.geometry=state.originalGeos.get(mesh);
  existing.geometry.dispose();state.previewGeos.delete(mesh);
}
function ensurePreviewGeometry(mesh){
  const key=state.mode==='stretch'?`stretch:${state.uvChannel}`:
    state.mode==='vertex'?`vertex:${$('#vertexChannel').value}`:state.mode==='alpha'?'vertex:a':null;
  const existing=state.previewGeos.get(mesh);
  if(existing?.key===key)return;
  restorePreviewGeometry(mesh);
  if(!key)return;
  const source=state.originalGeos.get(mesh);
  if(state.mode==='stretch'){
    const report=getStretch(mesh);
    if(!report.colors)return; // Too large, missing or invalid UV: neutral material fallback.
    const geo=source.index?source.toNonIndexed():source.clone();
    geo.setAttribute('color',new THREE.BufferAttribute(report.colors,3));
    mesh.geometry=geo;state.previewGeos.set(mesh,{key,geometry:geo});
  }else{
    const geo=source.clone();
    const colors=extractVertexColors(source,state.mode==='alpha'?'a':$('#vertexChannel').value);
    if(!colors){geo.dispose();return;}
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    mesh.geometry=geo;state.previewGeos.set(mesh,{key,geometry:geo});
  }
}
function assignDebugMaterial(mesh,material){
  // Multi-material BufferGeometry uses group.materialIndex. Supplying a single
  // material can cause all groups except the first to disappear in Three.js.
  const original=state.originalMats.get(mesh);
  mesh.material=Array.isArray(original)?original.map(()=>material):material;
}
function updateDisplayMaterial(){
  for(const mesh of state.meshes){
    prepareInspectionAlpha(mesh);
    ensurePreviewGeometry(mesh);
    const cache=state.debugMats.get(mesh)||{};
    if(state.mode==='material'){
      // Never mutate an imported material to attach preview shaders.
      if(($('#toggleAlphaOverlay').checked || $('#fxEnabled').checked) && !cache.working){
        makeWorkingMaterials(mesh);
        cache.working=state.debugMats.get(mesh).working;
      }
      mesh.material=cache.working??state.originalMats.get(mesh);
    } else if(state.mode==='normal'){
      if(!cache.normal) cache.normal=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
      assignDebugMaterial(mesh,cache.normal);
    } else if(state.mode==='stretch'||state.mode==='vertex'||state.mode==='alpha'){
      const key=state.mode==='alpha'?'vertex':state.mode;
      if(!cache[key])cache[key]=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,color:0xffffff,toneMapped:false});
      // A missing attribute is treated as neutral gray in the preview.
      if(!state.previewGeos.has(mesh)){
        if(!cache.neutral)cache.neutral=new THREE.MeshBasicMaterial({color:0x59616c,side:THREE.DoubleSide});
        if(!cache.missingAlpha)cache.missingAlpha=new THREE.MeshBasicMaterial({color:0xff6aad,side:THREE.DoubleSide,toneMapped:false});
        assignDebugMaterial(mesh,(state.mode==='alpha'||(state.mode==='vertex'&&$('#vertexChannel').value==='a'))?cache.missingAlpha:cache.neutral);
      } else assignDebugMaterial(mesh,cache[key]);
    } else {
      const name=state.mode;
      if(!cache[name]){
        const tex=(name==='checker'?checkerBase:gridBase).clone();tex.needsUpdate=true;
        tex.channel=state.uvChannel;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
        cache[name]=new THREE.MeshBasicMaterial({map:tex,color:0xffffff,side:THREE.DoubleSide});
      }
      cache[name].map.channel=state.uvChannel;
      // Transparency controls preview the same way in Material, Checker and UV Grid.
      applyBlendToMaterial(cache[name],$('#matAlphaMode').value,$('#matOpacity').value,$('#matAlphaCutoff').value);
      assignDebugMaterial(mesh,cache[name]);
    }
    if(['material','checker','uvgrid'].includes(state.mode)){
      for(const mat of (Array.isArray(mesh.material)?mesh.material:[mesh.material])){
        // Only patch cloned/owned materials; original materials are never modified.
        if(cache.working || state.mode!=='material')configureAlphaForMaterial(mesh,mat);
        updateShaderForMaterial(mat);
        if($('#fxEnabled').checked && ($('#fxDepthFade').checked || (state.shaderMaps.mask && Number($('#fxMaskStrength').value)>0))){
          if(!mat.transparent||mat.depthWrite){mat.transparent=true;mat.depthWrite=false;mat.needsUpdate=true;}
          mat.userData.vfxDepthFadeBlend=true;
        }else if(mat.userData.vfxDepthFadeBlend){
          mat.userData.vfxDepthFadeBlend=false;
          if(mat.userData.vfxAlphaMode!==undefined)applyBlendToMaterial(mat,mat.userData.vfxAlphaMode,$('#matOpacity').value,$('#matAlphaCutoff').value);
          else {mat.depthWrite=true;mat.transparent=false;mat.needsUpdate=true;}
        }
      }
    }
    state.debugMats.set(mesh,cache);
  }
  state.offsetsDirty=true;
  $('#viewModeHud').textContent={material:'PBR / MATERIAL',checker:'UV / CHECKER',uvgrid:'UV / GRID',normal:'GEOMETRY / NORMALS',stretch:'UV / STRETCH HEATMAP',vertex:'VERTEX / COLOR',alpha:'VERTEX / ALPHA'}[state.mode];
  $$('.tool[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
  $('#diagnosticLegend').hidden=state.mode!=='stretch';
  $('#vertexOptions').hidden=state.mode!=='vertex';
  $('#alphaLegend').hidden=state.mode!=='alpha';
  refreshAlphaOverlayStatus();
  refreshAlphaViewportWarning();
  applyTextureParameters();
}
function setMode(mode){state.mode=mode;updateDisplayMaterial();}
function disposeModel(){
  comparisonRequests.invalidate(); // An in-flight B import belongs to the old A model.
  capture.cancel();
  cancelDiagnostics(true);latestDiagnostic=null;$('#btnDiagExport').disabled=true;
  state.loadGeneration++;
  textureRequests.invalidateAll();
  state.uvPlaying=false;state.animationPlaying=false;state.sceneMixer?.stopAllAction();state.sceneMixer=null;
  $('#btnUVPlay').textContent='▶ UV Flow Play';$('#btnAnimToggle').textContent='▶ Play';
  if(state.normalHelper){state.normalHelper.parent?.remove(state.normalHelper);state.normalHelper.dispose?.();state.normalHelper=null;}
  if(state.tangentHelper){state.tangentHelper.parent?.remove(state.tangentHelper);state.tangentHelper.dispose?.();state.tangentHelper=null;}
  disposeWireHelpers();
  for(const mesh of [...state.previewGeos.keys()])restorePreviewGeometry(mesh);
  state.originalGeos.clear();state.stretchCache.clear();
  guides.clearPivots();
  const oldOriginals=[...state.originalMats.values()];
  for(const [mesh, cache] of state.debugMats){
    for(const key of ['working','normal','checker','uvgrid','stretch','vertex','neutral','missingAlpha']){
      const mats=cache[key] ? (Array.isArray(cache[key])?cache[key]:[cache[key]]) : [];
      for(const mat of mats){
        if(key==='checker'||key==='uvgrid')mat.map?.dispose();
        if(key==='working')for(const slot of textureMapSlots){if(mat[slot]&&state.editableTextures.has(mat[slot]))mat[slot].dispose();}
        mat.dispose();
      }
    }
  }
  state.debugMats.clear();state.originalMats.clear();
  if(state.model){
    scene.remove(state.model);
    const usedGeometry=new Set(), usedMaterials=new Set(), usedTextures=new Set();
    state.model.traverse(o=>{
      if(o.geometry&&!usedGeometry.has(o.geometry)){usedGeometry.add(o.geometry);o.geometry.dispose();}
      for(const m of (o.material?(Array.isArray(o.material)?o.material:[o.material]):[])){
        if(usedMaterials.has(m))continue;usedMaterials.add(m);
        for(const slot of textureMapSlots)if(m[slot])usedTextures.add(m[slot]);
        m.dispose();
      }
    });
    for(const mat of oldOriginals)for(const m of (Array.isArray(mat)?mat:[mat])){
      if(!usedMaterials.has(m)){
        for(const slot of textureMapSlots)if(m[slot])usedTextures.add(m[slot]);
        m.dispose();
      }
    }
    for(const tex of usedTextures)tex.dispose();
  }
  disposeComparison();
  state.localLoader.dispose();
  for(const u of state.uploadedURLs)URL.revokeObjectURL(u);
  state.uploadedURLs=[];state.editableTextures=new WeakSet();state.slotFiles.clear();state.slotFileBlobs.clear();
  $$('.texture-slot').forEach(el=>{el.classList.remove('loaded');el.querySelector('small').textContent='Upload image';});
  state.model=null;state.meshes=[];state.selected=null;state.clips=[];state.flowSeconds=0;state.flipbookSeconds=0;
}
function installModel(root,meta={},clips=[]){
  disposeModel();
  state.model=root; // Preserve imported root pivot and translation; do not recenter the asset.
  state.meshes=gatherMeshes(root);state.clips=clips;
  if(!state.meshes.length)status('경고: 불러온 모델에 메시가 없습니다. 포인트/카메라/라인만 포함되었을 수 있습니다.',true);
  for(const [i,mesh] of state.meshes.entries()){
    if(!mesh.name)mesh.name=`Mesh ${i+1}`;
    state.originalMats.set(mesh,mesh.material);
    state.originalGeos.set(mesh,mesh.geometry);
    prepareInspectionAlpha(mesh);
    if(mesh.geometry && !mesh.geometry.hasAttribute('normal'))mesh.geometry.computeVertexNormals();
  }
  scene.add(root);
  depthPreview.fit(root);
  updateSceneGuides();
  if(clips.length){state.sceneMixer=new THREE.AnimationMixer(root);}
  state.selected=null;state.uvPlaying=false;state.flowPhaseX=state.flowPhaseY=0;state.offsetsDirty=true;
  $('#btnUVPlay').textContent='▶ UV Flow Play';$('#flowOverlay').hidden=true;
  $('#assetTitle').textContent=(meta.name||root.name||'MODEL').slice(0,42).toUpperCase();
  $('#assetMeta').textContent=`${meta.format||'DEMO'} · ${state.meshes.length} meshes`+
    (meta.alphaRecovery?.restored?` · Alpha restored ${meta.alphaRecovery.restored}/${meta.alphaRecovery.sourceLayers}`:'');
  state.mode='material';updateDisplayMaterial();
  $('#uvDiagnostics').textContent='UV 품질 분석 버튼을 눌러 검사를 시작하세요 (큰 메시에서 시간이 걸릴 수 있습니다).';
  updateVertexAlphaHealth();
  updateStats();updateHierarchy();updateInspector();updateMaterialSlotSelect();updateAnimSelect();updateWireframe();updateNormalHelper();updateTangentHelper();fitCamera(root);updateSceneGuides();
  const alphaInfo=meta.alphaRecovery;
  status(`${meta.name||'데모 모델'} 준비 완료 · ${fmt(modelStats(state.meshes).triangles)} triangles`+
    (alphaInfo?.restored?` · FBX Vertex Alpha ${alphaInfo.restored} mesh 복구됨`:
     alphaInfo?.unmatched?` · ⚠ FBX Alpha ${alphaInfo.unmatched} mesh 대응 실패`:''),
    !!alphaInfo?.unmatched||!!alphaInfo?.error);
}
function fitCamera(target){
  if(!target)return;
  target.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(target);
  if(box.isEmpty()||!Number.isFinite(box.min.x)){status('모델의 바운딩 박스를 계산할 수 없습니다.',true);return;}
  const center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3());
  const radius=Math.max(size.length()*.5,.001);
  const hFOV=THREE.MathUtils.degToRad(camera.fov);
  const aspect=Math.max(camera.aspect,.1);
  const vDist=radius/Math.sin(hFOV/2);
  const hDist=radius/Math.sin(Math.atan(Math.tan(hFOV/2)*aspect));
  const distance=Math.max(vDist,hDist)*1.14;
  const direction=new THREE.Vector3(1,.65,1).normalize();
  camera.near=Math.max(distance/2000,.001);
  camera.far=Math.max(distance*80,100);
  camera.position.copy(center).addScaledVector(direction,distance);
  camera.updateProjectionMatrix();controls.target.copy(center);controls.minDistance=Math.max(radius*.02,.001);controls.maxDistance=Math.max(radius*75,1);
  controls.update();
  updateSceneGuides();
  grid.position.y=box.min.y-Math.max(.008,size.y*.004);
  grid.scale.setScalar(Math.max(.1, Math.min(1000, radius/9)));
}
function worldPivotEuler(node){
  node.updateWorldMatrix(true,false);
  const q=node.getWorldQuaternion(new THREE.Quaternion());
  const e=new THREE.Euler().setFromQuaternion(q,'XYZ');
  return [e.x,e.y,e.z].map(v=>(THREE.MathUtils.radToDeg(v)).toFixed(1)).join('°, ')+'°';
}
function updateSceneGuides(){
  const size=Number($('#axisSize').value)||.35;
  const showWorld=$('#toggleAxes').checked;
  const showPivot=$('#togglePivot').checked;
  const scope=$('#pivotScope').value;
  guides.configure(state.model,state.meshes,state.selected,{size,pivotSize:Number($('#pivotSize').value)||.12,showWorld,showPivot,scope});
  $('#pivotStatus').textContent=state.selected ? `Selected · ${formatPivotReadout(state.selected)}` :
    state.model ? `${scope==='root'?'Model root':'First mesh'} · ${formatPivotReadout(scope==='root'?state.model:state.meshes[0]||state.model)}` : 'No model';
}
function updateStats(){
  const stat=modelStats(state.meshes);
  $('#statTriangles').textContent=fmt(stat.triangles);
  $('#statVertices').textContent=fmt(stat.vertices);
  $('#statMeshes').textContent=fmt(stat.meshes);
  $('#meshCountChip').textContent=fmt(stat.meshes);
}
function updateHierarchy(){
  const tree=$('#meshTree');tree.replaceChildren();
  if(!state.meshes.length){tree.textContent='메시를 찾을 수 없습니다.';return;}
  for(const mesh of state.meshes){
    const button=document.createElement('button');button.type='button';button.className='mesh-item'+(mesh===state.selected?' selected':'');
    const name=document.createElement('span');name.className='mesh-name';name.textContent=mesh.name;
    const tris=document.createElement('span');tris.className='mesh-tris';tris.textContent=compact(triangleCount(state.originalGeos.get(mesh)||mesh.geometry));
    const icon=document.createElement('span');icon.className='mesh-ico';icon.textContent='⬡';
    button.append(icon,name,tris);button.title=mesh.name;
    button.addEventListener('click',()=>selectMesh(mesh));tree.appendChild(button);
  }
}
function compact(n){return n>=1000000?(n/1000000).toFixed(1)+'m':n>=1000?(n/1000).toFixed(1)+'k':String(n);}
function selectMesh(mesh){
  state.selected=mesh||null;updateHierarchy();updateInspector();updateVertexAlphaHealth();updateMaterialSlotSelect();updateNormalHelper();updateTangentHelper();updateSceneGuides();
  if($('#applyScope').value==='selected'&&!state.selected)$('#applyScope').value='all';
}
function inspected(){return state.selected?[state.selected]:state.meshes;}
function updateInspector(){
  const selected=state.selected, meshes=inspected();
  const stat=inspectMeshes(meshes.map(m=>({geometry:state.originalGeos.get(m)||m.geometry})),state.uvChannel);
  $('#selectedName').textContent=selected?.name||'All meshes';
  const bounds=state.model?new THREE.Box3().setFromObject(selected||state.model):new THREE.Box3();
  const dims=bounds.isEmpty()?null:bounds.getSize(new THREE.Vector3());
  const entries=[
    ['Meshes',fmt(stat.meshes)],['Triangles',fmt(stat.triangles)],['Vertices',fmt(stat.vertices)],
    ['Indexing',selected?(selected.geometry.index?'Indexed':'Non-indexed'):'Mixed / All'],
    ['Normals',stat.missingNormals===0?'Present':`${stat.missingNormals} missing`],
    ['UV channel',`UV${state.uvChannel}`],
    ['Dimensions',dims?[dims.x,dims.y,dims.z].map(v=>v.toFixed(3)).join(' × '):'—'],
    ['Materials',selected?(Array.isArray(state.originalMats.get(selected))?state.originalMats.get(selected).length:1):[...new Set(meshes.flatMap(m=>{const a=state.originalMats.get(m);return Array.isArray(a)?a:[a];}))].length],
    ['Vertex color',`${meshes.filter(m=>state.originalGeos.get(m)?.hasAttribute('color')).length}/${meshes.length} meshes`],
    ['Vertex Alpha (source)',`${meshes.filter(m=>analyzeVertexAlpha(state.originalGeos.get(m)||m.geometry).hasAlpha).length}/${meshes.length} meshes`],
    ['Tangents',`${meshes.filter(m=>state.originalGeos.get(m)?.hasAttribute('tangent')).length}/${meshes.length} meshes`],
    ['Pivot (world)',selected?formatPivotReadout(selected):'Select a mesh'],
    ['Pivot (local)',selected?selected.position.toArray().map(v=>v.toFixed(3)).join(', '):'—'],
    ['Pivot rotation XYZ°',selected?worldPivotEuler(selected):'—']
  ];
  const props=$('#inspectProperties');props.replaceChildren();
  for(const [k,v] of entries){const row=document.createElement('div');row.className='property-row';
    const key=document.createElement('span');key.textContent=k;const val=document.createElement('strong');val.textContent=String(v);
    row.append(key,val);props.appendChild(row);
  }
  $('#uvSummary').textContent=`UV${state.uvChannel}`;
  const health=$('#uvHealth');
  const info=[];
  info.push(`<p class="${stat.missingUV?'warn':'pass'}">${stat.missingUV?'⚠ '+stat.missingUV+' meshes missing UV'+state.uvChannel:'✓ UV channel available'}</p>`);
  if(stat.uvBounds){const b=stat.uvBounds;
    info.push(`<p>U range: ${b.minU.toFixed(3)} ~ ${b.maxU.toFixed(3)}</p><p>V range: ${b.minV.toFixed(3)} ~ ${b.maxV.toFixed(3)}</p>`);
    info.push(`<p>${stat.outUV?`⚑ ${fmt(stat.outUV)} UV vertices outside 0–1 (tiling 가능)`:'✓ All UV values within 0–1'}</p>`);
  }
  if(stat.missingNormals)info.push(`<p class="warn">⚠ ${stat.missingNormals} mesh normals regenerated for preview</p>`);
  health.innerHTML=info.join('');
  // Avoid a long synchronous stall when an asset contains dozens of dense meshes.
  const reports=[];let budget=180000, omitted=0;
  for(const mesh of meshes){
    const faces=triangleCount(state.originalGeos.get(mesh)||mesh.geometry);
    if(faces>budget){omitted++;continue;}
    reports.push(getStretch(mesh));budget-=faces;
  }
  const available=reports.filter(r=>r.validFaces>0);
  const valid=available.reduce((sum,r)=>sum+r.validFaces,0);
  const bad=reports.reduce((sum,r)=>sum+r.outlierFaces,0);
  const degenerate=reports.reduce((sum,r)=>sum+r.degenerateUV,0);
  const partial=omitted?` · ${omitted} mesh(es) omitted (180k triangle budget)`:'';
  $('#stretchHealth').textContent=available.length?
    `UV stretch: ${fmt(bad)} / ${fmt(valid)} faces differ >0.75 stops · Zero-area UV: ${fmt(degenerate)}${partial}`:
    omitted?'UV stretch: 180k triangle budget 초과 · 메시 단위로 선택하여 확인':
    'UV stretch: 분석 가능한 UV 면이 없습니다.';
  const result=drawUVLayout($('#uvCanvas'),meshes,state.uvChannel);
  $('#uvStatus').textContent=`UV${state.uvChannel}`+(result?.skippedFaces?' · simplified':'');
}
function formatAlphaReport(reports,meshes){
  const valid=reports.filter(r=>r.hasAlpha && r.sampled);
  const missing=reports.filter(r=>!r.hasAlpha);
  if(!valid.length) return `⛔ Alpha 데이터 없음 (${missing.length}/${meshes.length} mesh). RGB만 있는 메시를 A=1(흰색)으로 대체하지 않습니다. FBX Export의 Vertex Colors 설정과 3ds Max Vertex Alpha(-2) 채널을 확인하세요.`;
  const n=valid.reduce((a,r)=>a+r.sampled,0);
  const sum=valid.reduce((a,r)=>a+r.average*r.sampled,0);
  const lo=Math.min(...valid.map(r=>r.min)),hi=Math.max(...valid.map(r=>r.max));
  const black=valid.reduce((a,r)=>a+r.zero,0);
  const mid=valid.reduce((a,r)=>a+r.partial,0);
  const white=valid.reduce((a,r)=>a+r.opaque,0);
  const opaqueMeshes=valid.filter(r=>r.reason==='all-white').length;
  const base=`Vertex Alpha ${valid.length}/${meshes.length} meshes · min ${lo.toFixed(3)} / max ${hi.toFixed(3)} / avg ${(sum/n).toFixed(3)} · black ${fmt(black)}, gray ${fmt(mid)}, white ${fmt(white)} (sample ${fmt(n)})`;
  const notes=[];
  if(missing.length)notes.push(`⚠ ${missing.length} mesh Alpha 미포함(핑크 표시)`);
  if(opaqueMeshes)notes.push(`⚠ ${opaqueMeshes} mesh A 채널은 있으나 전부 1.0(흰색). 3ds Max 값이 FBX로 실제 전달됐는지 확인`);
  return base+(notes.length?' · '+notes.join(' · '):'');
}
function refreshAlphaViewportWarning(){
  const el=$('#alphaViewportAlert');
  if(!el)return;
  const alphaActive=state.mode==='alpha'||(state.mode==='vertex'&&$('#vertexChannel').value==='a')||$('#toggleAlphaOverlay').checked;
  const meshes=inspected();
  const reports=meshes.map(m=>analyzeVertexAlpha(state.originalGeos.get(m)||m.geometry));
  const missing=reports.filter(r=>!r.hasAlpha).length;
  const fullWhite=reports.filter(r=>r.reason==='all-white').length;
  el.hidden=!alphaActive||(!missing&&!fullWhite);
  if(el.hidden)return;
  el.textContent=missing
    ?`⚠ Vertex Alpha 누락: ${missing}/${meshes.length} mesh · 채널 없는 메시는 Overlay 적용하지 않음 (단독 검사에서는 핑크)`
    :`⚠ RGBA는 있으나 ${fullWhite}/${meshes.length} mesh의 A값이 전부 1.0입니다. 원본 FBX를 확인하세요.`;
}
function updateVertexAlphaHealth(){
  const meshes=inspected();
  const reports=meshes.map(m=>analyzeVertexAlpha(state.originalGeos.get(m)||m.geometry));
  const recovered=meshes.filter(m=>(state.originalGeos.get(m)||m.geometry)?.userData?.fbxAlphaRecovered).length;
  $('#vertexAlphaHealth').textContent=formatAlphaReport(reports,meshes)+
    (recovered?` · FBX RGBA Alpha 복구: ${recovered} mesh`: '');
  refreshAlphaViewportWarning();
}

function updateAnimSelect(){
  const sel=$('#animationSelect');sel.replaceChildren();
  if(!state.clips.length){const option=new Option('No animation','');sel.add(option);sel.disabled=true;$('#btnAnimToggle').disabled=true;return;}
  sel.disabled=false;$('#btnAnimToggle').disabled=false;
  state.clips.forEach((clip,i)=>sel.add(new Option(clip.name||`Clip ${i+1}`,String(i))));
  sel.value='0';state.currentAction=null;state.animationPlaying=false;
}
function switchClip(autoplay=false){
  if(!state.sceneMixer||!state.clips.length)return;
  state.sceneMixer.stopAllAction();
  const idx=clamp(Math.floor(finite($('#animationSelect').value)),0,state.clips.length-1);
  state.currentAction=state.sceneMixer.clipAction(state.clips[idx]);
  state.currentAction.reset();
  if(autoplay)state.currentAction.play();
  state.animationPlaying=autoplay;
  $('#btnAnimToggle').textContent=autoplay?'Ⅱ Pause':'▶ Play';
}
function disposeWireHelpers(){
  for(const helper of state.wireHelpers){helper.parent?.remove(helper);helper.geometry.dispose();helper.material.dispose();}
  state.wireHelpers=[];
}
function updateWireframe(){
  disposeWireHelpers();$('#btnWire').classList.toggle('active',$('#toggleWire').checked);if(!$('#toggleWire').checked)return;
  for(const mesh of state.meshes){
    if(triangleCount(state.originalGeos.get(mesh)||mesh.geometry)>180000){status('Wireframe: 180k triangle 초과 메시 생략 (성능 보호).');continue;}
    const geo=new THREE.WireframeGeometry(state.originalGeos.get(mesh)||mesh.geometry);
    const mat=new THREE.LineBasicMaterial({color:$('#wireColor').value,transparent:true,opacity:finite($('#wireOpacity').value,.9),depthTest:!$('#wireXray').checked,depthWrite:false});
    const helper=new THREE.LineSegments(geo,mat);helper.name='Wireframe Overlay';helper.frustumCulled=false;helper.renderOrder=900;helper.raycast=()=>{};
    mesh.add(helper);state.wireHelpers.push(helper);
  }
}
function updateWireStyle(){
  const color=$('#wireColor').value,opacity=clamp(finite($('#wireOpacity').value,.9),.1,1),xray=$('#wireXray').checked;
  $('#valueWireOpacity').textContent=opacity.toFixed(2);
  for(const h of state.wireHelpers){h.material.color.set(color);h.material.opacity=opacity;h.material.depthTest=!xray;h.material.needsUpdate=true;}
}
function updateNormalHelper(){
  if(state.normalHelper){state.normalHelper.parent?.remove(state.normalHelper);state.normalHelper.dispose?.();state.normalHelper=null;}
  if(!$('#toggleNormals').checked || !state.meshes.length)return;
  const mesh=state.selected||state.meshes[0], geo=mesh.geometry;
  if((geo.getAttribute('position')?.count||0)>15000){status('노멀 벡터는 15,000 vertices 이하 메시에서 표시합니다. 메시 선택을 변경해 보세요.');return;}
  const bbox=new THREE.Box3().setFromObject(mesh);const length=bbox.getSize(new THREE.Vector3()).length();
  state.normalHelper=new VertexNormalsHelper(mesh,Math.max(.002,length/120),0x80f5b2);
  scene.add(state.normalHelper);
}
function updateTangentHelper(){
  if(state.tangentHelper){state.tangentHelper.parent?.remove(state.tangentHelper);state.tangentHelper.dispose?.();state.tangentHelper=null;}
  if(!$('#toggleTangents').checked||!state.meshes.length)return;
  const mesh=state.selected||state.meshes[0];
  const geo=state.originalGeos.get(mesh)||mesh.geometry;
  if(!geo.hasAttribute('tangent')){status('선택한 메시의 Tangent 데이터가 없습니다. DCC에서 Tangents 포함으로 내보내세요.');return;}
  if((geo.getAttribute('position')?.count||0)>15000){status('Tangent 벡터는 15,000 vertices 이하에서 표시합니다.');return;}
  const length=new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).length();
  state.tangentHelper=new VertexTangentsHelper(mesh,Math.max(.002,length/120),0xf2b079);
  scene.add(state.tangentHelper);
}
function scopeMeshes(){return $('#applyScope').value==='selected'?(state.selected?[state.selected]:[]):state.meshes;}
function updateMaterialSlotSelect(){
  const control=$('#matSlotIndex');if(!control)return;
  const previous=control.value;
  control.replaceChildren(new Option('All material IDs','all'));
  const selected=state.selected;
  const count=selected?(Array.isArray(state.originalMats.get(selected))?state.originalMats.get(selected).length:1):0;
  for(let i=0;i<count;i++)control.add(new Option(`Material ID ${i}`,String(i)));
  control.disabled=$('#applyScope').value!=='selected'||!selected||count<2;
  control.value=[...control.options].some(o=>o.value===previous)?previous:'all';
}
function scopedMaterials(mesh){
  const mats=makeWorkingMaterials(mesh);
  const slot=$('#applyScope').value==='selected' && mesh===state.selected && !$('#matSlotIndex').disabled ? Number($('#matSlotIndex').value): -1;
  return scopedMaterialIndices(mats.length,slot).map(i=>mats[i]);
}

function makeWorkingMaterials(mesh){
  const cache=state.debugMats.get(mesh)||{};
  if(!cache.working){const source=state.originalMats.get(mesh);
    cache.working=Array.isArray(source)?source.map(m=>m.clone()):source.clone();state.debugMats.set(mesh,cache);
  }
  const editable=Array.isArray(cache.working)?cache.working:[cache.working];
  return editable.map((m,i)=>{
    if(!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial){
      const standard=new THREE.MeshStandardMaterial({color:m.color?.clone()||new THREE.Color('#ffffff'),map:m.map||null,normalMap:m.normalMap||null,roughnessMap:m.roughnessMap||null,metalnessMap:m.metalnessMap||null,emissiveMap:m.emissiveMap||null,alphaMap:m.alphaMap||null,aoMap:m.aoMap||null,vertexColors:!!m.vertexColors,transparent:m.transparent,opacity:m.opacity??1,side:m.side});
      if(Array.isArray(cache.working))cache.working[i]=standard;else cache.working=standard;
      m.dispose();return standard;
    }
    return m;
  });
}
function uniqueTextureForMaterial(material,slot){
  const tex=material[slot];if(!tex)return null;
  if(!state.editableTextures.has(tex)){
    const fresh=tex.clone();fresh.needsUpdate=true;
    material[slot]=fresh;state.editableTextures.add(fresh);
  }
  return material[slot];
}
/** Independent working materials per mesh; changing one slider never wipes other imported values. */
function applyMaterialInputs(meshes=scopeMeshes(),changed=null){
  const settings=alphaMaterialSettings($('#matAlphaMode').value,$('#matOpacity').value,$('#matAlphaCutoff').value);
  const normalScale=normalScalePair($('#matNormalStrength').value,$('#matNormalFlipGreen').checked);
  for(const mesh of meshes)for(const mat of scopedMaterials(mesh)){
    if(!changed||changed==='matColor'||changed==='matBaseStrength'){
      mat.color.set($('#matColor').value).multiplyScalar(materialValue('baseStrength',$('#matBaseStrength').value));
    }
    if(!changed||changed==='matRough')mat.roughness=materialValue('roughness',$('#matRough').value);
    if(!changed||changed==='matMetal')mat.metalness=materialValue('metalness',$('#matMetal').value);
    if(!changed||changed==='matNormalStrength'||changed==='matNormalFlipGreen')mat.normalScale.set(...normalScale);
    if(!changed||changed==='matAOIntensity')mat.aoMapIntensity=materialValue('aoMapIntensity',$('#matAOIntensity').value);
    if(!changed||changed==='matEmissiveColor')mat.emissive.set($('#matEmissiveColor').value);
    if(!changed||changed==='matEmissiveIntensity')mat.emissiveIntensity=materialValue('emissiveIntensity',$('#matEmissiveIntensity').value);
    if(!changed||changed==='matBumpScale')mat.bumpScale=materialValue('bumpScale',$('#matBumpScale').value);
    if(!changed||changed==='matDisplacementScale')mat.displacementScale=materialValue('displacementScale',$('#matDisplacementScale').value);
    if(!changed||changed==='matDisplacementBias')mat.displacementBias=materialValue('displacementBias',$('#matDisplacementBias').value);
    if(!changed||['matAlphaMode','matOpacity','matAlphaCutoff','matDepthTest','matDepthWrite','matCull'].includes(changed)){
      mat.userData.vfxHasInspectionAlpha=Boolean(locateVertexAlpha(state.originalGeos.get(mesh)||mesh.geometry).attribute);
      applyBlendToMaterial(mat,settings.alphaMode,$('#matOpacity').value,$('#matAlphaCutoff').value);
    }
    mat.needsUpdate=true;
  }
  if(['material','checker','uvgrid'].includes(state.mode))updateDisplayMaterial();
}
function applyTextureParameters(){
  const x=state.visualOffsetX,y=state.visualOffsetY;
  const globalFlow=createSlotFlow({uv:state.uvChannel,offsetX:x,offsetY:y,
    repeatX:$('#repeatX').value,repeatY:$('#repeatY').value});
  const separate=$('#slotFlowEnabled').checked,all=$('#flowAllTextures').checked;
  const flip=$('#flipbookEnabled').checked;
  const atlas=flip?flipbookAt(state.flipbookSeconds,{cols:$('#flipbookColumns').value,rows:$('#flipbookRows').value,
    fps:$('#flipbookFPS').value,loop:$('#flipbookLoop').checked}):null;
  $('#flipbookStatus').textContent=atlas?`Frame ${atlas.frame+1}/${atlas.total} · column ${atlas.column+1} / row ${atlas.row+1}`:'Flipbook OFF';
  for(const mesh of state.meshes){
    const cache=state.debugMats.get(mesh)||{},list=[];
    if(cache.working)list.push(...(Array.isArray(cache.working)?cache.working:[cache.working]));
    else if(state.uvPlaying||x||y||globalFlow.repeatX!==1||globalFlow.repeatY!==1||state.uvChannel!==0||separate||flip||state.textureTransforms.size)list.push(...makeWorkingMaterials(mesh));
    if(cache.checker)list.push(cache.checker);
    if(cache.uvgrid)list.push(cache.uvgrid);
    for(const mat of list){
      for(const slot of textureMapSlots){
        const isDebug=mat===cache.checker||mat===cache.uvgrid;
        if(isDebug&&slot!=='map')continue;
        if(!isDebug&&!separate&&!all&&slot!=='map'&&!state.textureTransforms.has(slot))continue;
        const tex=uniqueTextureForMaterial(mat,slot);if(!tex)continue;
        const chosen=(!isDebug&&separate)?state.slotFlows.get(slot)||createSlotFlow():globalFlow;
        const tile=(!isDebug&&flip&&slot===$('#flipbookSlot').value)?atlas:null;
        const tf=composeTextureTransform(textureTransform(chosen,(!isDebug&&separate)?state.flowSeconds:0,tile),state.textureTransforms.get(slot));
        if(tex.wrapS!==THREE.RepeatWrapping||tex.wrapT!==THREE.RepeatWrapping){
          tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.needsUpdate=true;
        }
        tex.repeat.set(tf.repeatX,tf.repeatY);tex.offset.set(tf.offsetX,tf.offsetY);
        if(tex.channel!==tf.uv){tex.channel=tf.uv;mat.needsUpdate=true;}
      }
    }
  }
  if(state.mode==='material')for(const mesh of state.meshes){const cache=state.debugMats.get(mesh);if(cache?.working)mesh.material=cache.working;}
  $('#currentOffset').textContent=`U ${x.toFixed(3)} · V ${y.toFixed(3)}`;
  state.offsetsDirty=false;
}
function toggleUVAnimation(){
  state.uvPlaying=!state.uvPlaying;
  $('#btnUVPlay').textContent=state.uvPlaying?'Ⅱ UV Flow Pause':'▶ UV Flow Play';
  $('#flowOverlay').hidden=!state.uvPlaying;
  state.offsetsDirty=true;
  renderFlowArrow();
}
function renderFlowArrow(){
  const sx=finite($('#flowX').value),sy=finite($('#flowY').value);
  const arrow=$('#flowArrow');
  const angle=Math.atan2(sy,sx)*180/Math.PI;
  arrow.textContent='➜';arrow.style.transform=`rotate(${-angle}deg)`;
  $('#flowVector').textContent=`X ${sx>=0?'+':''}${sx.toFixed(2)} · Y ${sy>=0?'+':''}${sy.toFixed(2)}`;
}
async function applyUpload(slot,file){
  if(!file||!state.meshes.length){status('먼저 모델을 불러오세요.',true);return false;}
  if(!file.type.startsWith('image/') && !/\.(png|jpe?g|bmp|webp|gif|avif|tga|dds|ktx2)$/i.test(file.name)){
    status('지원하는 이미지 형식: PNG/JPG/WebP/BMP/AVIF/TGA/DDS/KTX2',true);return false;
  }
  const generation=state.loadGeneration;
  const ticket=textureRequests.next(slot);
  let url=URL.createObjectURL(file);state.uploadedURLs.push(url);
  let tex;
  const uploadLoader=/\.tga$/i.test(file.name)?new TGALoader():/\.dds$/i.test(file.name)?new DDSLoader():
    /\.ktx2$/i.test(file.name)?getTextureKTX2Loader():new THREE.TextureLoader();
  try{tex=await uploadLoader.loadAsync(url);}catch(err){status(`텍스처 로드 실패: ${err.message}`,true);return false;}finally{URL.revokeObjectURL(url);state.uploadedURLs=state.uploadedURLs.filter(u=>u!==url);}
  if(generation!==state.loadGeneration||!textureRequests.isCurrent(slot,ticket)){tex.dispose();return false;}
  if(!/\.ktx2$/i.test(file.name))tex.flipY=$('#flipTextureY').checked;
  tex.colorSpace=['map','emissiveMap'].includes(slot)?THREE.SRGBColorSpace:THREE.NoColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  const targets=scopeMeshes();
  for(const mesh of targets){
    const mats=scopedMaterials(mesh);
    for(const mat of mats){
      const previous=mat[slot];
      const own=tex.clone();own.needsUpdate=true;state.editableTextures.add(own);
      mat[slot]=own;
      if(previous&&state.editableTextures.has(previous))previous.dispose();
      if(slot==='alphaMap'&&$('#matAlphaMode').value==='opaque'){$('#matAlphaMode').value='blend';$('#matAlphaCutoff').disabled=true;}
      if(slot==='emissiveMap')mat.emissive?.set('#ffffff');
      mat.needsUpdate=true;
    }
  }
  tex.dispose();
  const element=$(`.texture-slot[data-slot="${slot}"]`);
  element.classList.add('loaded');element.querySelector('small').textContent=file.name;
  state.slotFiles.set(slot,file.name);state.slotFileBlobs.set(slot,file);
  $('#matTexSlot').value=slot;loadManualTransform(); // Show the uploaded texture's independent transform immediately.
  if(slot==='alphaMap')applyMaterialInputs(targets,'matAlphaMode');
  state.offsetsDirty=true;applyTextureParameters();setMode('material');
  status(`${file.name} → ${slot} (${targets.length} meshes) 적용`);return true;
}
async function uploadORM(file){
  if(!file||!state.meshes.length){status('먼저 모델을 불러오세요.',true);return;}
  if(!file.type.startsWith('image/')&&!/\.(png|jpe?g|bmp|webp|gif|avif|tga|dds|ktx2)$/i.test(file.name)){
    status('ORM 입력 형식이 지원되지 않습니다.',true);return;
  }
  const generation=state.loadGeneration;
  const ormTickets=Object.fromEntries(ORM_SLOTS.map(slot=>[slot,textureRequests.next(slot)]));
  const url=URL.createObjectURL(file);state.uploadedURLs.push(url);
  const loader=/\.tga$/i.test(file.name)?new TGALoader():/\.dds$/i.test(file.name)?new DDSLoader():
    /\.ktx2$/i.test(file.name)?getTextureKTX2Loader():new THREE.TextureLoader();
  let source;
  try{source=await loader.loadAsync(url);}catch(e){status('ORM 로딩 실패: '+e.message,true);return;}finally{URL.revokeObjectURL(url);state.uploadedURLs=state.uploadedURLs.filter(u=>u!==url);}
  if(generation!==state.loadGeneration||ORM_SLOTS.some(slot=>!textureRequests.isCurrent(slot,ormTickets[slot]))){source.dispose();return;}
  source.colorSpace=THREE.NoColorSpace;if(!/\.ktx2$/i.test(file.name))source.flipY=$('#flipTextureY').checked;
  source.wrapS=source.wrapT=THREE.RepeatWrapping;
  const targets=scopeMeshes();
  for(const mesh of targets)for(const mat of scopedMaterials(mesh)){
    for(const slot of ORM_SLOTS){
      const prev=mat[slot];
      const tex=source.clone();tex.needsUpdate=true;tex.channel=state.uvChannel;
      state.editableTextures.add(tex);mat[slot]=tex;
      if(prev&&state.editableTextures.has(prev))prev.dispose();
      const el=$(`.texture-slot[data-slot="${slot}"]`);
      el.classList.add('loaded');el.querySelector('small').textContent=`ORM: ${file.name}`;
      state.slotFiles.set(slot,file.name);state.slotFileBlobs.set(slot,file);
    }
    mat.needsUpdate=true;
  }
  source.dispose();
  $('#ormFileName').textContent=file.name+' · R=AO / G=Roughness / B=Metallic';
  state.offsetsDirty=true;applyTextureParameters();setMode('material');
  status(`${file.name} ORM 적용 완료 (${targets.length} meshes)`);
}
function clearTextureSlot(slot){
  if(!slotNames.includes(slot))return;
  textureRequests.invalidate(slot);
  for(const mesh of scopeMeshes()){
    const cache=state.debugMats.get(mesh);if(!cache?.working)continue;
    for(const mat of scopedMaterials(mesh)){
      const tex=mat[slot];if(tex&&state.editableTextures.has(tex))tex.dispose();
      mat[slot]=null;mat.needsUpdate=true;
    }
  }
  const label=$(`.texture-slot[data-slot="${slot}"]`);
  label.classList.remove('loaded');label.querySelector('small').textContent='Upload image';
  state.slotFiles.delete(slot);state.slotFileBlobs.delete(slot);
  if(state.mode==='material')updateDisplayMaterial();
  status(`${slot} 텍스처 해제 완료 (선택 범위)`);
}
function resetMaterialUI(){
  for(const id of ['matBaseStrength','matNormalStrength','matAOIntensity','matEmissiveIntensity','matBumpScale','matDisplacementScale','matDisplacementBias','matOpacity','matAlphaCutoff','matRough','matMetal']){
    const control=$('#'+id);control.value=control.defaultValue;
    const output=$('#'+({matRough:'valueRough',matMetal:'valueMetal',matBaseStrength:'valueBaseStrength',matNormalStrength:'valueNormalStrength',matAOIntensity:'valueAOIntensity',matEmissiveIntensity:'valueEmissiveIntensity',matBumpScale:'valueBumpScale',matDisplacementScale:'valueDisplacementScale',matDisplacementBias:'valueDisplacementBias',matOpacity:'valueOpacity',matAlphaCutoff:'valueAlphaCutoff'}[id]));
    if(output)output.textContent=Number(control.value).toFixed(2);
  }
  $('#matColor').value='#ffffff';$('#matEmissiveColor').value='#ffffff';
  $('#matAlphaMode').value='opaque';$('#matAlphaCutoff').disabled=true;$('#matNormalFlipGreen').checked=false;
  $('#matDepthTest').checked=$('#matDepthWrite').checked=true;$('#matCull').value='double';$('#matMaskChannel').value='g';$('#matMaskInvert').checked=false;
}
function resetMaterials(){
  textureRequests.invalidateAll();
  for(const mesh of scopeMeshes()){
    const cache=state.debugMats.get(mesh);
    if(cache?.working){
      for(const mat of (Array.isArray(cache.working)?cache.working:[cache.working])){
        for(const slot of textureMapSlots)if(mat[slot]&&state.editableTextures.has(mat[slot]))mat[slot].dispose();
        mat.dispose();
      }
      delete cache.working;
    }
    for(const key of ['checker','uvgrid'])if(cache?.[key]?.map){cache[key].map.offset.set(0,0);cache[key].map.repeat.set(1,1);}
    if(state.mode==='material')mesh.material=state.originalMats.get(mesh);
  }
  $$('.texture-slot').forEach(el=>{el.classList.remove('loaded');el.querySelector('small').textContent='Upload image';});
  state.slotFiles.clear();state.slotFileBlobs.clear();resetMaterialUI();$('#ormFileName').textContent='Not loaded';
  state.flowSeconds=state.flipbookSeconds=0;state.slotFlows.clear();loadSlotFlow();
  state.visualOffsetX=state.visualOffsetY=0;state.flowPhaseX=state.flowPhaseY=0;
  $('#offsetX').value=0;$('#offsetY').value=0;
  state.uvPlaying=false;$('#btnUVPlay').textContent='▶ UV Flow Play';$('#flowOverlay').hidden=true;
  state.offsetsDirty=true;updateDisplayMaterial();
  status('재질 오버라이드를 초기화했습니다.');
}
function getTextureKTX2Loader(){
  if(!state.textureKTX2){
    state.textureKTX2=new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/basis/');
    state.textureKTX2.detectSupport(renderer);
  }
  return state.textureKTX2;
}
function updateDiagnostics(){
  const data=diagnoseMeshes(inspected().map(mesh=>({name:mesh.name,geometry:state.originalGeos.get(mesh)||mesh.geometry})),state.uvChannel);
  const s=data.summary;
  $('#uvDiagnostics').textContent=`UV${state.uvChannel} · scanned ${s.analyzed||0}/${s.faces||0} faces\n`+
    `overlaps ${s.overlapPairs||0} · flipped ${s.flipped||0} · degenerate ${s.degenerate||0}\n`+
    `bad normals ${s.invalidNormals||0} · opposing ${s.opposingNormals||0}`+
    (data.reports.some(r=>r.partial)?'\n⚠ 일부 대형 메시 샘플링 제한':'')+
    '\n* VFX에서 UV 겹침/반전은 연출 의도일 수 있습니다.';
  return data;
}
function disposeComparison(){
  comparisonRequests.invalidate();
  depthPreview.setReferenceRoot(null);
  state.compareMaterialStates.clear();state.compareBasePosition=null;
  if(state.compareRoot){
    scene.remove(state.compareRoot);
    disposeDetachedRoot(state.compareRoot,textureMapSlots);
  }
  state.compareLoader?.dispose();state.compareRoot=null;state.compareLoader=null;state.compareMeta=null;
  $('#comparisonResults').textContent='비교 모델을 불러오면 폴리곤·UV·알파 차이를 표시합니다.';
}
function applyCompareView(){
  $('#valueCompareOpacity').textContent=Number($('#compareOpacity').value).toFixed(2);
  const root=state.compareRoot;if(!root)return;
  const mode=$('#compareDisplayMode').value;
  root.visible=$('#compareVisible').checked;
  const base=state.compareBasePosition;
  if(!base)return;
  root.position.copy(base);
  // Side mode already offsets comparison on initial import. Overlay aligns world-space bounds centers.
  if(mode==='overlay'&&state.model){
    root.updateMatrixWorld(true);state.model.updateMatrixWorld(true);
    const primary=new THREE.Box3().setFromObject(state.model), secondary=new THREE.Box3().setFromObject(root);
    if(!primary.isEmpty()&&!secondary.isEmpty()){
      const centerA=primary.getCenter(new THREE.Vector3()),centerB=secondary.getCenter(new THREE.Vector3());
      root.position.add(centerA.sub(centerB));
    }
  }
  const strength=clamp(Number($('#compareOpacity').value)||0,0,1);
  const fade=mode==='overlay'?strength:1;
  root.traverse(obj=>{
    if(!obj.isMesh)return;
    for(const mat of materials(obj)){
      if(!mat||!mat.isMaterial)continue;
      if(!state.compareMaterialStates.has(mat))state.compareMaterialStates.set(mat,{opacity:mat.opacity,transparent:mat.transparent,depthWrite:mat.depthWrite});
      const src=state.compareMaterialStates.get(mat);
      mat.opacity=src.opacity*fade;mat.transparent=src.transparent||fade<1;mat.depthWrite=fade<1?false:src.depthWrite;mat.needsUpdate=true;
    }
  });
  root.updateMatrixWorld(true);depthPreview.setReferenceRoot(root);
}
async function openComparison(files){
  if(!files.length||!state.model)return;
  const ticket=comparisonRequests.next(),originalPrimary=state.model;
  const loader=new LocalModelLoader(renderer);
  let accepted=false,result=null;
  try{
    status('비교 모델 로딩 중...');result=await loader.load(files);
    if(!comparisonRequests.isCurrent(ticket)||state.model!==originalPrimary)return;
    disposeComparison();state.compareRoot=result.root;state.compareLoader=loader;accepted=true;
    state.compareMeta=result;state.compareBasePosition=result.root.position.clone();
    depthPreview.setReferenceRoot(result.root);updateShaderStudioUI({rebuild:false});
    const primaryBox=new THREE.Box3().setFromObject(state.model);
    const secondaryBox=new THREE.Box3().setFromObject(result.root);
    if(!primaryBox.isEmpty()&&!secondaryBox.isEmpty()){
      const gap=Math.max(primaryBox.getSize(new THREE.Vector3()).length()*.1,.2);
      result.root.position.x+=primaryBox.max.x-secondaryBox.min.x+gap;
    }
    state.compareBasePosition=result.root.position.clone();
    scene.add(result.root);result.root.updateMatrixWorld(true);
    $('#compareDisplayMode').value='side';$('#compareVisible').checked=true;$('#compareOpacity').value='1';applyCompareView();
    const c=buildComparison(state.model,result.root,state.uvChannel),d=c.comparison.delta;
    $('#comparisonResults').textContent=`A ${c.left.name} vs B ${c.right.name}\n`+
      Object.entries(d).map(([k,v])=>`${k}: ${v.left.toLocaleString()} → ${v.right.toLocaleString()} (${v.diff>=0?'+':''}${v.diff.toLocaleString()})`).join('\n');
    const box=new THREE.Box3().setFromObject(state.model).union(new THREE.Box3().setFromObject(result.root));
    const center=box.getCenter(new THREE.Vector3());controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(5,4,6).normalize().multiplyScalar(Math.max(box.getSize(new THREE.Vector3()).length(),1)*1.8));
    controls.update();status('비교 모델 로드 완료 · 좌: 기준 / 우: 비교');
  }catch(err){
    if(comparisonRequests.isCurrent(ticket))status('비교 파일 오류: '+err.message,true);
  }finally{
    if(!accepted){disposeDetachedRoot(result?.root,textureMapSlots);loader.dispose();}
  }
}

async function openFiles(files){
  const inputFiles=Array.from(files||[]);
  if(!inputFiles.length)return;
  const ticket=modelRequests.next();
  const loader=new LocalModelLoader(renderer);
  let accepted=false,result=null;
  setLoading(true,'모델 분석 중');status(`파일 ${inputFiles.length}개 분석 중...`);
  try{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!modelRequests.isCurrent(ticket))return;
    result=await loader.load(inputFiles);
    if(!modelRequests.isCurrent(ticket))return;
    installModel(result.root,{name:result.name,format:result.format,alphaRecovery:result.alphaRecovery},result.animations);
    state.localLoader=loader;accepted=true;
  }catch(err){
    if(modelRequests.isCurrent(ticket)){
      console.error(err);status(err.message||'알 수 없는 로딩 오류',true);
      window.alert(`모델을 열지 못했습니다.\n\n${err.message||err}`);
    }
  }finally{
    if(!accepted){disposeDetachedRoot(result?.root,textureMapSlots);loader.dispose();}
    if(accepted||modelRequests.isCurrent(ticket))setLoading(false);
  }
}

function bindUI(){
  $('#btnOpen').onclick=()=>$('#fileInput').click();$('#dropzone').onclick=()=>$('#fileInput').click();
  $('#dropzone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#fileInput').click();}});
  $('#fileInput').addEventListener('change',e=>{openFiles(e.target.files);e.target.value='';});
  $('#btnFolder').onclick=()=>$('#folderInput').click();
  $('#folderInput').addEventListener('change',e=>{openFiles(e.target.files);e.target.value='';});
  const drop=$('#dropzone');
  for(const elem of [drop,viewport]){
    elem.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging');});
    elem.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
    elem.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');openFiles(e.dataTransfer.files);});
  }
  // Keep browser's default open-file behavior out of the viewport on accidental drops.
  window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
  $('#btnDemo').onclick=()=>{modelRequests.invalidate();installModel(createDemo(),{name:'Demo / VFX Study',format:'PROCEDURAL'});setLoading(false);};
  $('#btnAlphaReport').onclick=()=>{
    const inspectedMeshes=inspected();
    const report={tool:'maxVFX Model Inspector',version:'1.0.1',asset:$('#assetTitle').textContent,
      warning:'This report describes channels actually loaded by the browser; it does not prove which channels existed before FBX export.',
      meshes:inspectedMeshes.map(mesh=>{
        const geo=state.originalGeos.get(mesh)||mesh.geometry;
        const c=geo.getAttribute('color'),a=geo.getAttribute('alpha');
        return {name:mesh.name,vertices:geo.getAttribute('position')?.count||0,
          colorItemSize:c?.itemSize||0,colorArrayType:c?.array?.constructor?.name||null,
          colorNormalized:c?.normalized||false,standaloneAlphaItemSize:a?.itemSize||0,
          alpha:analyzeVertexAlpha(geo),fbxAlphaRecovered:!!geo.userData?.fbxAlphaRecovered,fbxAlphaSource:geo.userData?.fbxAlphaSource||null};
      })};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='maxVFX-vertex-alpha-report.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    status('Vertex Alpha 진단 JSON 저장 완료');
  };
  $$('.tool[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
  $$('.right-tab').forEach(b=>b.onclick=()=>{
    $$('.right-tab').forEach(tab=>tab.classList.toggle('active',tab===b));
    $$('.tabpage').forEach(p=>p.classList.toggle('active',p.id===`page-${b.dataset.tab}`));
    if(b.dataset.tab==='uv')updateInspector();
  });
  $('#btnHelp').onclick=()=>$('#helpDialog').showModal();$('#btnHelpClose').onclick=()=>$('#helpDialog').close();
  $('#helpDialog').addEventListener('click',e=>{if(e.target===$('#helpDialog'))$('#helpDialog').close();});
  $('#btnFrame').onclick=()=>fitCamera(state.model);
  $('#btnFocus').onclick=()=>fitCamera(state.selected||state.model);
  $('#btnScreenshot').onclick=()=>{
    if(bloomPass.enabled)bloomComposer.render();else renderer.render(scene,camera);
    const a=document.createElement('a');a.href=renderer.domElement.toDataURL('image/png');a.download=`maxVFX-View-${Date.now()}.png`;a.click();status('뷰포트 이미지를 저장했습니다.');
  };
  $('#toggleGrid').onchange=e=>grid.visible=e.target.checked;
  $('#toggleAxes').onchange=updateSceneGuides;
  $('#togglePivot').onchange=updateSceneGuides;
  $('#pivotScope').onchange=updateSceneGuides;
  $('#axisSize').oninput=()=>{$('#valueAxisSize').textContent=Number($('#axisSize').value).toFixed(2);guides.resize(Number($('#axisSize').value),Number($('#pivotSize').value));};
  $('#pivotSize').oninput=()=>{$('#valuePivotSize').textContent=Number($('#pivotSize').value).toFixed(2);guides.resize(Number($('#axisSize').value),Number($('#pivotSize').value));};
  $('#toggleWire').onchange=updateWireframe;
  $('#btnWire').onclick=()=>{$('#toggleWire').checked=!$('#toggleWire').checked;updateWireframe();};
  $('#btnAlphaOverlay').onclick=()=>setAlphaOverlay(!$('#toggleAlphaOverlay').checked);
  $('#toggleAlphaOverlay').onchange=e=>setAlphaOverlay(e.target.checked);
  $('#toggleAlphaInspector').onchange=e=>setAlphaOverlay(e.target.checked);
  $('#alphaOverlayView').onchange=()=>{updateDisplayMaterial();refreshAlphaOverlayStatus();};
  $('#alphaOverlayStrength').oninput=e=>{
    $('#valueAlphaOverlayStrength').textContent=Number(e.target.value).toFixed(2);
    updateDisplayMaterial();
  };
  for(const id of ['wireOpacity','wireColor','wireXray'])$('#'+id).addEventListener('input',updateWireStyle);
  $('#toggleNormals').onchange=updateNormalHelper;
  $('#toggleTangents').onchange=updateTangentHelper;
  $('#vertexChannel').onchange=()=>{if(state.mode==='vertex')updateDisplayMaterial();refreshAlphaViewportWarning();};
  $('#toggleRotate').onchange=e=>controls.autoRotate=e.target.checked;
  $('#toggleDoubleSide').onchange=e=>{
    for(const mesh of state.meshes){
      for(const mat of makeWorkingMaterials(mesh)){
        mat.side=e.target.checked?THREE.DoubleSide:THREE.FrontSide;mat.needsUpdate=true;
      }
    }
    updateDisplayMaterial();
  };
  $('#rangeExposure').oninput=e=>{renderer.toneMappingExposure=finite(e.target.value,1);$('#valueExposure').textContent=Number(e.target.value).toFixed(2);};
  $('#bgColor').oninput=e=>{light.set(e.target.value);scene.background=light.clone();renderer.setClearColor(light);};
  $('#uvChannel').onchange=e=>{state.uvChannel=+e.target.value;state.offsetsDirty=true;updateInspector();updateDisplayMaterial();};
  $('#btnUVGrid').onclick=()=>{setMode('uvgrid');$$('.right-tab[data-tab="uv"]')[0].click();};
  $('#btnExportUV').onclick=()=>{
    const can=document.createElement('canvas');can.width=can.height=2048;
    drawUVLayout(can,inspected(),state.uvChannel,{exportMode:true});
    const a=document.createElement('a');a.href=can.toDataURL('image/png');a.download=`maxVFX-UV${state.uvChannel}-${Date.now()}.png`;a.click();status('UV 레이아웃을 PNG로 저장했습니다.');
  };
  $('#flowPreset').onchange=e=>{
    const presets={right:[.3,0,1,1],left:[-.3,0,1,1],up:[0,.3,1,1],down:[0,-.3,1,1],aura:[.3,.12,2,1],waterfall:[0,-.7,1,2],heat:[.12,.35,2,2],diagonal:[.45,.45,1,1]};
    const p=presets[e.target.value];if(!p)return;
    ['flowX','flowY','repeatX','repeatY'].forEach((id,i)=>$('#'+id).value=p[i]);
    state.flowPhaseX=state.flowPhaseY=0;
    state.visualOffsetX=finite($('#offsetX').value);state.visualOffsetY=finite($('#offsetY').value);
    state.offsetsDirty=true;applyTextureParameters();renderFlowArrow();
    status(`UV Flow preset: ${e.target.selectedOptions[0].textContent}`);
  };
  $('#btnUVPlay').onclick=toggleUVAnimation;
  $('#btnUVReset').onclick=()=>{
    state.visualOffsetX=state.visualOffsetY=state.flowPhaseX=state.flowPhaseY=0;
    $('#offsetX').value=0;$('#offsetY').value=0;state.offsetsDirty=true;applyTextureParameters();
    status('UV 오프셋을 0으로 초기화했습니다.');
  };
  for(const id of ['flowX','flowY'])$(('#'+id)).addEventListener('input',renderFlowArrow);
  for(const id of ['offsetX','offsetY','repeatX','repeatY','flowAllTextures'])$('#'+id).addEventListener('input',()=>{
    state.visualOffsetX=finite($('#offsetX').value)+state.flowPhaseX;
    state.visualOffsetY=finite($('#offsetY').value)+state.flowPhaseY;
    state.offsetsDirty=true;applyTextureParameters();
  });
  $$('[data-texture]').forEach(el=>el.addEventListener('change',e=>{
    applyUpload(e.target.dataset.texture,e.target.files?.[0]);e.target.value='';
  }));
  $('#ormInput').addEventListener('change',e=>{uploadORM(e.target.files?.[0]);e.target.value='';});
  const matOutputs={matBaseStrength:'valueBaseStrength',matRough:'valueRough',matMetal:'valueMetal',matNormalStrength:'valueNormalStrength',matAOIntensity:'valueAOIntensity',matEmissiveIntensity:'valueEmissiveIntensity',matBumpScale:'valueBumpScale',matDisplacementScale:'valueDisplacementScale',matDisplacementBias:'valueDisplacementBias',matOpacity:'valueOpacity',matAlphaCutoff:'valueAlphaCutoff'};
  for(const [id,out] of Object.entries(matOutputs))$('#'+id).addEventListener('input',e=>{
    $('#'+out).textContent=Number(e.target.value).toFixed(2);applyMaterialInputs(scopeMeshes(),id);
  });
  for(const id of ['matColor','matEmissiveColor'])$('#'+id).addEventListener('input',()=>applyMaterialInputs(scopeMeshes(),id));
  $('#matNormalFlipGreen').addEventListener('change',()=>applyMaterialInputs(scopeMeshes(),'matNormalFlipGreen'));
  $('#matAlphaMode').addEventListener('change',()=>{
    const kind=$('#matAlphaMode').value;
    $('#matAlphaCutoff').disabled=kind!=='mask';
    $('#matDepthWrite').checked=['opaque','mask'].includes(kind);
    applyMaterialInputs(scopeMeshes(),'matAlphaMode');
  });
  for(const id of ['matDepthTest','matDepthWrite','matCull'])$('#'+id).addEventListener('change',()=>applyMaterialInputs(scopeMeshes(),id));
  for(const id of ['matMaskChannel','matMaskInvert'])$('#'+id).addEventListener('change',updateDisplayMaterial);
  for(const id of ['matBloom','matBloomStrength','matBloomThreshold','matBloomRadius'])$('#'+id).addEventListener('input',()=>{
    for(const [input,out] of [['matBloomStrength','valueBloomStrength'],['matBloomThreshold','valueBloomThreshold'],['matBloomRadius','valueBloomRadius']])$('#'+out).textContent=Number($('#'+input).value).toFixed(2);
    updateBloom();
  });
  $('#matTexSlot').addEventListener('change',loadManualTransform);
  for(const id of Object.values(manualTransformFields)){
    $('#'+id).addEventListener('input',saveManualTransform);
    $('#'+id).addEventListener('change',()=>{saveManualTransform();loadManualTransform();});
  }
  $('#btnMatTransformReset').onclick=()=>{state.textureTransforms.delete($('#matTexSlot').value);loadManualTransform();state.offsetsDirty=true;applyTextureParameters();};
  $('#btnMatTransformUV').onclick=()=>$$('.right-tab[data-tab="uv"]')[0].click();
  $('#slotFlowSlot').addEventListener('change',loadSlotFlow);
  for(const id of Object.values(flowFields))$('#'+id).addEventListener('input',saveSlotFlow);
  $('#slotFlowEnabled').addEventListener('change',()=>{state.flowSeconds=0;state.offsetsDirty=true;applyTextureParameters();});
  for(const id of ['flipbookEnabled','flipbookSlot','flipbookColumns','flipbookRows','flipbookFPS','flipbookLoop'])$('#'+id).addEventListener('change',()=>{state.flipbookSeconds=0;state.offsetsDirty=true;applyTextureParameters();});
  $('#btnUVAnalyze').onclick=scanProDiagnostics;
  $('#btnDiagCancel').onclick=()=>cancelDiagnostics();
  $('#btnDiagExport').onclick=()=>{if(!latestDiagnostic)return;downloadJSON('maxVFX-UV-Mesh-QA-v0.9.5.json',latestDiagnostic);status('상세 QA 리포트 저장 완료');};
  $('#fxApplyLook').onclick=()=>{
    const p=resolveShaderPreset($('#fxLookPreset').value);if(!p){status('프리셋을 선택하세요.');return;}
    for(const [id,value] of Object.entries({...p.settings,...p.material})){
      const el=$('#'+id);if(!el)continue;
      if(el.type==='checkbox')el.checked=Boolean(value);else el.value=value;
      const out=$('#out'+id[0].toUpperCase()+id.slice(1));if(out&&el.type==='range')out.textContent=Number(el.value).toFixed(2);
    }
    $('#matAlphaCutoff').disabled=$('#matAlphaMode').value!=='mask';
    applyMaterialInputs(scopeMeshes());updateBloom();updateShaderStudioUI();
    status(`${p.label} 프리뷰 프리셋 적용 (Unity/Unreal 결과 보장 아님)`);
  };
  $('#btnPresetExport').onclick=()=>{downloadJSON('maxVFX-material-preset-v1.0.1.json',currentPreset());status('프리셋 JSON 저장 완료');};
  $('#btnPresetImport').onclick=()=>$('#presetFileInput').click();
  $('#presetFileInput').onchange=async e=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    try{const p=await importPreset(f);applyPresetValues(p);status('JSON 프리셋 적용 완료. 텍스처 포함 저장은 ZIP을 이용하세요.');}
    catch(err){status('프리셋 오류: '+err.message,true);}
  };
  $('#btnPackExport').onclick=async()=>{
    const button=$('#btnPackExport');button.disabled=true;status('프리셋과 텍스처를 ZIP으로 묶는 중...');
    try{const JSZip=await getZipLibrary();const data=await savePack(currentPreset(),state.slotFileBlobs,state.shaderFileBlobs,JSZip);
      downloadBlob('maxVFX-Material-Pack-v1.0.1.zip',data);status(`패키지 저장 완료 · ${(data.size/1024/1024).toFixed(2)}MB`);
    }catch(e){status('ZIP 저장 오류: '+e.message,true);}finally{button.disabled=false;}
  };
  $('#btnPackImport').onclick=()=>$('#packFileInput').click();
  $('#packFileInput').onchange=async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const button=$('#btnPackImport');button.disabled=true;
    const activeGeneration=state.loadGeneration;
    try{
      if(!state.meshes.length)throw Error('프리셋을 적용할 모델을 먼저 불러오세요.');
      const JSZip=await getZipLibrary();const {manifest,files}=await loadPack(file,JSZip);
      if(activeGeneration!==state.loadGeneration)throw Error('모델이 변경되어 이전 프리셋 복원을 취소했습니다.');
      applyPresetValues(manifest.preset);
      // The pack is applied to every mesh; individual material overrides cannot be reconstructed from one UI snapshot.
      $('#applyScope').value='all';$('#matSlotIndex').value='all';
      let errors=0;
      for(const entry of files){
        if(activeGeneration!==state.loadGeneration)throw Error('모델 변경으로 프리셋 복원을 중단했습니다.');
        try{const ok=entry.kind==='material'?await applyUpload(entry.slot,entry.file):await loadShaderTexture(entry.slot,entry.file);if(!ok)errors++;}
        catch(error){errors++;console.warn('Pack texture import',entry.slot,error);}
      }
      if(activeGeneration!==state.loadGeneration)throw Error('모델 변경으로 프리셋 복원을 중단했습니다.');
      state.offsetsDirty=true;applyTextureParameters();updateShaderStudioUI();
      status(errors?`ZIP 부분 복원 · ${errors}개 텍스처 실패 (설정 재검토 필요)`:`프리셋 ZIP 복원 완료 · 이미지 ${files.length}개`,!!errors);
    }catch(e){status('ZIP 불러오기 오류: '+e.message,true);}finally{button.disabled=false;}
  };
  for(const id of ['compareDisplayMode','compareOpacity','compareVisible'])$('#'+id).addEventListener('input',applyCompareView);
  $('#btnRecord').onclick=()=>{
    if(capture.active){capture.stop();return;}
    try{capture.start(renderer.domElement);status('WebM 녹화 중 · 최대 30초 · 화면의 3D 캔버스만 저장합니다.');}
    catch(e){status('녹화 시작 실패: '+e.message,true);}
  };
  $('#btnCompareOpen').onclick=()=>$('#compareFileInput').click();
  $('#compareFileInput').onchange=e=>{openComparison(Array.from(e.target.files||[]));e.target.value='';};
  $('#btnCompareClear').onclick=()=>{disposeComparison();fitCamera(state.model);status('비교 모델을 제거했습니다.');};
  $('#btnCompareFocus').onclick=()=>{
    if(!state.compareRoot)return fitCamera(state.model);
    const box=new THREE.Box3().setFromObject(state.model).union(new THREE.Box3().setFromObject(state.compareRoot));
    const center=box.getCenter(new THREE.Vector3()),radius=Math.max(box.getSize(new THREE.Vector3()).length()*.5,.01);
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,.65,1).normalize().multiplyScalar(radius*4));controls.update();
  };
  $('#btnQAReport').onclick=()=>{
    const report={tool:'maxVFX Model Inspector',version:'1.0.1',generatedAt:new Date().toISOString(),uvChannel:state.uvChannel,
      primary:inspectAsset(state.model,state.uvChannel),secondary:state.compareRoot?inspectAsset(state.compareRoot,state.uvChannel):null,
      advancedUV:latestDiagnostic,
      notes:['Overlapping UVs can be intentional for VFX.','Pro scanner is bounded and marks partial results. Run Full QA Scan before exporting.','Draw calls and FPS depend on device and view state.']};
    downloadJSON('maxVFX-production-report.json',report);status('검수 리포트 저장 완료');
  };
  $('#applyScope').addEventListener('change',()=>{updateMaterialSlotSelect();status('Apply to 범위 변경 · 이후 텍스처/수치 편집에 적용됩니다.');});
  $('#matSlotIndex').addEventListener('change',()=>status('Material ID 범위 변경 · 이후 편집부터 적용됩니다.'));
  $$('.texture-slot').forEach(label=>{
    const close=document.createElement('button');close.type='button';close.className='slot-clear';close.textContent='×';close.title='Remove '+label.dataset.slot;
    close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();clearTextureSlot(label.dataset.slot);});
    label.appendChild(close);
  });
  // Shader Studio: controls use uniform updates; no per-frame shader recompilation.
  for(const id of shaderControls){
    const el=$('#'+id);if(!el)throw Error('Shader Studio UI missing '+id);
    el.addEventListener(el.type==='checkbox'||el.tagName==='SELECT'?'change':'input',()=>{
      const output=$('#out'+id[0].toUpperCase()+id.slice(1));
      if(output)output.textContent=Number(el.value).toFixed(2);
      updateShaderStudioUI();
    });
  }
  $('#fxNoiseFile').onchange=e=>{loadShaderTexture('noise',e.target.files?.[0]);e.target.value='';};
  $('#fxMaskFile').onchange=e=>{loadShaderTexture('mask',e.target.files?.[0]);e.target.value='';};
  for(const slot of ['noise','mask'])$(slot==='noise'?'#fxClearNoise':'#fxClearMask').onclick=()=>{
    ++state.shaderUploadSerial[slot];state.shaderMaps[slot]?.dispose();state.shaderMaps[slot]=null;state.shaderFileBlobs.delete(slot);
    $('#fxLayerStatus').textContent=`${slot} 텍스처 제거됨`;updateShaderStudioUI();
  };
  $('#fxReset').onclick=()=>{
    for(const [id,value] of Object.entries(SHADER_FIELD_DEFAULTS)){const el=$('#'+id);if(el.type==='checkbox')el.checked=Boolean(value);else el.value=value;}
    for(const slot of ['noise','mask']){++state.shaderUploadSerial[slot];state.shaderMaps[slot]?.dispose();state.shaderMaps[slot]=null;state.shaderFileBlobs.delete(slot);}
    for(const id of shaderControls){const out=$('#out'+id[0].toUpperCase()+id.slice(1));if(out)out.textContent=Number($('#'+id).value).toFixed(2);}
    $('#fxLayerStatus').textContent='Shader Studio 초기화 완료';updateShaderStudioUI();
  };
  $('#btnMaterialReset').onclick=resetMaterials;
  $('#animationSelect').onchange=()=>switchClip(true);
  $('#btnAnimToggle').onclick=()=>{
    if(!state.currentAction)switchClip(true);
    else{
      state.animationPlaying=!state.animationPlaying;
      state.currentAction.paused=!state.animationPlaying;
      $('#btnAnimToggle').textContent=state.animationPlaying?'Ⅱ Pause':'▶ Play';
    }
  };
  renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)state.pointerDown=[e.clientX,e.clientY];});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!state.pointerDown||e.button!==0)return;
    const [x,y]=state.pointerDown;state.pointerDown=null;
    if(Math.hypot(x-e.clientX,y-e.clientY)>4)return;
    const rect=renderer.domElement.getBoundingClientRect();
    rayPoint.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1));
    raycaster.setFromCamera(rayPoint,camera);
    const hit=raycaster.intersectObjects(state.meshes,false);
    selectMesh(hit[0]?.object||null);
  });
}
function sizeRenderer(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  if(w<1||h<1)return;
  renderer.setSize(w,h,false);bloomComposer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
  depthPreview.resize(Math.floor(w*renderer.getPixelRatio()),Math.floor(h*renderer.getPixelRatio()));
}
const resizeObserver=new ResizeObserver(sizeRenderer);resizeObserver.observe(viewport);
function animate(){
  requestAnimationFrame(animate);capture.enforceLimit();
  const dt=Math.min(frameClock.getDelta(),.08);
  if(state.animationPlaying&&state.sceneMixer)state.sceneMixer.update(dt);
  if(state.uvPlaying){
    state.flowSeconds=(state.flowSeconds+dt)%4096;
    // Increment phases rather than multiplying elapsed time by velocity.
    state.flowPhaseX=(state.flowPhaseX+finite($('#flowX').value)*dt)%4096;
    state.flowPhaseY=(state.flowPhaseY+finite($('#flowY').value)*dt)%4096;
    state.visualOffsetX=finite($('#offsetX').value)+state.flowPhaseX;
    state.visualOffsetY=finite($('#offsetY').value)+state.flowPhaseY;
    state.offsetsDirty=true;
  }
  if($('#flipbookEnabled').checked){state.flipbookSeconds+=dt;state.offsetsDirty=true;}
  if(state.offsetsDirty)applyTextureParameters();
  if($('#fxEnabled').checked){
    const s=shaderSettings();if(s.fxNoiseSpeedU||s.fxNoiseSpeedV) {state.shaderSeconds=(state.shaderSeconds+dt)%1024;updateShaderStudioUI({rebuild:false});}
  }
  controls.update();
  state.normalHelper?.update();
  state.tangentHelper?.update();
  guides.followPivots();
  depthPreview.render();
  if(bloomPass.enabled)bloomComposer.render();else renderer.render(scene,camera);
  state.frameCount++;
  const t=performance.now();
  if(t-state.lastFpsUpdate>700){
    $('#statFPS').textContent=fmt(state.frameCount*1000/Math.max(t-state.lastFpsUpdate,1));
    $('#statDrawCalls').textContent=fmt(renderer.info.render.calls);
    state.frameCount=0;state.lastFpsUpdate=t;
  }
}
try{
  bindUI();sizeRenderer();state.lastFpsUpdate=performance.now();
  installModel(createDemo(),{name:'Demo / VFX Study',format:'PROCEDURAL'});
  $('#loading').hidden=true;window.__maxVFXReady=true;renderFlowArrow();animate();
}catch(error){console.error('Initialization error',error);setLoading(true,'3D 뷰어 초기화 실패');$('#loading').querySelector('small').textContent=String(error?.message||error);status('초기화 오류: '+error.message,true);}

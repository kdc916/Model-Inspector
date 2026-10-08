import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VertexNormalsHelper } from 'three/addons/helpers/VertexNormalsHelper.js';
import { VertexTangentsHelper } from 'three/addons/helpers/VertexTangentsHelper.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import { LocalModelLoader } from './model-loaders.js';
import { createDemo, makeCheckerTexture } from './procedural.js';
import { drawUVLayout, inspectMeshes } from './analysis.js';
import { finite, modelStats, textureOffsetFromVisual, triangleCount } from './uv-utils.js';
import { analyzeUVStretch, extractVertexColors, analyzeVertexAlpha } from './mesh-diagnostics.js';
import { TEXTURE_SLOTS, ORM_SLOTS, normalScalePair, scopedMaterialIndices, materialValue, alphaMaterialSettings } from './material-controls.js';

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
  pointerDown:null, dragCount:0, loadGeneration:0, slotFiles:new Map()
};
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
const axes=new THREE.AxesHelper(3);axes.visible=false;scene.add(axes);
scene.add(new THREE.HemisphereLight(0xe9f7ff,0x3b5367,2.0));
const key = new THREE.DirectionalLight(0xffffff,3.1);key.position.set(8,12,10);scene.add(key);
const fill = new THREE.DirectionalLight(0x76b3dd,1.3);fill.position.set(-8,1,-5);scene.add(fill);
const rim = new THREE.DirectionalLight(0x83f4dc,1.0);rim.position.set(-2,6,8);scene.add(rim);
const raycaster=new THREE.Raycaster();const rayPoint=new THREE.Vector2();
const frameClock=new THREE.Clock();
const checkerBase=makeCheckerTexture('checker');const gridBase=makeCheckerTexture('uvgrid');

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
    ensurePreviewGeometry(mesh);
    const cache=state.debugMats.get(mesh)||{};
    if(state.mode==='material'){
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
      assignDebugMaterial(mesh,cache[name]);
    }
    state.debugMats.set(mesh,cache);
  }
  state.offsetsDirty=true;
  $('#viewModeHud').textContent={material:'PBR / MATERIAL',checker:'UV / CHECKER',uvgrid:'UV / GRID',normal:'GEOMETRY / NORMALS',stretch:'UV / STRETCH HEATMAP',vertex:'VERTEX / COLOR',alpha:'VERTEX / ALPHA'}[state.mode];
  $$('.tool[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
  $('#diagnosticLegend').hidden=state.mode!=='stretch';
  $('#vertexOptions').hidden=state.mode!=='vertex';
  $('#alphaLegend').hidden=state.mode!=='alpha';
  refreshAlphaViewportWarning();
  applyTextureParameters();
}
function setMode(mode){state.mode=mode;updateDisplayMaterial();}
function disposeModel(){
  state.loadGeneration++;
  state.uvPlaying=false;state.animationPlaying=false;state.sceneMixer?.stopAllAction();state.sceneMixer=null;
  $('#btnUVPlay').textContent='▶ UV Flow Play';$('#btnAnimToggle').textContent='▶ Play';
  if(state.normalHelper){state.normalHelper.parent?.remove(state.normalHelper);state.normalHelper.dispose?.();state.normalHelper=null;}
  if(state.tangentHelper){state.tangentHelper.parent?.remove(state.tangentHelper);state.tangentHelper.dispose?.();state.tangentHelper=null;}
  disposeWireHelpers();
  for(const mesh of [...state.previewGeos.keys()])restorePreviewGeometry(mesh);
  state.originalGeos.clear();state.stretchCache.clear();
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
  state.localLoader.dispose();
  for(const u of state.uploadedURLs)URL.revokeObjectURL(u);
  state.uploadedURLs=[];state.editableTextures=new WeakSet();state.slotFiles.clear();
  $$('.texture-slot').forEach(el=>{el.classList.remove('loaded');el.querySelector('small').textContent='Upload image';});
  state.model=null;state.meshes=[];state.selected=null;state.clips=[];
}
function installModel(root,meta={},clips=[]){
  disposeModel();
  state.model=root;state.model.position.set(0,0,0);
  state.meshes=gatherMeshes(root);state.clips=clips;
  if(!state.meshes.length)status('경고: 불러온 모델에 메시가 없습니다. 포인트/카메라/라인만 포함되었을 수 있습니다.',true);
  for(const [i,mesh] of state.meshes.entries()){
    if(!mesh.name)mesh.name=`Mesh ${i+1}`;
    state.originalMats.set(mesh,mesh.material);
    state.originalGeos.set(mesh,mesh.geometry);
    if(mesh.geometry && !mesh.geometry.hasAttribute('normal'))mesh.geometry.computeVertexNormals();
  }
  scene.add(root);
  if(clips.length){state.sceneMixer=new THREE.AnimationMixer(root);}
  state.selected=null;state.uvPlaying=false;state.flowPhaseX=state.flowPhaseY=0;state.offsetsDirty=true;
  $('#btnUVPlay').textContent='▶ UV Flow Play';$('#flowOverlay').hidden=true;
  $('#assetTitle').textContent=(meta.name||root.name||'MODEL').slice(0,42).toUpperCase();
  $('#assetMeta').textContent=`${meta.format||'DEMO'} · ${state.meshes.length} meshes`;
  state.mode='material';updateDisplayMaterial();
  updateVertexAlphaHealth();
  updateStats();updateHierarchy();updateInspector();updateMaterialSlotSelect();updateAnimSelect();updateWireframe();updateNormalHelper();updateTangentHelper();fitCamera(root);
  status(`${meta.name||'데모 모델'} 준비 완료 · ${fmt(modelStats(state.meshes).triangles)} triangles`);
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
  grid.position.y=box.min.y-Math.max(.008,size.y*.004);
  grid.scale.setScalar(Math.max(.1, Math.min(1000, radius/9)));
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
  state.selected=mesh||null;updateHierarchy();updateInspector();updateVertexAlphaHealth();updateMaterialSlotSelect();updateNormalHelper();updateTangentHelper();
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
    ['Tangents',`${meshes.filter(m=>state.originalGeos.get(m)?.hasAttribute('tangent')).length}/${meshes.length} meshes`]
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
  const alphaActive=state.mode==='alpha'||(state.mode==='vertex'&&$('#vertexChannel').value==='a');
  const meshes=inspected();
  const reports=meshes.map(m=>analyzeVertexAlpha(state.originalGeos.get(m)||m.geometry));
  const missing=reports.filter(r=>!r.hasAlpha).length;
  const fullWhite=reports.filter(r=>r.reason==='all-white').length;
  el.hidden=!alphaActive||(!missing&&!fullWhite);
  if(el.hidden)return;
  el.textContent=missing
    ?`⚠ Vertex Alpha 누락: ${missing}/${meshes.length} mesh · 핑크 표시는 알파 채널 미포함(RGB만 있거나 색상 없음)`
    :`⚠ RGBA는 있으나 ${fullWhite}/${meshes.length} mesh의 A값이 전부 1.0입니다. 원본 FBX를 확인하세요.`;
}
function updateVertexAlphaHealth(){
  const meshes=inspected();
  const reports=meshes.map(m=>analyzeVertexAlpha(state.originalGeos.get(m)||m.geometry));
  $('#vertexAlphaHealth').textContent=formatAlphaReport(reports,meshes);
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
      const standard=new THREE.MeshStandardMaterial({color:m.color?.clone()||new THREE.Color('#ffffff'),map:m.map||null,normalMap:m.normalMap||null,roughnessMap:m.roughnessMap||null,metalnessMap:m.metalnessMap||null,emissiveMap:m.emissiveMap||null,alphaMap:m.alphaMap||null,aoMap:m.aoMap||null,transparent:m.transparent,opacity:m.opacity??1,side:m.side});
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
    if(!changed||changed==='matAlphaMode'||changed==='matOpacity'||changed==='matAlphaCutoff'){
      mat.transparent=settings.transparent;mat.opacity=settings.opacity;
      mat.alphaTest=settings.alphaTest;mat.depthWrite=settings.depthWrite;
    }
    mat.needsUpdate=true;
  }
  if(state.mode==='material')updateDisplayMaterial();
}
function applyTextureParameters(){
  const x = state.visualOffsetX, y=state.visualOffsetY;
  const offset=textureOffsetFromVisual(x,y);
  const repX=clamp(finite($('#repeatX').value,1),.01,128);
  const repY=clamp(finite($('#repeatY').value,1),.01,128);
  const all=$('#flowAllTextures').checked;
  // Use the same phase across visible and editable materials; do not mutate original imported textures.
  for(const mesh of state.meshes){
    const cache=state.debugMats.get(mesh)||{};
    const list=[];
    if(cache.working)list.push(...(Array.isArray(cache.working)?cache.working:[cache.working]));
    else if(state.uvPlaying||x||y||repX!==1||repY!==1||state.uvChannel!==0){list.push(...makeWorkingMaterials(mesh));}
    if(cache.checker)list.push(cache.checker);
    if(cache.uvgrid)list.push(cache.uvgrid);
    for(const mat of list){
      for(const slot of all?textureMapSlots:['map']){
        const tex=uniqueTextureForMaterial(mat,slot);
        if(!tex)continue;
        if(tex.wrapS!==THREE.RepeatWrapping||tex.wrapT!==THREE.RepeatWrapping){
          tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.needsUpdate=true;
        }
        tex.repeat.set(repX,repY);
        tex.offset.set(offset.x,offset.y);
        // Three supports uv, uv1, uv2, uv3 via Texture.channel. Not every geometry has all channels.
        if(tex.channel!==state.uvChannel){tex.channel=state.uvChannel;mat.needsUpdate=true;}
        // Offset and repeat uniforms update without texture re-upload.
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
  if(!file||!state.meshes.length){status('먼저 모델을 불러오세요.',true);return;}
  if(!file.type.startsWith('image/') && !/\.(png|jpe?g|bmp|webp|gif|avif|tga|dds)$/i.test(file.name)){
    status('지원하는 이미지 형식: PNG/JPG/WebP/BMP/AVIF/TGA/DDS',true);return;
  }
  const generation=state.loadGeneration;
  let url=URL.createObjectURL(file);state.uploadedURLs.push(url);
  let tex;
  const uploadLoader=/\.tga$/i.test(file.name)?new TGALoader():/\.dds$/i.test(file.name)?new DDSLoader():new THREE.TextureLoader();
  try{tex=await uploadLoader.loadAsync(url);}catch(err){status(`텍스처 로드 실패: ${err.message}`,true);return;}
  if(generation!==state.loadGeneration){tex.dispose();return;}
  tex.flipY=$('#flipTextureY').checked;
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
  state.slotFiles.set(slot,file.name);
  if(slot==='alphaMap')applyMaterialInputs(targets,'matAlphaMode');
  state.offsetsDirty=true;applyTextureParameters();setMode('material');
  status(`${file.name} → ${slot} (${targets.length} meshes) 적용`);
}
async function uploadORM(file){
  if(!file||!state.meshes.length){status('먼저 모델을 불러오세요.',true);return;}
  if(!file.type.startsWith('image/')&&!/\.(png|jpe?g|bmp|webp|gif|avif|tga|dds)$/i.test(file.name)){
    status('ORM 입력 형식이 지원되지 않습니다.',true);return;
  }
  const generation=state.loadGeneration;
  const url=URL.createObjectURL(file);state.uploadedURLs.push(url);
  const loader=/\.tga$/i.test(file.name)?new TGALoader():/\.dds$/i.test(file.name)?new DDSLoader():new THREE.TextureLoader();
  let source;
  try{source=await loader.loadAsync(url);}catch(e){status('ORM 로딩 실패: '+e.message,true);return;}
  if(generation!==state.loadGeneration){source.dispose();return;}
  source.colorSpace=THREE.NoColorSpace;source.flipY=$('#flipTextureY').checked;
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
      state.slotFiles.set(slot,file.name);
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
  for(const mesh of scopeMeshes()){
    const cache=state.debugMats.get(mesh);if(!cache?.working)continue;
    for(const mat of scopedMaterials(mesh)){
      const tex=mat[slot];if(tex&&state.editableTextures.has(tex))tex.dispose();
      mat[slot]=null;mat.needsUpdate=true;
    }
  }
  const label=$(`.texture-slot[data-slot="${slot}"]`);
  label.classList.remove('loaded');label.querySelector('small').textContent='Upload image';
  state.slotFiles.delete(slot);
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
}
function resetMaterials(){
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
  state.slotFiles.clear();resetMaterialUI();$('#ormFileName').textContent='Not loaded';
  state.visualOffsetX=state.visualOffsetY=0;state.flowPhaseX=state.flowPhaseY=0;
  $('#offsetX').value=0;$('#offsetY').value=0;
  state.uvPlaying=false;$('#btnUVPlay').textContent='▶ UV Flow Play';$('#flowOverlay').hidden=true;
  state.offsetsDirty=true;updateDisplayMaterial();
  status('재질 오버라이드를 초기화했습니다.');
}
async function openFiles(files){
  // FileInput.value is reset synchronously by the caller; snapshot FileList first.
  const inputFiles=Array.from(files||[]);
  if(!inputFiles.length)return;
  setLoading(true,'모델 분석 중');status(`파일 ${inputFiles.length}개 분석 중...`);
  // Allow UI to paint before parsing potentially heavy assets.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
    const result=await state.localLoader.load(inputFiles);
    // Loading a new model disposes old file URL maps: defer disposing the just loaded URLs.
    // Keep the active LocalModelLoader instance in state while replacing the old scene.
    const justLoaded=state.localLoader;
    state.localLoader=new LocalModelLoader();
    installModel(result.root,{name:result.name,format:result.format},result.animations);
    state.localLoader=justLoaded;
  }catch(err){
    console.error(err);status(err.message||'알 수 없는 로딩 오류',true);
    window.alert(`모델을 열지 못했습니다.\n\n${err.message||err}`);
  }finally{setLoading(false);}
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
  $('#btnDemo').onclick=()=>installModel(createDemo(),{name:'Demo / VFX Study',format:'PROCEDURAL'});
  $('#btnAlphaReport').onclick=()=>{
    const inspectedMeshes=inspected();
    const report={tool:'maxVFX Model Inspector',version:'0.4.0',asset:$('#assetTitle').textContent,
      warning:'This report describes channels actually loaded by the browser; it does not prove which channels existed before FBX export.',
      meshes:inspectedMeshes.map(mesh=>{
        const geo=state.originalGeos.get(mesh)||mesh.geometry;
        const c=geo.getAttribute('color'),a=geo.getAttribute('alpha');
        return {name:mesh.name,vertices:geo.getAttribute('position')?.count||0,
          colorItemSize:c?.itemSize||0,colorArrayType:c?.array?.constructor?.name||null,
          colorNormalized:c?.normalized||false,standaloneAlphaItemSize:a?.itemSize||0,
          alpha:analyzeVertexAlpha(geo)};
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
    renderer.render(scene,camera);
    const a=document.createElement('a');a.href=renderer.domElement.toDataURL('image/png');a.download=`maxVFX-View-${Date.now()}.png`;a.click();status('뷰포트 이미지를 저장했습니다.');
  };
  $('#toggleGrid').onchange=e=>grid.visible=e.target.checked;
  $('#toggleAxes').onchange=e=>axes.visible=e.target.checked;
  $('#toggleWire').onchange=updateWireframe;
  $('#btnWire').onclick=()=>{$('#toggleWire').checked=!$('#toggleWire').checked;updateWireframe();};
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
  $('#matAlphaMode').addEventListener('change',()=>{$('#matAlphaCutoff').disabled=$('#matAlphaMode').value!=='mask';applyMaterialInputs(scopeMeshes(),'matAlphaMode');});
  $('#applyScope').addEventListener('change',()=>{updateMaterialSlotSelect();status('Apply to 범위 변경 · 이후 텍스처/수치 편집에 적용됩니다.');});
  $('#matSlotIndex').addEventListener('change',()=>status('Material ID 범위 변경 · 이후 편집부터 적용됩니다.'));
  $$('.texture-slot').forEach(label=>{
    const close=document.createElement('button');close.type='button';close.className='slot-clear';close.textContent='×';close.title='Remove '+label.dataset.slot;
    close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();clearTextureSlot(label.dataset.slot);});
    label.appendChild(close);
  });
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
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
const resizeObserver=new ResizeObserver(sizeRenderer);resizeObserver.observe(viewport);
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(frameClock.getDelta(),.08);
  if(state.animationPlaying&&state.sceneMixer)state.sceneMixer.update(dt);
  if(state.uvPlaying){
    // Increment phases rather than multiplying elapsed time by velocity.
    state.flowPhaseX=(state.flowPhaseX+finite($('#flowX').value)*dt)%4096;
    state.flowPhaseY=(state.flowPhaseY+finite($('#flowY').value)*dt)%4096;
    state.visualOffsetX=finite($('#offsetX').value)+state.flowPhaseX;
    state.visualOffsetY=finite($('#offsetY').value)+state.flowPhaseY;
    state.offsetsDirty=true;
  }
  if(state.offsetsDirty)applyTextureParameters();
  controls.update();
  state.normalHelper?.update();
  state.tangentHelper?.update();
  renderer.render(scene,camera);
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

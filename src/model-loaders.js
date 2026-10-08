import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { parseFbxColorLayers, restoreFBXAlpha } from './fbx-alpha-recovery.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';

export const SUPPORTED = new Set(['glb','gltf','fbx','obj','stl','ply','3ds','dae','3mf']);
const PRIMARY_ORDER = ['glb','gltf','fbx','obj','3mf','3ds','dae','ply','stl'];
const ext = name => (name.split('.').pop() || '').toLowerCase();
const norm = name => name.replaceAll('\\','/').replace(/^\.\//,'').replace(/^\/+/,'').toLowerCase();

/** The selected files never leave the browser. File names are mapped to ephemeral blob URLs. */
export class LocalModelLoader {
  constructor(renderer=null) { this.objectUrls = []; this.decoder = null; this.renderer=renderer; this.ktx2=null; }
  dispose() {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.length = 0;
    if (this.decoder) this.decoder.dispose();
    if (this.ktx2) this.ktx2.dispose();
    this.decoder = null;this.ktx2=null;
  }
  makeManager(files) {
    const fileMap = new Map();
    const byBase = new Map();
    for (const file of files) {
      const relative = norm(file.webkitRelativePath || file.name);
      const base = norm(file.name);
      const objectUrl = URL.createObjectURL(file);
      this.objectUrls.push(objectUrl);
      fileMap.set(relative, objectUrl);
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(objectUrl);
    }
    const manager = new THREE.LoadingManager();
    manager.addHandler(/\.tga(?:[?#].*)?$/i, new TGALoader(manager));
    manager.addHandler(/\.dds(?:[?#].*)?$/i, new DDSLoader(manager));
    manager.setURLModifier((raw) => {
      if (/^(data:|blob:)/i.test(raw)) return raw;
      // Keep model-owned asset references local. Never fetch arbitrary remote URLs from untrusted models.
      if (/^https?:\/\//i.test(raw)) return 'data:application/octet-stream,';
      const withoutQuery = raw.split(/[?#]/)[0];
      let relative = withoutQuery;
      try { relative = decodeURIComponent(withoutQuery); } catch { /* keep original */ }
      relative = norm(relative);
      const exact = fileMap.get(relative);
      if (exact) return exact;
      const suffix = [...fileMap].find(([key]) => key.endsWith('/' + relative));
      if (suffix) return suffix[1];
      const base = relative.split('/').pop();
      const candidates = byBase.get(base);
      if (candidates?.length === 1) return candidates[0];
      return raw;
    });
    return manager;
  }
  async load(files) {
    this.dispose();
    const selected = [...files];
    const models = selected.filter(f => SUPPORTED.has(ext(f.name)));
    if (!models.length) {
      if (selected.some(f=>['max','blend'].includes(ext(f.name)))) {
        throw new Error('.max / .blend 원본은 웹에서 직접 불러올 수 없습니다. Blender는 GLB, 3ds Max는 FBX로 변환한 뒤 열어주세요.');
      }
      throw new Error('지원 모델이 없습니다. GLB, glTF, FBX, OBJ, STL, PLY, 3DS, DAE 또는 3MF 파일을 선택하세요.');
    }
    models.sort((a,b) => PRIMARY_ORDER.indexOf(ext(a.name)) - PRIMARY_ORDER.indexOf(ext(b.name)));
    const file = models[0];
    const manager = this.makeManager(selected);
    const type = ext(file.name);
    let root, animations = [], alphaRecovery=null;
    try {
      switch (type) {
        case 'glb': case 'gltf': {
          const loader = new GLTFLoader(manager);
          this.decoder = new DRACOLoader();
          this.decoder.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/draco/');
          this.decoder.setWorkerLimit(2);
          loader.setDRACOLoader(this.decoder);
          loader.setMeshoptDecoder(MeshoptDecoder);
          if(this.renderer){
            this.ktx2=new KTX2Loader(manager).setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/basis/');
            this.ktx2.detectSupport(this.renderer);
            loader.setKTX2Loader(this.ktx2);
          }
          // parse(..., '') avoids incorrect blob: parent paths for external .bin/.png.
          // LoadingManager resolves referenced filenames against the selected File objects.
          const raw = type === 'glb' ? await file.arrayBuffer() : await file.text();
          const gltf = await new Promise((resolve, reject) => loader.parse(raw, '', resolve, reject));
          root = gltf.scene;
          animations = gltf.animations || [];
          break;
        }
        case 'fbx': {
          const loader = new FBXLoader(manager);
          const source = await file.arrayBuffer();
          root = loader.parse(source, '');
          animations = root.animations || [];
          try {
            const layers=await parseFbxColorLayers(source);
            alphaRecovery=restoreFBXAlpha(root,layers,THREE);
            if(alphaRecovery.unmatched) console.warn('[maxVFX] FBX Alpha recovery incomplete',alphaRecovery);
          } catch (err) {
            alphaRecovery={sourceLayers:0,restored:0,error:String(err)};
            console.warn('[maxVFX] FBX Alpha recovery unavailable:',err);
          }
          break;
        }
        case 'obj': {
          const loader = new OBJLoader(manager);
          const mtlFiles = selected.filter(f=>ext(f.name)==='mtl');
          if (mtlFiles.length) {
            const chosen = mtlFiles.find(f=>f.name.toLowerCase().startsWith(file.name.slice(0,-4).toLowerCase())) || mtlFiles[0];
            const materials = new MTLLoader(manager).parse(await chosen.text(), '');
            materials.preload(); loader.setMaterials(materials);
          }
          root = loader.parse(await file.text());
          break;
        }
        case 'stl': {
          const geometry = new STLLoader(manager).parse(await file.arrayBuffer());
          const mat = new THREE.MeshStandardMaterial({color:0xbad3db,roughness:.64,metalness:.08,side:THREE.DoubleSide,vertexColors:geometry.hasAttribute('color')});
          root = new THREE.Mesh(geometry, mat);
          break;
        }
        case 'ply': {
          const geometry = new PLYLoader(manager).parse(await file.arrayBuffer());
          const mat = new THREE.MeshStandardMaterial({color:0xd2e2de,roughness:.66,side:THREE.DoubleSide,vertexColors:geometry.hasAttribute('color')});
          root = new THREE.Mesh(geometry, mat);
          break;
        }
        case '3ds': root = new TDSLoader(manager).parse(await file.arrayBuffer(), '');break;
        case 'dae': {
          const collada = new ColladaLoader(manager).parse(await file.text(), '');
          root = collada.scene;
          animations = collada.animations || root.animations || [];
          break;
        }
        case '3mf': root = new ThreeMFLoader(manager).parse(await file.arrayBuffer());break;
        default: throw new Error('지원하지 않는 모델 형식입니다.');
      }
    } catch (err) {
      throw new Error(`${file.name} 로딩 실패: ${err?.message || err}`);
    }
    if (!root) throw new Error('로드한 데이터에서 3D 모델을 찾지 못했습니다.');
    root.name = file.name;
    return { root, animations, name: file.name, format:type.toUpperCase(), files:selected.length, alphaRecovery };
  }
}

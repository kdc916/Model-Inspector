/** maxVFX Shader Studio: isolated shader extension, never alters imported geometry.
 * Shader chunks target Three.js r186. All user-controlled scalars are clamped before upload.
 */
export const SHADER_FIELD_DEFAULTS = Object.freeze({
  fxEnabled:false,fxFresnel:false,fxFresnelPower:3,fxFresnelStrength:1,fxFresnelColor:'#58cfff',
  fxDissolve:false,fxDissolveAmount:0.3,fxDissolveWidth:0.08,fxDissolveColor:'#ff873a',fxDissolveGlow:1,
  fxNoiseStrength:0,fxNoiseMode:'multiply',fxNoiseScaleU:1,fxNoiseScaleV:1,fxNoiseSpeedU:0,fxNoiseSpeedV:0,
  fxMaskStrength:1,fxMaskChannel:'r',fxMaskInvert:false,fxDistort:0,
  fxDepthFade:false,fxFadeDistance:0.5,fxPlaneVisible:true,
});
const range=(v,a,b,f)=>{const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):f;};
export function normalizeShaderStudio(input={}) {
  const s={...SHADER_FIELD_DEFAULTS};
  for (const key of ['fxEnabled','fxFresnel','fxDissolve','fxMaskInvert','fxDepthFade','fxPlaneVisible']) if(input[key]!==undefined)s[key]=input[key]===true||input[key]==='true';
  for (const [k,a,b] of [['fxFresnelPower',0.2,12],['fxFresnelStrength',0,12],['fxDissolveAmount',0,1],['fxDissolveWidth',0.001,0.5],['fxDissolveGlow',0,15],['fxNoiseStrength',0,1],['fxNoiseScaleU',0.01,64],['fxNoiseScaleV',0.01,64],['fxNoiseSpeedU',-16,16],['fxNoiseSpeedV',-16,16],['fxMaskStrength',0,1],['fxDistort',0,0.3],['fxFadeDistance',0.001,25]]) s[k]=range(input[k],a,b,s[k]);
  s.fxNoiseMode=['multiply','add','lerp'].includes(input.fxNoiseMode)?input.fxNoiseMode:s.fxNoiseMode;
  s.fxMaskChannel=['r','g','b','a'].includes(input.fxMaskChannel)?input.fxMaskChannel:s.fxMaskChannel;
  for (const key of ['fxFresnelColor','fxDissolveColor']) if(/^#[0-9a-f]{6}$/i.test(input[key]||''))s[key]=input[key];
  return s;
}
export function noiseOffset(s,time){const x=s.fxNoiseSpeedU*time,y=s.fxNoiseSpeedV*time;return [(-x%1024+1024)%1024,(-y%1024+1024)%1024];}
export function supportsShaderStudio(material){return Boolean(material&&(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial||material.isMeshBasicMaterial));}
/** Installed after Alpha Preview so the two shader hooks chain without replacing one another. */
export function installShaderStudio(material,THREE){
  if(!supportsShaderStudio(material)||material.userData?.vfxStudio)return;
  const u={
    vfxFxEnabled:{value:0},vfxFxParams:{value:new THREE.Vector4(3,1,0.3,0.08)},
    vfxFxColor:{value:new THREE.Color('#58cfff')},vfxFxEdgeColor:{value:new THREE.Color('#ff873a')},
    vfxFxMode:{value:new THREE.Vector4(0,0,0,0)},vfxFxLayer:{value:new THREE.Vector4(0,1,1,0)},
    vfxFxNoiseUV:{value:new THREE.Vector4(1,1,0,0)},vfxFxDissolveGlow:{value:1},
    vfxFxMaskChannel:{value:new THREE.Vector4(1,0,0,0)},vfxFxMaskStrength:{value:1},
    vfxFxDistort:{value:0},vfxFxNoiseMap:{value:null},vfxFxMaskMap:{value:null},
    vfxFxHasNoise:{value:0},vfxFxHasMask:{value:0},
    vfxFxDepth:{value:null},vfxFxDepthSize:{value:new THREE.Vector2(1,1)},vfxFxCamera:{value:new THREE.Vector2(0.01,50000)},
    vfxFxFade:{value:0.5},vfxFxDepthEnabled:{value:0},
  };
  const oldHook=material.onBeforeCompile;
  const oldKey=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=function(shader,renderer){
    oldHook?.call(this,shader,renderer);
    // Standard/Basic ShaderLib chunks are stable in Three.js r186.
    const required=['#include <begin_vertex>','#include <map_fragment>','#include <alphatest_fragment>','#include <opaque_fragment>'];
    if(required.some(x=>!shader.vertexShader.includes(x)&&!shader.fragmentShader.includes(x)))return;
    Object.assign(shader.uniforms,u);
    shader.vertexShader=`varying vec2 vfxFxUV; varying vec3 vfxFxWorld; varying vec3 vfxFxNormal;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vfxFxUV=uv;
        vfxFxWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
        vfxFxNormal=normalize(mat3(modelMatrix)*normal);`);
    shader.fragmentShader=`varying vec2 vfxFxUV; varying vec3 vfxFxWorld; varying vec3 vfxFxNormal;
      uniform float vfxFxEnabled;uniform vec4 vfxFxParams;uniform vec3 vfxFxColor;uniform vec3 vfxFxEdgeColor;
      uniform vec4 vfxFxMode;uniform vec4 vfxFxLayer;uniform vec4 vfxFxNoiseUV;
      uniform float vfxFxDissolveGlow;uniform vec4 vfxFxMaskChannel;uniform float vfxFxMaskStrength;
      uniform float vfxFxDepthEnabled;uniform float vfxFxDistort;uniform sampler2D vfxFxNoiseMap;uniform sampler2D vfxFxMaskMap;
      uniform float vfxFxHasNoise;uniform float vfxFxHasMask;
      uniform sampler2D vfxFxDepth;uniform vec2 vfxFxDepthSize;uniform vec2 vfxFxCamera;uniform float vfxFxFade;
      float vfxFxGray(vec4 c){return dot(c.rgb,vec3(0.299,0.587,0.114));}
      float vfxFxNoiseAt(vec2 uv){
        if(vfxFxHasNoise>0.5)return vfxFxGray(texture2D(vfxFxNoiseMap,uv));
        return clamp(0.5+0.28*sin(uv.x*37.0+sin(uv.y*11.0)*2.7)*sin(uv.y*29.0-uv.x*9.0),0.0,1.0);
      }
      float vfxFxDepthLinear(float z){float ndc=z*2.0-1.0;return(2.0*vfxFxCamera.x*vfxFxCamera.y)/(vfxFxCamera.y+vfxFxCamera.x-ndc*(vfxFxCamera.y-vfxFxCamera.x));}
    `+shader.fragmentShader;
    // Preview distortion shifts Base Color UVs. Alpha, vertex masks and other PBR slots remain untouched.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec2 vfxMapCoord=vMapUv;
      if(vfxFxEnabled>0.5 && vfxFxDistort>0.00001){
        vec2 vfxNuv=vfxFxUV*vfxFxNoiseUV.xy+vfxFxNoiseUV.zw;
        float vfxN1=vfxFxNoiseAt(vfxNuv);
        float vfxN2=vfxFxNoiseAt(vfxNuv+vec2(0.37,0.71));
        vfxMapCoord+=vec2(vfxN1-0.5,vfxN2-0.5)*vfxFxDistort;
      }
      diffuseColor*=texture2D(map,vfxMapCoord);
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
      float vfxFxEdge=0.0;
      if(vfxFxEnabled>0.5){
        vec2 vfxLayerUV=vfxFxUV*vfxFxNoiseUV.xy+vfxFxNoiseUV.zw;
        float vfxNoise=vfxFxNoiseAt(vfxLayerUV);
        if(vfxFxMode.z>0.5 && vfxFxHasNoise>0.5){
          vec3 vfxLayerRGB=texture2D(vfxFxNoiseMap,vfxLayerUV).rgb;
          float vfxAmount=clamp(vfxFxLayer.x,0.0,1.0);
          if(vfxFxMode.w<0.5)diffuseColor.rgb*=mix(vec3(1.0),vfxLayerRGB,vfxAmount);
          else if(vfxFxMode.w<1.5)diffuseColor.rgb+=vfxLayerRGB*vfxAmount;
          else diffuseColor.rgb=mix(diffuseColor.rgb,vfxLayerRGB,vfxAmount);
        }
        if(vfxFxHasMask>0.5){
          float vfxMask=dot(texture2D(vfxFxMaskMap,vfxLayerUV),vfxFxMaskChannel);
          vfxMask=mix(vfxMask,1.0-vfxMask,vfxFxLayer.y);
          diffuseColor.a*=mix(1.0,vfxMask,vfxFxMaskStrength);
        }
        if(vfxFxMode.y>0.5){
          float vfxDist=vfxNoise-vfxFxParams.z;
          float vfxWidth=max(vfxFxParams.w,0.001);
          if(vfxDist<0.0)discard;
          vfxFxEdge=1.0-smoothstep(0.0,vfxWidth,vfxDist);
        }
        if(vfxFxMode.x>0.5){
          vec3 vfxView=normalize(cameraPosition-vfxFxWorld);
          float vfxRim=pow(1.0-abs(dot(normalize(vfxFxNormal),vfxView)),vfxFxParams.x);
          diffuseColor.rgb+=vfxFxColor*vfxRim*vfxFxParams.y;
        }
        if(vfxFxDepthEnabled>0.5){
          float vfxDepthVal=texture2D(vfxFxDepth,gl_FragCoord.xy/vfxFxDepthSize).r;
          if(vfxDepthVal<0.999999){
            float vfxGap=vfxFxDepthLinear(vfxDepthVal)-vfxFxDepthLinear(gl_FragCoord.z);
            diffuseColor.a*=clamp(vfxGap/max(vfxFxFade,0.001),0.0,1.0);
          }
        }
      }
      #include <alphatest_fragment>`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
      if(vfxFxEnabled>0.5)gl_FragColor.rgb+=vfxFxEdge*vfxFxEdgeColor*vfxFxDissolveGlow;`);
  };
  material.customProgramCacheKey=()=>`${oldKey()}|maxvfx-studio-v1`;
  material.userData.vfxStudio=u;
  material.needsUpdate=true;
}
export function updateShaderStudio(material,THREE,raw,options={}){
  const u=material?.userData?.vfxStudio;if(!u)return;
  const s=normalizeShaderStudio(raw),offset=noiseOffset(s,options.time||0);
  u.vfxFxEnabled.value=s.fxEnabled?1:0;
  u.vfxFxParams.value.set(s.fxFresnelPower,s.fxFresnelStrength,s.fxDissolveAmount,s.fxDissolveWidth);
  u.vfxFxColor.value.set(s.fxFresnelColor);u.vfxFxEdgeColor.value.set(s.fxDissolveColor);
  u.vfxFxMode.value.set(s.fxFresnel?1:0,s.fxDissolve?1:0,s.fxNoiseStrength>0?1:0,({multiply:0,add:1,lerp:2})[s.fxNoiseMode]);
  u.vfxFxDepthEnabled.value=(s.fxDepthFade&&options.depthTexture)?1:0;
  u.vfxFxLayer.value.set(s.fxNoiseStrength,s.fxMaskInvert?1:0,0,0);
  u.vfxFxNoiseUV.value.set(s.fxNoiseScaleU,s.fxNoiseScaleV,...offset);
  u.vfxFxDissolveGlow.value=s.fxDissolveGlow;u.vfxFxMaskStrength.value=s.fxMaskStrength;
  u.vfxFxMaskChannel.value.set(...({r:[1,0,0,0],g:[0,1,0,0],b:[0,0,1,0],a:[0,0,0,1]})[s.fxMaskChannel]);
  u.vfxFxDistort.value=s.fxDistort;u.vfxFxNoiseMap.value=options.noiseTexture||null;
  u.vfxFxMaskMap.value=options.maskTexture||null;
  u.vfxFxHasNoise.value=options.noiseTexture?1:0;u.vfxFxHasMask.value=options.maskTexture?1:0;
  if(options.depthTexture){u.vfxFxDepth.value=options.depthTexture;u.vfxFxDepthSize.value.set(options.width||1,options.height||1);u.vfxFxCamera.value.set(options.near||0.01,options.far||50000);}
  u.vfxFxFade.value=s.fxFadeDistance;
}

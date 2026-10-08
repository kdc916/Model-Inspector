/** Bounded WebM canvas recorder with deterministic cleanup and no microphone access. */
export const MAX_CAPTURE_SECONDS=30;
export const MAX_CAPTURE_BYTES=160*1024*1024;
export const RECORD_FPS=30;
export function supportedMime(MediaRecorderClass=globalThis.MediaRecorder){
  if(!MediaRecorderClass)return null;
  for(const mime of ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']){
    if(MediaRecorderClass.isTypeSupported?.(mime))return mime;
  }
  return null;
}
export class CanvasRecorder {
  constructor({onStop=()=>{},onError=()=>{},onState=()=>{}}={}) {
    this.onStop=onStop;this.onError=onError;this.onState=onState;
    this.recorder=null;this.stream=null;this.chunks=[];this.started=0;
  }
  get active(){return this.recorder?.state==='recording';}
  start(canvas,{fps=RECORD_FPS,MediaRecorderClass=globalThis.MediaRecorder,now=Date.now}={}){
    if(this.recorder)throw Error('녹화 세션이 이미 존재합니다.');
    if(!canvas?.captureStream||!MediaRecorderClass)throw Error('이 브라우저는 Canvas 녹화를 지원하지 않습니다.');
    const mime=supportedMime(MediaRecorderClass);if(!mime)throw Error('이 브라우저는 WebM 녹화를 지원하지 않습니다.');
    const stream=canvas.captureStream(Math.min(60,Math.max(1,fps)));
    let recorder;
    try{recorder=new MediaRecorderClass(stream,{mimeType:mime,videoBitsPerSecond:6_000_000});}
    catch(e){for(const track of stream.getTracks())track.stop();throw e;}
    this.stream=stream;this.recorder=recorder;this.chunks=[];this.started=now();
    recorder.ondataavailable=event=>{
      if(event.data?.size){this.chunks.push(event.data);const total=this.chunks.reduce((n,b)=>n+b.size,0);if(total>=MAX_CAPTURE_BYTES)this.stop();}
    };
    recorder.onerror=event=>this.onError(event.error||Error('녹화 오류'));
    recorder.onstop=()=>{
      const chunks=this.chunks;this.chunks=[];this.cleanup();
      if(chunks.length)this.onStop(new Blob(chunks,{type:mime}));
      this.onState(false);
    };
    try{recorder.start(1000)}catch(err){this.cleanup();throw err;}
    this.onState(true);
  }
  stop(){if(this.recorder?.state==='recording')this.recorder.stop();}
  cancel(){
    if(!this.recorder)return;
    const rec=this.recorder;rec.onstop=null;rec.ondataavailable=null;this.chunks=[];
    if(rec.state!=='inactive')rec.stop();
    this.cleanup();this.onState(false);
  }
  cleanup(){for(const track of this.stream?.getTracks()||[])track.stop();this.stream=null;this.recorder=null;}
  enforceLimit(now=Date.now()){if(this.active&&now-this.started>=MAX_CAPTURE_SECONDS*1000)this.stop();}
}

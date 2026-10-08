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
    this.recorder=null;this.stream=null;this.chunks=[];this.totalBytes=0;this.started=0;
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
    this.stream=stream;this.recorder=recorder;this.chunks=[];this.totalBytes=0;this.started=now();
    recorder.ondataavailable=event=>{
      if(this.recorder!==recorder||!event.data?.size)return;
      this.totalBytes+=event.data.size;
      if(this.totalBytes>MAX_CAPTURE_BYTES){this.fail(Error('WebM 녹화 데이터가 160MB 제한을 초과해 저장을 취소했습니다.'));return;}
      this.chunks.push(event.data);
      if(this.totalBytes===MAX_CAPTURE_BYTES)this.stop();
    };
    recorder.onerror=event=>this.fail(event.error||Error('녹화 오류'));
    recorder.onstop=()=>{
      if(this.recorder!==recorder)return;
      const chunks=this.chunks;this.chunks=[];this.totalBytes=0;this.cleanup();
      try {if(chunks.length)this.onStop(new Blob(chunks,{type:mime}));}
      finally {this.onState(false);}
    };
    try{recorder.start(1000)}catch(err){this.cleanup();throw err;}
    this.onState(true);
  }
  stop(){if(this.recorder?.state==='recording')this.recorder.stop();}
  fail(error){
    if(!this.recorder)return;
    this.cancel();this.onError(error);
  }
  cancel(){
    if(!this.recorder)return;
    const rec=this.recorder;
    rec.onstop=null;rec.ondataavailable=null;rec.onerror=null;
    this.chunks=[];this.totalBytes=0;
    try {if(rec.state!=='inactive')rec.stop();}
    finally {this.cleanup();this.onState(false);}
  }
  cleanup(){for(const track of this.stream?.getTracks()||[])track.stop();this.stream=null;this.recorder=null;}
  enforceLimit(now=Date.now()){if(this.active&&now-this.started>=MAX_CAPTURE_SECONDS*1000)this.stop();}
}

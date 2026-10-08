import test from 'node:test';import assert from 'node:assert/strict';
import {CanvasRecorder,supportedMime,MAX_CAPTURE_SECONDS} from '../src/capture-workflow.js';
class Track {stopped=false;stop(){this.stopped=true;}}
class FakeMR {
 static isTypeSupported(type){return type==='video/webm';}
 constructor(stream,opts){this.stream=stream;this.opts=opts;this.state='inactive';}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.onstop?.();}
}
test('WebM selection follows browser support',()=>assert.equal(supportedMime(FakeMR),'video/webm'));
test('unsupported recorder returns no mime',()=>assert.equal(supportedMime(undefined),null));
test('recording stops after bounded elapsed time, releases stream',()=>{
 const track=new Track(),canvas={captureStream:()=>({getTracks:()=>[track]})};const states=[];
 const c=new CanvasRecorder({onState:x=>states.push(x)});
 c.start(canvas,{MediaRecorderClass:FakeMR,now:()=>1000});
 assert.equal(c.active,true);c.enforceLimit(1000+MAX_CAPTURE_SECONDS*1000);
 assert.equal(c.active,false);assert.equal(track.stopped,true);assert.deepEqual(states,[true,false]);
});
test('cancel clears stream without download',()=>{
 const track=new Track(),canvas={captureStream:()=>({getTracks:()=>[track]})};let saved=0;
 const c=new CanvasRecorder({onStop:()=>saved++});c.start(canvas,{MediaRecorderClass:FakeMR});c.cancel();
 assert.equal(track.stopped,true);assert.equal(saved,0);
});
test('start throws on missing captureStream',()=>{const c=new CanvasRecorder();assert.throws(()=>c.start({}, {MediaRecorderClass:FakeMR}),/지원/);});
test('recorder error releases stream and prevents incomplete download',()=>{
 const track=new Track(),canvas={captureStream:()=>({getTracks:()=>[track]})};
 const states=[],errors=[];let saved=0;
 const rec=new CanvasRecorder({onStop:()=>saved++,onError:e=>errors.push(e.message),onState:s=>states.push(s)});
 rec.start(canvas,{MediaRecorderClass:FakeMR});
 const active=rec.recorder;
 active.onerror({error:new Error('encoder failure')});
 assert.equal(track.stopped,true);assert.equal(rec.recorder,null);
 assert.equal(rec.active,false);assert.equal(saved,0);
 assert.deepEqual(errors,['encoder failure']);assert.deepEqual(states,[true,false]);
});
test('recording beyond 160MB discards chunks and frees tracks',()=>{
 const track=new Track(),canvas={captureStream:()=>({getTracks:()=>[track]})};
 const errors=[];let saved=0;
 const rec=new CanvasRecorder({onStop:()=>saved++,onError:e=>errors.push(e.message)});
 rec.start(canvas,{MediaRecorderClass:FakeMR});
 const active=rec.recorder;
 active.ondataavailable({data:{size:160*1024*1024+1}});
 assert.equal(track.stopped,true);assert.equal(saved,0);assert.equal(rec.totalBytes,0);
 assert.match(errors[0],/160MB/);
});
test('cancel after encoder failure is safe',()=>{
 const track=new Track(),canvas={captureStream:()=>({getTracks:()=>[track]})};
 const rec=new CanvasRecorder();rec.start(canvas,{MediaRecorderClass:FakeMR});
 rec.fail(Error('fail'));rec.cancel();assert.equal(track.stopped,true);
});

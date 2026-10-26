import {trackingCrop,frameCrop} from './tracking.js';
export class CameraTracker{
 constructor(video,{onFrame=()=>{},onStatus=()=>{},onStart=()=>{},onStop=()=>{}}={}){Object.assign(this,{video,onFrame,onStatus,onStart,onStop});this.generation=0;this.options={};this.running=false;this.lastTime=-1;this.lastSent=0;this.busy=false;this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);}
 async start(options={}){
  this.stop();const generation=this.generation;this.options=options;this.onStatus('Requesting camera permission…');
  try{
   const width=Number(options.resolution)||1920;
   const stream=await navigator.mediaDevices.getUserMedia({video:{...(options.deviceId?{deviceId:{exact:options.deviceId}}:{facingMode:{ideal:'environment'}}),width:{ideal:width},height:{ideal:Math.round(width*9/16)},frameRate:{ideal:30}},audio:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.video.srcObject=stream;await this.video.play();this.onStatus('Starting tracking…');
   const worker=this.worker=new Worker(new URL('./tracker.js',import.meta.url),{type:'classic'});
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Tracking startup timed out. Try marker mode or reconnect.')),45000);worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve();}else if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));}};worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message||'This browser could not start tracking. Try marker mode.'));};worker.postMessage({type:'init',mode:options.mode||'hand'});});
   if(generation!==this.generation)return;
   worker.onmessage=({data})=>{this.busy=false;if(data.type==='error'){this.stop();this.onStatus(data.message);return;}this.onFrame(data);};worker.onerror=()=>{this.stop();this.onStatus('Tracking failed. Reconnect, or try marker mode.');};
   this.running=true;this.lastTime=-1;const actual=stream.getVideoTracks()[0].getSettings();this.onStart(actual);this.onStatus('Camera running. Keep this page open and the phone still.');stream.getVideoTracks()[0].onended=()=>{this.stop();this.onStatus('Camera access ended. Reconnect.');};
  }catch(e){if(generation!==this.generation)return;this.stop();const messages={NotAllowedError:'Allow camera access in your browser, then try again.',NotFoundError:'No camera found.',NotReadableError:'Camera is busy. Close other camera apps and try again.'};this.onStatus(messages[e.name]||e.message);}
 }
 stop(){this.generation++;this.running=false;this.worker?.terminate();this.worker=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;this.busy=false;this.onStop();}
 async tick(now){requestAnimationFrame(this.tick);if(!this.running||this.busy||document.hidden||this.video.readyState<2||now-this.lastSent<50||this.video.currentTime===this.lastTime)return;
  this.busy=true;this.lastSent=now;this.lastTime=this.video.currentTime;const worker=this.worker;
  try{const zoom=this.options.zoom?.()||1,center=this.options.center?.()||{x:.5,y:.5},v=this.video,p=frameCrop(trackingCrop(zoom,center.x,center.y),v.videoWidth,v.videoHeight);const crop={x:p.x/v.videoWidth,y:p.y/v.videoHeight,width:p.width/v.videoWidth,height:p.height/v.videoHeight};const bitmap=await createImageBitmap(v,p.x,p.y,p.width,p.height);if(worker!==this.worker||!this.running){bitmap.close();return;}worker.postMessage({type:'frame',bitmap,time:now,crop,mode:this.options.mode||'hand',color:this.options.color?.()||'#ff00ff'},[bitmap]);}catch(e){this.busy=false;this.onStatus(`Camera frame unavailable: ${e.message}`);}
 }
}

import {PairSession} from './pairing.js';
import {parsePairing,randomKey,PROTOCOL} from './protocol.js';
import {CameraTracker} from './camera.js';
import {gesture} from './geometry.js';
import {trackingCrop,previewPoint} from './tracking.js';
const $=id=>document.getElementById(id),video=$('phone-video'),canvas=$('phone-preview');
let session,state=null,seq=0,center={x:.5,y:.5},lastData=null,wasDrawing=false,wakeLock,connected=false,calTap=0;
const camera=new CameraTracker(video,{onFrame:data=>{lastData=data;drawPreview();const drawing=$('phone-mode').value==='marker'?!state?.paused:!state?.paused&&gesture(data.landmarks||emptyHand(),$('phone-gesture').value,wasDrawing);wasDrawing=!!drawing;sendFrame(data,drawing);},onStatus:text=>$('camera-status').textContent=text,onStart:async actual=>{
 $('preview-placeholder').hidden=true;$('start-camera').textContent='Restart camera';$('stop-camera').disabled=false;$('camera-detail').textContent=`Actual: ${actual.width||video.videoWidth} × ${actual.height||video.videoHeight} · ${Math.round(actual.frameRate||0)} fps`;
 session?.send({type:'camera',id:'phone-'+randomKey(),mode:$('phone-mode').value,clock:performance.now(),width:actual.width||video.videoWidth,height:actual.height||video.videoHeight});
 try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
 try{const selected=actual.deviceId,devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');$('phone-camera').replaceChildren(new Option('Rear camera (default)',''),...devices.map((d,i)=>new Option(d.label||`Camera ${i+1}`,d.deviceId)));$('phone-camera').value=selected||'';}catch{}
},onStop:()=>{session?.send({type:'camera',id:'phone-stopped',mode:$('phone-mode').value,active:false});sendFrame({landmarks:null,marker:null},false);$('stop-camera').disabled=true;$('preview-placeholder').hidden=false;wakeLock?.release().catch(()=>{});}});
function emptyHand(){return Array.from({length:21},()=>({x:0,y:0}));}
function sendFrame(data,drawing=false){session?.send({type:'tracking',at:performance.now(),seq:seq++,landmarks:data.landmarks||null,marker:data.marker||null,drawing:!!drawing,mode:$('phone-mode').value});}
function command(action,extra={}){session?.send({type:'command',action,...extra});}
async function connect(pair){session?.close();camera.stop();$('connection-status').textContent='Connecting to your main display…';$('unpaired').hidden=true;
 session=new PairSession({role:'phone',...pair,onStatus:text=>$('connection-status').textContent=text,onOpen:()=>{connected=true;$('start-camera').disabled=false;$('remote-controls').hidden=false;$('connection-status').textContent='Paired with your display. Start the rear camera.';},onClose:()=>{connected=false;camera.stop();$('start-camera').disabled=true;$('remote-controls').hidden=true;$('unpaired').hidden=false;$('pair-url').value=location.href;},onData:data=>{state=data;$('display-state').textContent=data.calibrated?'Projection calibrated. '+(data.paused?'Drawing paused.':`Tool: ${data.tool}.`):'Calibrate the projection before drawing.';$('phone-ink').textContent=data.paused?'Resume drawing':'Pause drawing';$('phone-cal-panel').hidden=!data.calibration?.active;$('phone-capture').hidden=data.calibration?.method==='manual';$('phone-cal-message').textContent=data.calibration?.active?`Target ${data.calibration.step+1} of 4. ${data.calibration.message||''} ${data.calibration.method==='manual'?'Tap the projected target in the camera preview above.':''}`:'';drawPreview();}});
 session.opened.catch(e=>{$('connection-status').textContent=e.message;$('unpaired').hidden=false;});
}
function drawPreview(){const w=video.videoWidth||640,h=video.videoHeight||480;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const c=canvas.getContext('2d');c.clearRect(0,0,w,h);const crop=trackingCrop($('phone-zoom').value,center.x,center.y);c.strokeStyle='#baf4cf';c.lineWidth=Math.max(2,w/400);c.strokeRect(crop.x*w,crop.y*h,crop.width*w,crop.height*h);const tip=lastData?.marker||lastData?.landmarks?.[8];if(tip){c.fillStyle='#fff';c.beginPath();c.arc(tip.x*w,tip.y*h,w/100,0,Math.PI*2);c.fill();}const points=state?.calibration?.active?state.calibration.points||[]:[];c.font=`${Math.max(18,w/35)}px system-ui`;points.forEach((p,i)=>{const x=(state.mirror?1-p.x:p.x)*w,y=p.y*h;c.fillStyle='#baf4cf';c.beginPath();c.arc(x,y,w/100,0,Math.PI*2);c.fill();c.fillText(String(i+1),x+w/70,y-w/70);});}
canvas.onclick=e=>{if(!camera.running)return;const p=previewPoint(e.clientX,e.clientY,canvas.getBoundingClientRect(),video.videoWidth,video.videoHeight);if(!p)return;if(state?.calibration?.active&&state.calibration.method==='manual'){if(performance.now()-calTap<450)return;calTap=performance.now();command('point',{point:p,step:state.calibration.step});}else{center=p;drawPreview();}};
$('start-camera').onclick=()=>{if(!connected)return;camera.start({deviceId:$('phone-camera').value,resolution:$('phone-resolution').value,mode:$('phone-mode').value,zoom:()=>Number($('phone-zoom').value),center:()=>center,color:()=>$('phone-marker-color').value});};
$('stop-camera').onclick=()=>camera.stop();
for(const id of ['phone-camera','phone-resolution','phone-mode'])$(id).onchange=()=>{camera.stop();$('phone-color-label').hidden=$('phone-mode').value!=='marker';$('phone-gesture').disabled=$('phone-mode').value==='marker';$('camera-status').textContent='Settings changed. Restart the camera, then recalibrate.';};
$('phone-zoom').oninput=()=>{$('phone-zoom-label').value=$('phone-zoom').value+'×';drawPreview();};
$('phone-ink').onclick=()=>command(state?.paused?'resume':'pause');
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>command(b.dataset.command));
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>command('color',{color:b.dataset.color}));
$('phone-calibrate').onclick=()=>command('calibrate',{method:$('phone-cal-method').value});
$('phone-capture').onclick=()=>command('capture');
$('disconnect-phone').onclick=()=>{session?.close();camera.stop();connected=false;$('start-camera').disabled=true;$('remote-controls').hidden=true;$('unpaired').hidden=false;};
$('join').onclick=()=>{try{const url=new URL($('pair-url').value),pair=parsePairing(url.hash);if(!pair)throw Error();history.replaceState(null,'',location.pathname+url.hash);connect(pair);}catch{$('connection-status').textContent='Paste the complete pairing link from the main display.';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){sendFrame({landmarks:null,marker:null},false);wasDrawing=false;command('pause');}else if(camera.running)navigator.wakeLock?.request('screen').then(lock=>wakeLock=lock).catch(()=>{});});
window.addEventListener('pagehide',()=>{camera.stop();session?.close();});
let sensorShape='';setInterval(()=>{if(!camera.running||!video.videoWidth)return;const shape=`${video.videoWidth}x${video.videoHeight}`;if(sensorShape&&sensorShape!==shape)session?.send({type:'camera',id:'phone-'+randomKey(),mode:$('phone-mode').value,clock:performance.now(),width:video.videoWidth,height:video.videoHeight});sensorShape=shape;},1000);
const pair=parsePairing(location.hash);if(pair)connect(pair);else{$('connection-status').textContent='Pair this phone with your main display.';$('unpaired').hidden=false;}

function orientationChanged(){if(camera.running){session?.send({type:'camera',id:'phone-'+randomKey(),mode:$('phone-mode').value,clock:performance.now(),width:video.videoWidth,height:video.videoHeight});$('camera-status').textContent='Phone orientation changed. Recalibrate the projection.';}}
if(screen.orientation?.addEventListener)screen.orientation.addEventListener('change',orientationChanged);else window.addEventListener('orientationchange',orientationChanged);

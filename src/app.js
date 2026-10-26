import {PairSession,QRCode} from './pairing.js';
import {PROTOCOL} from './protocol.js';
import { trackingCrop, frameCrop, previewPoint } from './tracking.js';
import { targets, homography, project, gesture, inside, distance, unitQuad, validateQuad, projectionPreset } from './geometry.js';
const $=id=>document.getElementById(id);
const canvas=$('board'),ctx=canvas.getContext('2d');
const diagnosticSuffix=new URLSearchParams(location.search).has('diagnostic')?'.diagnostic':'';
const STORAGE='lightboard.canvas.v1'+diagnosticSuffix,SETTINGS='lightboard.settings.v1'+diagnosticSuffix;
let strokes=[],active=null,history=[],future=[],color='#ffffff',tool='pen',width=5,pointerId=null,uiHidden=false;
let stream=null,worker=null,ready=false,busy=false,frameTime=-1,lastSend=0,raw=null,smoothed=null,ink=false,handSamples=[],lastSeen=0;
let calibrating=false,calPoints=[],captureTimer=null,calibration=null,toastTimer,saveTimer,cameraId='',connectGeneration=0;
let dwell={element:null,since:0,fired:false};
let penWidth=5,eraserWidth=48,markerInk=false,cropCenter={x:.5,y:.5},lastMarker=null,lastLandmarks=null;
let projectionQuad=unitQuad.map(p=>({...p})),projectionForward=homography(unitQuad,unitQuad),projectionInverse=homography(unitQuad,unitQuad),boundsBefore=null;
let phoneSession=null,remoteConnected=false,remoteCameraReady=false,remotePaused=false,remoteMode='hand',remoteClockOffset=null;
let calMethod='finger',calMessage='',calLastCapture=0,lastCalDraw=0;
let settings={};
try {settings=JSON.parse(localStorage.getItem(SETTINGS)||'{}');} catch {}
try{if(settings.projection){validateQuad(settings.projection);setProjection(settings.projection);}}catch{}
try {const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(saved)) strokes=saved.filter(s=>Array.isArray(s.points)&&s.points.length&&s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&Number.isFinite(s.width)&&/^#[0-9a-f]{6}$/i.test(s.color));} catch {}
history=[strokes.slice()];
$('tracking-mode').value=settings.trackingMode==='marker'?'marker':'hand';$('resolution').value=settings.resolution||'1920';$('tracking-zoom').value=settings.zoom||1;$('marker-color').value=settings.markerColor||'#ff00ff';cropCenter=settings.cropCenter||cropCenter;updateTrackingUI();
$('gesture').value=settings.gesture||'point';$('smoothing').value=settings.smoothing??45;$('mirror').checked=!!settings.mirror;
if(settings.calibration?.h?.length===8&&settings.calibration.h.every(Number.isFinite)) calibration=settings.calibration;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function persistSettings(){settings={...settings,gesture:$('gesture').value,smoothing:Number($('smoothing').value),mirror:$('mirror').checked,calibration,cameraId,trackingMode:$('tracking-mode').value,resolution:$('resolution').value,zoom:Number($('tracking-zoom').value),markerColor:$('marker-color').value,cropCenter,projection:projectionQuad};try{localStorage.setItem(SETTINGS,JSON.stringify(settings));}catch{toast('Settings could not be saved in this browser.');}}
function persist(){clearTimeout(saveTimer);$('save-status').textContent='Saving…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(strokes));$('save-status').textContent='Saved on this device';}catch{$('save-status').textContent='Storage full · save a PNG';toast('Browser storage is full. Use Save to keep your drawing.');}},300);}
function paintStroke(s,context=ctx,w=innerWidth,h=innerHeight){if(!s.points.length)return;context.save();context.strokeStyle=s.color;context.fillStyle=s.color;context.lineWidth=s.width*Math.min(w,h)*projectionScale(w,h);context.lineCap='round';context.lineJoin='round';context.globalCompositeOperation=s.erase?'destination-out':'source-over';const p=s.points.map(point=>project(point,projectionForward));context.beginPath();if(p.length===1){context.arc(p[0].x*w,p[0].y*h,context.lineWidth/2,0,Math.PI*2);context.fill();}else{context.moveTo(p[0].x*w,p[0].y*h);for(let i=1;i<p.length;i++)context.lineTo(p[i].x*w,p[i].y*h);context.stroke();}context.restore();}
function render(){ctx.clearRect(0,0,innerWidth,innerHeight);ctx.save();ctx.beginPath();projectionQuad.forEach((p,i)=>i?ctx.lineTo(p.x*innerWidth,p.y*innerHeight):ctx.moveTo(p.x*innerWidth,p.y*innerHeight));ctx.closePath();ctx.clip();for(const s of strokes)paintStroke(s);if(active)paintStroke(active);ctx.restore();}
function resize(){const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(innerWidth*d);canvas.height=Math.round(innerHeight*d);ctx.setTransform(d,0,0,d,0,0);render();if(calibrating)positionTarget();if(boundsBefore)drawBounds();if(calibration&&Math.abs((innerWidth/innerHeight)/calibration.aspect-1)>.05){calibration=null;persistSettings();updateCalibration();toast('Display proportions changed. Recalibrate on the projector.');}}
function changed(){history.push(strokes.slice());if(history.length>80)history.shift();future=[];updateHistory();persist();$('welcome').hidden=strokes.length>0||!!stream||settings.started;}
function updateHistory(){$('undo').disabled=history.length<2;$('redo').disabled=!future.length;}
function begin(p,source){if(active)finish();$('welcome').hidden=true;settings.started=true;active={color,width:width/900,erase:tool==='eraser',points:[{...p}],source};render();}
function append(p){if(!active)return;const prev=active.points.at(-1);if(distance(p,prev)>.0005){active.points.push({...p});render();}}
function finish(){if(!active)return;strokes=[...strokes,active];delete active.source;active=null;changed();}
function undo(){stopInk();finish();if(history.length<2)return;future.push(history.pop());strokes=history.at(-1).slice();render();updateHistory();persist();}
function redo(){stopInk();finish();if(!future.length)return;strokes=future.pop().slice();history.push(strokes.slice());render();updateHistory();persist();}
function setTool(t){stopInk();finish();tool=t;width=tool==='eraser'?eraserWidth:penWidth;$('size').value=width;$('size-value').value=width;$('size-name').textContent=tool==='eraser'?'Erase':'Pen';$('size').setAttribute('aria-label',tool==='eraser'?'Eraser size':'Stroke width');$('cursor').classList.toggle('erasing',tool==='eraser');for(const id of ['pen','eraser']){$(id).classList.toggle('selected',id===t);$(id).setAttribute('aria-pressed',String(id===t));}}
function setColor(c){color=c;setTool('pen');document.querySelectorAll('.swatch').forEach(b=>{b.classList.toggle('selected',b.dataset.color===c);b.setAttribute('aria-pressed',String(b.dataset.color===c));});$('custom-color').value=c;}
canvas.addEventListener('pointerdown',e=>{if(calibrating||$('setup').open||e.button!==0)return;stopInk();pointerId=e.pointerId;canvas.setPointerCapture(pointerId);const p=project({x:e.clientX/innerWidth,y:e.clientY/innerHeight},projectionInverse);if(inside(p))begin(p,'pointer');});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId)return;const samples=e.getCoalescedEvents?.();for(const sample of samples?.length?samples:[e]){const p=project({x:sample.clientX/innerWidth,y:sample.clientY/innerHeight},projectionInverse);if(!inside(p)){finish();continue;}if(!active)begin(p,'pointer');else append(p);}});
function pointerEnd(e){if(e.pointerId===pointerId){finish();pointerId=null;}}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('lostpointercapture',pointerEnd);
$('pen').onclick=()=>setTool('pen');$('eraser').onclick=()=>setTool('eraser');$('undo').onclick=undo;$('redo').onclick=redo;
document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>setColor(b.dataset.color));$('custom-color').oninput=e=>setColor(e.target.value);
$('size').oninput=e=>{width=Number(e.target.value);if(tool==='eraser')eraserWidth=width;else penWidth=width;$('size-value').value=width;};
$('try-mouse').onclick=()=>{$('welcome').hidden=true;settings.started=true;toast('Draw anywhere. H hides controls; F enters fullscreen.');};
function showSetup(){stopInk();finish();$('setup').showModal();if(navigator.mediaDevices?.enumerateDevices)enumerate().catch(()=>{});}
$('get-started').onclick=showSetup;$('settings-button').onclick=showSetup;$('close-setup').onclick=()=>$('setup').close();
$('clear').onclick=()=>{finish();$('clear-dialog').showModal();};$('cancel-clear').onclick=()=>$('clear-dialog').close();$('confirm-clear').onclick=()=>{strokes=[];changed();render();$('clear-dialog').close();};
$('save').onclick=()=>{finish();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const c=out.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,out.width,out.height);c.drawImage(canvas,0,0);out.toBlob(blob=>{if(!blob){toast('Image export failed. Please try again.');return;}const a=document.createElement('a');a.download=`lightboard-${new Date().toISOString().slice(0,10)}.png`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Canvas exported as PNG.');});};
function hideUI(h){uiHidden=h;document.body.classList.toggle('ui-hidden',h);$('restore-ui').hidden=!h;}$('hide-ui').onclick=()=>hideUI(true);$('restore-ui').onclick=()=>hideUI(false);
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s fullscreen command (usually F11).');}}$('fullscreen').onclick=fullscreen;
function isMarker(){return remoteConnected?remoteMode==='marker':$('tracking-mode').value==='marker';}
function currentCrop(){return trackingCrop($('tracking-zoom').value,cropCenter.x,cropCenter.y);}
function updateTrackingUI(){const marker=isMarker();$('marker-options').hidden=!marker;$('ink-toggle').hidden=!marker;$('gesture').disabled=marker;$('zoom-value').value=`${Number($('tracking-zoom').value)}×`;}
function toggleMarkerInk(){if(remoteConnected){remotePaused=!remotePaused;syncRemoteUI();sendPhoneState();return;}stopInk();markerInk=!markerInk;$('ink-toggle').textContent=markerInk?'Ink on':'Ink paused';$('ink-toggle').classList.toggle('active',markerInk);$('ink-toggle').setAttribute('aria-pressed',String(markerInk));}
$('ink-toggle').onclick=toggleMarkerInk;
$('tracking-mode').onchange=()=>{disconnect('Tracking method changed. Connect again, then recalibrate.');invalidateCalibration();updateTrackingUI();};
$('resolution').onchange=()=>{disconnect('Camera detail changed. Connect again to apply it.');invalidateCalibration();};
$('marker-color').onchange=()=>{stopInk();persistSettings();};
$('tracking-zoom').oninput=()=>{stopInk();updateTrackingUI();preview(lastLandmarks,lastMarker);persistSettings();};
$('preview').onclick=e=>{if(!stream)return;const point=previewPoint(e.clientX,e.clientY,$('preview').getBoundingClientRect(),$('video').videoWidth,$('video').videoHeight);if(point){cropCenter=point;stopInk();preview(lastLandmarks,lastMarker);persistSettings();}};
function updateCalibration(){$('calibration-status').textContent=calibration?'✓ Projection calibrated':'○ Not calibrated';}
function invalidateCalibration(){stopInk();calibration=null;updateCalibration();persistSettings();}
for(const id of ['gesture','smoothing'])$(id).onchange=()=>{stopInk();persistSettings();};$('mirror').onchange=()=>{invalidateCalibration();toast('Camera coordinates changed. Recalibrate the projection.');};
function stopInk(){if(active?.source==='camera')finish();ink=false;smoothed=null;$('cursor').style.background='';$('cursor').hidden=true;$('drawing-indicator').hidden=true;}
function setStatus(message,live=false){$('camera-status').classList.toggle('live',live);$('camera-status').lastChild.textContent=' '+message;}
async function enumerate(){const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');$('cameras').replaceChildren(...(devices.length?devices.map((d,i)=>new Option(d.label||`Camera ${i+1}`,d.deviceId)):[new Option('No camera detected','')]));if(cameraId)$('cameras').value=cameraId;}
function disconnect(message='Camera disconnected.'){connectGeneration++;if(calibrating)cancelCalibration();stopInk();worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;ready=false;busy=false;raw=null;handSamples=[];lastSeen=0;frameTime=-1;lastMarker=null;lastLandmarks=null;markerInk=false;$('ink-toggle').textContent='Ink paused';$('ink-toggle').classList.remove('active');$('ink-toggle').setAttribute('aria-pressed','false');$('video').srcObject=null;$('video-placeholder').hidden=false;$('preview').getContext('2d').clearRect(0,0,$('preview').width,$('preview').height);$('connect').disabled=false;$('connect').textContent='Connect camera';$('cameras').disabled=false;$('disconnect').disabled=true;$('calibrate').disabled=true;$('manual-calibrate').disabled=true;$('camera-message').textContent=message;setStatus('Camera off');}
$('disconnect').onclick=()=>disconnect();
$('connect').onclick=async()=>{
  const selected=$('cameras').value;disconnect('Requesting camera access…');const generation=connectGeneration;
  $('connect').disabled=true;$('cameras').disabled=true;$('connect').textContent='Connecting…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires localhost or HTTPS. Use the HTTPS site or open http://localhost:4173 in Chrome or Edge.');
    const nextStream=await navigator.mediaDevices.getUserMedia({video:{deviceId:selected?{exact:selected}:undefined,width:{ideal:Number($('resolution').value)},height:{ideal:Math.round(Number($('resolution').value)*9/16)},frameRate:{ideal:30}},audio:false});
    if(generation!==connectGeneration){nextStream.getTracks().forEach(t=>t.stop());return;}
    stream=nextStream;$('video').srcObject=stream;await $('video').play();
    const actual=stream.getVideoTracks()[0].getSettings();cameraId=actual.deviceId||selected;$('camera-quality').textContent=`Actual camera: ${actual.width||$('video').videoWidth} × ${actual.height||$('video').videoHeight} · ${Math.round(actual.frameRate||0)} fps`;await enumerate();
    const aspect=innerWidth/innerHeight;
    if(calibration&&(calibration.cameraId!==cameraId||Math.abs(aspect/calibration.aspect-1)>.05))calibration=null;
    updateCalibration();persistSettings();$('video-placeholder').hidden=true;$('camera-message').textContent='Loading local hand tracking…';
    worker=new Worker(new URL('./tracker.js',import.meta.url),{type:'classic'});
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Hand tracking took too long to start. Try reconnecting.')),45000);worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timeout);resolve();}else if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));}};worker.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message||'Tracking worker could not start.'));};worker.postMessage({type:'init',mode:$('tracking-mode').value});});
    if(generation!==connectGeneration)return;
    ready=true;worker.onmessage=({data})=>{busy=false;if(data.type==='error'){disconnect(`Tracking stopped: ${data.message}`);return;}if(data.type==='result')onHand(data.landmarks,data.marker||null);};worker.onerror=()=>disconnect('Hand tracking stopped. Reconnect the camera to retry.');
    stream.getVideoTracks()[0].onended=()=>disconnect('Camera was removed or access was revoked. Reconnect to continue.');
    $('camera-message').textContent=isMarker()?'Connected. Show the colored fingertip marker, then calibrate. Ink starts paused.':'Connected. Zoom the tracking crop onto your wall if the hand is small, then calibrate.';$('connect').textContent='Connected';$('disconnect').disabled=false;$('calibrate').disabled=false;$('manual-calibrate').disabled=false;$('welcome').hidden=true;setStatus(calibration?'Looking for hand':'Calibrate to draw',true);
  }catch(e){if(generation!==connectGeneration)return;const messages={NotAllowedError:'Camera permission was denied. Allow camera access in your browser, then reconnect.',NotFoundError:'No webcam was found. Connect your webcam, then try again.',NotReadableError:'The camera is busy or unavailable. Close other camera apps, then reconnect.',OverconstrainedError:'The selected camera is no longer available. Choose another camera.'};disconnect(messages[e.name]||e.message);}
};
function preview(landmarks,marker=null){
  lastLandmarks=landmarks;lastMarker=marker;const p=$('preview');
  if(p.width!==$('video').videoWidth||p.height!==$('video').videoHeight){p.width=$('video').videoWidth||640;p.height=$('video').videoHeight||480;}
  const c=p.getContext('2d');c.clearRect(0,0,p.width,p.height);
  const crop=currentCrop();c.strokeStyle='#baf4cf';c.lineWidth=Math.max(2,p.width/400);c.setLineDash([12,8]);c.strokeRect(crop.x*p.width,crop.y*p.height,crop.width*p.width,crop.height*p.height);c.setLineDash([]);
  const tip=marker||landmarks?.[8];if(!tip)return;
  c.fillStyle='#baf4cf';for(const point of landmarks||[marker]){c.beginPath();c.arc(point.x*p.width,point.y*p.height,Math.max(3,p.width/400),0,Math.PI*2);c.fill();}
  c.strokeStyle='#fff';c.beginPath();c.arc(tip.x*p.width,tip.y*p.height,Math.max(9,p.width/150),0,Math.PI*2);c.stroke();
}
function onHand(landmarks,marker=null,remoteDrawing=null){preview(landmarks,marker);if(!landmarks&&!marker){dwell={element:null,since:0,fired:false};raw=null;handSamples=[];stopInk();if(!calibrating)setStatus(calibration?(isMarker()?'Looking for marker':'Looking for hand'):'Calibrate to draw',true);return;}
  const now=performance.now();lastSeen=now;const tip=marker||landmarks[8];raw={x:$('mirror').checked?1-tip.x:tip.x,y:tip.y};handSamples.push({...raw,time:now});handSamples=handSamples.filter(p=>now-p.time<600);
  if(calibrating){stopInk();return;}
  if(!calibration||boundsBefore||$('pair-dialog').open||$('setup').open||$('clear-dialog').open||pointerId!==null||document.hidden||(!remoteConnected&&!document.hasFocus())){stopInk();return;}
  let mapped=project(raw,calibration.h);if(!inside(mapped)){stopInk();setStatus('Outside canvas',true);return;}
  if(smoothed&&distance(mapped,smoothed)>.2){stopInk();}
  const alpha=1-Number($('smoothing').value)/100;
  smoothed=smoothed?{x:smoothed.x+(mapped.x-smoothed.x)*alpha,y:smoothed.y+(mapped.y-smoothed.y)*alpha}:mapped;
  // A steady fingertip can select projected tools without returning to the computer.
  const hovered=document.elementFromPoint(smoothed.x*innerWidth,smoothed.y*innerHeight);
  const control=hovered?.closest('#toolbar button, #restore-ui, #ink-toggle');
  const overChrome=hovered?.closest('.chrome, #restore-ui');
  if(overChrome){
    const point={...smoothed};stopInk();
    $('cursor').hidden=false;$('cursor').style.left=`${point.x*100}%`;$('cursor').style.top=`${point.y*100}%`;$('cursor').classList.remove('inking');
    if(control&&!control.disabled){
      if(dwell.element!==control)dwell={element:control,since:now,fired:false};
      const progress=Math.min((now-dwell.since)/1100,1);
      $('cursor').style.background=`conic-gradient(#baf4cf ${progress*360}deg, transparent 0deg)`;
      setStatus(dwell.fired?'Tool selected':'Hold to select tool',true);
      if(progress===1&&!dwell.fired){dwell.fired=true;control.click();}
    }else{dwell={element:null,since:0,fired:false};$('cursor').style.background='';}
    return;
  }
  dwell={element:null,since:0,fired:false};$('cursor').style.background='';
  const boardPoint=project(smoothed,projectionInverse);if(!inside(boardPoint)){stopInk();return;}
  const drawing=remoteDrawing!==null?remoteDrawing:(marker?markerInk:gesture(landmarks,$('gesture').value,ink));$('cursor').hidden=false;$('cursor').style.left=`${smoothed.x*100}%`;$('cursor').style.top=`${smoothed.y*100}%`;$('cursor').classList.toggle('inking',drawing);$('drawing-indicator').hidden=!drawing;$('drawing-indicator').classList.toggle('erasing',tool==='eraser');$('drawing-indicator').lastChild.textContent=tool==='eraser'?' ERASING':' INK ON';const diameter=tool==='eraser'?width/900*Math.min(innerWidth,innerHeight):20;$('cursor').style.width=`${diameter}px`;$('cursor').style.height=`${diameter}px`;
  setStatus(drawing?(tool==='eraser'?'Erasing':'Drawing'):(marker?'Marker ready · ink paused':'Hand ready'),true);
  if(drawing){if(!ink)begin(boardPoint,'camera');else append(boardPoint);}else if(ink)finish();ink=drawing;
}
async function tick(now){requestAnimationFrame(tick);if(calibrating&&now-lastCalDraw>80){lastCalDraw=now;drawCalibrationPreview();}if(ink&&now-lastSeen>250){stopInk();setStatus('Looking for hand',true);}if(!ready||busy||document.hidden||!stream||$('video').readyState<2||now-lastSend<40||$('video').currentTime===frameTime)return;
  busy=true;frameTime=$('video').currentTime;lastSend=now;const currentWorker=worker;
  try{const video=$('video'),pixels=frameCrop(currentCrop(),video.videoWidth,video.videoHeight);const crop={x:pixels.x/video.videoWidth,y:pixels.y/video.videoHeight,width:pixels.width/video.videoWidth,height:pixels.height/video.videoHeight};const bitmap=await createImageBitmap(video,pixels.x,pixels.y,pixels.width,pixels.height);if(worker!==currentWorker||!ready){bitmap.close();return;}worker.postMessage({type:'frame',bitmap,time:now,crop,mode:$('tracking-mode').value,color:$('marker-color').value},[bitmap]);}catch{busy=false;stopInk();}
}
requestAnimationFrame(tick);
function positionTarget(){const step=Math.min(calPoints.length,3),p=project(targets[step],projectionForward);$('target').style.left=`${p.x*100}%`;$('target').style.top=`${p.y*100}%`;$('target').querySelector('b').textContent=step+1;$('cal-step').textContent=`${step+1} / 4`;$('cal-back').disabled=!calPoints.length;$('cal-message').textContent=calMessage;drawCalibrationPreview();sendPhoneState();}
function cancelCalibration(){clearInterval(captureTimer);captureTimer=null;calibrating=false;$('calibration').hidden=true;$('calibration').classList.remove('cal-manual');$('capture').disabled=false;$('capture').textContent='Capture in 3 seconds';handSamples=[];sendPhoneState();}
function startCalibration(method='finger'){
 if(!ready&&!remoteCameraReady){toast('Start the webcam or paired phone camera first.');return;}
 stopInk();finish();if($('setup').open)$('setup').close();if($('pair-dialog').open)$('pair-dialog').close();calPoints=[];handSamples=[];calMethod=method==='manual'?'manual':'finger';calibrating=true;calLastCapture=0;$('calibration').hidden=false;$('calibration').classList.toggle('cal-manual',calMethod==='manual');
 calMessage=calMethod==='manual'?(remoteConnected?'On your phone, tap the projected target in its camera preview.':'Click the camera image below exactly where the projected target appears.'):'Hold your fingertip on the target, then press Space once or start a 3-second capture.';positionTarget();
}
function addCalibrationPoint(point){if(!calibrating||performance.now()-calLastCapture<350)return;calLastCapture=performance.now();if(calPoints.length>=4)calPoints.pop();calPoints.push({...point});handSamples=[];
 if(calPoints.length<4){calMessage=calMethod==='manual'?'Select the next numbered target in the camera image.':'Move to the next target, hold still, then capture.';positionTarget();return;}
 try{const h=homography(calPoints,targets.map(p=>project(p,projectionForward)));calibration={h,cameraId,aspect:innerWidth/innerHeight};persistSettings();updateCalibration();cancelCalibration();toast('Calibrated. Your camera is aligned with the drawing area.');}
 catch(e){calMessage=e.message+' Your recorded points are shown below. Use Redo previous point to correct them.';positionTarget();}
}
function redoCalibrationPoint(){if(!calibrating)return;clearInterval(captureTimer);captureTimer=null;$('capture').disabled=false;$('capture').textContent='Capture in 3 seconds';calPoints.pop();handSamples=[];calLastCapture=0;calMessage='Redo this target. The surface can be tilted; select the numbered target in order.';positionTarget();}
$('cal-back').onclick=redoCalibrationPoint;
$('cancel-cal').onclick=()=>{cancelCalibration();if(!remoteConnected)showSetup();};
$('calibrate').onclick=()=>startCalibration('finger');$('manual-calibrate').onclick=()=>startCalibration('manual');
function capture(){if(!calibrating||calMethod!=='finger')return;const samples=handSamples.filter(p=>performance.now()-p.time<450);if(!raw||performance.now()-lastSeen>200||samples.length<4){calMessage='Tracking cannot see the fingertip clearly. Try again, or use click-to-calibrate from Setup.';positionTarget();return;}const center={x:samples.reduce((n,p)=>n+p.x,0)/samples.length,y:samples.reduce((n,p)=>n+p.y,0)/samples.length};if(samples.some(p=>distance(p,center)>.012)){calMessage='Tracking moved during capture. Hold still, or use click-to-calibrate.';positionTarget();return;}addCalibrationPoint(center);}
function delayedCapture(){if(captureTimer||!calibrating||calMethod!=='finger')return;let count=3;$('capture').disabled=true;$('capture').textContent=`Capturing in ${count}…`;captureTimer=setInterval(()=>{count--;if(count>0){$('capture').textContent=`Capturing in ${count}…`;return;}clearInterval(captureTimer);captureTimer=null;capture();$('capture').disabled=false;$('capture').textContent='Capture in 3 seconds';},1000);}
$('capture').onclick=delayedCapture;
function drawCalibrationPreview(){const p=$('cal-preview'),v=$('video');const w=640,h=!remoteConnected&&v.videoWidth?Math.round(w*v.videoHeight/v.videoWidth):480;if(p.width!==w||p.height!==h){p.width=w;p.height=h;}const c=p.getContext('2d');c.fillStyle='#101910';c.fillRect(0,0,w,h);if(!remoteConnected&&v.readyState>=2)c.drawImage(v,0,0,w,h);else{c.strokeStyle='#334c39';for(let i=1;i<4;i++){c.beginPath();c.moveTo(w*i/4,0);c.lineTo(w*i/4,h);c.moveTo(0,h*i/4);c.lineTo(w,h*i/4);c.stroke();}}
 const points=calPoints.map(q=>({x:$('mirror').checked?1-q.x:q.x,y:q.y}));c.strokeStyle='#baf4cf';c.lineWidth=2;c.beginPath();points.forEach((q,i)=>i?c.lineTo(q.x*w,q.y*h):c.moveTo(q.x*w,q.y*h));if(points.length===4)c.closePath();c.stroke();c.font='23px system-ui';points.forEach((q,i)=>{c.fillStyle='#baf4cf';c.beginPath();c.arc(q.x*w,q.y*h,7,0,Math.PI*2);c.fill();c.fillText(String(i+1),q.x*w+10,q.y*h-10);});$('cal-preview-label').textContent=remoteConnected?'Recorded phone camera points · tap targets on your phone':calMethod==='manual'?'Click the projected target in this camera image':'Recorded camera points · tilted shapes are allowed';
}
$('cal-preview').onclick=e=>{if(!calibrating||calMethod!=='manual'||remoteConnected)return;const p=previewPoint(e.clientX,e.clientY,$('cal-preview').getBoundingClientRect(),$('cal-preview').width,$('cal-preview').height);if(p)addCalibrationPoint({x:$('mirror').checked?1-p.x:p.x,y:p.y});};
document.addEventListener('keydown',e=>{if(boundsBefore){if(e.key==='Escape')cancelBounds();return;}if(calibrating){if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!captureTimer)capture();}if(e.key==='Escape'){cancelCalibration();showSetup();}return;}if(e.target.matches('input,select,textarea')||$('setup').open||$('clear-dialog').open)return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Space'&&isMarker()){e.preventDefault();if(!e.repeat)toggleMarkerInk();}if(key==='f')fullscreen();if(key==='h')hideUI(!uiHidden);if(key==='p')setTool('pen');if(key==='e')setTool('eraser');});
document.addEventListener('visibilitychange',()=>{stopInk();finish();pointerId=null;if(remoteConnected&&document.hidden){remotePaused=true;syncRemoteUI();sendPhoneState();}});
window.addEventListener('blur',()=>{stopInk();finish();pointerId=null;});window.addEventListener('resize',()=>{stopInk();finish();resize();});
window.addEventListener('beforeunload',()=>{finish();try{localStorage.setItem(STORAGE,JSON.stringify(strokes));}catch{}});
function projectionScale(w=innerWidth,h=innerHeight){const xs=projectionQuad.map(p=>p.x),ys=projectionQuad.map(p=>p.y);return Math.min((Math.max(...xs)-Math.min(...xs))*w,(Math.max(...ys)-Math.min(...ys))*h)/Math.min(w,h);}
function setProjection(points){validateQuad(points);projectionQuad=points.map(p=>({...p}));projectionForward=homography(unitQuad,projectionQuad);projectionInverse=homography(projectionQuad,unitQuad);}
function drawBounds(){$('bounds-svg').setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);$('bounds-polygon').setAttribute('points',projectionQuad.map(p=>`${p.x*innerWidth},${p.y*innerHeight}`).join(' '));document.querySelectorAll('.bounds-handle').forEach((b,i)=>{b.style.left=`${Math.max(22,Math.min(innerWidth-22,projectionQuad[i].x*innerWidth))}px`;b.style.top=`${Math.max(22,Math.min(innerHeight-22,projectionQuad[i].y*innerHeight))}px`;});}
function editBounds(){stopInk();finish();if(calibrating)cancelCalibration();if($('setup').open)$('setup').close();boundsBefore=projectionQuad.map(p=>({...p}));$('bounds-editor').hidden=false;drawBounds();}
function cancelBounds(){if(!boundsBefore)return;setProjection(boundsBefore);boundsBefore=null;$('bounds-editor').hidden=true;render();}
$('bounds-button').onclick=editBounds;$('setup-bounds').onclick=editBounds;$('cancel-bounds').onclick=cancelBounds;
$('save-bounds').onclick=()=>{boundsBefore=null;$('bounds-editor').hidden=true;invalidateCalibration();render();toast('Drawing area saved. Calibrate the camera to the new area.');sendPhoneState();};
document.querySelectorAll('[data-aspect]').forEach(b=>b.onclick=()=>{setProjection(projectionPreset(Number(b.dataset.aspect),innerWidth,innerHeight));drawBounds();render();});
document.querySelectorAll('.bounds-handle').forEach(b=>{
 let dragging=false;const move=(x,y)=>{const points=projectionQuad.map(p=>({...p}));points[Number(b.dataset.corner)]={x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};try{setProjection(points);drawBounds();render();$('bounds-message').textContent='Tilted edges and trapezoids are fine. Save, then calibrate to this area.';}catch{$('bounds-message').textContent='Keep the four corners around the edge. They may be tilted, but cannot fold over each other.';}};
 b.onpointerdown=e=>{dragging=true;b.setPointerCapture(e.pointerId);};b.onpointermove=e=>{if(dragging)move(e.clientX/innerWidth,e.clientY/innerHeight);};b.onpointerup=b.onpointercancel=()=>dragging=false;b.onkeydown=e=>{const d={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]}[e.key];if(d){e.preventDefault();const p=projectionQuad[Number(b.dataset.corner)];move(p.x+d[0],p.y+d[1]);}};
});
function sendPhoneState(){phoneSession?.send({type:'state',version:PROTOCOL,paused:remotePaused,tool,calibrated:!!calibration,mirror:$('mirror').checked,calibration:{active:calibrating,method:calMethod,step:Math.min(calPoints.length,3),points:calPoints,message:calMessage}});}
function syncRemoteUI(){document.body.classList.toggle('remote-camera',remoteConnected);$('remote-summary').hidden=!remoteConnected;$('remote-summary').textContent='Phone camera connected. Camera and tracking settings are controlled on your phone.';for(const id of ['connect','cameras','resolution','tracking-mode','tracking-zoom','marker-color','gesture'])$(id).disabled=remoteConnected;$('calibrate').disabled=$('manual-calibrate').disabled=!(ready||remoteCameraReady);updateTrackingUI();if(remoteConnected)$('gesture').disabled=true;if(remoteConnected){$('ink-toggle').hidden=false;$('ink-toggle').textContent=remotePaused?'Ink paused':'Ink on';$('ink-toggle').classList.toggle('active',!remotePaused);}else{$('ink-toggle').textContent=markerInk?'Ink on':'Ink paused';$('ink-toggle').classList.toggle('active',markerInk);}}
function receivePhone(data){
 if(data.type==='camera'){stopInk();remoteCameraReady=data.active!==false;remoteMode=data.mode;remotePaused=data.active===false||data.mode==='marker';remoteClockOffset=Number.isFinite(data.clock)?performance.now()-data.clock:null;cameraId=data.id;invalidateCalibration();syncRemoteUI();setStatus(remoteCameraReady?'Phone · calibrate':'Phone camera stopped',remoteCameraReady);sendPhoneState();return;}
 if(data.type==='tracking'){if(remoteClockOffset!==null&&Number.isFinite(data.at)&&performance.now()-data.at-remoteClockOffset>500){onHand(null,null,false);return;}if(!remoteCameraReady||data.mode!==remoteMode)return;onHand(data.landmarks,data.marker,data.drawing&&!remotePaused);return;}
 if(data.type!=='command')return;
 const actions={pen:()=>setTool('pen'),eraser:()=>setTool('eraser'),undo,redo,pause:()=>{remotePaused=true;stopInk();},resume:()=>remotePaused=false,calibrate:()=>startCalibration(data.method==='finger'?'finger':'manual'),capture:delayedCapture,back:redoCalibrationPoint,cancel:cancelCalibration,color:()=>setColor(data.color),point:()=>{if(calibrating&&calMethod==='manual'&&data.step===Math.min(calPoints.length,3))addCalibrationPoint({x:$('mirror').checked?1-data.point.x:data.point.x,y:data.point.y});}};actions[data.action]?.();syncRemoteUI();sendPhoneState();
}
function endPhone(){const session=phoneSession;phoneSession=null;session?.close();remoteConnected=false;remoteCameraReady=false;stopInk();syncRemoteUI();$('end-pair').hidden=true;}
async function createPair(){endPhone();disconnect();invalidateCalibration();$('create-pair').disabled=true;$('pair-status').textContent='Creating a secure pairing link…';$('pair-details').hidden=true;
 try{phoneSession=new PairSession({onStatus:text=>$('pair-status').textContent=text,onData:receivePhone,onOpen:()=>{remoteConnected=true;remotePaused=false;remoteCameraReady=false;invalidateCalibration();syncRemoteUI();$('end-pair').hidden=false;$('welcome').hidden=true;if($('pair-dialog').open)$('pair-dialog').close();setStatus('Phone · start camera',true);sendPhoneState();},onClose:()=>{remoteConnected=false;remoteCameraReady=false;stopInk();raw=null;handSamples=[];if(calibrating)cancelCalibration();invalidateCalibration();syncRemoteUI();setStatus('Phone disconnected');}});
  const url=await phoneSession.url();$('pair-link').value=url;$('open-phone').href=url;$('pair-qr').src=await QRCode.toDataURL(url,{width:300,margin:2,errorCorrectionLevel:'M'});$('pair-details').hidden=false;
 }catch(e){$('pair-status').textContent=e.message;}finally{$('create-pair').disabled=false;}
}
function showPair(){stopInk();if($('setup').open)$('setup').close();$('pair-dialog').showModal();}
$('phone-button').onclick=showPair;$('setup-phone').onclick=showPair;$('close-pair').onclick=()=>$('pair-dialog').close();$('create-pair').onclick=createPair;$('end-pair').onclick=endPhone;
$('copy-pair').onclick=async()=>{try{await navigator.clipboard.writeText($('pair-link').value);toast('Pairing link copied. Open it on your phone.');}catch{$('pair-link').select();toast('Select and copy the pairing link.');}};
setInterval(()=>{if(remoteConnected)sendPhoneState();},750);
window.addEventListener('pagehide',()=>phoneSession?.close());
$('welcome').hidden=strokes.length>0;resize();updateHistory();updateCalibration();

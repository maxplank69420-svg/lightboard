import { targets, homography, project, gesture, inside, distance } from './geometry.js';
const $=id=>document.getElementById(id);
const canvas=$('board'),ctx=canvas.getContext('2d');
const STORAGE='lightboard.canvas.v1',SETTINGS='lightboard.settings.v1';
let strokes=[],active=null,history=[],future=[],color='#ffffff',tool='pen',width=5,pointerId=null,uiHidden=false;
let stream=null,worker=null,ready=false,busy=false,frameTime=-1,lastSend=0,raw=null,smoothed=null,ink=false,handSamples=[],lastSeen=0;
let calibrating=false,calPoints=[],captureTimer=null,calibration=null,toastTimer,saveTimer,cameraId='',connectGeneration=0;
let dwell={element:null,since:0,fired:false};
let settings={};
try {settings=JSON.parse(localStorage.getItem(SETTINGS)||'{}');} catch {}
try {const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(saved)) strokes=saved.filter(s=>Array.isArray(s.points)&&s.points.length&&s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&Number.isFinite(s.width)&&/^#[0-9a-f]{6}$/i.test(s.color));} catch {}
history=[strokes.slice()];
$('gesture').value=settings.gesture||'point';$('smoothing').value=settings.smoothing??45;$('mirror').checked=!!settings.mirror;
if(settings.calibration?.h?.length===8&&settings.calibration.h.every(Number.isFinite)) calibration=settings.calibration;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function persistSettings(){settings={...settings,gesture:$('gesture').value,smoothing:Number($('smoothing').value),mirror:$('mirror').checked,calibration,cameraId};try{localStorage.setItem(SETTINGS,JSON.stringify(settings));}catch{toast('Settings could not be saved in this browser.');}}
function persist(){clearTimeout(saveTimer);$('save-status').textContent='Saving…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(strokes));$('save-status').textContent='Saved on this device';}catch{$('save-status').textContent='Storage full · save a PNG';toast('Browser storage is full. Use Save to keep your drawing.');}},300);}
function paintStroke(s,context=ctx,w=innerWidth,h=innerHeight){if(!s.points.length)return;context.save();context.strokeStyle=s.color;context.fillStyle=s.color;context.lineWidth=s.width*Math.min(w,h);context.lineCap='round';context.lineJoin='round';context.globalCompositeOperation=s.erase?'destination-out':'source-over';const p=s.points;context.beginPath();if(p.length===1){context.arc(p[0].x*w,p[0].y*h,context.lineWidth/2,0,Math.PI*2);context.fill();}else{context.moveTo(p[0].x*w,p[0].y*h);for(let i=1;i<p.length;i++)context.lineTo(p[i].x*w,p[i].y*h);context.stroke();}context.restore();}
function render(){ctx.clearRect(0,0,innerWidth,innerHeight);for(const s of strokes)paintStroke(s);if(active)paintStroke(active);}
function resize(){const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(innerWidth*d);canvas.height=Math.round(innerHeight*d);ctx.setTransform(d,0,0,d,0,0);render();if(calibrating)positionTarget();if(calibration&&Math.abs((innerWidth/innerHeight)/calibration.aspect-1)>.05){calibration=null;persistSettings();updateCalibration();toast('Display proportions changed. Recalibrate on the projector.');}}
function changed(){history.push(strokes.slice());if(history.length>80)history.shift();future=[];updateHistory();persist();$('welcome').hidden=strokes.length>0||!!stream||settings.started;}
function updateHistory(){$('undo').disabled=history.length<2;$('redo').disabled=!future.length;}
function begin(p,source){if(active)finish();$('welcome').hidden=true;settings.started=true;active={color,width:width/900,erase:tool==='eraser',points:[{...p}],source};render();}
function append(p){if(!active)return;const prev=active.points.at(-1);if(distance(p,prev)>.0005){active.points.push({...p});render();}}
function finish(){if(!active)return;strokes=[...strokes,active];delete active.source;active=null;changed();}
function undo(){stopInk();finish();if(history.length<2)return;future.push(history.pop());strokes=history.at(-1).slice();render();updateHistory();persist();}
function redo(){stopInk();finish();if(!future.length)return;strokes=future.pop().slice();history.push(strokes.slice());render();updateHistory();persist();}
function setTool(t){stopInk();finish();tool=t;for(const id of ['pen','eraser']){$(id).classList.toggle('selected',id===t);$(id).setAttribute('aria-pressed',String(id===t));}}
function setColor(c){color=c;setTool('pen');document.querySelectorAll('.swatch').forEach(b=>{b.classList.toggle('selected',b.dataset.color===c);b.setAttribute('aria-pressed',String(b.dataset.color===c));});$('custom-color').value=c;}
canvas.addEventListener('pointerdown',e=>{if(calibrating||$('setup').open||e.button!==0)return;stopInk();pointerId=e.pointerId;canvas.setPointerCapture(pointerId);begin({x:e.clientX/innerWidth,y:e.clientY/innerHeight},'pointer');});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId)return;for(const sample of e.getCoalescedEvents?.()||[e])append({x:sample.clientX/innerWidth,y:sample.clientY/innerHeight});});
function pointerEnd(e){if(e.pointerId===pointerId){finish();pointerId=null;}}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('lostpointercapture',pointerEnd);
$('pen').onclick=()=>setTool('pen');$('eraser').onclick=()=>setTool('eraser');$('undo').onclick=undo;$('redo').onclick=redo;
document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>setColor(b.dataset.color));$('custom-color').oninput=e=>setColor(e.target.value);
$('size').oninput=e=>{width=Number(e.target.value);$('size-value').value=width;};
$('try-mouse').onclick=()=>{$('welcome').hidden=true;settings.started=true;toast('Draw anywhere. H hides controls; F enters fullscreen.');};
function showSetup(){stopInk();finish();$('setup').showModal();if(navigator.mediaDevices?.enumerateDevices)enumerate().catch(()=>{});}
$('get-started').onclick=showSetup;$('settings-button').onclick=showSetup;$('close-setup').onclick=()=>$('setup').close();
$('clear').onclick=()=>{finish();$('clear-dialog').showModal();};$('cancel-clear').onclick=()=>$('clear-dialog').close();$('confirm-clear').onclick=()=>{strokes=[];changed();render();$('clear-dialog').close();};
$('save').onclick=()=>{finish();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const c=out.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,out.width,out.height);c.drawImage(canvas,0,0);out.toBlob(blob=>{if(!blob){toast('Image export failed. Please try again.');return;}const a=document.createElement('a');a.download=`lightboard-${new Date().toISOString().slice(0,10)}.png`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Canvas exported as PNG.');});};
function hideUI(h){uiHidden=h;document.body.classList.toggle('ui-hidden',h);$('restore-ui').hidden=!h;}$('hide-ui').onclick=()=>hideUI(true);$('restore-ui').onclick=()=>hideUI(false);
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s fullscreen command (usually F11).');}}$('fullscreen').onclick=fullscreen;
function updateCalibration(){$('calibration-status').textContent=calibration?'✓ Projection calibrated':'○ Not calibrated';}
function invalidateCalibration(){stopInk();calibration=null;updateCalibration();persistSettings();}
for(const id of ['gesture','smoothing'])$(id).onchange=()=>{stopInk();persistSettings();};$('mirror').onchange=()=>{invalidateCalibration();toast('Camera coordinates changed. Recalibrate the projection.');};
function stopInk(){if(active?.source==='camera')finish();ink=false;smoothed=null;$('cursor').style.background='';$('cursor').hidden=true;$('drawing-indicator').hidden=true;}
function setStatus(message,live=false){$('camera-status').classList.toggle('live',live);$('camera-status').lastChild.textContent=' '+message;}
async function enumerate(){const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');$('cameras').replaceChildren(...(devices.length?devices.map((d,i)=>new Option(d.label||`Camera ${i+1}`,d.deviceId)):[new Option('No camera detected','')]));if(cameraId)$('cameras').value=cameraId;}
function disconnect(message='Camera disconnected.'){connectGeneration++;if(calibrating)cancelCalibration();stopInk();worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;ready=false;busy=false;raw=null;handSamples=[];lastSeen=0;frameTime=-1;$('video').srcObject=null;$('video-placeholder').hidden=false;$('preview').getContext('2d').clearRect(0,0,$('preview').width,$('preview').height);$('connect').disabled=false;$('connect').textContent='Connect camera';$('cameras').disabled=false;$('disconnect').disabled=true;$('calibrate').disabled=true;$('camera-message').textContent=message;setStatus('Camera off');}
$('disconnect').onclick=()=>disconnect();
$('connect').onclick=async()=>{
  const selected=$('cameras').value;disconnect('Requesting camera access…');const generation=connectGeneration;
  $('connect').disabled=true;$('cameras').disabled=true;$('connect').textContent='Connecting…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires localhost or HTTPS. Use the HTTPS site or open http://localhost:4173 in Chrome or Edge.');
    const nextStream=await navigator.mediaDevices.getUserMedia({video:{deviceId:selected?{exact:selected}:undefined,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false});
    if(generation!==connectGeneration){nextStream.getTracks().forEach(t=>t.stop());return;}
    stream=nextStream;$('video').srcObject=stream;await $('video').play();
    cameraId=stream.getVideoTracks()[0].getSettings().deviceId||selected;await enumerate();
    const aspect=innerWidth/innerHeight;
    if(calibration&&(calibration.cameraId!==cameraId||Math.abs(aspect/calibration.aspect-1)>.05))calibration=null;
    updateCalibration();persistSettings();$('video-placeholder').hidden=true;$('camera-message').textContent='Loading local hand tracking…';
    worker=new Worker(new URL('./tracker.js',import.meta.url),{type:'classic'});
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Hand tracking took too long to start. Try reconnecting.')),45000);worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timeout);resolve();}else if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));}};worker.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message||'Tracking worker could not start.'));};worker.postMessage({type:'init'});});
    if(generation!==connectGeneration)return;
    ready=true;worker.onmessage=({data})=>{busy=false;if(data.type==='error'){disconnect(`Tracking stopped: ${data.message}`);return;}if(data.type==='result')onHand(data.landmarks);};worker.onerror=()=>disconnect('Hand tracking stopped. Reconnect the camera to retry.');
    stream.getVideoTracks()[0].onended=()=>disconnect('Camera was removed or access was revoked. Reconnect to continue.');
    $('camera-message').textContent='Connected. Keep your hand visible and calibrate on the projector.';$('connect').textContent='Connected';$('disconnect').disabled=false;$('calibrate').disabled=false;$('welcome').hidden=true;setStatus(calibration?'Looking for hand':'Calibrate to draw',true);
  }catch(e){if(generation!==connectGeneration)return;const messages={NotAllowedError:'Camera permission was denied. Allow camera access in your browser, then reconnect.',NotFoundError:'No webcam was found. Connect your webcam, then try again.',NotReadableError:'The camera is busy or unavailable. Close other camera apps, then reconnect.',OverconstrainedError:'The selected camera is no longer available. Choose another camera.'};disconnect(messages[e.name]||e.message);}
};
function preview(landmarks){const p=$('preview');if(p.width!==$('video').videoWidth){p.width=$('video').videoWidth||640;p.height=$('video').videoHeight||480;}const c=p.getContext('2d');c.clearRect(0,0,p.width,p.height);if(!landmarks)return;c.fillStyle='#baf4cf';for(const point of landmarks){c.beginPath();c.arc(point.x*p.width,point.y*p.height,3,0,Math.PI*2);c.fill();}const tip=landmarks[8];c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.arc(tip.x*p.width,tip.y*p.height,9,0,Math.PI*2);c.stroke();}
function onHand(landmarks){preview(landmarks);if(!landmarks){dwell={element:null,since:0,fired:false};raw=null;handSamples=[];stopInk();if(!calibrating)setStatus(calibration?'Looking for hand':'Calibrate to draw',true);return;}
  const now=performance.now();lastSeen=now;raw={x:$('mirror').checked?1-landmarks[8].x:landmarks[8].x,y:landmarks[8].y};handSamples.push({...raw,time:now});handSamples=handSamples.filter(p=>now-p.time<600);
  if(calibrating){stopInk();return;}
  if(!calibration||$('setup').open||$('clear-dialog').open||pointerId!==null||document.hidden||!document.hasFocus()){stopInk();return;}
  let mapped=project(raw,calibration.h);if(!inside(mapped)){stopInk();setStatus('Outside canvas',true);return;}
  if(smoothed&&distance(mapped,smoothed)>.2){stopInk();}
  const alpha=1-Number($('smoothing').value)/100;
  smoothed=smoothed?{x:smoothed.x+(mapped.x-smoothed.x)*alpha,y:smoothed.y+(mapped.y-smoothed.y)*alpha}:mapped;
  // A steady fingertip can select projected tools without returning to the computer.
  const hovered=document.elementFromPoint(smoothed.x*innerWidth,smoothed.y*innerHeight);
  const control=hovered?.closest('#toolbar button, #restore-ui');
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
  const drawing=gesture(landmarks,$('gesture').value,ink);$('cursor').hidden=false;$('cursor').style.left=`${smoothed.x*100}%`;$('cursor').style.top=`${smoothed.y*100}%`;$('cursor').classList.toggle('inking',drawing);$('drawing-indicator').hidden=!drawing;
  setStatus(drawing?'Drawing':'Hand ready',true);
  if(drawing){if(!ink)begin(smoothed,'camera');else append(smoothed);}else if(ink)finish();ink=drawing;
}
async function tick(now){requestAnimationFrame(tick);if(ink&&now-lastSeen>250){stopInk();setStatus('Looking for hand',true);}if(!ready||busy||document.hidden||!stream||$('video').readyState<2||now-lastSend<40||$('video').currentTime===frameTime)return;
  busy=true;frameTime=$('video').currentTime;lastSend=now;const currentWorker=worker;
  try{const bitmap=await createImageBitmap($('video'));if(worker!==currentWorker||!ready){bitmap.close();return;}worker.postMessage({type:'frame',bitmap,time:now},[bitmap]);}catch{busy=false;stopInk();}
}
requestAnimationFrame(tick);
function positionTarget(){const p=targets[calPoints.length];if(!p)return;$('target').style.left=`${p.x*100}%`;$('target').style.top=`${p.y*100}%`;$('target').querySelector('b').textContent=calPoints.length+1;$('cal-step').textContent=`${calPoints.length+1} / 4`;}
function cancelCalibration(){clearInterval(captureTimer);captureTimer=null;calibrating=false;$('calibration').hidden=true;$('capture').disabled=false;$('capture').textContent='Capture in 3 seconds';handSamples=[];}
$('cancel-cal').onclick=()=>{cancelCalibration();showSetup();};
$('calibrate').onclick=()=>{if(!ready)return;stopInk();finish();$('setup').close();calPoints=[];handSamples=[];calibrating=true;$('calibration').hidden=false;$('cal-message').innerHTML='Hold your index fingertip at the center, then press Space.<br>Or start a 3-second capture and move to the target.';positionTarget();};
function capture(){if(!calibrating)return;const samples=handSamples.filter(p=>performance.now()-p.time<450);if(!raw||performance.now()-lastSeen>200||samples.length<4){$('cal-message').textContent='Hand not visible. Hold your index finger on the target and try again.';return;}const center={x:samples.reduce((n,p)=>n+p.x,0)/samples.length,y:samples.reduce((n,p)=>n+p.y,0)/samples.length};if(samples.some(p=>distance(p,center)>.025)){$('cal-message').textContent='Hold your fingertip still at the target, then capture again.';return;}calPoints.push(center);handSamples=[];
  if(calPoints.length<4){positionTarget();$('cal-message').textContent='Point at the next target, hold still, then capture.';return;}
  try{const h=homography(calPoints);calibration={h,cameraId,aspect:innerWidth/innerHeight};persistSettings();updateCalibration();cancelCalibration();toast($('gesture').value==='pinch'?'Calibrated. Pinch thumb to middle finger to draw.':'Calibrated. Point to draw; open your hand to pause.');}catch(e){calPoints=[];positionTarget();$('cal-message').textContent=e.message+' Start again at target 1.';}
}
$('capture').onclick=()=>{if(captureTimer)return;let count=3;$('capture').disabled=true;$('capture').textContent=`Capturing in ${count}…`;captureTimer=setInterval(()=>{count--;if(count>0){$('capture').textContent=`Capturing in ${count}…`;return;}clearInterval(captureTimer);captureTimer=null;capture();$('capture').disabled=false;$('capture').textContent='Capture in 3 seconds';},1000);};
document.addEventListener('keydown',e=>{if(calibrating){if(e.code==='Space'){e.preventDefault();if(!captureTimer)capture();}if(e.key==='Escape'){cancelCalibration();showSetup();}return;}if(e.target.matches('input,select,textarea')||$('setup').open||$('clear-dialog').open)return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if(e.ctrlKey||e.metaKey||e.altKey)return;if(key==='f')fullscreen();if(key==='h')hideUI(!uiHidden);if(key==='p')setTool('pen');if(key==='e')setTool('eraser');});
document.addEventListener('visibilitychange',()=>{stopInk();finish();pointerId=null;});
window.addEventListener('blur',()=>{stopInk();finish();pointerId=null;});window.addEventListener('resize',()=>{stopInk();finish();resize();});
window.addEventListener('beforeunload',()=>{finish();try{localStorage.setItem(STORAGE,JSON.stringify(strokes));}catch{}});
$('welcome').hidden=strokes.length>0;resize();updateHistory();updateCalibration();

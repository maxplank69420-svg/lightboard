export const PROTOCOL=1;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function validPoint(p){return p&&finite(p.x)&&finite(p.y)&&p.x>=-.25&&p.x<=1.25&&p.y>=-.25&&p.y<=1.25;}
export function validTracking(d){
 return d&&d.type==='tracking'&&Number.isSafeInteger(d.seq)&&d.seq>=0&&typeof d.drawing==='boolean'&&['hand','marker'].includes(d.mode)&&
  (d.marker===null||validPoint(d.marker))&&(d.landmarks===null||(Array.isArray(d.landmarks)&&d.landmarks.length===21&&d.landmarks.every(validPoint)))&&
  !(d.marker&&d.landmarks);
}
export function validCommand(d){
 if(!d||d.type!=='command')return false;
 if(['pen','eraser','undo','redo','pause','resume','calibrate','capture','back','cancel'].includes(d.action))return true;
 if(d.action==='point')return validPoint(d.point)&&Number.isInteger(d.step)&&d.step>=0&&d.step<=3;
 if(d.action==='color')return /^#[0-9a-f]{6}$/i.test(d.color||'');
 return false;
}
export function pairingHash(host,token){return '#phone='+encodeURIComponent(host)+'&key='+encodeURIComponent(token);}
export function parsePairing(hash){const p=new URLSearchParams(hash.replace(/^#/,''));const host=p.get('phone'),token=p.get('key');return /^[a-z0-9-]{8,100}$/i.test(host||'')&&/^[a-f0-9]{32}$/.test(token||'')?{host,token}:null;}
export function randomKey(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}

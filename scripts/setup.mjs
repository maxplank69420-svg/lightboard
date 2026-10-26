import { mkdir, cp, copyFile, writeFile, access } from 'node:fs/promises';
await mkdir('vendor/wasm', { recursive: true });
await copyFile('node_modules/@mediapipe/tasks-vision/vision_bundle.cjs', 'vendor/vision_bundle.js');
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'vendor/wasm', { recursive: true });
try { await access('vendor/hand_landmarker.task'); }
catch {
  console.log('Downloading the hand tracking model (about 8 MB)…');
  const res = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task');
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  await writeFile('vendor/hand_landmarker.task', Buffer.from(await res.arrayBuffer()));
}
console.log('Camera assets ready. Camera processing is local; phone pairing uses online signaling.');
const { build } = await import('esbuild');
await build({stdin:{contents:'export { Peer } from "peerjs"; import QRCode from "qrcode"; export { QRCode };',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,outfile:'vendor/connect.mjs',legalComments:'linked'});

const { readFile } = await import('node:fs/promises');
await writeFile('vendor/PAIRING_LICENSES.txt',(await Promise.all(['peerjs/LICENSE','qrcode/license'].map(async path=>{try{return path+'\n'+await readFile('node_modules/'+path,'utf8');}catch{return '';}}))).join('\n\n'));

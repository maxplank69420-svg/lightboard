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
console.log('Ready. Camera processing works locally; no internet needed at runtime.');

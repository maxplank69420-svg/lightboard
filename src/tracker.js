// Classic worker: the WASM loader uses importScripts. Export shim for the official CJS bundle.
self.exports = {};
importScripts('../vendor/vision_bundle.js');
const { FilesetResolver, HandLandmarker } = self.exports;
let tracker;
self.onmessage = async ({data}) => {
  if(data.type==='init') {
    try {
      const vision=await FilesetResolver.forVisionTasks(new URL('../vendor/wasm',self.location.href).href);
      tracker=await HandLandmarker.createFromOptions(vision, {
        baseOptions:{modelAssetPath:new URL('../vendor/hand_landmarker.task',self.location.href).href,delegate:'CPU'},
        runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
      });
      self.postMessage({type:'ready'});
    } catch(e) {self.postMessage({type:'error',message:e.message});}
  } else if(data.type==='frame') {
    try {
      const result=tracker.detectForVideo(data.bitmap,data.time);
      self.postMessage({type:'result',landmarks:result.landmarks[0]||null});
    } catch(e) {self.postMessage({type:'error',message:e.message});}
    finally {data.bitmap.close();}
  }
};

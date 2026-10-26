// Classic worker: the official WASM loader uses importScripts.
let tracker,core,markerCanvas,markerContext;
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      core=await import('./tracking.js');
      if(data.mode!=='marker'){
        self.exports={};importScripts('../vendor/vision_bundle.js');
        const {FilesetResolver,HandLandmarker}=self.exports;
        const vision=await FilesetResolver.forVisionTasks(new URL('../vendor/wasm',self.location.href).href);
        tracker=await HandLandmarker.createFromOptions(vision,{
          baseOptions:{modelAssetPath:new URL('../vendor/hand_landmarker.task',self.location.href).href,delegate:'CPU'},
          runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.45,minHandPresenceConfidence:.5,minTrackingConfidence:.5
        });
      }
      self.postMessage({type:'ready'});
    }catch(e){self.postMessage({type:'error',message:e.message});}
  }else if(data.type==='frame'){
    try{
      if(data.mode==='marker'){
        const w=Math.min(640,data.bitmap.width),h=Math.max(1,Math.round(w*data.bitmap.height/data.bitmap.width));
        if(!markerCanvas||markerCanvas.width!==w||markerCanvas.height!==h){markerCanvas=new OffscreenCanvas(w,h);markerContext=markerCanvas.getContext('2d',{willReadFrequently:true});}
        markerContext.drawImage(data.bitmap,0,0,w,h);
        const point=core.detectMarker(markerContext.getImageData(0,0,w,h).data,w,h,data.color);
        self.postMessage({type:'result',landmarks:null,marker:point?core.remapPoint(point,data.crop):null});
      }else{
        const result=tracker.detectForVideo(data.bitmap,data.time);
        self.postMessage({type:'result',landmarks:result.landmarks[0]?.map(p=>core.remapPoint(p,data.crop))||null});
      }
    }catch(e){self.postMessage({type:'error',message:e.message});}
    finally{data.bitmap.close();}
  }
};

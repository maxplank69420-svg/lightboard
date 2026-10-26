const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function trackingCrop(zoom=1,centerX=.5,centerY=.5){
  const size=1/clamp(Number(zoom)||1,1,4);
  return {x:clamp(centerX-size/2,0,1-size),y:clamp(centerY-size/2,0,1-size),width:size,height:size};
}
export function frameCrop(crop,width,height){
  const x=Math.min(width-1,Math.round(crop.x*width)),y=Math.min(height-1,Math.round(crop.y*height));
  return {x,y,width:Math.max(1,Math.min(width-x,Math.round(crop.width*width))),height:Math.max(1,Math.min(height-y,Math.round(crop.height*height)))};
}
export function remapPoint(p,crop={x:0,y:0,width:1,height:1}){return {...p,x:crop.x+p.x*crop.width,y:crop.y+p.y*crop.height};}
export function previewPoint(clientX,clientY,rect,videoWidth,videoHeight){
  const scale=Math.min(rect.width/videoWidth,rect.height/videoHeight),w=videoWidth*scale,h=videoHeight*scale;
  const x=(clientX-rect.left-(rect.width-w)/2)/w,y=(clientY-rect.top-(rect.height-h)/2)/h;
  return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;
}
export function hue(r,g,b){
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  if(!d)return {h:0,s:0,v:max/255};
  let h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return {h:(h*60+360)%360,s:d/max,v:max/255};
}
// Connected components reject isolated noise, large projected patches, and ambiguous markers.
export function detectMarker(rgba,width,height,color='#ff00ff'){
  const target=hue(parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16));
  const count=width*height,mask=new Uint8Array(count),queue=new Int32Array(count),components=[];
  for(let i=0;i<count;i++){
    const {h,s,v}=hue(rgba[i*4],rgba[i*4+1],rgba[i*4+2]);
    const delta=Math.abs(h-target.h);
    if(Math.min(delta,360-delta)<22&&s>.48&&v>.24)mask[i]=1;
  }
  for(let i=0;i<count;i++){
    if(mask[i]!==1)continue;
    let start=0,end=1,sumX=0,sumY=0,minX=width,maxX=0,minY=height,maxY=0;
    queue[0]=i;mask[i]=2;
    while(start<end){const p=queue[start++],x=p%width,y=Math.floor(p/width);sumX+=x;sumY+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const n of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(n>=0&&mask[n]===1){mask[n]=2;queue[end++]=n;}
    }
    const aspect=(maxX-minX+1)/(maxY-minY+1);
    if(end>=5&&end<count*.06&&aspect>.15&&aspect<6)components.push({x:(sumX/end+.5)/width,y:(sumY/end+.5)/height,pixels:end});
  }
  components.sort((a,b)=>b.pixels-a.pixels);
  if(!components.length||(components[1]&&components[1].pixels>=components[0].pixels*.75))return null;
  return components[0];
}

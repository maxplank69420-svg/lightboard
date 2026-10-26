export const targets = [{x:.12,y:.16},{x:.88,y:.16},{x:.88,y:.84},{x:.12,y:.84}];
export function homography(from, to = targets) {
  if (from.length !== 4 || to.length !== 4) throw new Error('Four calibration points are required.');
  validateQuad(from);
  validateQuad(to);
  const rows = [];
  for (let i=0;i<4;i++) {
    const {x,y}=from[i], {x:u,y:v}=to[i];
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for (let c=0;c<8;c++) {
    let pivot=c;
    for (let r=c+1;r<8;r++) if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c])) pivot=r;
    if(Math.abs(rows[pivot][c])<1e-9) throw new Error('Two recorded points overlap or the area is too narrow. Redo the last point, or use click-to-calibrate.');
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const d=rows[c][c]; for(let j=c;j<9;j++) rows[c][j]/=d;
    for(let r=0;r<8;r++) if(r!==c) {const k=rows[r][c]; for(let j=c;j<9;j++) rows[r][j]-=k*rows[c][j];}
  }
  const h=rows.map(r=>r[8]);
  return h;
}
export function project(p,h) {
  if(!h) return {...p};
  const d=h[6]*p.x+h[7]*p.y+1;
  if(Math.abs(d)<1e-9) return {x:NaN,y:NaN};
  return {x:(h[0]*p.x+h[1]*p.y+h[2])/d,y:(h[3]*p.x+h[4]*p.y+h[5])/d};
}
export function distance(a,b) {return Math.hypot(a.x-b.x,a.y-b.y);}
export function gesture(landmarks, mode, wasDrawing=false) {
  const l=landmarks, palm=Math.max(distance(l[0],l[9]),.01);
  if(mode==='pinch') return distance(l[4],l[12])/palm < (wasDrawing?.42:.30);
  const extended=(tip,pip)=>distance(l[tip],l[0])>distance(l[pip],l[0])*1.15;
  return extended(8,6) && !extended(12,10) && !extended(16,14);
}
export function inside(p) {return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=1&&p.y<=1;}

export const unitQuad=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
export function validateQuad(points){
 if(points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('Four distinct corner positions are needed.');
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),scale=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys));
 const crosses=points.map((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
 if(scale<1e-10||crosses.some(v=>Math.abs(v)<scale*1e-6))throw new Error('Recorded points overlap or nearly line up. Redo a point, or click the targets in the camera image. A tilted rectangle or trapezoid is fine.');
 if(!crosses.every(v=>Math.sign(v)===Math.sign(crosses[0])))throw new Error('The recorded camera points cross or fold inward. Follow targets 1 → 2 → 3 → 4 around the edge. Tilted rectangles and trapezoids are allowed; redo the bad point.');
 return true;
}
export function projectionPreset(aspect,viewportWidth,viewportHeight){
 if(!aspect)return unitQuad.map(p=>({...p}));
 const w=Math.min(viewportWidth,viewportHeight*aspect)/viewportWidth,h=Math.min(viewportHeight,viewportWidth/aspect)/viewportHeight;
 return [{x:(1-w)/2,y:(1-h)/2},{x:(1+w)/2,y:(1-h)/2},{x:(1+w)/2,y:(1+h)/2},{x:(1-w)/2,y:(1+h)/2}];
}

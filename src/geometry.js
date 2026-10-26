export const targets = [{x:.12,y:.16},{x:.88,y:.16},{x:.88,y:.84},{x:.12,y:.84}];
export function homography(from, to = targets) {
  if (from.length !== 4 || to.length !== 4) throw new Error('Four calibration points are required.');
  const rows = [];
  for (let i=0;i<4;i++) {
    const {x,y}=from[i], {x:u,y:v}=to[i];
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for (let c=0;c<8;c++) {
    let pivot=c;
    for (let r=c+1;r<8;r++) if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c])) pivot=r;
    if(Math.abs(rows[pivot][c])<1e-9) throw new Error('Calibration points overlap. Try again with four distinct corners.');
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const d=rows[c][c]; for(let j=c;j<9;j++) rows[c][j]/=d;
    for(let r=0;r<8;r++) if(r!==c) {const k=rows[r][c]; for(let j=c;j<9;j++) rows[r][j]-=k*rows[c][j];}
  }
  const h=rows.map(r=>r[8]);
  // A folded or nearly collapsed quadrilateral cannot describe the projected plane.
  const crosses=from.map((a,i)=>{const b=from[(i+1)%4],c=from[(i+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
  if(crosses.some(v=>Math.abs(v)<.0001) || !crosses.every(v=>Math.sign(v)===Math.sign(crosses[0]))) throw new Error('Targets must form a clear, non-crossing rectangle in the camera view.');
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

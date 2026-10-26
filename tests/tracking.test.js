import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingCrop,frameCrop,remapPoint,previewPoint,detectMarker} from '../src/tracking.js';
import {homography,project,targets} from '../src/geometry.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function image(width=100,height=100){return {width,height,data:new Uint8ClampedArray(width*height*4)};}
function patch(img,x,y,w,h,r=255,g=0,b=255){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*img.width+xx)*4;img.data.set([r,g,b,255],i);}return img;}
const detect=img=>detectMarker(img.data,img.width,img.height);
test('a small colored fingertip can be found without a recognizable hand',()=>{const p=detect(patch(image(),30,40,4,4));near(p.x,.32);near(p.y,.42);assert.equal(p.pixels,16);});
test('isolated colored pixels and white highlights do not create a marker',()=>{const img=image();patch(img,10,10,1,1);patch(img,20,20,8,8,255,255,255);assert.equal(detect(img),null);});
test('ambiguous similar markers and oversized projected patches pause tracking',()=>{const img=patch(image(),10,10,4,4);patch(img,50,50,4,4);assert.equal(detect(img),null);assert.equal(detect(patch(image(),10,10,40,40)),null);});
test('separate edge blobs do not wrap around rows',()=>{const img=patch(image(),0,40,2,4);patch(img,98,39,2,4);assert.equal(detect(img),null);});
test('tracking crop stays within the sensor at every edge',()=>{for(const x of [0,.5,1])for(const y of [0,.5,1]){const c=trackingCrop(4,x,y);assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=1&&c.y+c.height<=1);const r=frameCrop(c,1920,1080);assert.ok(r.width>0&&r.height>0&&r.x+r.width<=1920&&r.y+r.height<=1080);}});
test('cropped detections preserve existing camera-to-projector calibration',()=>{const from=[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}],h=homography(from),c=trackingCrop(2,.5,.5);const p=remapPoint({x:.5,y:.5},c);const result=project(p,h);near(result.x,.5);near(result.y,.5);const mirrored=remapPoint({x:0,y:0},c);near(mirrored.x,.25);near(mirrored.y,.25);});
test('preview clicks account for letterboxing and reject the black bars',()=>{const rect={left:10,top:20,width:400,height:300};const center=previewPoint(210,170,rect,1920,1080);near(center.x,.5);near(center.y,.5);assert.equal(previewPoint(210,25,rect,1920,1080),null);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {homography,project,targets,gesture,inside} from '../src/geometry.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('perspective calibration maps an oblique camera quadrilateral onto every target',()=>{
 const from=[{x:.20,y:.12},{x:.85,y:.24},{x:.77,y:.91},{x:.13,y:.73}],h=homography(from);
 from.forEach((p,i)=>{const mapped=project(p,h);near(mapped.x,targets[i].x);near(mapped.y,targets[i].y);});
});
test('camera calibration supports mirrored or rotated mounting',()=>{
 for(const from of [[{x:.9,y:.1},{x:.1,y:.1},{x:.1,y:.9},{x:.9,y:.9}],[{x:.9,y:.9},{x:.1,y:.9},{x:.1,y:.1},{x:.9,y:.1}]]){
 const h=homography(from);const center=project({x:.5,y:.5},h);near(center.x,.5);near(center.y,.5);
 }
});
test('rejects overlapping and crossed calibration points',()=>{
 assert.throws(()=>homography(Array(4).fill({x:.5,y:.5})));
 assert.throws(()=>homography([{x:.1,y:.1},{x:.9,y:.9},{x:.1,y:.9},{x:.9,y:.1}]));
});
test('out of range and invalid projection never inks inside the board',()=>{assert.equal(inside({x:-.1,y:.5}),false);assert.equal(inside({x:Infinity,y:.5}),false);assert.equal(inside({x:.4,y:.7}),true);});
function hand(){const l=Array.from({length:21},()=>({x:.5,y:.6}));l[0]={x:.5,y:.9};l[9]={x:.5,y:.5};l[6]={x:.45,y:.55};l[8]={x:.45,y:.2};l[10]={x:.5,y:.55};l[12]={x:.5,y:.65};l[14]={x:.55,y:.55};l[16]={x:.55,y:.65};return l;}
test('pointing draws while an open hand pauses',()=>{const l=hand();assert.equal(gesture(l,'point'),true);l[12].y=.15;l[16].y=.2;assert.equal(gesture(l,'point'),false);});
test('pinch has hysteresis to avoid ink flicker',()=>{const l=hand();l[4]={x:l[12].x+.14,y:l[12].y};assert.equal(gesture(l,'pinch',false),false);assert.equal(gesture(l,'pinch',true),true);l[4].x=l[12].x+.05;assert.equal(gesture(l,'pinch',false),true);});

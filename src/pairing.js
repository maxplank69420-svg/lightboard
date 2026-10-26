import {Peer,QRCode} from '../vendor/connect.mjs';
import {PROTOCOL,randomKey,pairingHash,validTracking,validCommand} from './protocol.js';
export {QRCode};
// One authenticated phone per fresh display session. Only coordinates and controls cross this channel.
export class PairSession{
 constructor({role='display',host,token,onStatus=()=>{},onData=()=>{},onOpen=()=>{},onClose=()=>{}}={}){
  this.role=role;this.token=token||randomKey();this.onStatus=onStatus;this.onData=onData;this.onOpen=onOpen;this.onClose=onClose;this.closed=false;this.authenticated=false;this.lastReceived=Date.now();this.lastSeq=-1;
  this.peer=new Peer('lb-'+randomKey(),{secure:true,debug:0});
  this.opened=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{reject(new Error('Pairing service did not respond. Check internet access and try a new pairing link.'));this.close();},20000);
   this.peer.on('open',id=>{clearTimeout(timer);this.id=id;resolve(id);if(role==='phone')this.bind(this.peer.connect(host,{reliable:true,serialization:'json',metadata:{app:'lightboard',version:PROTOCOL}}));else onStatus('Scan the QR code with your phone.');});
   this.peer.on('error',e=>{clearTimeout(timer);const message=e.type==='peer-unavailable'?'This display session is no longer available. Generate a new pairing link on the main device.':`Connection error: ${e.message}. Try the same Wi-Fi network and a fresh pairing link.`;onStatus(message);if(!this.id)reject(new Error(message));});
  });
  this.peer.on('connection',c=>{if(role!=='display'||this.connection){c.on('open',()=>c.close());return;}this.bind(c);});
  this.peer.on('disconnected',()=>{if(!this.closed&&!this.authenticated){onStatus('Pairing service disconnected. Generate a fresh link.');}});
  this.interval=setInterval(()=>{if(this.connection?.open){this.send({type:'ping'});if(Date.now()-this.lastReceived>9000)this.drop('Connection lost. Pair again; drawing has stopped.');}},2000);
 }
 bind(c){
  this.connection=c;let authTimer=setTimeout(()=>{if(!this.authenticated){c.close();if(this.connection===c)this.connection=null;this.onStatus('Pairing timed out. Generate a fresh link and try again.');}},15000);
  c.on('open',()=>{this.lastReceived=Date.now();this.onStatus('Connecting to the other device…');if(this.role==='phone')c.send({type:'hello',version:PROTOCOL,token:this.token});});
  c.on('data',d=>{
   if(!d||typeof d!=='object')return;
   if(!this.authenticated){
    if(this.role==='display'&&d.type==='hello'&&d.version===PROTOCOL&&d.token===this.token){this.authenticated=true;c.send({type:'welcome',version:PROTOCOL});}
    else if(this.role==='phone'&&d.type==='welcome'&&d.version===PROTOCOL)this.authenticated=true;
    else{c.close();if(this.connection===c)this.connection=null;return;}
    clearTimeout(authTimer);this.onStatus('Connected');this.onOpen();return;
   }
   this.lastReceived=Date.now();if(d.type==='ping')return;
   if(this.role==='display'){
    if(validTracking(d)&&d.seq>this.lastSeq){this.lastSeq=d.seq;this.onData(d);}
    else if(validCommand(d)||d.type==='camera'&&typeof d.id==='string'&&d.id.length<200&&['hand','marker'].includes(d.mode))this.onData(d);
   }else if(d.type==='state'&&d.version===PROTOCOL)this.onData(d);
  });
  c.on('close',()=>{clearTimeout(authTimer);if(this.connection===c)this.drop('Phone disconnected. Drawing has stopped.');});
  c.on('error',()=>this.drop('Device connection failed. Pair again.'));
 }
 send(data){if(data.type==='tracking'&&(this.connection?.dataChannel?.bufferedAmount||0)>32768)return false;if(this.connection?.open&&(this.authenticated||data.type==='hello')){try{this.connection.send(data);return true;}catch{this.drop('Connection lost.');}}return false;}
 async url(base=location.href){const id=await this.opened;return new URL('./phone.html'+pairingHash(id,this.token),base).href;}
 drop(message){const was=this.authenticated;this.authenticated=false;const c=this.connection;this.connection=null;c?.close();this.lastSeq=-1;this.onStatus(message);if(was)this.onClose();}
 close(){this.closed=true;clearInterval(this.interval);this.drop('Disconnected');this.peer?.destroy();}
}

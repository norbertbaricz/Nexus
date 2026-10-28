'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=name=>'data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../public',name),'utf8')).toString('base64');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../public/call-preview.js'),'utf8').replace("'./config.js'",JSON.stringify(url('config.js')))).toString('base64'));
function track(){const value=new EventTarget();value.readyState='live';value.muted=false;value.stops=0;value.stop=()=>{value.stops++;value.readyState='ended';};return value;}
const stream=value=>({getVideoTracks:()=>[value],getTracks:()=>[value]});
function node(){const classes=new Set(),events=new Map();return{children:[],parentElement:null,hidden:false,dataset:{},attributes:{},classList:{add:value=>classes.add(value),remove:(...values)=>values.forEach(value=>classes.delete(value)),toggle(value,enabled){enabled?classes.add(value):classes.delete(value);},contains:value=>classes.has(value)},setAttribute(key,value){this.attributes[key]=value;},addEventListener(event,handler){events.set(event,handler);},fire(event){events.get(event)?.();},append(...children){for(const child of children){if(child.parentElement){const a=child.parentElement.children;a.splice(a.indexOf(child),1);}child.parentElement=this;this.children.push(child);}},replaceChildren(...children){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...children);},insertBefore(child,before){if(child.parentElement){const a=child.parentElement.children;a.splice(a.indexOf(child),1);}child.parentElement=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,child);},get nextElementSibling(){const a=this.parentElement?.children||[];return a[a.indexOf(this)+1]||null;},get isConnected(){return true;},readyState:2,paused:true,plays:0,pauses:0,play(){this.paused=false;this.plays++;return Promise.resolve();},pause(){this.paused=true;this.pauses++;}};}
function fixture(){const screen=track(),camera=track(),local=track(),root=node();root.ownerDocument={createElement:()=>node()};
 const state={user:{id:'self'},users:[{id:'self',displayName:'Self'},{id:'peer',displayName:'Member <test>'}],blockedIds:[],socketId:'local',voice:[{socketId:'local',userId:'self',conversationId:'voice',camera:true},{socketId:'remote',userId:'peer',conversationId:'voice',camera:true,sharing:true}]};
 const call={active:{conversationId:'voice'},cameraStream:stream(local),peers:new Map([['remote',{cameraStream:stream(camera),screenStream:stream(screen)}]])};return{state,call,root,screen,camera,local};
}
test('preview selects only published live tracks from the connected room, with screen priority and block gates',async()=>{
 const {callPreviewSources}=await load(),f=fixture();assert.deepEqual(callPreviewSources(f.state,f.call).map(s=>s.key),['remote:screen','remote:camera','local:camera']);
 f.state.blockedIds=['peer'];assert.deepEqual(callPreviewSources(f.state,f.call).map(s=>s.key),['local:camera']);f.state.blockedIds=[];
 f.screen.readyState='ended';assert.ok(!callPreviewSources(f.state,f.call).some(s=>s.kind==='screen'));f.call.active={conversationId:'elsewhere'};assert.equal(callPreviewSources(f.state,f.call).length,0);
 f.call.active=null;assert.equal(callPreviewSources(f.state,f.call).length,0);f.state.user=null;assert.equal(callPreviewSources(f.state,f.call).length,0);
});
test('preview preserves its muted player across identity/layout updates and never stops call tracks',async()=>{
 const {CallPreview}=await load(),f=fixture();const preview=new CallPreview({getState:()=>f.state,getCall:()=>f.call,getSocketId:()=>f.state.socketId,getRoot:()=>f.root});
 assert.equal(preview.update(true),true);const video=preview.video;assert.equal(video.muted,true);assert.equal(video.playsInline,true);assert.equal(video.srcObject,f.call.peers.get('remote').screenStream);
 f.state.users[1].displayName='Renamed <member>';preview.update(true);assert.equal(preview.video,video);assert.equal(video.pauses,0);assert.equal(preview.caption.textContent,'Renamed <member> · Screen sharing');
 preview.next();preview.update(true);assert.equal(video.srcObject,f.call.peers.get('remote').cameraStream);
 preview.update(false);assert.equal(f.root.hidden,true);assert.equal(video.srcObject,null);assert.equal(f.screen.stops+f.camera.stops+f.local.stops,0);
 preview.update(true);assert.equal(preview.video,video);f.call.active=null;preview.update(true);assert.equal(f.root.hidden,true);assert.equal(video.srcObject,null);assert.equal(preview.watched.size,0);
});
test('ending or unpublishing a shared track removes the preview without waiting for another navigation',async()=>{
 const {CallPreview}=await load(),f=fixture();f.state.voice[0].camera=false;f.state.voice[1].camera=false;let updates=0,preview;
 preview=new CallPreview({getState:()=>f.state,getCall:()=>f.call,getSocketId:()=>f.state.socketId,getRoot:()=>f.root,onChange:()=>{updates++;preview.update(true);}});
 preview.update(true);f.screen.readyState='ended';f.screen.dispatchEvent(new Event('ended'));assert.equal(updates,1);assert.equal(f.root.hidden,true);assert.equal(preview.video.srcObject,null);
 f.screen.readyState='live';preview.update(true);f.state.voice[1].sharing=false;preview.update(true);assert.equal(f.root.hidden,true);assert.equal(f.screen.stops,0);
});
test('desktop/mobile placement moves one existing dock without replacing its preview or sidebar content',async()=>{
 const {placeCallDock}=await load(),app=node(),sidebar=node(),bar=node(),dock=node(),video=node();app.append(sidebar,dock);sidebar.append(bar);dock.append(video);
 const options={app,sidebar,userBar:bar,dock,width:1440};placeCallDock(options);assert.equal(dock.parentElement,sidebar);assert.equal(dock.nextElementSibling,bar);assert.equal(dock.children[0],video);
 placeCallDock({...options,width:390});assert.equal(dock.parentElement,app);assert.equal(dock.children[0],video);assert.equal(bar.parentElement,sidebar);
 placeCallDock({...options,width:1024});assert.equal(dock.nextElementSibling,bar);assert.equal(dock.children[0],video);
});

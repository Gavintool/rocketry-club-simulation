import * as THREE from './vendor/three.module.min.js';
const worker = new Worker(new URL('./simulation-worker.js', import.meta.url), {type:'module'});
const pending = new Map();
worker.onmessage = ({data}) => {const task=pending.get(data.id);if(!task)return;pending.delete(data.id);data.error?task.reject(Error(data.error)):task.resolve(data.result);};
worker.onerror = () => {for(const task of pending.values())task.reject(Error('The flight calculation could not start. Reload the page and try again.'));pending.clear();};
function calculate(id,parameters){return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,parameters});});}

const $ = id => document.getElementById(id);
const canvas=$('scene'), form=$('controls');
let result=null, elapsed=0, playing=false, lastTime=0, requestID=0;
let azimuth=.35, elevation=.42, zoom=1, dragging=null;
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false}); }
catch(e){$('render-error').hidden=false;$('render-error').textContent='3D rendering needs WebGL2. Please open this page in a current desktop browser.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#a7d3e9');scene.fog=new THREE.Fog('#b6d6df',400,1800);
const camera=new THREE.PerspectiveCamera(48,1,.01,6000);
scene.add(new THREE.HemisphereLight(0xe5f5ff,0x617349,2.5));
const sun=new THREE.DirectionalLight(0xfff3df,3.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.camera.near=.1;sun.shadow.camera.far=600;sun.shadow.bias=-.0001;sun.shadow.normalBias=.002;scene.add(sun);scene.add(sun.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),new THREE.MeshStandardMaterial({color:'#718e57',roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const grid=new THREE.GridHelper(2000,200,0xaac18c,0x91a66f);grid.position.y=.006;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
const pad=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,.04,48),new THREE.MeshStandardMaterial({color:'#77868b',roughness:.9}));pad.position.y=.02;pad.receiveShadow=true;scene.add(pad);
const rail=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,1,8),new THREE.MeshStandardMaterial({color:'#c8d6dc',metalness:.8,roughness:.25}));rail.position.set(-.09,.5,0);scene.add(rail);
// Deterministic scenery gives the ground scale and parallax without remote assets.
const trunkMat=new THREE.MeshStandardMaterial({color:'#6f5940'}),leafMat=new THREE.MeshStandardMaterial({color:'#426a40',roughness:1});
let seed=83;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.25,2.5,6),trunkMat,160);
const leaves=new THREE.InstancedMesh(new THREE.ConeGeometry(1.9,5,7),leafMat,160);
const dummy=new THREE.Object3D();
for(let i=0;i<160;i++){const a=random()*Math.PI*2,r=25+random()*430,x=Math.cos(a)*r,z=Math.sin(a)*r,s=.6+random();dummy.scale.setScalar(s);dummy.position.set(x,1.25*s,z);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=4*s;dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);}
trunks.castShadow=leaves.castShadow=true;scene.add(trunks,leaves);
// Distance markers at 10 m intervals near the launch pad.
for(let i=-10;i<=10;i++){if(!i)continue;const marker=new THREE.Mesh(new THREE.BoxGeometry(.15,.6,.15),new THREE.MeshStandardMaterial({color:i%5===0?'#e8d5a1':'#91a476'}));marker.position.set(i*10,.3,5);scene.add(marker);}
const rocket=new THREE.Group(),recovery=new THREE.Group();scene.add(rocket,recovery);
const positionMarker=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:'#ec7635',depthTest:false}));positionMarker.renderOrder=5;scene.add(positionMarker);
let bodyMesh, flame, trail, canopy, cords=[], modelLength=.7, diameter=.04;
const blue=new THREE.MeshStandardMaterial({color:'#168bd1',metalness:.25,roughness:.32});
const darkBlue=new THREE.MeshStandardMaterial({color:'#1269a9',metalness:.35,roughness:.28});
const black=new THREE.MeshStandardMaterial({color:'#263a47',metalness:.6,roughness:.3});
function clearGroup(g){while(g.children.length){const child=g.children[0];g.remove(child);child.traverse(o=>{if(o.geometry)o.geometry.dispose();});}}
function mesh(geometry,material,parent=rocket){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function buildRocket(p){
 clearGroup(rocket);clearGroup(recovery);cords=[];modelLength=p.length;diameter=p.diameter;
 const L=p.length,r=p.diameter/2,cone=L*.22,body=L-cone;
 bodyMesh=mesh(new THREE.CylinderGeometry(r,r,body,48),blue);bodyMesh.position.y=-cone/2;
 const nose=mesh(new THREE.ConeGeometry(r,cone,48),darkBlue);nose.position.y=L/2-cone/2;
 const nozzle=mesh(new THREE.CylinderGeometry(r*.6,r*.85,L*.035,24),black);nozzle.position.y=-L/2+.01*L;
 for(const y of [-L*.25,L*.12]){const band=mesh(new THREE.CylinderGeometry(r*1.015,r*1.015,L*.018,48),new THREE.MeshStandardMaterial({color:'#c2e7fa',metalness:.4,roughness:.3}));band.position.y=y;}
 for(let i=0;i<4;i++){const shape=new THREE.Shape();shape.moveTo(r,-L*.17);shape.lineTo(L*.15,-L*.43);shape.lineTo(L*.15,-L*.5);shape.lineTo(r,-L*.43);shape.closePath();const fin=mesh(new THREE.ExtrudeGeometry(shape,{depth:Math.max(.002,L*.004),bevelEnabled:false}),darkBlue);fin.rotation.y=i*Math.PI/2;}
 // A curved transparent decal is physically attached to the cylindrical body.
 const faceCanvas=document.createElement('canvas');faceCanvas.width=256;faceCanvas.height=256;const ctx=faceCanvas.getContext('2d');ctx.fillStyle='#092f4c';for(const x of [75,181]){ctx.beginPath();ctx.arc(x,83,13,0,Math.PI*2);ctx.fill();}ctx.beginPath();ctx.arc(128,127,61,.18,Math.PI-.18);ctx.lineWidth=12;ctx.lineCap='round';ctx.strokeStyle='#092f4c';ctx.stroke();
 const texture=new THREE.CanvasTexture(faceCanvas);texture.colorSpace=THREE.SRGBColorSpace;
 const face=mesh(new THREE.CylinderGeometry(r*1.02,r*1.02,r*2.4,48,1,true,-.75,1.5),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));face.position.y=L*.01;
 flame=mesh(new THREE.ConeGeometry(r*.7,L*.28,16),new THREE.MeshBasicMaterial({color:'#ffb43f',transparent:true,opacity:.88}));flame.rotation.x=Math.PI;flame.position.y=-L*.64;
 canopy=mesh(new THREE.SphereGeometry(p.chute_diameter/2,32,16,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:'#f1b546',side:THREE.DoubleSide,roughness:.8}),recovery);
 for(let i=0;i<8;i++){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#eee8dc'}));recovery.add(line);cords.push(line);}
 if(trail){scene.remove(trail);trail.geometry.dispose();trail.material.dispose();}
 trail=new THREE.Line(new THREE.BufferGeometry().setFromPoints(result.trajectory.map(s=>new THREE.Vector3(s[3],s[1],0))),new THREE.LineBasicMaterial({color:'#3169aa',transparent:true,opacity:.85}));scene.add(trail);
 rail.rotation.z=-p.launch_angle*Math.PI/180;rail.position.x=-.09+.5*Math.sin(p.launch_angle*Math.PI/180);
}
function sampleAt(time){const arr=result.trajectory;let lo=0,hi=arr.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(arr[mid][0]<time)lo=mid+1;else hi=mid;}if(!lo)return arr[0];const a=arr[lo-1],b=arr[lo],f=Math.max(0,Math.min(1,(time-a[0])/(b[0]-a[0])));return a.map((v,i)=>i===0?time:v==null||b[i]==null?null:v+(b[i]-v)*f);}
function pause(){playing=false;$('play').textContent='Play flight';}
function updateScene(){if(!result)return;const s=sampleAt(elapsed),p=result.parameters,landed=elapsed>=result.flight_time_s;
 rocket.position.set(s[3],s[1],0);rocket.rotation.z=-s[6];flame.visible=elapsed<p.burn_time&&!landed;
 flame.scale.y=.95+.08*Math.sin(elapsed*80);
 recovery.visible=s[8]>.001;
 if(recovery.visible){const attachment=new THREE.Vector3(0,modelLength*.4,0).applyQuaternion(rocket.quaternion).add(rocket.position);const drift=(s[4]-p.wind)*.025;
 const center=attachment.clone().add(new THREE.Vector3(-drift,modelLength*1.7,0));canopy.position.copy(center);canopy.scale.set(Math.max(.01,s[8]),.6*Math.max(.01,s[8]),Math.max(.01,s[8]));
 for(let i=0;i<cords.length;i++){let a=i/cords.length*Math.PI*2,end=center.clone().add(new THREE.Vector3(Math.sin(a)*p.chute_diameter/2*s[8],0,Math.cos(a)*p.chute_diameter/2*s[8]));const pos=cords[i].geometry.attributes.position;pos.setXYZ(0,attachment.x,attachment.y,attachment.z);pos.setXYZ(1,end.x,end.y,end.z);pos.needsUpdate=true;cords[i].geometry.computeBoundingSphere();}}
 const target=rocket.position.clone();let distance=modelLength*(recovery.visible?6.5:3.4)*zoom;
 if($('camera').value==='overview'){target.set(result.downrange_m/2,result.apogee_m*.45,0);distance=Math.max(result.apogee_m,Math.abs(result.downrange_m),5)*1.8*zoom;}
 positionMarker.visible=$('camera').value==='overview';positionMarker.position.copy(rocket.position);positionMarker.scale.setScalar(distance*.006);
 camera.position.copy(target).add(new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)).multiplyScalar(distance));camera.position.y=Math.max(camera.position.y,.15);camera.lookAt(target);
 sun.position.copy(rocket.position).add(new THREE.Vector3(-30,70,40));sun.target.position.copy(rocket.position);
 const phase=landed?'GROUND CONTACT':s[8]>.001?(s[8]<.999?'CANOPY OPENING':'PARACHUTE DESCENT'):elapsed===0?'ON LAUNCH RAIL':elapsed<p.burn_time?'POWERED ASCENT':s[2]>0?'COAST TO APOGEE':p.recovery?'AWAITING RECOVERY':'UNRECOVERED DESCENT';
 $('phase').textContent=phase;$('height').textContent=s[1].toFixed(1)+' m';$('vertical').textContent=s[2].toFixed(1)+' m/s';$('aoa').textContent=s[5]==null?'—':s[5].toFixed(1)+'°';$('pitch').textContent=(Math.atan2(Math.sin(s[6]),Math.cos(s[6]))*180/Math.PI).toFixed(1)+'°';$('clock').textContent=elapsed.toFixed(1)+' s';$('scrub').value=elapsed/result.flight_time_s*1000;
 $('wind-readout').textContent=`Wind ${p.wind>=0?'→':'←'} ${Math.abs(p.wind).toFixed(1)} m/s · +x is downrange`;
}
function drawPlot(id,index,unit){if(!result)return;const c=$(id),dpr=Math.min(devicePixelRatio,2),w=c.clientWidth,h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);const pts=result.trajectory,min=Math.min(0,...pts.map(p=>p[index])),max=Math.max(1,...pts.map(p=>p[index]))*1.08,l=46,t=15,pw=w-l-12,ph=h-45;ctx.font='11px system-ui';ctx.fillStyle='#597482';ctx.strokeStyle='#d4e1e7';for(let i=0;i<=4;i++){let y=t+ph*i/4;ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(w-12,y);ctx.stroke();ctx.textAlign='right';ctx.fillText((max-(max-min)*i/4).toFixed(0),l-7,y+3);ctx.textAlign='center';ctx.fillText((result.flight_time_s*i/4).toFixed(1),l+pw*i/4,h-11);}ctx.fillText(unit,l,9);ctx.fillText('s',w-10,h-11);ctx.beginPath();ctx.strokeStyle=index===1?'#1686bc':'#c47831';ctx.lineWidth=2;pts.forEach((p,i)=>{let x=l+p[0]/result.flight_time_s*pw,y=t+(max-p[index])/(max-min)*ph;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();drawPlot('altitude',1,'m');drawPlot('velocity',2,'m/s');}
new ResizeObserver(resize).observe(canvas);
canvas.addEventListener('pointerdown',e=>{dragging={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!dragging)return;azimuth-=(e.clientX-dragging.x)*.008;elevation=Math.max(.05,Math.min(1.4,elevation+(e.clientY-dragging.y)*.006));dragging={x:e.clientX,y:e.clientY};});canvas.addEventListener('pointerup',()=>dragging=null);canvas.addEventListener('pointercancel',()=>dragging=null);canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.5,Math.min(20,zoom*Math.exp(e.deltaY*.001)));},{passive:false});
$('reset').onclick=()=>{azimuth=.35;elevation=.42;zoom=1;};$('camera').onchange=()=>zoom=1;
$('play').onclick=()=>{if(!result)return;if(playing){pause();return;}if(elapsed>=result.flight_time_s)elapsed=0;playing=true;$('play').textContent='Pause';};$('scrub').oninput=()=>{pause();if(result)elapsed=Number($('scrub').value)/1000*result.flight_time_s;};
form.addEventListener('submit',async e=>{e.preventDefault();pause();const id=++requestID;$('error').textContent='';$('simulate').disabled=true;const parameters=Object.fromEntries([...new FormData(form)].filter(([key])=>key!=='recovery').map(([key,value])=>[key,Number(value)]));parameters.recovery=form.elements.recovery.checked;try{const data=await calculate(id,parameters);if(id!==requestID)return;result=data;elapsed=0;zoom=1;buildRocket(data.parameters);$('play').disabled=false;$('apogee').textContent=data.apogee_m.toFixed(1)+' m';$('duration').textContent=data.flight_time_s.toFixed(1)+' s';$('landing').textContent=data.landing_speed_m_s.toFixed(1)+' m/s';$('range').textContent=data.downrange_m.toFixed(1)+' m';$('events').replaceChildren();for(const event of [{name:'Launch',time:0},{name:'Burnout',time:data.parameters.burn_time},...data.events]){if(event.time>data.flight_time_s)continue;const b=document.createElement('button');b.textContent=event.name;b.onclick=()=>{pause();elapsed=event.time;};$('events').append(b);}resize();updateScene();}catch(e){$('error').textContent=e.message+' Previous valid flight remains displayed.';}finally{if(id===requestID)$('simulate').disabled=false;}});
function animate(now){const delta=lastTime?Math.min(.1,(now-lastTime)/1000):0;lastTime=now;if(playing&&result){elapsed=Math.min(result.flight_time_s,elapsed+delta*Number($('speed').value));if(elapsed>=result.flight_time_s)pause();}updateScene();renderer.render(scene,camera);requestAnimationFrame(animate);}
resize();requestAnimationFrame(animate);form.requestSubmit();

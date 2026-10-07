(() => {
'use strict';
const A={earth:'/assets/earth/earth_atmos_2048.jpg',normal:'/assets/earth/earth_normal_2048.jpg',specular:'/assets/earth/earth_specular_2048.jpg',lights:'/assets/earth/earth_lights_2048.png',clouds:'/assets/earth/earth_clouds_1024.png',moon:'/assets/earth/moon_1024.jpg'};
const S={clouds:true,night:true,atmosphere:true,moon:true,stars:true,satellites:true,autoRotate:true};
let scene,camera,renderer,controls,earth,night,clouds,atmosphere,moon,stars,sunLight,satGroup,trajectory,locationState=null,satellites=[];
const $=id=>document.getElementById(id);
const status=(t,p)=>{$('boot-status').textContent=t;$('boot-progress').style.width=p+'%'};
const loadTexture=(loader,url)=>new Promise((resolve,reject)=>loader.load(url,resolve,undefined,reject));
const srgb=t=>{if('colorSpace' in t)t.colorSpace=THREE.SRGBColorSpace;else t.encoding=THREE.sRGBEncoding};
function earthPoint(lat,lon,r=1.025){const p=(90-lat)*Math.PI/180,t=(lon+180)*Math.PI/180;return new THREE.Vector3(r*Math.sin(p)*Math.cos(t),r*Math.cos(p),r*Math.sin(p)*Math.sin(t))}
async function init(){
 status('Preparing renderer…',8);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x02060d);
 camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.01,100);camera.position.set(0,.35,3.15);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=THREE.sRGBEncoding;
 $('globe-stage').appendChild(renderer.domElement);
 controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.055;controls.minDistance=1.35;controls.maxDistance=7;controls.enablePan=false;
 const L=new THREE.TextureLoader();status('Loading mandatory Earth assets…',25);
 const [map,norm,spec,lights,cloudMap,moonMap]=await Promise.all(Object.values(A).map(url=>loadTexture(L,url)));
 [map,lights,cloudMap,moonMap].forEach(srgb);[map,norm,spec,lights,cloudMap,moonMap].forEach(t=>t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8));
 status('Constructing real Earth…',58);
 const g=new THREE.Group();scene.add(g);
 earth=new THREE.Mesh(new THREE.SphereGeometry(1,96,96),new THREE.MeshPhongMaterial({map,normalMap:norm,normalScale:new THREE.Vector2(.55,.55),specularMap:spec,specular:new THREE.Color(0x315b77),shininess:18}));g.add(earth);
 night=new THREE.Mesh(new THREE.SphereGeometry(1.003,96,96),new THREE.ShaderMaterial({uniforms:{map:{value:lights},sun:{value:new THREE.Vector3(1,0,0)}},vertexShader:'varying vec3 vNormal;varying vec2 vUv;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D map;uniform vec3 sun;varying vec3 vNormal;varying vec2 vUv;void main(){float night=smoothstep(0.22,-0.18,dot(normalize(vNormal),normalize(sun)));vec4 c=texture2D(map,vUv);gl_FragColor=vec4(c.rgb*night*1.25,c.a*night*0.92);}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));g.add(night);
 clouds=new THREE.Mesh(new THREE.SphereGeometry(1.012,96,96),new THREE.MeshPhongMaterial({map:cloudMap,transparent:true,opacity:.68,depthWrite:false,side:THREE.DoubleSide}));g.add(clouds);
 atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.075,64,64),new THREE.MeshBasicMaterial({color:0x66bfff,transparent:true,opacity:.16,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending}));g.add(atmosphere);
 moon=new THREE.Mesh(new THREE.SphereGeometry(.12,48,48),new THREE.MeshPhongMaterial({map:moonMap,shininess:2}));scene.add(moon);
 scene.add(new THREE.AmbientLight(0x9bb6d1,.075));sunLight=new THREE.DirectionalLight(0xffffff,2.2);scene.add(sunLight);
 const points=[];for(let i=0;i<4200;i++){const r=35+Math.random()*45,a=Math.random()*Math.PI*2,b=Math.acos(2*Math.random()-1);points.push(r*Math.sin(b)*Math.cos(a),r*Math.sin(b)*Math.sin(a),r*Math.cos(b))}
 stars=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xdceeff,size:.035,sizeAttenuation:true,transparent:true,opacity:.8}));stars.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(stars);
 satGroup=new THREE.Group();scene.add(satGroup);
 wire();restoreLocation();status('Planetary renderer ready',100);setTimeout(()=>{$('boot-screen').style.opacity='0';setTimeout(()=>$('boot-screen').remove(),650)},350);addEventListener('resize',resize);addEventListener('hashchange',hashView);hashView();loadSatellites('stations');animate();
}
function wire(){
 document.querySelectorAll('.layer').forEach(button=>button.onclick=()=>{const key=button.dataset.layer;S[key]=!S[key];button.classList.toggle('active',S[key]);const object={clouds,night,atmosphere,moon,stars,satellites:satGroup}[key];if(object)object.visible=S[key]});
 $('auto-rotate').onclick=()=>{S.autoRotate=!S.autoRotate;$('auto-rotate').classList.toggle('active',S.autoRotate);$('auto-rotate').querySelector('b').textContent=S.autoRotate?'ON':'OFF'};
 $('reset-view').onclick=resetView;$('locate-globe').onclick=requestLocation;$('close-satellites').onclick=()=>{location.hash='';$('satellite-drawer').classList.remove('open')};
 $('reload-satellites').onclick=()=>loadSatellites($('sat-group').value);$('sat-group').onchange=e=>loadSatellites(e.target.value);
 renderer.domElement.addEventListener('dblclick',resetView);document.addEventListener('click',event=>{const row=event.target.closest('.sat-row');if(row)selectSatellite(row.dataset.norad)});
}
function hashView(){const open=location.hash==='#satellites';$('satellite-drawer').classList.toggle('open',open);$('satellite-drawer').setAttribute('aria-hidden',String(!open));if(open)loadSatellites($('sat-group').value)}
function resetView(){camera.position.set(0,.35,3.15);controls.target.set(0,0,0);controls.update()}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2))}
function restoreLocation(){try{const raw=sessionStorage.getItem('3dearth-location');if(raw)applyLocation(JSON.parse(raw))}catch(_){}}
function requestLocation(){if(!navigator.geolocation){alert('This browser does not provide device geolocation.');return}$('observer-label').textContent='Requesting device position…';navigator.geolocation.getCurrentPosition(position=>{const loc={lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};try{sessionStorage.setItem('3dearth-location',JSON.stringify(loc))}catch(_){}applyLocation(loc)},error=>{$('observer-label').textContent=error.code===1?'Location permission denied':'Location unavailable'},{enableHighAccuracy:true,maximumAge:0,timeout:15000})}
async function applyLocation(loc){
 locationState=loc;$('observer-label').textContent=loc.lat.toFixed(5)+'°, '+loc.lon.toFixed(5)+'°';$('observer-accuracy').textContent='Device-reported accuracy: '+Math.round(loc.accuracy)+' m';
 const url=new URL('/api/weather',location.origin);url.searchParams.set('latitude',loc.lat);url.searchParams.set('longitude',loc.lon);url.searchParams.set('current','temperature_2m');url.searchParams.set('daily','sunrise,sunset');url.searchParams.set('timezone','auto');url.searchParams.set('forecast_days','1');
 try{const data=await fetch(url).then(response=>response.json());const timezone=data.timezone||'UTC';$('timezone-name').textContent=timezone;updateClock(timezone);if(data.daily?.sunrise?.[0]&&data.daily?.sunset?.[0])$('daylight-window').textContent=new Date(data.daily.sunrise[0]).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'–'+new Date(data.daily.sunset[0]).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}catch(_){$('timezone-name').textContent='Timezone unavailable'}
}
function updateClock(timezone){const now=new Date();$('utc-clock').textContent='UTC '+now.toISOString().slice(11,19);try{$('local-clock').textContent=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'medium',timeZone:timezone||'UTC'}).format(now)}catch(_){$('local-clock').textContent='UTC time'}}
function updateAstronomy(now){
 const sun=PlanetAstronomy.sunDirection(now);night.material.uniforms.sun.value.copy(sun);
 const days=(now.getTime()/86400000+2440587.5-2451545)/365.25,angle=(days*2*Math.PI)%(2*Math.PI);moon.position.set(Math.cos(angle)*2.8,.35+Math.sin(angle*.5)*.5,Math.sin(angle)*2.8);sunLight.position.copy(sun).multiplyScalar(5);
 if(locationState){const info=PlanetAstronomy.solar(now,locationState.lat,locationState.lon);$('solar-state').textContent=info.altitude>=0?'DAYLIGHT':'NIGHT';$('sun-altitude').textContent=info.altitude.toFixed(1)+'°'}else{$('solar-state').textContent='UTC GEOMETRY';$('sun-altitude').textContent='—'}
}
function loadScript(url){return new Promise((resolve,reject)=>{if(window.satellite)return resolve();const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)})}
async function loadSatellites(group){
 $('sat-source').textContent='Loading current CelesTrak orbital elements…';
 try{await loadScript('/vendor/satellite.min.js');const response=await fetch('/api/satellites?group='+encodeURIComponent(group));const data=await response.json();satellites=data.items||data||[];satGroup.clear();trajectory=null;
 satellites.slice(0,80).forEach(item=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(.012,8,8),new THREE.MeshBasicMaterial({color:0x9fdcff}));dot.userData=item;dot.name=item.name;item._mesh=dot;satGroup.add(dot)});
 $('sat-source').textContent=(data.source||'CelesTrak')+' · '+satellites.length+' current objects · fetched '+new Date(data.ts||Date.now()).toLocaleTimeString();renderSatList();
 }catch(_){$('sat-source').textContent='Satellite data unavailable; Earth rendering continues normally.';$('sat-list').innerHTML='<div class="source-note">No live orbital feed was returned.</div>'}
}
function renderSatList(){const list=$('sat-list');list.innerHTML='';satellites.slice(0,80).forEach(item=>{const row=document.createElement('article');row.className='sat-row';row.dataset.norad=item.norad||'';row.innerHTML='<strong>'+escapeHtml(item.name||'Unnamed object')+'</strong><div class="sat-meta"><span>NORAD '+escapeHtml(String(item.norad||'—'))+'</span><span>'+escapeHtml(item.type||'PAYLOAD')+'</span></div>';list.appendChild(row)})}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
async function selectSatellite(norad){
 const item=satellites.find(value=>String(value.norad)===String(norad));if(!item)return;
 const row=[...document.querySelectorAll('.sat-row')].find(value=>value.dataset.norad===String(norad));if(row&&!row.querySelector('.sat-detail')){const detail=document.createElement('div');detail.className='sat-detail';detail.textContent='Loading catalog metadata…';row.appendChild(detail);fetch('/api/satellites/'+encodeURIComponent(norad)).then(response=>response.json()).then(meta=>{detail.innerHTML='<b>Owner:</b> '+escapeHtml(meta.OWNER||'Not listed')+' · <b>Launch:</b> '+escapeHtml(meta.LAUNCH_DATE||'Not listed')+' · <b>Period:</b> '+escapeHtml(String(meta.PERIOD??'—'))+' min · <b>Inclination:</b> '+escapeHtml(String(meta.INCLINATION??'—'))+'° · <b>Apogee:</b> '+escapeHtml(String(meta.APOGEE??'—'))+' km · <b>Perigee:</b> '+escapeHtml(String(meta.PERIGEE??'—'))+' km'}).catch(()=>{detail.textContent='Catalog metadata unavailable.'})}
 drawTrajectory(item);
}
function drawTrajectory(item){if(trajectory){satGroup.remove(trajectory);trajectory=null}if(!window.satellite||!item.tle1)return;const record=satellite.twoline2satrec(item.tle1,item.tle2),points=[];for(let minutes=-45;minutes<=45;minutes++){const date=new Date(Date.now()+minutes*60000),state=satellite.propagate(record,date);if(!state?.position)continue;const geo=satellite.eciToGeodetic(state.position,satellite.gstime(date));points.push(earthPoint(geo.latitude*180/Math.PI,geo.longitude*180/Math.PI,1.035))}trajectory=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x75c9ff,transparent:true,opacity:.65}));satGroup.add(trajectory)}
function updateSatellites(now){if(!window.satellite)return;const gmst=satellite.gstime(now);for(const item of satellites){if(!item._mesh||!item.tle1)continue;try{const record=satellite.twoline2satrec(item.tle1,item.tle2),state=satellite.propagate(record,now);if(!state?.position)continue;const geo=satellite.eciToGeodetic(state.position,gmst);item._mesh.position.copy(earthPoint(geo.latitude*180/Math.PI,geo.longitude*180/Math.PI,1.055));if(state.velocity){const speed=Math.sqrt(state.velocity.x**2+state.velocity.y**2+state.velocity.z**2);item._mesh.scale.setScalar(Math.min(3,Math.max(1,speed/2)))}}catch(_){}}}
let last=performance.now(),frames=0,stamp=last,lastSat=0,lastClock=0;
function animate(now=performance.now()){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;frames++;if(now-stamp>1000){$('fps-state').textContent=Math.round(frames*1000/(now-stamp))+' FPS';frames=0;stamp=now}const date=new Date();if(now-lastClock>1000){updateAstronomy(date);if(locationState)updateClock(document.getElementById('timezone-name').textContent);else updateClock('UTC');lastClock=now}if(now-lastSat>1000){updateSatellites(date);lastSat=now}if(S.autoRotate)earth.rotation.y+=dt*.018;clouds.rotation.y+=dt*.025;stars.rotation.y-=dt*.001;controls.update();renderer.render(scene,camera)}
init().catch(error=>{$('boot-status').textContent='Earth renderer failed to initialize.';console.error(error)});
})();
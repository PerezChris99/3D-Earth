(() => {
'use strict';
const A={earth:'/assets/earth/earth_atmos_2048.jpg',normal:'/assets/earth/earth_normal_2048.jpg',specular:'/assets/earth/earth_specular_2048.jpg',clouds:'/assets/earth/earth_clouds_1024.png',moon:'/assets/earth/moon_1024.jpg'};
const S={clouds:true,atmosphere:true,moon:true,stars:true,satellites:true,autoRotate:true};
let scene,camera,renderer,controls,earthGroup,earth,clouds,atmosphere,moon,stars,sunLight,sunMesh,satGroup,dataMarkerGroup,trajectory,selectedMarker,locationState=null,satellites=[],selectedNorad=null,focusedNorad=null,focusDistance=3.15,lastFocusAt=Date.now(),gltfLoader=null,dataLayerItems=[],dataLayerMeta=[],databaseSatelliteCatalog=[],activeDataSectors=new Set(['wildfires','volcanoes','oceans','weather','earthquakes','severe_weather','other_events','telemetry_samples','earth_observation_products','volcano_alerts']);
const $=id=>document.getElementById(id);let satelliteLoadToken=0,selectedPassCache=null,selectedPassAt=0;
const status=(t,p)=>{$('boot-status').textContent=t;$('boot-progress').style.width=p+'%'};
const loadTexture=(loader,url)=>new Promise((resolve,reject)=>loader.load(url,resolve,undefined,reject));
const srgb=t=>{if('colorSpace' in t&&THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;else if('encoding' in t)t.encoding=THREE.sRGBEncoding};
function fallbackTexture(kind){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');
 if(kind==='earth'){c.fillStyle='#123f63';c.fillRect(0,0,1024,512);c.fillStyle='#4d775d';const shapes=[[[70,130],[105,95],[165,105],[205,145],[188,185],[150,210],[125,270],[98,238],[82,190]],[[210,260],[250,275],[275,330],[260,400],[225,455],[205,390],[190,320]],[[405,110],[470,90],[520,118],[560,150],[530,190],[480,185],[450,220],[420,175]],[[450,205],[500,220],[525,285],[505,355],[480,415],[455,345],[430,280]],[[535,100],[600,75],[700,95],[780,135],[820,180],[760,205],[700,185],[650,220],[590,170]],[[700,230],[755,245],[785,290],[755,330],[725,300]],[[835,320],[890,300],[930,330],[915,370],[865,390]]];for(const s of shapes){c.beginPath();s.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fill()}c.strokeStyle='rgba(175,215,232,.15)';c.lineWidth=1;for(let x=0;x<=1024;x+=64){c.beginPath();c.moveTo(x,0);c.lineTo(x,512);c.stroke()}for(let y=0;y<=512;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(1024,y);c.stroke()}}
 else if(kind==='normal'){c.fillStyle='rgb(128,128,255)';c.fillRect(0,0,1024,512)}
 else if(kind==='specular'){c.fillStyle='#101820';c.fillRect(0,0,1024,512)}
 else if(kind==='clouds'){c.clearRect(0,0,1024,512);c.fillStyle='rgba(255,255,255,.18)';for(let i=0;i<70;i++){const x=(i*137)%1024,y=(i*71)%512;c.beginPath();c.ellipse(x,y,18+(i%7)*7,3+(i%4)*3,(i%6)*.2,0,Math.PI*2);c.fill()}}
 else{c.fillStyle='#777d80';c.fillRect(0,0,1024,512);c.fillStyle='#60686d';for(let i=0;i<180;i++){const x=(i*83)%1024,y=(i*47)%512;c.beginPath();c.arc(x,y,3+(i%11),0,Math.PI*2);c.fill()}}
 const t=new THREE.CanvasTexture(canvas);srgb(t);return t;
}
async function loadTextureSafe(loader,url,kind){try{return await loadTexture(loader,url)}catch(error){console.warn('Earth asset unavailable; using local fallback:',url,error);return fallbackTexture(kind)}}
function earthPoint(lat,lon,r=1.025){const p=(90-lat)*Math.PI/180,t=(lon+180)*Math.PI/180;return new THREE.Vector3(r*Math.sin(p)*Math.cos(t),r*Math.cos(p),r*Math.sin(p)*Math.sin(t))}
async function init(){
 status('Preparing renderer…',8);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x02060d);
 camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.01,100);camera.position.set(0,.35,innerWidth<=760?4.55:3.15);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=THREE.sRGBEncoding;
 $('globe-stage').appendChild(renderer.domElement);
 controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.055;controls.minDistance=1.35;controls.maxDistance=7;controls.enablePan=false;controls.target.set(0,0,0);controls.autoRotate=false;
 const L=new THREE.TextureLoader();status('Loading mandatory Earth assets…',25);
 const [map,norm,spec,cloudMap,moonMap]=await Promise.all(Object.entries(A).map(([kind,url])=>loadTextureSafe(L,url,kind)));
 [map,cloudMap,moonMap].forEach(srgb);[map,norm,spec,cloudMap,moonMap].forEach(t=>t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8));
 status('Constructing real Earth…',58);
 earthGroup=new THREE.Group();scene.add(earthGroup);
 earth=new THREE.Mesh(new THREE.SphereGeometry(1,96,96),new THREE.MeshPhongMaterial({map,normalMap:norm,normalScale:new THREE.Vector2(.55,.55),specularMap:spec,specular:new THREE.Color(0x315b77),shininess:18}));earthGroup.add(earth);
 clouds=new THREE.Mesh(new THREE.SphereGeometry(1.012,96,96),new THREE.MeshPhongMaterial({map:cloudMap,transparent:true,opacity:.68,depthWrite:false,side:THREE.DoubleSide}));earthGroup.add(clouds);
 atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.075,96,96),new THREE.ShaderMaterial({uniforms:{sun:{value:new THREE.Vector3(1,0,0)},cameraPos:{value:new THREE.Vector3()}},vertexShader:'varying vec3 vWorldNormal;varying vec3 vWorldPos;void main(){vWorldNormal=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.0);vWorldPos=wp.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 sun;uniform vec3 cameraPos;varying vec3 vWorldNormal;varying vec3 vWorldPos;void main(){vec3 view=normalize(cameraPos-vWorldPos);float rim=pow(1.0-max(dot(normalize(vWorldNormal),view),0.0),3.2);float day=max(dot(normalize(vWorldNormal),normalize(sun)),0.0);float glow=rim*(0.35+0.65*day);gl_FragColor=vec4(vec3(0.22,0.55,1.0)*glow,glow*.42);}',transparent:true,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending}));earthGroup.add(atmosphere);
 moon=new THREE.Mesh(new THREE.SphereGeometry(.12,48,48),new THREE.MeshPhongMaterial({map:moonMap,shininess:2}));scene.add(moon);
 scene.add(new THREE.AmbientLight(0x9bb6d1,.035));sunLight=new THREE.DirectionalLight(0xffffff,2.35);scene.add(sunLight);sunMesh=new THREE.Mesh(new THREE.SphereGeometry(.085,24,24),new THREE.MeshBasicMaterial({color:0xfff1b0}));scene.add(sunMesh);
 const points=[];for(let i=0;i<4200;i++){const r=35+Math.random()*45,a=Math.random()*Math.PI*2,b=Math.acos(2*Math.random()-1);points.push(r*Math.sin(b)*Math.cos(a),r*Math.sin(b)*Math.sin(a),r*Math.cos(b))}
 stars=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xdceeff,size:.035,sizeAttenuation:true,transparent:true,opacity:.8}));stars.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(stars);
 satGroup=new THREE.Group();earthGroup.add(satGroup);dataMarkerGroup=new THREE.Group();earthGroup.add(dataMarkerGroup);
 wire();restoreLocation();loadObservatorySummary();status('Planetary renderer ready',100);setTimeout(()=>{$('boot-screen').style.opacity='0';setTimeout(()=>$('boot-screen').remove(),650)},350);addEventListener('resize',()=>{if(!focusedNorad&&innerWidth<=760&&camera.position.length()<3.8)camera.position.set(0,.35,4.55);resize()});addEventListener('hashchange',hashView);hashView();loadSatellites('all');animate();
}
async function loadObservatorySummary(){
 const results=await Promise.allSettled([fetch('/api/observatory/summary'),fetch('/api/observatory/layers')]);
 if(results[0].status==='fulfilled'&&results[0].value.ok){try{const summary=await results[0].value.json();databaseSatelliteCatalog=Array.isArray(summary.satellites)?summary.satellites:[];mergeDatabaseSatelliteCatalog();const sampleCount=Array.isArray(summary.samples)?summary.samples.length:0;$('system-state').title='Supabase connected · '+databaseSatelliteCatalog.length+' satellite catalog records · '+sampleCount+' telemetry samples in the current sample window'}catch(_){}}
 if(results[1].status==='fulfilled'&&results[1].value.ok){try{const data=await results[1].value.json();installObservatoryLayers(data);$('system-state').textContent='SUPABASE · '+data.count+' GEO FEATURES · '+data.layers.length+' DATA LAYERS'+(data.partial?' · PARTIAL DATA':'');$('system-state').title='Database-backed geographic observations are displayed on the globe'}catch(_){$('system-state').textContent='DATABASE LAYERS UNAVAILABLE'}}
 else if(results[0].status!=='fulfilled'||!results[0].value.ok){$('system-state').textContent='PLANETARY VIEW · DATABASE OFFLINE'}
}
function mergeDatabaseSatelliteCatalog(){const byNorad=new Map(databaseSatelliteCatalog.filter(row=>row.norad_id!=null).map(row=>[String(row.norad_id),row]));satellites.forEach(item=>{const record=byNorad.get(String(item.norad));if(!record)return;item.databaseRecord=record;item.databaseOwner=record.owner_country;item.databaseOperator=record.operator;item.databaseType=record.object_type});if(satellites.length)renderSatList()}
function installObservatoryLayers(data){
 dataLayerItems=Array.isArray(data.items)?data.items:[];dataLayerMeta=Array.isArray(data.layers)?data.layers:[];dataLayerItems.sort((a,b)=>new Date(b.observed_at||0)-new Date(a.observed_at||0));
 dataMarkerGroup.clear();const geometry=new THREE.SphereGeometry(.012,8,8);
 const colors={wildfires:0xff754f,volcanoes:0xffc45e,oceans:0x57c9ff,weather:0x8de2b4,earthquakes:0xff657a,severe_weather:0xc09cff,other_events:0xe6a6ff,telemetry_samples:0xb9c4d3,earth_observation_products:0xffdf7b,volcano_alerts:0xffc45e};
 const materials={};Object.entries(colors).forEach(([key,color])=>materials[key]=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92}));
 dataLayerItems.forEach(item=>{
  const lat=Number(item.latitude),lon=Number(item.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
  const marker=new THREE.Mesh(geometry,materials[item.sector]||materials.weather);marker.position.copy(earthPoint(lat,lon,1.014));
  marker.userData={kind:'observation',item};marker.visible=activeDataSectors.has(item.sector);item._marker=marker;dataMarkerGroup.add(marker);
 });
 dataLayerMeta.forEach(layer=>{const count=$('count-'+layer.sector);if(count)count.textContent=String(layer.loaded_count??layer.count??0);});
 const total=$('data-layer-total');if(total)total.textContent=String(dataLayerItems.length);
 const statusText=$('data-layer-status');if(statusText)statusText.textContent=dataLayerItems.length+' database-backed observations · '+(data.source||'Supabase')+' · updated '+new Date(data.ts||Date.now()).toLocaleTimeString();
 const list=$('data-layer-list');if(list){list.innerHTML='';dataLayerItems.slice(0,14).forEach(item=>{const row=document.createElement('button');row.type='button';row.className='data-layer-row';row.dataset.observationId=String(item.id);row.textContent=(item.label||item.sector)+' · '+(item.metric||item.sector)+' '+(item.value??'')+' '+(item.unit||'');list.appendChild(row)});}
}
function selectObservation(id){
 const item=dataLayerItems.find(value=>String(value.id)===String(id));if(!item)return;
 const detail=$('data-observation-detail');detail.hidden=false;
 const fields=[['Observation',item.label],['Layer',item.sector],['Measurement',String(item.value??'Not reported')+' '+(item.unit||'')],['Metric',item.metric||'Not specified'],['Observed',item.observed_at?new Date(item.observed_at).toLocaleString():'Time not supplied'],['Quality',item.quality_status||'Unspecified'],['Source',item.source_name||item.provider||'Not listed']];
 detail.innerHTML='';fields.forEach(([label,value])=>{const line=document.createElement('p'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=label;span.textContent=String(value);line.append(strong,span);detail.appendChild(line)});
 const marker=item._marker;if(marker)controls.target.lerp(marker.position,.35);
}
document.addEventListener('click',event=>{const row=event.target.closest('.data-layer-row');if(row)selectObservation(row.dataset.observationId)});
function wire(){
 $('locate-globe').onclick=openLocationDialog;
 $('toggle-planet-panel').onclick=()=>{const panel=$('planet-panel'),collapsed=panel.classList.toggle('panel-collapsed'),button=$('toggle-planet-panel');button.textContent=collapsed?'⌄':'⌃';button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Expand observer panel':'Collapse observer panel')};
 $('cancel-location').onclick=()=> $('location-dialog')?.close();
 $('confirm-location').onclick=()=>{ $('location-dialog')?.close();requestLocation() };
 $('close-satellites').onclick=()=>{location.hash='';$('satellite-drawer').classList.remove('open');$('satellite-drawer').setAttribute('aria-hidden','true');resetView()};
 $('reload-satellites').onclick=()=>loadSatellites($('sat-group').value);
 $('sat-group').onchange=e=>loadSatellites(e.target.value);
 $('data-layers-toggle').onclick=()=>{const drawer=$('data-layer-drawer'),opening=!drawer.classList.contains('open');drawer.classList.toggle('open',opening);drawer.setAttribute('aria-hidden',String(!opening));$('data-layers-toggle').setAttribute('aria-expanded',String(opening));$('satellite-drawer').classList.remove('open')};
 $('close-data-layers').onclick=()=>{$('data-layer-drawer').classList.remove('open');$('data-layer-drawer').setAttribute('aria-hidden','true');$('data-layers-toggle').setAttribute('aria-expanded','false')};
 document.querySelectorAll('[data-sector]').forEach(button=>button.addEventListener('click',()=>{
  const sector=button.dataset.sector;if(activeDataSectors.has(sector))activeDataSectors.delete(sector);else activeDataSectors.add(sector);
  button.classList.toggle('active',activeDataSectors.has(sector));button.setAttribute('aria-pressed',String(activeDataSectors.has(sector)));
  dataLayerItems.forEach(item=>{if(item._marker)item._marker.visible=activeDataSectors.has(item.sector)});
 }));
 renderer.domElement.addEventListener('dblclick',resetView);
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart=null;
 renderer.domElement.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY}});
 renderer.domElement.addEventListener('pointerup',event=>{
  if(!pointerStart)return;const moved=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y);pointerStart=null;if(moved>7)return;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects([...satGroup.children,...dataMarkerGroup.children],true);
  for(const hit of hits){let object=hit.object;while(object&&object!==satGroup&&object!==dataMarkerGroup&&!object.userData?.kind)object=object.parent;
   if(object?.userData?.kind==='satellite'){const item=object.userData.item;if(item){selectedHit=true;$('satellite-drawer').classList.add('open');$('satellite-drawer').setAttribute('aria-hidden','false');$('data-layer-drawer').classList.remove('open');selectSatellite(item.norad);return}}
   if(object?.userData?.kind==='observation'){const item=object.userData.item;if(item){selectedHit=true;$('data-layer-drawer').classList.add('open');$('data-layer-drawer').setAttribute('aria-hidden','false');$('satellite-drawer').classList.remove('open');selectObservation(item.id);return}}
  }
  if(!selectedHit&&focusedNorad)resetView();
 });
 document.addEventListener('click',event=>{const row=event.target.closest('.sat-row');if(row)selectSatellite(row.dataset.norad)});
}
function hashView(){const open=location.hash==='#satellites';$('satellite-drawer').classList.toggle('open',open);$('satellite-drawer').setAttribute('aria-hidden',String(!open));if(open){const requested=new URL(location.href).searchParams.get('satellite');loadSatellites(requested?'all':$('sat-group').value).then(()=>{if(requested)selectSatellite(requested)})}}
function resetView(){focusedNorad=null;selectedNorad=null;controls.autoRotate=false;camera.position.set(0,.35,innerWidth<=760?4.55:3.15);controls.target.set(0,0,0);controls.update();renderSatList()}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2))}
function restoreLocation(){try{const raw=sessionStorage.getItem('3dearth-location');if(raw)applyLocation(JSON.parse(raw))}catch(_){}}
function openLocationDialog(){const dialog=$('location-dialog');if(dialog&&typeof dialog.showModal==='function')dialog.showModal();else requestLocation()}
function requestLocation(){const note=$('location-dialog-status');if(!navigator.geolocation){if(note)note.textContent='This browser does not provide device geolocation. The globe remains available.';$('observer-coordinates').textContent='Location not supported';return}$('observer-coordinates').textContent='Requesting device position…';if(note)note.textContent='Waiting for browser permission…';navigator.geolocation.getCurrentPosition(position=>{const loc={lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy,altitude:position.coords.altitude,altitudeAccuracy:position.coords.altitudeAccuracy,timestamp:position.timestamp};try{sessionStorage.setItem('3dearth-location',JSON.stringify(loc))}catch(_){}if(note)note.textContent='Location received for this browser session.';applyLocation(loc)},error=>{const message=error.code===1?'Location permission denied. You can keep using the globe without it.':error.code===2?'The device could not determine a location.':'The location request timed out.';$('observer-coordinates').textContent=message;if(note)note.textContent=message},{enableHighAccuracy:true,maximumAge:0,timeout:15000})}
async function updateObserverDetails(loc){
 $('observer-astro-coordinates').textContent=loc.lat.toFixed(5)+'°, '+loc.lon.toFixed(5)+'°';
 $('observer-place').textContent='Resolving place…';$('observer-isp').textContent='Checking public-IP network…';
 $('observer-altitude').textContent=Number.isFinite(loc.altitude)?(loc.altitude>=0?loc.altitude.toFixed(0)+' m above sea level':Math.abs(loc.altitude).toFixed(0)+' m below sea level'):'Not provided by device';
 const tasks=await Promise.allSettled([
  fetch('/api/geocode/reverse?lat='+encodeURIComponent(loc.lat)+'&lon='+encodeURIComponent(loc.lon),{signal:AbortSignal.timeout(11000)}).then(r=>{if(!r.ok)throw new Error('Reverse geocoding unavailable');return r.json()}),
  fetch('/api/geocode/network',{signal:AbortSignal.timeout(6000)}).then(r=>{if(!r.ok)throw new Error('Network lookup unavailable');return r.json()})
 ]);
 if(tasks[0].status==='fulfilled'){const a=tasks[0].value.address||{},place=a.city||a.town||a.village||a.municipality||a.suburb||a.county||a.state||'Place name unavailable',region=a.state||a.region||a.county;$('observer-place').textContent=[place,region&&region!==place?a.country||region:null].filter(Boolean).join(', ');$('observer-label').textContent=place}else $('observer-place').textContent='Place name unavailable';
 if(tasks[1].status==='fulfilled'){const n=tasks[1].value;$('observer-isp').textContent=n.isp||n.organization||'ISP unavailable';$('observer-isp').title=[n.city,n.region,n.country].filter(Boolean).join(', ')+' · approximate public-IP network data'}else $('observer-isp').textContent='ISP estimate unavailable';
}
async function applyLocation(loc){
 locationState=loc;$('observer-coordinates').textContent=loc.lat.toFixed(5)+'°, '+loc.lon.toFixed(5)+'°';$('observer-accuracy').textContent='Device-reported accuracy: '+(Number.isFinite(loc.accuracy)?Math.round(loc.accuracy)+' m':'unavailable');
 updateObserverDetails(loc).catch(error=>console.warn('Observer details unavailable',error));
 const url=new URL('/api/weather',location.origin);url.searchParams.set('latitude',loc.lat);url.searchParams.set('longitude',loc.lon);url.searchParams.set('current','temperature_2m');url.searchParams.set('daily','sunrise,sunset');url.searchParams.set('timezone','auto');url.searchParams.set('forecast_days','1');
 try{const data=await fetch(url).then(response=>response.json());const timezone=data.timezone||'UTC';$('timezone-name').textContent=timezone;updateClock(timezone);if(data.daily?.sunrise?.[0]&&data.daily?.sunset?.[0])$('daylight-window').textContent=new Date(data.daily.sunrise[0]).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'–'+new Date(data.daily.sunset[0]).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}catch(_){$('timezone-name').textContent='Timezone unavailable'}
}
function updateClock(timezone){const now=new Date();$('utc-clock').textContent='UTC '+now.toISOString().slice(11,19);try{$('local-clock').textContent=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'medium',timeZone:timezone||'UTC'}).format(now)}catch(_){$('local-clock').textContent='UTC time'}}
function updateAstronomy(now){
 const solar=PlanetAstronomy.solar(now,0,0);const sun=earthPoint(solar.subLat,solar.subLon,1).normalize();if(earthGroup)sun.applyQuaternion(earthGroup.quaternion);if(atmosphere?.material?.uniforms?.sun)atmosphere.material.uniforms.sun.value.copy(sun);
 const days=(now.getTime()/86400000+2440587.5-2451545)/365.25,angle=(days*2*Math.PI)%(2*Math.PI);moon.position.set(Math.cos(angle)*2.8,.35+Math.sin(angle*.5)*.5,Math.sin(angle)*2.8);sunLight.position.copy(sun).multiplyScalar(5);
 if(locationState){const info=PlanetAstronomy.solar(now,locationState.lat,locationState.lon);$('solar-state').textContent=info.altitude>=0?'DAYLIGHT':'NIGHT';$('sun-altitude').textContent=info.altitude.toFixed(1)+'°'}else{$('solar-state').textContent='UTC GEOMETRY';$('sun-altitude').textContent='—'}
}
function loadScript(url){return new Promise((resolve,reject)=>{if(window.satellite)return resolve();const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)})}
const SPACECRAFT_MODELS={
 "25544":"https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/International%20Space%20Station%20(ISS)%20(D)%20(IGOAL)/International%20Space%20Station%20(ISS)%20(D)%20(IGOAL).glb",
 "39084":"https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Landsat%208/Landsat%208.glb",
 "25994":"https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Terra/Terra.glb",
 "20580":"https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Hubble%20Space%20Telescope%20(B)/Hubble%20Space%20Telescope%20(B).glb"
};
function satelliteIconTexture(item){const c=document.createElement('canvas');c.width=96;c.height=96;const ctx=c.getContext('2d');ctx.clearRect(0,0,96,96);ctx.translate(48,48);ctx.lineWidth=3;ctx.strokeStyle='#dce7ef';ctx.fillStyle='#aebbc5';const name=String(item.name||'').toUpperCase(),type=String(item.type||'').toLowerCase();const starlink=/STARLINK/.test(name);const station=/STATION|ISS/.test(name)||type.includes('station');const weather=/WEATHER|NOAA|GOES|METEOSAT|HIMAWARI/.test(name)||type.includes('weather');const gps=/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU/.test(name)||type.includes('navigation');if(station){ctx.fillRect(-15,-10,30,20);ctx.strokeRect(-15,-10,30,20);ctx.fillRect(-43,-7,25,14);ctx.strokeRect(-43,-7,25,14);ctx.fillRect(18,-7,25,14);ctx.strokeRect(18,-7,25,14);ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke();}else if(starlink){ctx.fillRect(-14,-8,28,16);ctx.strokeRect(-14,-8,28,16);ctx.fillRect(-44,-5,27,10);ctx.fillRect(17,-5,27,10);ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(0,-27);ctx.lineTo(10,-34);ctx.stroke();ctx.beginPath();ctx.arc(12,-35,7,-.8,1.8);ctx.stroke();}else if(weather){ctx.fillRect(-12,-12,24,24);ctx.strokeRect(-12,-12,24,24);ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.stroke();ctx.fillRect(-43,-4,28,8);ctx.fillRect(15,-4,28,8);}else if(gps){ctx.fillRect(-10,-13,20,26);ctx.strokeRect(-10,-13,20,26);ctx.fillRect(-42,-5,29,10);ctx.fillRect(13,-5,29,10);ctx.beginPath();ctx.moveTo(0,13);ctx.lineTo(0,32);ctx.stroke();}else{ctx.fillRect(-12,-9,24,18);ctx.strokeRect(-12,-9,24,18);ctx.fillRect(-42,-5,28,10);ctx.fillRect(14,-5,28,10);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(0,-28);ctx.stroke();}const t=new THREE.CanvasTexture(c);srgb(t);return t}function makeSatelliteModel(item){const material=new THREE.SpriteMaterial({map:satelliteIconTexture(item),transparent:true,depthTest:true,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.scale.set(.075,.075,1);sprite.userData.icon=true;return sprite}
function loadAuthoritativeModel(item,placeholder){
 const url=SPACECRAFT_MODELS[String(item.norad)];
 if(!url||!THREE.GLTFLoader)return;
 if(!gltfLoader)gltfLoader=new THREE.GLTFLoader();
 gltfLoader.load(url,gltf=>{
   const model=gltf.scene;
   model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false}});
   model.scale.setScalar(0.035);
   model.rotation.set(0,0,0);
   placeholder.clear();placeholder.add(model);
   item._visualModel='NASA_3D_RESOURCE';
   item._visualSource=url;
 },undefined,()=>{item._visualModel='REALISTIC_SATELLITE_ICON'});
}
async function loadSatellites(group){
 const token=++satelliteLoadToken;$('sat-source').textContent='Loading satellite orbital elements…';
 if(!window.satellite)loadScript('https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js').catch(()=>{});
 const merged=new Map();satGroup.clear();trajectory=null;selectedMarker=null;
 const refreshMarkers=(rows,source)=>{
  if(token!==satelliteLoadToken)return;rows.forEach(item=>{if(item&&item.norad!=null)merged.set(String(item.norad),item)});
  satellites=[...merged.values()];mergeDatabaseSatelliteCatalog();
  satellites.forEach(item=>{if(item._mesh&&item._mesh.parent===satGroup)return;const model=makeSatelliteModel(item);model.userData={kind:'satellite',item,norad:item.norad,icon:true};model.name=item.name;item._mesh=model;satGroup.add(model);loadAuthoritativeModel(item,model)});
  $('sat-source').textContent=(source||'CelesTrak GP · SGP4')+' · '+satellites.length+' objects loaded progressively · calculating positions…';renderSatList();
 };
 try{
  if(group==='all'){
   const limits={stations:100,weather:80,'gps-ops':100,science:80,starlink:140},groups=Object.keys(limits);
   const results=await Promise.allSettled(groups.map(value=>fetch('/api/satellites?group='+value,{signal:AbortSignal.timeout(16000)}).then(r=>{if(!r.ok)throw new Error(value+' feed unavailable');return r.json()}).then(data=>{refreshMarkers((data.items||data||[]).slice(0,limits[value]),data.source||'CelesTrak GP · SGP4');return data})));
   if(token!==satelliteLoadToken)return;const failures=results.filter(r=>r.status==='rejected').length;if(!merged.size)throw new Error('No satellite group returned data');
   $('sat-source').textContent='CelesTrak GP · SGP4 · '+satellites.length+' current objects'+(failures?' · '+failures+' groups unavailable':'')+' · click a marker to inspect';
  }else{
   const response=await fetch('/api/satellites?group='+encodeURIComponent(group),{signal:AbortSignal.timeout(16000)});if(!response.ok)throw new Error('Satellite group unavailable');
   const data=await response.json();refreshMarkers((data.items||data||[]).slice(0,500),data.source||'CelesTrak GP · SGP4');$('sat-source').textContent=(data.source||'CelesTrak GP · SGP4')+' · '+satellites.length+' current objects · click a marker to inspect';
  }
 }catch(error){if(token!==satelliteLoadToken)return;console.warn('Satellite orbital elements unavailable:',error);$('sat-source').textContent=satellites.length?'Showing '+satellites.length+' catalog objects; some feeds failed.':'Satellite data unavailable; Earth rendering continues normally.';if(!satellites.length)$('sat-list').innerHTML='<div class="source-note">No live orbital feed was returned.</div>'}
}
function renderSatList(){const list=$('sat-list');list.innerHTML='';const ordered=selectedNorad?[...satellites].sort((a,b)=>String(a.norad)===selectedNorad?-1:String(b.norad)===selectedNorad?1:0):satellites;ordered.slice(0,80).forEach(item=>{const row=document.createElement('article');row.className='sat-row';row.dataset.norad=item.norad||'';row.innerHTML='<strong>'+escapeHtml(item.name||'Unnamed object')+'</strong><div class="sat-meta"><span>NORAD '+escapeHtml(String(item.norad||'—'))+'</span><span>'+escapeHtml(item.databaseOperator||item.databaseOwner||item.type||'PAYLOAD')+'</span><span>'+(item.databaseRecord?'DB CATALOG':'LIVE FEED')+'</span><span class="sat-live">Awaiting propagation</span></div>';list.appendChild(row)})}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
async function selectSatellite(norad){
 const item=satellites.find(value=>String(value.norad)===String(norad));if(!item)return;selectedNorad=String(norad);renderSatList();
 if(item._mesh&&window.satellite&&item.tle1){try{const rec=item._satrec||satellite.twoline2satrec(item.tle1,item.tle2),now=new Date(),state=satellite.propagate(rec,now);if(state?.position){const geo=satellite.eciToGeodetic(state.position,satellite.gstime(now));item._mesh.position.copy(earthPoint(geo.latitude*180/Math.PI,geo.longitude*180/Math.PI,1+Math.max(0,geo.height)/6371))}}catch(_){}}
 if(item._mesh){focusedNorad=String(item.norad);controls.autoRotate=false;controls.target.set(0,0,0);focusDistance=Math.min(3.6,Math.max(2.15,item._mesh.getWorldPosition(new THREE.Vector3()).length()+.9));lastFocusAt=Date.now();controls.update()}
 selectedPassCache=null;selectedPassAt=0;
 const row=[...document.querySelectorAll('.sat-row')].find(value=>value.dataset.norad===String(norad));if(row&&!row.querySelector('.sat-detail')){const detail=document.createElement('div');detail.className='sat-detail';detail.textContent='Loading catalog metadata…';row.appendChild(detail);fetch('/api/satellites/'+encodeURIComponent(norad)).then(response=>response.json()).then(meta=>{detail.innerHTML='<b>Owner:</b> '+escapeHtml(meta.OWNER||'Not listed')+' · <b>Launch:</b> '+escapeHtml(meta.LAUNCH_DATE||'Not listed')+' · <b>Period:</b> '+escapeHtml(String(meta.PERIOD??'—'))+' min · <b>Inclination:</b> '+escapeHtml(String(meta.INCLINATION??'—'))+'° · <b>Apogee:</b> '+escapeHtml(String(meta.APOGEE??'—'))+' km · <b>Perigee:</b> '+escapeHtml(String(meta.PERIGEE??'—'))+' km<br><b>Database record:</b> '+(item.databaseRecord?'Matched':'No matching record')+' · <b>DB operator:</b> '+escapeHtml(item.databaseOperator||'Not listed')+' · <b>DB owner:</b> '+escapeHtml(item.databaseOwner||'Not listed')}).catch(()=>{detail.textContent='Catalog metadata unavailable.'})}
 try{sessionStorage.setItem('selected-satellite',String(item.norad))}catch(_){}drawTrajectory(item);
}
function drawTrajectory(item){if(trajectory){satGroup.remove(trajectory);trajectory.geometry?.dispose();trajectory.material?.dispose();trajectory=null}if(selectedMarker){satGroup.remove(selectedMarker);selectedMarker.geometry?.dispose();selectedMarker.material?.dispose();selectedMarker=null}if(!window.satellite||!item.tle1)return;const record=item._satrec||satellite.twoline2satrec(item.tle1,item.tle2),points=[];for(let minutes=-45;minutes<=45;minutes+=2){const date=new Date(Date.now()+minutes*60000),state=satellite.propagate(record,date);if(!state?.position)continue;const geo=satellite.eciToGeodetic(state.position,satellite.gstime(date));points.push(earthPoint(geo.latitude*180/Math.PI,geo.longitude*180/Math.PI,1+Math.max(0,geo.height)/6371))}trajectory=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x75c9ff,transparent:true,opacity:.65}));satGroup.add(trajectory);selectedMarker=new THREE.Mesh(new THREE.TorusGeometry(.034,.005,10,32),new THREE.MeshBasicMaterial({color:0xffd66b,transparent:true,opacity:.95}));satGroup.add(selectedMarker)}
function currentMetrics(item,date){if(!window.satellite||!item.tle1)return null;try{const record=item._satrec||satellite.twoline2satrec(item.tle1,item.tle2),state=satellite.propagate(record,date);if(!state?.position)return null;const geo=satellite.eciToGeodetic(state.position,satellite.gstime(date));const speed=state.velocity?Math.sqrt(state.velocity.x**2+state.velocity.y**2+state.velocity.z**2):null;return {altitude:geo.height,speed}}catch(_){return null}}
function nextPassEta(item,date){if(!locationState||!window.satellite||!item.tle1)return null;try{const record=item._satrec||satellite.twoline2satrec(item.tle1,item.tle2),observer=satellite.geodeticToEcf({longitude:locationState.lon*Math.PI/180,latitude:locationState.lat*Math.PI/180,height:0});let wasAbove=false;for(let seconds=0;seconds<=5400;seconds+=60){const t=new Date(date.getTime()+seconds*1000),state=satellite.propagate(record,t);if(!state?.position)continue;const ecf=satellite.eciToEcf(state.position,satellite.gstime(t)),look=satellite.ecfToLookAngles({longitude:locationState.lon*Math.PI/180,latitude:locationState.lat*Math.PI/180,height:0},ecf);const above=look.elevation>0;if(above&&!wasAbove)return t;wasAbove=above}return null}catch(_){return null}}
function updateSelectedSatelliteCard(now){if(!selectedNorad)return;const item=satellites.find(value=>String(value.norad)===selectedNorad);if(!item)return;const row=[...document.querySelectorAll('.sat-row')].find(value=>value.dataset.norad===selectedNorad);if(!row)return;let detail=row.querySelector('.sat-detail');if(!detail)return;const metrics=currentMetrics(item,now);if(now.getTime()-selectedPassAt>30000){selectedPassCache=nextPassEta(item,now);selectedPassAt=now.getTime()}const pass=selectedPassCache;const live=metrics?'<br><b>Speed:</b> '+metrics.speed.toFixed(3)+' km/s · <b>Altitude:</b> '+metrics.altitude.toFixed(0)+' km':'';const eta=locationState?(pass?'<br><b>Next pass:</b> '+pass.toLocaleString():'<br><b>Next pass:</b> none in 90 min'):'<br><b>Next pass:</b> set a private observer location';detail.innerHTML=detail.innerHTML.replace(/(<br><b>Live:[\s\S]*)$/,'');detail.innerHTML+='<br><b>Live:</b>'+live+eta}
function updateSatellites(now){if(!window.satellite)return;const gmst=satellite.gstime(now);for(const item of satellites){if(!item._mesh||!item.tle1)continue;try{const record=item._satrec||satellite.twoline2satrec(item.tle1,item.tle2),state=satellite.propagate(record,now);if(!state?.position)continue;const geo=satellite.eciToGeodetic(state.position,gmst);const radius=1+Math.max(0,geo.height)/6371;const currentPosition=earthPoint(geo.latitude*180/Math.PI,geo.longitude*180/Math.PI,radius);item._mesh.position.copy(currentPosition);if(state.velocity){if(item._visualModel!=='NASA_3D_RESOURCE'&&item._mesh.userData.icon){const pulse=1+Math.sin(now*.004+Number(item.norad||0))*.06;item._mesh.scale.set(.075*pulse,.075*pulse,1)}const nextDate=new Date(now.getTime()+2000),nextState=satellite.propagate(record,nextDate);if(nextState?.position){const nextGeo=satellite.eciToGeodetic(nextState.position,satellite.gstime(nextDate));const nextPosition=earthPoint(nextGeo.latitude*180/Math.PI,nextGeo.longitude*180/Math.PI,1+Math.max(0,nextGeo.height)/6371);const direction=nextPosition.sub(currentPosition).normalize();if(direction.lengthSq()>.5)item._mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction)}}if(String(item.norad)===selectedNorad){if(selectedMarker){selectedMarker.position.copy(item._mesh.position);selectedMarker.rotation.x+=.012;selectedMarker.rotation.y+=.018}if(focusedNorad===selectedNorad){const worldPosition=item._mesh.getWorldPosition(new THREE.Vector3());const desired=worldPosition.normalize().multiplyScalar(focusDistance);camera.position.lerp(desired,1-Math.exp(-Math.min((now.getTime()-lastFocusAt)/1000,.05)*2.8));controls.target.set(0,0,0)}const row=[...document.querySelectorAll('.sat-row')].find(value=>value.dataset.norad===selectedNorad);const live=row?.querySelector('.sat-live');if(live){const m=currentMetrics(item,now);live.textContent=m?m.speed.toFixed(3)+' km/s · '+m.altitude.toFixed(0)+' km':'Propagation unavailable'}}}catch(_){}}updateSelectedSatelliteCard(now)}
let last=performance.now(),frames=0,stamp=last,lastSat=0,lastClock=0;
function animate(now=performance.now()){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;frames++;if(now-stamp>1000){$('fps-state').textContent=Math.round(frames*1000/(now-stamp))+' FPS';frames=0;stamp=now}const date=new Date();if(now-lastClock>1000){updateAstronomy(date);if(locationState)updateClock(document.getElementById('timezone-name').textContent);else updateClock('UTC');lastClock=now}if(now-lastSat>1000){updateSatellites(date);lastSat=now}/* Rotate the Earth-fixed scene at sidereal rate. Satellite and database coordinates share this parent, preserving their geographic alignment. */if(earthGroup)earthGroup.rotation.y+=dt*.00045;clouds.rotation.y+=dt*.000001;stars.rotation.y-=dt*.00001;if(atmosphere?.material?.uniforms?.cameraPos)atmosphere.material.uniforms.cameraPos.value.copy(camera.position);if(sunMesh)sunMesh.position.copy(sunLight.position);if(focusedNorad){const focused=satellites.find(value=>String(value.norad)===focusedNorad);if(focused?._mesh){const worldPosition=focused._mesh.getWorldPosition(new THREE.Vector3());const desired=worldPosition.normalize().multiplyScalar(focusDistance);camera.position.lerp(desired,1-Math.exp(-dt*2.8));controls.target.set(0,0,0)}}controls.update();renderer.render(scene,camera)}
init().catch(error=>{console.error('Earth renderer initialization failed:',error);const screen=$('boot-screen'),message=$('boot-status');if(screen)screen.classList.add('boot-failed');if(message){const detail=error&&error.message?error.message:'Unknown rendering error';message.textContent='The 3D view could not start on this device ('+detail+'). Check WebGL support or reload; location permission is not required.';message.setAttribute('role','alert')}const progress=$('boot-progress');if(progress)progress.style.width='100%'});
})();
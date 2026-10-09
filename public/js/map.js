(() => {
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('world-map'),ctx=canvas.getContext('2d',{alpha:false});
const sectors={
 earthquakes:{label:'Earthquakes',color:'#ff657a'},severe_weather:{label:'Severe weather',color:'#c09cff'},
 wildfires:{label:'Wildfires',color:'#ff754f'},volcanoes:{label:'Volcano observations',color:'#ffc45e'},
 volcano_alerts:{label:'Volcano notices',color:'#ffc45e'},oceans:{label:'Ocean observations',color:'#57c9ff'},
 weather:{label:'Surface weather',color:'#8de2b4'},earth_observation_products:{label:'Satellite image footprints',color:'#ffdf7b'},
 telemetry_samples:{label:'Seed telemetry samples',color:'#b9c4d3'},other_events:{label:'Other Earth events',color:'#e6a6ff'}
};
const active=new Set(Object.keys(sectors)),tileCache=new Map(),tilePending=new Set();
let zoom=2,centerLon=15,centerLat=12,items=[],selected=null,observer=null,drag=null,catalogOffset=0,catalogHasMore=false,refreshing=false,renderQueued=false;
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const mapStatus=message=>{$('map-status').textContent=message};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function worldSize(z=zoom){return 256*Math.pow(2,z)}
function worldPixel(lon,lat,z=zoom){const size=worldSize(z),phi=clamp(lat,-85.0511,85.0511)*Math.PI/180;return{x:(lon+180)/360*size,y:(1-Math.asinh(Math.tan(phi))/Math.PI)/2*size}}
function screenPoint(lon,lat){const p=worldPixel(lon,lat),c=worldPixel(centerLon,centerLat);let dx=p.x-c.x,size=worldSize();if(dx>size/2)dx-=size;if(dx< -size/2)dx+=size;return{x:canvas.clientWidth/2+dx,y:canvas.clientHeight/2+p.y-c.y}}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()})}
const land=[
[[-168,70],[-145,72],[-125,55],[-105,50],[-82,25],[-97,8],[-113,25],[-130,45],[-153,58]],
[[-82,12],[-68,8],[-50,-5],[-35,-20],[-50,-55],[-72,-40],[-80,-8]],
[[-52,80],[-24,76],[-20,60],[-42,58],[-62,68]],
[[-12,72],[15,70],[38,55],[52,36],[35,5],[15,-35],[-3,-25],[-16,5],[-25,35]],
[[-10,36],[5,44],[25,35],[45,12],[35,-12],[20,-35],[5,-28],[-5,5]],
[[30,70],[70,78],[110,65],[160,60],[178,48],[150,30],[125,5],[100,0],[80,20],[60,5],[40,25]],
[[68,25],[90,28],[105,10],[115,-10],[135,-5],[150,-18],[130,-42],[110,-25],[95,-5],[80,5]],
[[112,-12],[155,-10],[154,-42],[130,-45],[115,-30]],
[[130,32],[145,44],[147,34],[138,30]],
[[45,-13],[51,-16],[49,-25],[43,-23]]
];
function projectPolygon(points){return points.map(([lon,lat])=>screenPoint(lon,lat))}
function drawBase(w,h){
 ctx.fillStyle='#0b2434';ctx.fillRect(0,0,w,h);
 const gradient=ctx.createRadialGradient(w*.5,h*.45,20,w*.5,h*.45,Math.max(w,h)*.78);gradient.addColorStop(0,'#15384a');gradient.addColorStop(1,'#06121f');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 ctx.lineWidth=.6;ctx.strokeStyle='rgba(133,192,220,.15)';
 for(let lat=-75;lat<=75;lat+=15){const y=screenPoint(0,lat).y;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
 for(let lon=-180;lon<=180;lon+=15){const x=screenPoint(lon,0).x;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
 land.forEach(poly=>{const pts=projectPolygon(poly);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#294d4e';ctx.fill();ctx.strokeStyle='rgba(142,194,169,.35)';ctx.lineWidth=1;ctx.stroke()});
}
function getTile(z,x,y){
 const n=2**z;x=(x%n+n)%n;if(y<0||y>=n)return null;const key=z+'/'+x+'/'+y;
 if(tileCache.has(key))return tileCache.get(key);
 if(tilePending.has(key))return null;
 if(tilePending.size>=48)return null;
 tilePending.add(key);const img=new Image();img.decoding='async';
 img.onload=()=>{tilePending.delete(key);tileCache.set(key,{img,failed:false});queueRender()};
 img.onerror=()=>{tilePending.delete(key);tileCache.set(key,{img:null,failed:true});};
 img.src='https://tile.openstreetmap.org/'+key+'.png';return null;
}
function drawTiles(w,h){
 const z=zoom,size=worldSize(z),center=worldPixel(centerLon,centerLat),originX=center.x-w/2,originY=center.y-h/2;
 const firstX=Math.floor(originX/256),lastX=Math.floor((originX+w)/256),firstY=Math.floor(originY/256),lastY=Math.floor((originY+h)/256);
 let drawn=0;
 for(let ty=firstY;ty<=lastY;ty++)for(let tx=firstX;tx<=lastX;tx++){
  const tile=getTile(z,tx,ty),x=tx*256-originX,y=ty*256-originY;
  if(tile?.img){ctx.drawImage(tile.img,x,y,256,256);drawn++}
 }
 return drawn;
}
function drawGeometry(geometry){
 if(!geometry||!geometry.coordinates)return;
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 polygons.forEach(poly=>poly.forEach((ring,ri)=>{if(!ring?.length)return;const pts=ring.map(([lon,lat])=>screenPoint(lon,lat));ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(ri===0){ctx.fillStyle='rgba(255,223,123,.13)';ctx.fill();ctx.strokeStyle='#ffdf7b';ctx.lineWidth=1.5;ctx.stroke()}}));
}
function drawRecords(w,h){
 const visible=items.filter(item=>active.has(item.sector));
 visible.forEach(item=>{if(item.sector==='earth_observation_products')drawGeometry(item.geometry)});
 visible.forEach(item=>{
  const lat=Number(item.latitude),lon=Number(item.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
  const p=screenPoint(lon,lat);if(p.x< -15||p.x>w+15||p.y< -15||p.y>h+15)return;
  const color=sectors[item.sector]?.color||'#c4d3e2',isSelected=selected&&String(selected.id)===String(item.id);
  ctx.beginPath();ctx.arc(p.x,p.y,isSelected?6:3.2,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  ctx.strokeStyle=isSelected?'#fff':'rgba(3,12,20,.88)';ctx.lineWidth=isSelected?2:1;ctx.stroke();
  if(isSelected){ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.stroke()}
 });
 if(observer){const p=screenPoint(observer.longitude,observer.latitude);ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fillStyle='#75c9ff';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke()}
}
function render(){
 if(!canvas.clientWidth||!canvas.clientHeight)return;
 const dpr=Math.min(window.devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 ctx.setTransform(dpr,0,0,dpr,0,0);drawBase(w,h);const drawn=drawTiles(w,h);drawRecords(w,h);
 $('zoom-world').title='Zoom level '+zoom;
}
function detailFor(item){
 selected=item;queueRender();const box=$('feature-detail');box.hidden=false;box.replaceChildren();
 const values=[['Record',item.label||item.event_type||item.sector||'Observation'],['Layer',sectors[item.sector]?.label||item.sector],['Coordinates',Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude))?Number(item.latitude).toFixed(5)+'°, '+Number(item.longitude).toFixed(5)+'°':'No point coordinates in source'],['Measurement',item.value==null?'Not reported':String(item.value)+' '+(item.unit||'')],['Observed',item.observed_at?new Date(item.observed_at).toLocaleString():'Time not supplied'],['Quality',item.quality_status||'Not supplied'],['Source',item.source_name||item.provider||'Not listed']];
 values.forEach(([label,value])=>{const row=document.createElement('p'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=label;span.textContent=String(value);row.append(strong,span);box.append(row)});
}
function renderRecordList(){
 const list=$('map-record-list');list.replaceChildren();const visible=items.filter(item=>active.has(item.sector)).slice(0,45);
 $('loaded-count').textContent=visible.length+' shown · '+items.length+' loaded';
 if(!visible.length){const p=document.createElement('p');p.className='empty-state';p.textContent='No located records returned yet. The map remains usable while data loads.';list.append(p);return}
 visible.forEach(item=>{const button=document.createElement('button');button.type='button';button.className='map-record';const title=document.createElement('strong'),meta=document.createElement('small');title.textContent=item.label||item.event_type||sectors[item.sector]?.label||item.sector;meta.textContent=(sectors[item.sector]?.label||item.sector)+' · '+(item.observed_at?new Date(item.observed_at).toLocaleString():'time not supplied');button.append(title,meta);button.addEventListener('click',()=>{detailFor(item);centerLon=Number(item.longitude);centerLat=Number(item.latitude);zoom=Math.max(zoom,4);queueRender()});list.append(button)});
}
function renderCounts(data){
 const layers=Array.isArray(data.layers)?data.layers:[];
 layers.forEach(layer=>{const el=$('count-'+layer.sector);if(el)el.textContent=String(layer.loaded_count??layer.count??0)});
 Object.entries(sectors).forEach(([sector])=>{const el=$('count-'+sector);if(el&&!layers.some(layer=>layer.sector===sector))el.textContent=String(items.filter(item=>item.sector===sector).length)});
}
async function loadFallbackMapRecords(){
 const fallback=await Promise.allSettled([
  fetch('/api/observatory/catalog?dataset=observatory_observations&limit=100&offset=0',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw new Error('Observation catalog HTTP '+r.status);return r.json()}),
  fetch('/api/observatory/catalog?dataset=earth_events&limit=100&offset=0',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw new Error('Event catalog HTTP '+r.status);return r.json()})
 ]);
 const rows=[];
 if(fallback[0].status==='fulfilled')for(const row of fallback[0].value.items||[])rows.push({...row,id:'fallback-observation-'+row.id,label:row.external_id||row.metric||row.sector,sector:sectors[row.sector]?row.sector:'other_events',observed_at:row.observed_at,latitude:Number(row.latitude),longitude:Number(row.longitude),source_name:row.source_id||'Supabase observatory observations'});
 if(fallback[1].status==='fulfilled')for(const row of fallback[1].value.items||[])rows.push({...row,id:'fallback-event-'+row.id,label:row.title||row.event_type,sector:String(row.event_type||'').toLowerCase()==='earthquake'?'earthquakes':'other_events',observed_at:row.occurred_at,latitude:Number(row.latitude),longitude:Number(row.longitude),source_name:'Supabase earth events'});
 return rows.filter(row=>Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)&&Math.abs(row.latitude)<=90&&Math.abs(row.longitude)<=180);
}
async function loadData(showRefresh=false){
 if(refreshing)return;refreshing=true;const btn=$('refresh-data');btn.disabled=true;btn.textContent='LOADING…';
 if(showRefresh)mapStatus('Refreshing database-backed map layers…');
 try{
  const response=await fetch('/api/observatory/layers?limit=160',{cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error('API returned HTTP '+response.status);
  const data=await response.json();
  items=Array.isArray(data.items)?data.items.filter(item=>Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude))&&Math.abs(Number(item.latitude))<=90&&Math.abs(Number(item.longitude))<=180):[];
  if(!items.length)items=await loadFallbackMapRecords();
  renderCounts(data);renderRecordList();queueRender();
  if(!items.length)throw new Error('The database endpoints returned no valid located records');
  mapStatus(items.length+' geographic records loaded from Supabase · '+(data.partial?'some sources returned partial data':'database sources responded')+' · refreshed '+new Date(data.ts||Date.now()).toLocaleTimeString());
 }catch(error){
  try{
   items=await loadFallbackMapRecords();
   if(items.length){renderRecordList();queueRender();mapStatus(items.length+' located records loaded from the Supabase catalog fallback · aggregate layer endpoint unavailable ('+error.message+')');}
   else throw new Error('The aggregate and direct catalog endpoints returned no located records');
  }catch(fallbackError){mapStatus('Map base is available, but database data could not be loaded ('+fallbackError.message+'). Use Refresh Data to retry.')}
 }
 finally{refreshing=false;btn.disabled=false;btn.textContent='REFRESH DATA'}
}
const datasetsWithTextSearch=new Set(['observatory_observations','world_development_observations','earth_events','earth_observation_products','satellites','seed_telemetry_samples','volcano_observations','environment_observations','space_weather_observations','celestial_bodies','observatory_sources','data_sources','data_layer_configs','ingestion_runs','observatory_ingestion_runs']);
function valueText(value){if(value===null||value===undefined||value==='')return '—';if(typeof value==='object')return JSON.stringify(value);if(typeof value==='string'&&value.length>180)return value.slice(0,177)+'…';return String(value)}
function recordTitle(item,index){return item.title||item.name||item.country_name||item.indicator_name||item.volcano_name||item.external_id||item.event_type||item.product||item.job_name||item.slug||item.layer_key||item.sector||item.collection||item.norad_id||item.sample_id||('Record '+(catalogOffset+index+1))}
function renderCatalogRecords(itemsToRender){
 const target=$('catalog-results');itemsToRender.forEach((item,index)=>{
  const article=document.createElement('article');article.className='catalog-record';const heading=document.createElement('h3');heading.textContent=recordTitle(item,index);article.append(heading);
  const meta=document.createElement('div');meta.className='record-meta';[item.sector,item.status,item.period,item.observed_at||item.captured_at||item.acquired_at||item.started_at].filter(Boolean).slice(0,3).forEach(value=>{const chip=document.createElement('span');chip.textContent=String(value);meta.append(chip)});if(meta.childElementCount)article.append(meta);
  const fields=document.createElement('dl');fields.className='record-fields';const entries=Object.entries(item).filter(([key,value])=>value!==undefined&&value!==null&&value!==''&&!['metadata','payload','asset_links','geometry','metrics','position'].includes(key));
  entries.slice(0,8).forEach(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key.replaceAll('_',' ');dd.textContent=valueText(value);fields.append(dt,dd)});article.append(fields);
  const extraEntries=Object.fromEntries(Object.entries(item).filter(([key])=>['metadata','payload','asset_links','geometry','metrics','position'].includes(key)));
  if(Object.keys(extraEntries).length){const details=document.createElement('details');details.className='record-extra';const summary=document.createElement('summary');summary.textContent='Inspect structured fields';const pre=document.createElement('pre');pre.textContent=JSON.stringify(extraEntries,null,2);details.append(summary,pre);article.append(details)}
  target.append(article);
 });
}
async function loadCatalog(reset=true){
 const dataset=$('catalog-dataset').value,q=$('catalog-search').value.trim();
 if(reset){catalogOffset=0;$('catalog-results').replaceChildren()}
 $('catalog-status').textContent='Loading '+dataset.replaceAll('_',' ')+'…';$('catalog-more').disabled=true;
 const searchAllowed=datasetsWithTextSearch.has(dataset);
 try{
  const params=new URLSearchParams({dataset,limit:'50',offset:String(catalogOffset)});if(q&&searchAllowed)params.set('q',q);
  const response=await fetch('/api/observatory/catalog?'+params,{cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'HTTP '+response.status)}
  const data=await response.json();const page=Array.isArray(data.items)?data.items:[];
  catalogOffset=data.next_offset??(catalogOffset+page.length);catalogHasMore=data.has_more===true;
  renderCatalogRecords(page);
  $('catalog-status').textContent=dataset.replaceAll('_',' ')+' · '+page.length+' records loaded · '+(catalogHasMore?'more records available':'end of matching records')+(q&&searchAllowed?' · filtered by '+q:q&&!searchAllowed?' · this dataset has no indexed text search; browse pages instead':'');
  $('catalog-more').hidden=!catalogHasMore;$('catalog-more').disabled=!catalogHasMore;
  if(!page.length&&reset)$('catalog-status').textContent='No records matched this query. Try a broader search or another dataset.';
 }catch(error){$('catalog-status').textContent='Dataset query failed: '+error.message;$('catalog-more').disabled=true;$('catalog-more').hidden=true}
}
function wire(){
 document.querySelectorAll('[data-sector]').forEach(button=>button.addEventListener('click',()=>{const sector=button.dataset.sector;if(active.has(sector))active.delete(sector);else active.add(sector);button.classList.toggle('active',active.has(sector));button.setAttribute('aria-pressed',String(active.has(sector)));renderRecordList();queueRender()}));
 $('refresh-data').addEventListener('click',()=>loadData(true));
 $('zoom-in').addEventListener('click',()=>{zoom=clamp(zoom+1,2,7);queueRender()});
 $('zoom-out').addEventListener('click',()=>{zoom=clamp(zoom-1,2,7);queueRender()});
 $('zoom-world').addEventListener('click',()=>{zoom=2;centerLon=15;centerLat=12;queueRender()});
 $('collapse-panel').addEventListener('click',()=>{const panel=$('map-panel');panel.classList.toggle('collapsed');$('collapse-panel').textContent=panel.classList.contains('collapsed')?'+':'−'});
 $('locate-me').addEventListener('click',()=>{
  if(!navigator.geolocation){$('location-status').textContent='This browser does not support device location.';return}
  $('location-status').textContent='Waiting for browser location permission…';
  navigator.geolocation.getCurrentPosition(pos=>{observer={latitude:pos.coords.latitude,longitude:pos.coords.longitude};centerLon=observer.longitude;centerLat=observer.latitude;zoom=clamp(Math.max(zoom,5),2,7);queueRender();$('location-status').textContent='Device location shown locally · reported accuracy '+(Number.isFinite(pos.coords.accuracy)?Math.round(pos.coords.accuracy)+' m':'unavailable')+'. Not uploaded.'},error=>{$('location-status').textContent=(error.code===1?'Location permission denied.':error.code===2?'Device location unavailable.':'Location request timed out.')+' The map remains available.'},{enableHighAccuracy:true,maximumAge:30000,timeout:15000});
 });
 $('catalog-toggle').addEventListener('click',()=>{$('catalog-panel').hidden=false;loadCatalog(true)});
 $('close-catalog').addEventListener('click',()=>{$('catalog-panel').hidden=true});
 $('catalog-dataset').addEventListener('change',()=>loadCatalog(true));
 $('catalog-search-button').addEventListener('click',()=>loadCatalog(true));
 $('catalog-search').addEventListener('keydown',e=>{if(e.key==='Enter')loadCatalog(true)});
 $('catalog-more').addEventListener('click',()=>loadCatalog(false));
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId)});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4)drag.moved=true;if(drag.moved){const size=worldSize();const c=worldPixel(centerLon,centerLat);centerLon=((c.x-dx+size)%size)/size*360-180;const newY=clamp(c.y-dy,0,size);centerLat=Math.atan(Math.sinh(Math.PI*(1-2*newY/size)))*180/Math.PI;drag.lastX=e.clientX;drag.lastY=e.clientY;queueRender()}});
 const finish=e=>{if(!drag)return;const was=drag;drag=null;if(!was.moved&&e.type==='pointerup'){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let best=null,bestD=13;for(const item of items){if(!active.has(item.sector))continue;const p=screenPoint(Number(item.longitude),Number(item.latitude)),d=Math.hypot(p.x-x,p.y-y);if(d<bestD){bestD=d;best=item}}if(best)detailFor(best)}};
 canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('wheel',e=>{e.preventDefault();const old=zoom;zoom=clamp(zoom+(e.deltaY<0?1:-1),2,7);if(old!==zoom)queueRender()},{passive:false});
 canvas.addEventListener('dblclick',e=>{e.preventDefault();zoom=clamp(zoom+1,2,7);queueRender()});
 window.addEventListener('resize',queueRender);
}
function boot(){wire();render();loadData(false);loadCatalog(true)}
boot();
})();
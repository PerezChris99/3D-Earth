(() => {
'use strict';
const $=id=>document.getElementById(id);
const shell=document.querySelector('.map-shell');
const sectors={
 earthquakes:{label:'Earthquakes',color:'#ff657a'},severe_weather:{label:'Severe weather',color:'#c09cff'},
 wildfires:{label:'Wildfires',color:'#ff754f'},volcanoes:{label:'Volcano observations',color:'#ffc45e'},
 volcano_alerts:{label:'Volcano notices',color:'#ffc45e'},oceans:{label:'Ocean observations',color:'#57c9ff'},
 weather:{label:'Surface weather',color:'#8de2b4'},earth_observation_products:{label:'Satellite image footprints',color:'#ffdf7b'},
 telemetry_samples:{label:'Seed telemetry samples',color:'#b9c4d3'},other_events:{label:'Other Earth events',color:'#e6a6ff'}
};
const active=new Set(Object.keys(sectors)),layerGroups=new Map(),markers=new Map();
let items=[],selected=null,observer=null,catalogOffset=0,catalogHasMore=false,refreshing=false,map=null,baseLayer=null,baseIndex=0,tileErrors=0,tileFallbackTimer=null;
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const mapStatus=message=>{$('map-status').textContent=message};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const baseProviders=[
 {url:'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',name:'CARTO Dark'},
 {url:'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',name:'CARTO Voyager'},
 {url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',name:'OpenStreetMap'}
];
function installBase(index){
 if(index>=baseProviders.length){mapStatus('Basemap providers are returning errors. Geographic database overlays remain available.');return}
 baseIndex=index;tileErrors=0;
 if(baseLayer)map.removeLayer(baseLayer);
 const provider=baseProviders[index];
 baseLayer=L.tileLayer(provider.url,{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · tiles '+provider.name,updateWhenIdle:true,keepBuffer:2});
 baseLayer.on('tileerror',()=>{
  tileErrors++;
  if(tileErrors>=3&&baseIndex===index&&!tileFallbackTimer&&index<baseProviders.length-1){
   tileFallbackTimer=setTimeout(()=>{tileFallbackTimer=null;if(baseIndex===index)installBase(index+1)},500);
  }
 });
 baseLayer.addTo(map);
}
function initMap(){
 map=L.map('leaflet-map',{zoomControl:false,worldCopyJump:true,preferCanvas:true,scrollWheelZoom:true}).setView([12,15],2);
 installBase(0);
 Object.keys(sectors).forEach(sector=>layerGroups.set(sector,L.layerGroup().addTo(map)));
 map.whenReady(()=>setTimeout(()=>map.invalidateSize({pan:false}),50));
 window.addEventListener('resize',()=>map.invalidateSize({pan:false}));
}
function clearMapItems(){layerGroups.forEach(group=>group.clearLayers());markers.clear()}
function validPoint(item){const lat=Number(item.latitude),lon=Number(item.longitude);return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180}
function addItemToMap(item){
 const sector=sectors[item.sector]?item.sector:'other_events';
 if(item.geometry&&['Polygon','MultiPolygon'].includes(item.geometry.type)){
  try{const geo=L.geoJSON({type:'Feature',properties:{id:item.id},geometry:item.geometry},{style:{color:sectors[sector].color,weight:1.5,fillOpacity:.12}});geo.on('click',()=>detailFor(item));if(active.has(sector))geo.addTo(layerGroups.get(sector));markers.set(String(item.id),geo)}catch(error){console.warn('Could not render observation geometry:',error)}
 }
 if(!validPoint(item))return;
 const marker=L.circleMarker([Number(item.latitude),Number(item.longitude)],{radius:5,color:'#071019',weight:1.2,fillColor:sectors[sector].color,fillOpacity:.95});
 marker.on('click',()=>detailFor(item));
 if(active.has(sector))marker.addTo(layerGroups.get(sector));
 markers.set(String(item.id),marker);
}
function renderMapItems(){clearMapItems();items.forEach(addItemToMap);renderRecordList()}
function detailFor(item){
 selected=item;
 const box=$('feature-detail');box.hidden=false;box.replaceChildren();
 const values=[['Record',item.label||item.event_type||item.sector||'Observation'],['Layer',sectors[item.sector]?.label||item.sector],['Coordinates',validPoint(item)?Number(item.latitude).toFixed(5)+'°, '+Number(item.longitude).toFixed(5)+'°':'No point coordinates in source'],['Measurement',item.value==null?'Not reported':String(item.value)+' '+(item.unit||'')],['Observed',item.observed_at?new Date(item.observed_at).toLocaleString():'Time not supplied'],['Quality',item.quality_status||'Not supplied'],['Source',item.source_name||item.provider||'Not listed']];
 values.forEach(([label,value])=>{const row=document.createElement('p'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=label;span.textContent=String(value);row.append(strong,span);box.append(row)});
}
function renderRecordList(){
 const list=$('map-record-list');list.replaceChildren();const visible=items.filter(item=>active.has(item.sector)).slice(0,45);
 $('loaded-count').textContent=visible.length+' shown · '+items.length+' loaded';
 if(!visible.length){const p=document.createElement('p');p.className='empty-state';p.textContent='No located records returned yet. The map remains usable while data loads.';list.append(p);return}
 visible.forEach(item=>{const button=document.createElement('button');button.type='button';button.className='map-record';const title=document.createElement('strong'),meta=document.createElement('small');title.textContent=item.label||item.event_type||sectors[item.sector]?.label||item.sector;meta.textContent=(sectors[item.sector]?.label||item.sector)+' · '+(item.observed_at?new Date(item.observed_at).toLocaleString():'time not supplied');button.append(title,meta);button.addEventListener('click',()=>{detailFor(item);if(validPoint(item))map.setView([Number(item.latitude),Number(item.longitude)],Math.max(map.getZoom(),4),{animate:true})});list.append(button)});
}
function renderCounts(data){
 const layers=Array.isArray(data.layers)?data.layers:[];
 layers.forEach(layer=>{const el=$('count-'+layer.sector);if(el)el.textContent=String(layer.loaded_count??layer.count??0)});
 Object.keys(sectors).forEach(sector=>{const el=$('count-'+sector);if(el&&!layers.some(layer=>layer.sector===sector))el.textContent=String(items.filter(item=>item.sector===sector).length)});
}
async function loadFallbackMapRecords(){
 const fallback=await Promise.allSettled([
  fetch('/api/observatory/catalog?dataset=observatory_observations&map=1&limit=100&offset=0',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw new Error('Observation catalog HTTP '+r.status);return r.json()}),
  fetch('/api/observatory/catalog?dataset=earth_events&map=1&limit=100&offset=0',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw new Error('Event catalog HTTP '+r.status);return r.json()})
 ]);
 const rows=[];
 if(fallback[0].status==='fulfilled')for(const row of fallback[0].value.items||[])rows.push({...row,id:'fallback-observation-'+row.id,label:row.external_id||row.metric||row.sector,sector:sectors[row.sector]?row.sector:'other_events',observed_at:row.observed_at,latitude:Number(row.latitude),longitude:Number(row.longitude),source_name:row.source_id||'Supabase observatory observations'});
 if(fallback[1].status==='fulfilled')for(const row of fallback[1].value.items||[])rows.push({...row,id:'fallback-event-'+row.id,label:row.title||row.event_type,sector:String(row.event_type||'').toLowerCase()==='earthquake'?'earthquakes':'other_events',observed_at:row.occurred_at,latitude:Number(row.latitude),longitude:Number(row.longitude),source_name:'Supabase earth events'});
 return rows.filter(validPoint);
}
async function loadData(showRefresh=false){
 if(refreshing)return;refreshing=true;const btn=$('refresh-data');btn.disabled=true;btn.textContent='LOADING…';
 if(showRefresh)mapStatus('Refreshing database-backed map layers…');
 try{
  const response=await fetch('/api/observatory/layers?limit=160',{cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||body.message||('API returned HTTP '+response.status))}
  const data=await response.json();
  items=Array.isArray(data.items)?data.items.filter(validPoint):[];
  if(!items.length)items=await loadFallbackMapRecords();
  renderCounts(data);renderMapItems();
  if(!items.length)throw new Error('Database endpoints returned no valid located records');
  mapStatus(items.length+' geographic records loaded from Supabase · '+(data.partial?'some sources returned partial data':'database sources responded')+' · refreshed '+new Date(data.ts||Date.now()).toLocaleTimeString());
 }catch(error){
  try{
   items=await loadFallbackMapRecords();
   if(items.length){renderMapItems();mapStatus(items.length+' located records loaded from the Supabase catalog fallback · aggregate layer endpoint unavailable ('+error.message+')');}
   else throw new Error(error.message+'; direct catalog fallback returned no located records');
  }catch(fallbackError){mapStatus('Map base is available, but database data could not be loaded ('+fallbackError.message+'). Use Refresh Data to retry.')}
 }
 finally{refreshing=false;btn.disabled=false;btn.textContent='REFRESH DATA'}
}
const datasetsWithTextSearch=new Set(['observatory_observations','world_development_observations','earth_events','earth_observation_products','satellites','seed_telemetry_samples','volcano_observations','environment_observations','space_weather_observations','celestial_bodies','observatory_sources','data_sources','data_layer_configs','ingestion_runs','observatory_ingestion_runs']);
function valueText(value){if(value===null||value===undefined||value==='')return '—';if(typeof value==='object')return JSON.stringify(value);if(typeof value==='string'&&value.length>180)return value.slice(0,177)+'…';return String(value)}
function recordTitle(item,index){return item.title||item.name||item.country_name||item.indicator_name||item.volcano_name||item.external_id||item.event_type||item.product||item.job_name||item.slug||item.layer_key||item.sector||item.collection||item.norad_id||item.sample_id||('Record '+(catalogOffset+index+1))}
function renderCatalogRecords(itemsToRender){
 const target=$('catalog-results');itemsToRender.forEach((item,index)=>{const article=document.createElement('article');article.className='catalog-record';const heading=document.createElement('h3');heading.textContent=recordTitle(item,index);article.append(heading);const meta=document.createElement('div');meta.className='record-meta';[item.sector,item.status,item.period,item.observed_at||item.captured_at||item.acquired_at||item.started_at].filter(Boolean).slice(0,3).forEach(value=>{const chip=document.createElement('span');chip.textContent=String(value);meta.append(chip)});if(meta.childElementCount)article.append(meta);const fields=document.createElement('dl');fields.className='record-fields';const entries=Object.entries(item).filter(([key,value])=>value!==undefined&&value!==null&&value!==''&&!['metadata','payload','asset_links','geometry','metrics','position'].includes(key));entries.slice(0,8).forEach(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key.replaceAll('_',' ');dd.textContent=valueText(value);fields.append(dt,dd)});article.append(fields);const extraEntries=Object.fromEntries(Object.entries(item).filter(([key])=>['metadata','payload','asset_links','geometry','metrics','position'].includes(key)));if(Object.keys(extraEntries).length){const details=document.createElement('details');details.className='record-extra';const summary=document.createElement('summary');summary.textContent='Inspect structured fields';const pre=document.createElement('pre');pre.textContent=JSON.stringify(extraEntries,null,2);details.append(summary,pre);article.append(details)}target.append(article)});
}
async function loadCatalog(reset=true){
 const dataset=$('catalog-dataset').value,q=$('catalog-search').value.trim();if(reset){catalogOffset=0;$('catalog-results').replaceChildren()}
 $('catalog-status').textContent='Loading '+dataset.replaceAll('_',' ')+'…';$('catalog-more').disabled=true;const searchAllowed=datasetsWithTextSearch.has(dataset);
 try{const params=new URLSearchParams({dataset,limit:'50',offset:String(catalogOffset)});if(q&&searchAllowed)params.set('q',q);const response=await fetch('/api/observatory/catalog?'+params,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(18000)});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'HTTP '+response.status)}const data=await response.json();const page=Array.isArray(data.items)?data.items:[];catalogOffset=data.next_offset??(catalogOffset+page.length);catalogHasMore=data.has_more===true;renderCatalogRecords(page);$('catalog-status').textContent=dataset.replaceAll('_',' ')+' · '+page.length+' records loaded · '+(catalogHasMore?'more records available':'end of matching records')+(q&&searchAllowed?' · filtered by '+q:q&&!searchAllowed?' · this dataset has no indexed text search; browse pages instead':'');$('catalog-more').hidden=!catalogHasMore;$('catalog-more').disabled=!catalogHasMore;if(!page.length&&reset)$('catalog-status').textContent='No records matched this query. Try a broader search or another dataset.'}
 catch(error){$('catalog-status').textContent='Dataset query failed: '+error.message;$('catalog-more').disabled=true;$('catalog-more').hidden=true}
}
function wire(){
 document.querySelectorAll('[data-sector]').forEach(button=>button.addEventListener('click',()=>{const sector=button.dataset.sector;if(active.has(sector))active.delete(sector);else active.add(sector);button.classList.toggle('active',active.has(sector));button.setAttribute('aria-pressed',String(active.has(sector));const group=layerGroups.get(sector);if(group){if(active.has(sector))group.addTo(map);else map.removeLayer(group)}renderRecordList()}));
 $('refresh-data').addEventListener('click',()=>loadData(true));$('zoom-in').addEventListener('click',()=>map.zoomIn());$('zoom-out').addEventListener('click',()=>map.zoomOut());$('zoom-world').addEventListener('click',()=>map.setView([12,15],2));
 $('collapse-panel').addEventListener('click',()=>{const panel=$('map-panel'),collapsed=panel.classList.toggle('collapsed');$('collapse-panel').textContent=collapsed?'+':'−';$('collapse-panel').setAttribute('aria-label',collapsed?'Expand Earth data panel':'Collapse Earth data panel');$('collapse-panel').setAttribute('aria-expanded',String(!collapsed))});
 $('locate-me').addEventListener('click',()=>{if(!navigator.geolocation){$('location-status').textContent='This browser does not support device location.';return}$('location-status').textContent='Waiting for browser location permission…';navigator.geolocation.getCurrentPosition(pos=>{observer={latitude:pos.coords.latitude,longitude:pos.coords.longitude};map.setView([observer.latitude,observer.longitude],Math.max(map.getZoom(),5),{animate:true});L.circleMarker([observer.latitude,observer.longitude],{radius:7,color:'#fff',weight:2,fillColor:'#75c9ff',fillOpacity:1}).addTo(map).bindTooltip('This device · browser-reported accuracy '+Math.round(pos.coords.accuracy)+' m');$('location-status').textContent='Device location shown locally · reported accuracy '+(Number.isFinite(pos.coords.accuracy)?Math.round(pos.coords.accuracy)+' m':'unavailable')+'. Not uploaded.'},error=>{$('location-status').textContent=(error.code===1?'Location permission denied.':error.code===2?'Device location unavailable.':'Location request timed out.')+' The map remains available.'},{enableHighAccuracy:true,maximumAge:30000,timeout:15000})});
 $('catalog-toggle').addEventListener('click',()=>{$('catalog-panel').hidden=false;loadCatalog(true);setTimeout(()=>map.invalidateSize({pan:false}),80)});$('close-catalog').addEventListener('click',()=>$('catalog-panel').hidden=true);
 $('catalog-dataset').addEventListener('change',()=>loadCatalog(true));$('catalog-search-button').addEventListener('click',()=>loadCatalog(true));$('catalog-search').addEventListener('keydown',e=>{if(e.key==='Enter')loadCatalog(true)});$('catalog-more').addEventListener('click',()=>loadCatalog(false));
}
function boot(){initMap();wire();loadData(false);loadCatalog(true)}
boot();
})();
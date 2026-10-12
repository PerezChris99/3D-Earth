(() => {
'use strict';
const $=id=>document.getElementById(id);
const shell=document.querySelector('.map-shell');
const sectors={
 earthquakes:{label:'Earthquakes',color:'#ff657a'},severe_weather:{label:'Severe weather',color:'#c09cff'},
 wildfires:{label:'Wildfires',color:'#ff754f'},volcanoes:{label:'Volcano observations',color:'#ffc45e'},
 volcano_alerts:{label:'Volcano notices',color:'#ffc45e'},oceans:{label:'Ocean observations',color:'#57c9ff'},
 weather:{label:'Surface weather',color:'#8de2b4'},earth_observation_products:{label:'Satellite image footprints',color:'#ffdf7b'},
 global_features:{label:'Major geographic features',color:'#f5cc80'},satellite_positions:{label:'Current satellite positions',color:'#78bfff'},other_events:{label:'Other Earth events',color:'#e6a6ff'}
};
const active=new Set(Object.keys(sectors)),layerGroups=new Map(),markers=new Map();
let items=[],selected=null,observer=null,observerMarker=null,catalogOffset=0,catalogHasMore=false,refreshing=false,map=null,baseLayer=null,baseIndex=0,tileErrors=0,tileFallbackTimer=null;
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const mapStatus=message=>{$('map-status').textContent=message};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const baseProviders=[
 {url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',name:'OpenStreetMap'},
 {url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',name:'Esri World Street Map'}
];
function installBase(index){
 if(index>=baseProviders.length){mapStatus('Basemap providers are returning errors. Geographic database overlays remain available.');return}
 baseIndex=index;tileErrors=0;
 if(baseLayer)map.removeLayer(baseLayer);
 const provider=baseProviders[index];
 const attribution=provider.name==='OpenStreetMap'
  ?'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
  :'Sources: Esri, Garmin, FAO, NOAA, USGS, <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>, and the GIS User Community';
 baseLayer=L.tileLayer(provider.url,{maxZoom:19,attribution,updateWhenIdle:true,keepBuffer:2});
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
function validPoint(item){return window.EarthMapData.isValidPoint(item)}
let liveOverlayGeneration=0,loadStatusPrefix='Loading verified data feeds…';
function mergeMapItems(...collections){
 const clean=collections.map(rows=>Array.isArray(rows)?rows.filter(row=>row&&row.sector!=='telemetry_samples') : []);
 return window.EarthMapData.mergeItems(...clean,Array.isArray(window.EarthMapReferenceFeatures)?window.EarthMapReferenceFeatures:[],Array.isArray(window.EarthMapCountryData?.features)?window.EarthMapCountryData.features:[]);
}
function updateStatusSummary(){
 const referenceCount=items.filter(item=>item.sector==='global_features').length;
 const satelliteCount=items.filter(item=>item.sector==='satellite_positions').length;
 const sourcedCount=items.filter(item=>!['global_features','satellite_positions','telemetry_samples'].includes(item.sector)).length;
 mapStatus(sourcedCount+' source-backed observation/event records · '+referenceCount+' named global reference locations · '+satelliteCount+' satellite positions computed from current orbital elements'+(loadStatusPrefix?' · '+loadStatusPrefix:''));
}
async function refreshLiveOverlayData(){
 if(!window.EarthMapLiveData)return;
 const generation=++liveOverlayGeneration;
 const outcomes=await Promise.allSettled([window.EarthMapLiveData.loadEarthEvents(),window.EarthMapLiveData.loadSatellitePositions()]);
 if(generation!==liveOverlayGeneration)return;
 const liveEvents=outcomes[0].status==='fulfilled'?outcomes[0].value:[];
 const satellites=outcomes[1].status==='fulfilled'?outcomes[1].value:[];
 const stable=items.filter(item=>!['global_features','satellite_positions','telemetry_samples'].includes(item.sector));
 const uniqueEvents=liveEvents.filter(candidate=>{
  if(candidate.sector!=='earthquakes')return true;
  const candidateTime=Date.parse(candidate.observed_at||'');
  return !stable.some(existing=>existing.sector==='earthquakes'&&
   Math.abs(Number(existing.latitude)-Number(candidate.latitude))<0.001&&
   Math.abs(Number(existing.longitude)-Number(candidate.longitude))<0.001&&
   Number.isFinite(candidateTime)&&Number.isFinite(Date.parse(existing.observed_at||''))&&
   Math.abs(Date.parse(existing.observed_at)-candidateTime)<=1000);
 });
 items=mergeMapItems(stable,uniqueEvents,satellites);
 renderCounts({layers:window.EarthMapData.layersFromItems(items,sectors)});
 renderMapItems();
 updateStatusSummary();
}

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
 const observed=item.computed_at?'Computed at':'Observed';
 const values=[
  ['Record',item.label||item.event_type||item.sector||'Observation'],
  ['Layer',sectors[item.sector]?.label||item.sector],
  ['Region / feature type',item.continent?(item.continent+' · '+(item.feature_type||'Geographic feature')):(item.feature_type||item.location_kind||'Not specified')],
  ['Coordinates',validPoint(item)?Number(item.latitude).toFixed(5)+'°, '+Number(item.longitude).toFixed(5)+'°':'No point coordinates in source'],
  ['Measurement',item.value==null?'Not reported':String(item.value)+' '+(item.unit||'')],
  ...(item.metrics?Object.entries(item.metrics).map(([code,metric])=>[metric.name+' ('+code+')',String(metric.value)+(metric.unit?' '+metric.unit:'')+' · '+metric.period]):[]),
  ['Altitude',Number.isFinite(Number(item.altitude_km))?Number(item.altitude_km).toFixed(1)+' km':'Not reported'],
  ['Speed',Number.isFinite(Number(item.speed_km_s))?Number(item.speed_km_s).toFixed(3)+' km/s':'Not reported'],
  [observed,item.computed_at?new Date(item.computed_at).toLocaleString():(item.observed_at?new Date(item.observed_at).toLocaleString():'Time not supplied')],
  ['Quality',item.quality_status||'Not supplied'],
  ['Source',item.source_name||item.provider||'Not listed']
 ];
 values.forEach(([label,value])=>{const row=document.createElement('p'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=label;span.textContent=String(value);row.append(strong,span);box.append(row)});
 let safeSourceUrl=null;try{if(typeof item.source_url==='string'&&item.source_url.trim()){const parsedSourceUrl=new URL(item.source_url,location.origin);if(parsedSourceUrl.protocol==='http:'||parsedSourceUrl.protocol==='https:')safeSourceUrl=parsedSourceUrl.href}}catch(_){}
 if(safeSourceUrl){const row=document.createElement('p'),strong=document.createElement('strong'),link=document.createElement('a');strong.textContent='Source link';link.href=safeSourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open data provider';row.append(strong,link);box.append(row)}
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
async function loadFallbackMapRecords(force=false){
 const jobs=[];
 if(window.EarthData&&typeof window.EarthData.fetchLayers==='function')jobs.push({kind:'direct',run:()=>window.EarthData.fetchLayers(Boolean(force))});
 jobs.push({kind:'observations',run:()=>fetch('/api/observatory/catalog?dataset=observatory_observations&map=1&limit=100&offset=0',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw new Error('Observation catalog HTTP '+r.status);return r.json()})});
 jobs.push({kind:'events',run:()=>fetch('/api/observatory/catalog?dataset=earth_events&map=1&limit=100&offset=0',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw new Error('Event catalog HTTP '+r.status);return r.json()})});
 const settled=await Promise.allSettled(jobs.map(job=>job.run())),rows=[];
 window.__earthDataResult=null;
 settled.forEach((result,index)=>{
  if(result.status!=='fulfilled')return;
  const kind=jobs[index].kind,data=result.value;
  if(kind==='direct'){
   if(data&&Array.isArray(data.items)){if(data.items.length)window.__earthDataResult=data;rows.push(...data.items.filter(validPoint))}
   return;
  }
  for(const row of (data.items||[])){
   if(!validPoint(row))continue;
   if(kind==='observations'){
    let sector=String(row.sector||'').toLowerCase();if(sector==='earth_observation')sector='earth_observation_products';
    rows.push({...row,id:'observation-'+row.id,label:row.external_id||row.metric||sector,sector,observed_at:row.observed_at,
     latitude:Number(row.latitude),longitude:Number(row.longitude),source_name:row.source_name||row.provider||'Supabase observatory observations'});
   }else{
    const type=String(row.event_type||'').toLowerCase();
    const sector=type.includes('earthquake')?'earthquakes':type.includes('severe')?'severe_weather':type.includes('volcano')?'volcanoes':type.includes('fire')?'wildfires':'other_events';
    rows.push({...row,id:'earth-event-'+row.id,label:row.title||row.event_type||'Earth event',sector,observed_at:row.occurred_at,
     latitude:Number(row.latitude),longitude:Number(row.longitude),source_name:row.source_name||'Supabase earth_events'});
   }
  }
 });
 return window.EarthMapData.mergeItems(rows);
}
async function loadData(showRefresh=false){
 if(refreshing)return;refreshing=true;const btn=$('refresh-data');btn.disabled=true;btn.textContent='LOADING…';
 if(showRefresh)mapStatus('Refreshing source-backed map layers…');
 try{
  const response=await fetch('/api/observatory/layers?limit=160',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||body.message||('API returned HTTP '+response.status))}
  const data=await response.json();
  window.__earthDataResult=null;
  const serverItems=Array.isArray(data.items)?data.items.filter(validPoint):[];
  let fallbackItems=[];
  if(!serverItems.length||data.partial)fallbackItems=await loadFallbackMapRecords(showRefresh);
  items=mergeMapItems(serverItems,fallbackItems);
  if(window.EarthMapCountryData){const countryItems=await window.EarthMapCountryData.load();items=mergeMapItems(items,countryItems);}
  renderCounts({layers:window.EarthMapData.layersFromItems(items,sectors)});
  renderMapItems();;
  loadStatusPrefix=(data.partial?'Database feed partially available':'Database feed checked')+' · refreshed '+new Date(data.ts||Date.now()).toLocaleTimeString();
 }catch(error){
  try{
   const fallbackItems=await loadFallbackMapRecords(showRefresh);
   items=mergeMapItems(items.filter(item=>!['global_features','satellite_positions'].includes(item.sector)),fallbackItems);
   renderCounts({layers:window.EarthMapData.layersFromItems(items,sectors)});
   renderMapItems();;
   loadStatusPrefix='Primary database request failed; used available fallbacks';
  }catch(fallbackError){
   items=mergeMapItems(items.filter(item=>!['global_features','satellite_positions'].includes(item.sector)),[]);
   renderCounts({layers:window.EarthMapData.layersFromItems(items,sectors)});
   renderMapItems();;
   loadStatusPrefix='Database feeds unavailable; retained trusted reference locations';
  }
 }
 finally{refreshing=false;btn.disabled=false;btn.textContent='REFRESH DATA';updateStatusSummary();void refreshLiveOverlayData()}
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
 document.querySelectorAll('[data-sector]').forEach(button=>button.addEventListener('click',()=>{const sector=button.dataset.sector;if(active.has(sector))active.delete(sector);else active.add(sector);button.classList.toggle('active',active.has(sector));button.setAttribute('aria-pressed',String(active.has(sector)));const group=layerGroups.get(sector);if(group){if(active.has(sector))group.addTo(map);else map.removeLayer(group)}renderRecordList()}));
 $('refresh-data').addEventListener('click',()=>loadData(true));$('zoom-in').addEventListener('click',()=>map.zoomIn());$('zoom-out').addEventListener('click',()=>map.zoomOut());$('zoom-world').addEventListener('click',()=>map.setView([12,15],2));
 $('collapse-panel').addEventListener('click',()=>{const panel=$('map-panel'),collapsed=panel.classList.toggle('collapsed');$('collapse-panel').textContent=collapsed?'+':'−';$('collapse-panel').setAttribute('aria-label',collapsed?'Expand Earth data panel':'Collapse Earth data panel');$('collapse-panel').setAttribute('aria-expanded',String(!collapsed))});
 $('locate-me').addEventListener('click',()=>{
  if(!navigator.geolocation){$('location-status').textContent='This browser does not support device location.';return}
  $('location-status').textContent='Waiting for browser location permission…';
  navigator.geolocation.getCurrentPosition(pos=>{
   const c=pos.coords,connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection,ua=navigator.userAgent||'';
   const device=/tablet|ipad/i.test(ua)?'Tablet':/mobile|android|iphone|ipod/i.test(ua)?'Mobile device':'Desktop / laptop';
   const network=navigator.onLine===false?'Offline':connection?[connection.effectiveType||connection.type||'Connected',Number.isFinite(connection.downlink)?connection.downlink+' Mbps downlink':null,Number.isFinite(connection.rtt)?connection.rtt+' ms RTT':null].filter(Boolean).join(' · '):'Connected; browser network details unavailable';
   observer={latitude:c.latitude,longitude:c.longitude,accuracy_m:c.accuracy,altitude_m:Number.isFinite(c.altitude)?c.altitude:null,speed_m_s:Number.isFinite(c.speed)?c.speed:null,heading_deg:Number.isFinite(c.heading)?c.heading:null,captured_at:new Date(pos.timestamp||Date.now()).toISOString(),device,network,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Not reported'};
   if(observerMarker)map.removeLayer(observerMarker);
   const pin=L.divIcon({className:'user-location-pin-wrap',html:'<span class="user-location-pin" aria-label="Your device location"><span></span></span>',iconSize:[30,40],iconAnchor:[15,39],popupAnchor:[0,-36]});
   observerMarker=L.marker([observer.latitude,observer.longitude],{icon:pin,zIndexOffset:10000,keyboard:true,title:'Your device location'}).addTo(map);
   observerMarker.on('click',showObserverDetails);
   observerMarker.bindTooltip('Your location · accuracy '+(Number.isFinite(c.accuracy)?Math.round(c.accuracy)+' m':'not reported'));
   map.setView([observer.latitude,observer.longitude],Math.max(map.getZoom(),12),{animate:true});showObserverDetails();
   $('location-status').textContent='Your location is pinned at city-level zoom. It remains on the map when you zoom out. Location details stay in this browser and are not uploaded.';
  },error=>{$('location-status').textContent=(error.code===1?'Location permission denied.':error.code===2?'Device location unavailable.':'Location request timed out.')+' The map remains available.'},{enableHighAccuracy:true,maximumAge:15000,timeout:20000})
 });
 function showObserverDetails(){
  if(!observer)return;const box=$('feature-detail');box.hidden=false;box.replaceChildren();
  const rows=[['Record','Your device location'],['Layer','Private, browser-local location pin'],['Coordinates',observer.latitude.toFixed(6)+'°, '+observer.longitude.toFixed(6)+'°'],['Reported accuracy',Number.isFinite(observer.accuracy_m)?Math.round(observer.accuracy_m)+' m':'Not reported by device'],['Altitude',observer.altitude_m===null?'Not provided by device':observer.altitude_m.toFixed(1)+' m above sea level (device estimate)'],['Speed',observer.speed_m_s===null?'Not provided by device':(observer.speed_m_s*3.6).toFixed(1)+' km/h'],['Heading',observer.heading_deg===null?'Not provided by device':observer.heading_deg.toFixed(0)+'°'],['Device class',observer.device],['Network',observer.network],['Time zone',observer.timezone],['Captured at',new Date(observer.captured_at).toLocaleString()],['Privacy','Stored in this page only; not sent to the server']];
  rows.forEach(([label,value])=>{const row=document.createElement('p'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=label;span.textContent=String(value);row.append(strong,span);box.append(row)});
 }
 $('catalog-toggle').addEventListener('click',()=>{$('catalog-panel').hidden=false;loadCatalog(true);setTimeout(()=>map.invalidateSize({pan:false}),80)});$('close-catalog').addEventListener('click',()=>$('catalog-panel').hidden=true);
 $('catalog-dataset').addEventListener('change',()=>loadCatalog(true));$('catalog-search-button').addEventListener('click',()=>loadCatalog(true));$('catalog-search').addEventListener('keydown',e=>{if(e.key==='Enter')loadCatalog(true)});$('catalog-more').addEventListener('click',()=>loadCatalog(false));
}
function boot(){initMap();wire();window.__earthMapRenderer='leaflet';window.__earthMapRendererReady=true;loadData(false)}
try{boot()}catch(error){console.error('Leaflet map initialization failed:',error);if(typeof window.__earthMapFallback==='function')window.__earthMapFallback('Leaflet initialization failed: '+(error.message||'unknown error'));else mapStatus('Map initialization failed. Reload the page to retry.')}
})();
(() => {
'use strict';
const $ = id => document.getElementById(id);
const status = $('map-status');
const locationStatus = $('location-status');
const mapRoot = $('map');
const colors = { earthquakes:'#ff657a',severe_weather:'#c09cff',wildfires:'#ff754f',volcanoes:'#ffc45e',volcano_alerts:'#ffc45e',oceans:'#57c9ff',weather:'#8de2b4',earth_observation_products:'#ffdf7b',telemetry_samples:'#b9c4d3',other_events:'#e6a6ff' };
const labels = { earthquakes:'Earthquakes',severe_weather:'Severe weather',wildfires:'Wildfires',volcanoes:'Volcano observations',volcano_alerts:'Volcano notices',oceans:'Ocean observations',weather:'Surface weather',earth_observation_products:'Satellite image footprints',telemetry_samples:'Seed telemetry samples',other_events:'Other Earth events' };
let map = null, pointSource = null, footprintSource = null, pointLayer = null, footprintLayer = null, locationSource = null;
let dataItems = [], dataLayers = [], catalogOffset = 0, catalogHasMore = false, catalogItems = [], currentLocation = null, fallback = false;
const activeSectors = new Set(Object.keys(labels));
const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
function setStatus(message){if(status)status.textContent=message}
function safeDate(value){if(!value)return 'Time not supplied';const d=new Date(value);return Number.isNaN(d.getTime())?'Time not supplied':d.toLocaleString()}
function detailFor(item){
 const box=$('feature-detail');if(!box)return;box.hidden=false;box.replaceChildren();
 const fields=[['Record',item.label||item.event_type||item.sector||'Observation'],['Layer',labels[item.sector]||item.sector],['Coordinates',Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude))?Number(item.latitude).toFixed(5)+'°, '+Number(item.longitude).toFixed(5)+'°':'No point coordinates in source'],['Measurement',item.value==null?'Not reported':String(item.value)+' '+(item.unit||'')],['Observed',safeDate(item.observed_at)],['Quality',item.quality_status||'Not supplied'],['Location type',item.location_kind||'Stored coordinates'],['Source',item.source_name||item.provider||'Not listed']];
 fields.forEach(([key,value])=>{const p=document.createElement('p'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=key;span.textContent=String(value);p.append(strong,span);box.appendChild(p)});
}
function featureStyle(feature){
 const sector=feature.get('sector')||'other_events', color=colors[sector]||'#c4d3e2';
 if(sector==='earth_observation_products')return new ol.style.Style({fill:new ol.style.Fill({color:'rgba(255,223,123,.12)'}),stroke:new ol.style.Stroke({color,width:2})});
 const item=feature.get('item')||{}, magnitude=Number(item.value), radius=sector==='earthquakes'&&Number.isFinite(magnitude)?Math.max(4,Math.min(10,3+magnitude*1.25)):5;
 return new ol.style.Style({image:new ol.style.Circle({radius,fill:new ol.style.Fill({color}),stroke:new ol.style.Stroke({color:'#06111d',width:1.3})})});
}
function initializeOpenLayers(){
 if(!window.ol||!ol.Map)return false;
 pointSource=new ol.source.Vector();footprintSource=new ol.source.Vector();locationSource=new ol.source.Vector();
 const osm=new ol.layer.Tile({source:new ol.source.OSM({attributions:'© OpenStreetMap contributors'})});
 footprintLayer=new ol.layer.Vector({source:footprintSource,style:featureStyle});
 pointLayer=new ol.layer.Vector({source:pointSource,style:featureStyle});
 const observerLayer=new ol.layer.Vector({source:locationSource,style:new ol.style.Style({image:new ol.style.Circle({radius:8,fill:new ol.style.Fill({color:'#75c9ff'}),stroke:new ol.style.Stroke({color:'#fff',width:2})})})});
 map=new ol.Map({target:'map',layers:[osm,footprintLayer,pointLayer,observerLayer],view:new ol.View({center:ol.proj.fromLonLat([15,18]),zoom:2,minZoom:2,maxZoom:19}),controls:ol.control.defaults({attribution:true,zoom:true,rotate:false})});
 map.on('singleclick',event=>{
  const feature=map.forEachFeatureAtPixel(event.pixel,f=>f.get('observatory')?f:undefined);
  if(feature){const item=feature.get('item');if(item)detailFor(item)}
 });
 window.addEventListener('resize',()=>map.updateSize());
 setTimeout(()=>map.updateSize(),250);
 setStatus('OpenLayers map initialized · loading stored geographic records…');
 return true;
}
function worldPixel(lon,lat,zoom){const n=2**zoom,phi=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;return{x:(lon+180)/360*n*256,y:(1-Math.asinh(Math.tan(phi))/Math.PI)/2*n*256,n}}
function initFallback(){
 fallback=true;mapRoot.classList.add('map-fallback');
 mapRoot.innerHTML='<div class="fallback-map-tiles" id="fallback-tiles"></div><div id="fallback-markers"></div><div class="fallback-controls"><button type="button" id="fallback-plus" aria-label="Zoom in">+</button><button type="button" id="fallback-minus" aria-label="Zoom out">−</button><button type="button" id="fallback-world">WORLD</button></div><div class="fallback-credit">© OpenStreetMap contributors · OpenLayers CDN unavailable</div>';
 let zoom=2,centerLon=15,centerLat=18,drag=null;
 const tiles=$('fallback-tiles'),markers=$('fallback-markers');
 function render(){
  const center=worldPixel(centerLon,centerLat,zoom),originX=center.x-innerWidth/2,originY=center.y-innerHeight/2,firstX=Math.floor(originX/256),firstY=Math.floor(originY/256),cols=Math.ceil(innerWidth/256)+2,rows=Math.ceil(innerHeight/256)+2;
  tiles.style.left=(firstX*256-originX)+'px';tiles.style.top=(firstY*256-originY)+'px';tiles.style.gridTemplateColumns='repeat('+cols+',256px)';tiles.style.gridTemplateRows='repeat('+rows+',256px)';tiles.innerHTML='';
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const tx=firstX+x,ty=firstY+y,img=document.createElement('img');img.alt='';img.draggable=false;img.src='https://tile.openstreetmap.org/'+zoom+'/'+((tx%center.n+center.n)%center.n)+'/'+Math.max(0,Math.min(center.n-1,ty))+'.png';tiles.appendChild(img)}
  markers.innerHTML='';for(const item of dataItems){if(!activeSectors.has(item.sector)||!Number.isFinite(Number(item.latitude))||!Number.isFinite(Number(item.longitude)))continue;const p=worldPixel(Number(item.longitude),Number(item.latitude),zoom),button=document.createElement('button');button.type='button';button.className='fallback-data-marker';button.title=item.label||item.sector;button.style.background=colors[item.sector]||'#c4d3e2';button.style.left=(p.x-originX)+'px';button.style.top=(p.y-originY)+'px';button.addEventListener('click',()=>detailFor(item));markers.appendChild(button)}
 }
 mapRoot.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,center:worldPixel(centerLon,centerLat,zoom)};mapRoot.setPointerCapture?.(e.pointerId)});
 mapRoot.addEventListener('pointermove',e=>{if(!drag)return;const x=drag.center.x-(e.clientX-drag.x),y=drag.center.y-(e.clientY-drag.y),world=256*2**zoom;centerLon=x/world*360-180;centerLat=Math.atan(Math.sinh(Math.PI*(1-2*y/world)))*180/Math.PI;render()});
 mapRoot.addEventListener('pointerup',()=>drag=null);mapRoot.addEventListener('pointercancel',()=>drag=null);
 $('fallback-plus').onclick=()=>{zoom=Math.min(18,zoom+1);render()};$('fallback-minus').onclick=()=>{zoom=Math.max(2,zoom-1);render()};$('fallback-world').onclick=()=>{zoom=2;centerLon=15;centerLat=18;render()};
 window.__fallbackSetView=(lon,lat,z)=>{centerLon=lon;centerLat=lat;zoom=z;render()};window.addEventListener('resize',render);render();setStatus('Emergency OpenStreetMap tile view active. The page will still load database records; OpenLayers could not be reached from its CDN.');
}
function addPoint(item){
 const lat=Number(item.latitude),lon=Number(item.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
 if(fallback)return;
 const feature=new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat([lon,lat])));
 feature.setProperties({observatory:true,sector:item.sector,item,id:item.id});
 if(item.sector==='earth_observation_products'&&item.geometry&&ol.format?.GeoJSON){
  try{const polygon= new ol.format.GeoJSON().readFeature({type:'Feature',geometry:item.geometry,properties:{sector:item.sector,id:item.id}},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});polygon.setProperties({observatory:true,sector:item.sector,item,id:item.id});footprintSource.addFeature(polygon);return}catch(error){console.warn('Footprint geometry could not be drawn; using footprint center',error)}
 }
 pointSource.addFeature(feature);
}
function renderRecordList(){
 const list=$('map-record-list');if(!list)return;list.replaceChildren();
 const visible=dataItems.filter(item=>activeSectors.has(item.sector)).slice(0,45);
 visible.forEach(item=>{const button=document.createElement('button');button.type='button';button.className='map-record';const title=document.createElement('strong'),meta=document.createElement('small');title.textContent=item.label||item.event_type||labels[item.sector]||item.sector;meta.textContent=(labels[item.sector]||item.sector)+' · '+safeDate(item.observed_at)+' · '+Number(item.latitude).toFixed(3)+', '+Number(item.longitude).toFixed(3);button.append(title,meta);button.addEventListener('click',()=>{detailFor(item);if(map&&!fallback){const feature=[...pointSource.getFeatures(),...footprintSource.getFeatures()].find(f=>f.get('id')===item.id);if(feature){const geom=feature.getGeometry();if(geom.getType()==='Point')map.getView().animate({center:geom.getCoordinates(),zoom:Math.max(map.getView().getZoom(),7),duration:350});else map.getView().fit(geom.getExtent(),{duration:350,padding:[70,420,70,70],maxZoom:10})}}});list.appendChild(button)});
 const loaded=$('loaded-count');if(loaded)loaded.textContent=visible.length+' shown / '+dataItems.length+' loaded';
}
function updateLayerCounts(){
 dataLayers.forEach(layer=>{const el=$('count-'+layer.sector);if(el)el.textContent=String(layer.loaded_count??dataItems.filter(item=>item.sector===layer.sector).length)});
}
async function loadData(showRefresh){
 if(showRefresh)setStatus('Refreshing geographic records from Supabase…');
 try{
  const response=await fetch('/api/observatory/layers?limit=300',{signal:AbortSignal.timeout(25000),cache:'no-store'});
  if(!response.ok)throw new Error('Database endpoint returned HTTP '+response.status);
  const data=await response.json();dataItems=Array.isArray(data.items)?data.items:[];dataLayers=Array.isArray(data.layers)?data.layers:[];
  if(!fallback){pointSource.clear();footprintSource.clear();dataItems.forEach(addPoint)}
  const notes=dataLayers.map(layer=>(layer.label||layer.sector)+': '+(layer.loaded_count??0)).filter(x=>!x.endsWith(': 0'));
  setStatus(dataItems.length+' located database records loaded from Supabase. '+(notes.length?notes.join(' · '):'No located records were returned.')+' Coordinates are stored values; seed samples are marked separately.'+(data.partial?' Some database queries failed; partial results are shown.':''));
  updateLayerCounts();renderRecordList();if(fallback)window.dispatchEvent(new Event('resize'));
  if(locationStatus)locationStatus.textContent='Database layers loaded · map works without device location.';
 }catch(error){console.error('Database map layers failed:',error);setStatus('The OpenStreetMap base is running, but database records could not be loaded ('+error.message+').');if(locationStatus)locationStatus.textContent='Map available; database layer request failed.'}
}
function wireLayers(){
 document.querySelectorAll('[data-sector]').forEach(button=>button.addEventListener('click',()=>{
  const sector=button.dataset.sector;if(activeSectors.has(sector))activeSectors.delete(sector);else activeSectors.add(sector);
  button.classList.toggle('active',activeSectors.has(sector));button.setAttribute('aria-pressed',String(activeSectors.has(sector)));
  if(pointLayer)pointLayer.changed();if(footprintLayer)footprintLayer.changed();
  if(pointLayer)pointLayer.setStyle(feature=>activeSectors.has(feature.get('sector'))?featureStyle(feature):new ol.style.Style({image:new ol.style.Circle({radius:0,fill:new ol.style.Fill({color:'rgba(0,0,0,0)'})})}));
  if(footprintLayer)footprintLayer.setStyle(feature=>activeSectors.has(feature.get('sector'))?featureStyle(feature):new ol.style.Style({fill:new ol.style.Fill({color:'rgba(0,0,0,0)'}),stroke:new ol.style.Stroke({color:'rgba(0,0,0,0)',width:0})}));
  renderRecordList();if(fallback)mapRoot.dispatchEvent(new Event('resize'));
 }));
 $('collapse-panel').addEventListener('click',()=>{const panel=$('map-panel');panel.classList.toggle('collapsed');$('collapse-panel').textContent=panel.classList.contains('collapsed')?'+':'−';if(map)setTimeout(()=>map.updateSize(),100)});
 $('refresh-data').addEventListener('click',()=>loadData(true));
 $('locate-me').addEventListener('click',()=>{
  if(!navigator.geolocation){if(locationStatus)locationStatus.textContent='This browser does not support device location.';return}
  if(locationStatus)locationStatus.textContent='Waiting for browser location permission…';
  navigator.geolocation.getCurrentPosition(position=>{
   const c=position.coords;currentLocation={latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy};
   if(map){const point=new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat([c.longitude,c.latitude])));locationSource.clear();locationSource.addFeature(point);map.getView().animate({center:ol.proj.fromLonLat([c.longitude,c.latitude]),zoom:Math.max(12,map.getView().getZoom()),duration:500})}
   else{fallbackCenter(c.longitude,c.latitude,12)}
   try{sessionStorage.setItem('3dearth-location',JSON.stringify({lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,timestamp:position.timestamp}))}catch(_){}
   if(locationStatus)locationStatus.textContent='Device location · '+(Number.isFinite(c.accuracy)?Math.round(c.accuracy)+' m reported':'accuracy unavailable')+' · WGS84';
  },error=>{if(locationStatus)locationStatus.textContent=(error.code===1?'Location permission denied.':error.code===2?'Device location unavailable.':'Location request timed out.')+' The map remains available.'},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
 });
 $('catalog-toggle').addEventListener('click',()=>{$('catalog-panel').hidden=false;loadCatalog(true)});
 $('close-catalog').addEventListener('click',()=>{$('catalog-panel').hidden=true});
 $('catalog-dataset').addEventListener('change',()=>loadCatalog(true));
 $('catalog-search-button').addEventListener('click',()=>loadCatalog(true));
 $('catalog-search').addEventListener('keydown',e=>{if(e.key==='Enter')loadCatalog(true)});
 $('catalog-more').addEventListener('click',()=>loadCatalog(false));
}
function fallbackCenter(lon,lat,zoom){if(typeof window.__fallbackSetView==='function')window.__fallbackSetView(lon,lat,zoom)}
async function loadCatalog(reset){
 const dataset=$('catalog-dataset').value,q=$('catalog-search').value.trim();
 if(reset){catalogOffset=0;catalogItems=[];$('catalog-results').replaceChildren()}
 $('catalog-status').textContent='Loading '+dataset.replaceAll('_',' ')+'…';$('catalog-more').disabled=true;
 try{
  const params=new URLSearchParams({dataset,limit:'50',offset:String(catalogOffset)});if(q)params.set('q',q);
  const response=await fetch('/api/observatory/catalog?'+params.toString(),{signal:AbortSignal.timeout(20000),cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();const items=Array.isArray(data.items)?data.items:[];catalogItems.push(...items);catalogOffset=data.next_offset??catalogOffset;catalogHasMore=data.has_more===true;
  const target=$('catalog-results');items.forEach((item,index)=>{
   const article=document.createElement('article');article.className='catalog-record';const heading=document.createElement('h3');
   heading.textContent=item.title||item.name||item.country_name||item.indicator_name||item.volcano_name||item.external_id||item.event_type||item.product||item.job_name||item.slug||item.sector||item.collection||item.norad_id||('Record '+(data.offset+index+1));
   const body=document.createElement('pre');body.textContent=JSON.stringify(item,null,2);article.append(heading,body);target.appendChild(article);
  });
  $('catalog-status').textContent=dataset.replaceAll('_',' ')+' · '+items.length+' records on this page · '+(catalogHasMore?'more records available':'end of matching records')+(q?' · search: '+q:'');
  $('catalog-more').hidden=!catalogHasMore;$('catalog-more').disabled=!catalogHasMore;
  if(!items.length&&reset)$('catalog-status').textContent='No records matched this query. Try a broader search.';
 }catch(error){$('catalog-status').textContent='Dataset query failed: '+error.message;$('catalog-more').disabled=true;$('catalog-more').hidden=true}
}
function boot(){
 wireLayers();
 if(!initializeOpenLayers())initFallback();
 loadData(false);
 loadCatalog(true);
}
boot();
})();
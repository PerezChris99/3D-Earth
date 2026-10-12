(()=> {
'use strict';
const SATELLITE_JS_URL='https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js';
let satelliteLibraryPromise=null;
async function getJson(url,timeout=12000){
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw new Error('HTTP '+response.status+' from '+url);
 return response.json();
}
function valid(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180}
async function loadEarthEvents(){
 const jobs=[
  {kind:'earthquakes',url:'/api/earthquakes'},
  {kind:'wildfires',url:'/api/thermal'}
 ];
 const settled=await Promise.allSettled(jobs.map(job=>getJson(job.url,15000)));
 const records=[];
 settled.forEach((result,index)=>{
  if(result.status!=='fulfilled')return;
  const {kind}=jobs[index],rows=Array.isArray(result.value)?result.value:[];
  if(kind==='earthquakes'){
   rows.slice(0,350).forEach(row=>{
    const latitude=Number(row.lat),longitude=Number(row.lon),magnitude=Number(row.mag);
    if(!valid(latitude,longitude))return;
    const timestamp=Number(row.time),observed_at=Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
    records.push({id:'usgs-earthquake-'+String(row.id||[latitude,longitude,timestamp].join('-')),sector:'earthquakes',
     label:String(row.place||'Reported earthquake'),latitude,longitude,observed_at,
     metric:'Magnitude',value:Number.isFinite(magnitude)?magnitude:null,unit:'magnitude',depth_km:row.depth==null?null:(Number.isFinite(Number(row.depth))?Number(row.depth):null),
     quality_status:'Reported earthquake; coordinates supplied by USGS',
     source_name:'USGS Earthquake Hazards Program',provider:'USGS global real-time GeoJSON feed',
     source_url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.0_hour.geojson',
     location_kind:'reported earthquake epicentre'});
   });
  }else{
   rows.slice(0,220).forEach(row=>{
    const latitude=Number(row.lat),longitude=Number(row.lon);
    if(!valid(latitude,longitude))return;
    const brightness=row.brightness==null?null:Number(row.brightness),rawTime=String(row.time??'').padStart(4,'0');
    let observed_at=null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(row.date))&&/^\d{4}$/.test(rawTime)){
     const parsed=new Date(String(row.date)+'T'+rawTime.slice(0,2)+':'+rawTime.slice(2,4)+':00Z');
     if(Number.isFinite(parsed.getTime()))observed_at=parsed.toISOString();
    }
    records.push({id:'nasa-firms-'+[row.date,row.time,latitude,longitude,row.satellite||'viirs'].join('-'),
     sector:'wildfires',label:'Satellite thermal hotspot',latitude,longitude,observed_at,
     metric:'Brightness temperature',value:Number.isFinite(brightness)?brightness:null,unit:'provider-reported brightness units',
     confidence:row.confidence??null,quality_status:'NASA satellite thermal anomaly; not independently confirmed as a fire',
     source_name:'NASA LANCE FIRMS',provider:'NASA Fire Information for Resource Management System',
     source_url:'https://firms.modaps.eosdis.nasa.gov/',location_kind:'satellite thermal-anomaly coordinates'});
   });
  }
 });
 return records;
}
function loadSatelliteLibrary(){
 if(window.satellite&&typeof window.satellite.twoline2satrec==='function')return Promise.resolve(window.satellite);
 if(satelliteLibraryPromise)return satelliteLibraryPromise;
 satelliteLibraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=SATELLITE_JS_URL;script.async=true;
  let settled=false;
  const finish=(error)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   if(script.parentNode)script.remove();
   if(error){satelliteLibraryPromise=null;reject(error);return}
   if(window.satellite&&typeof window.satellite.twoline2satrec==='function')resolve(window.satellite);
   else{satelliteLibraryPromise=null;reject(new Error('satellite.js loaded without its propagator API'))}
  };
  const timer=setTimeout(()=>finish(new Error('Timed out loading satellite.js orbital propagator')),8000);
  script.onload=()=>finish(null);script.onerror=()=>finish(new Error('Could not load satellite.js'));
  document.head.appendChild(script);
 });
 return satelliteLibraryPromise;
}
async function loadSatellitePositions(){
 const propagator=await loadSatelliteLibrary();
 const groups=[{name:'stations',limit:70},{name:'gps-ops',limit:40},{name:'weather',limit:45}];
 const settled=await Promise.allSettled(groups.map(group=>getJson('/api/satellites?group='+encodeURIComponent(group.name),15000)));
 const elements=new Map();
 settled.forEach((result,index)=>{
  if(result.status!=='fulfilled')return;
  const rows=Array.isArray(result.value.items)?result.value.items:[];
  rows.slice(0,groups[index].limit).forEach(row=>{
   const norad=String(row.norad??'').trim();
   if(!norad||!row.tle1||!row.tle2||elements.has(norad))return;
   elements.set(norad,row);
  });
 });
 const date=new Date(),records=[];
 elements.forEach((item,norad)=>{
  try{
   const satrec=propagator.twoline2satrec(item.tle1,item.tle2);
   const state=propagator.propagate(satrec,date);
   if(!state||!state.position||!state.velocity||!Number.isFinite(state.position.x))return;
   const geo=propagator.eciToGeodetic(state.position,propagator.gstime(date));
   const latitude=geo.latitude*180/Math.PI;
   let longitude=geo.longitude*180/Math.PI;
   longitude=((longitude+540)%360)-180;
   if(!valid(latitude,longitude)||!Number.isFinite(geo.height))return;
   const speed=Math.sqrt(state.velocity.x**2+state.velocity.y**2+state.velocity.z**2);
   records.push({id:'live-satellite-'+norad,sector:'satellite_positions',
    label:String(item.name||'Satellite')+' · NORAD '+norad,latitude,longitude,
    observed_at:null,computed_at:date.toISOString(),altitude_km:geo.height,
    speed_km_s:Number.isFinite(speed)?speed:null,metric:'SGP4-propagated ground position',
    value:Number.isFinite(speed)?speed:null,unit:'km/s',
    quality_status:'Position propagated at display time from current CelesTrak orbital elements; not a direct GPS telemetry downlink.',
    source_name:'CelesTrak GP orbital elements',provider:'CelesTrak + satellite.js SGP4 propagator',
    source_url:'https://celestrak.org/NORAD/elements/gp.php',
    location_kind:'computed subsatellite point',norad_id:norad,element_epoch_julian:satrec.jdsatepoch});
  }catch(_){/* Skip invalid/stale element sets instead of plotting fabricated coordinates. */}
 });
 return records;
}
window.EarthMapLiveData={loadEarthEvents,loadSatellitePositions};
})();
/* Public, read-only Supabase access for static pages.
 * This publishable key is intended for browser use. RLS remains the access boundary;
 * never place a service-role or secret key in this file.
 */
(() => {
  'use strict';
  const URL = 'https://iunxtsdczuvugttnwdky.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bnh0c2RjenV2dWd0dG53ZGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDA1NTIsImV4cCI6MjEwNjk3NjU1Mn0.zfl_zuxFZDVbLN7Ig6fqR14dIHeReXojAQZiVRORMhI';
  const SECTORS = ['earthquakes','severe_weather','wildfires','volcanoes','volcano_alerts','oceans','weather','earth_observation_products','telemetry_samples','other_events'];
  if (!Promise.allSettled) Promise.allSettled = promises => Promise.all(Array.from(promises, promise => Promise.resolve(promise).then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason}))));
  const LABELS = {
    earthquakes:'Earthquakes',severe_weather:'Severe weather',wildfires:'Wildfires',volcanoes:'Volcanoes',
    volcano_alerts:'Volcano notices',oceans:'Ocean observations',weather:'Surface weather',
    earth_observation_products:'Satellite footprints',telemetry_samples:'Seed telemetry',other_events:'Other Earth events'
  };
  let cached = null, cachedAt = 0, pending = null;
  const validPoint = row => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) &&
    Math.abs(Number(row.latitude)) <= 90 && Math.abs(Number(row.longitude)) <= 180;
  const point = row => ({...row, latitude:Number(row.latitude), longitude:Number(row.longitude)});
  async function read(table, params) {
    const url = URL + '/rest/v1/' + encodeURIComponent(table) + '?' + params;
    const response = await fetch(url, {
      method:'GET', mode:'cors', cache:'no-store',
      headers:{ apikey:KEY, Authorization:'Bearer '+KEY, Accept:'application/json' },
      signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('Supabase '+table+' returned HTTP '+response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Unexpected Supabase response for '+table);
    return rows;
  }
  function center(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return null;
    const points=[];
    function walk(value, depth) {
      if (!Array.isArray(value) || depth>12) return;
      if (value.length>=2 && typeof value[0]==='number' && typeof value[1]==='number') points.push(value);
      else value.forEach(child=>walk(child,depth+1));
    }
    walk(geometry.coordinates,0);
    if (!points.length) return null;
    const avg=points.reduce((acc,p)=>({longitude:acc.longitude+p[0],latitude:acc.latitude+p[1]}),{longitude:0,latitude:0});
    return {latitude:avg.latitude/points.length,longitude:avg.longitude/points.length};
  }
  function normalizeObservation(row) {
    let sector = row.sector;
    if (sector==='earth_observation') sector='earth_observation_products';
    else if (sector==='space_weather') sector='other_events';
    if (!LABELS[sector]) sector='other_events';
    return {...point(row),id:'observation-'+row.id,record_id:row.id,sector,label:row.external_id||row.metric||sector,
      observed_at:row.observed_at,metric:row.metric,value:row.value,unit:row.unit,quality_status:row.quality_status,
      source_id:row.source_id,source_name:row.source_name||row.provider||sector,provider:row.provider||'Supabase observatory observations'};
  }
  async function fetchLayers(force) {
    if (!force && cached && Date.now()-cachedAt<30000) return cached;
    if (pending) return pending;
    pending=(async()=>{
      const jobs=[];
      const observationSectors=['wildfires','volcanoes','oceans','earth_observation','space_weather'];
      observationSectors.forEach(sector=>jobs.push({kind:'observations',sector,run:()=>read('observatory_observations',
        'select=id,source_id,sector,external_id,observed_at,published_at,latitude,longitude,metric,value,unit,quality_status&sector=eq.'+encodeURIComponent(sector)+'&latitude=not.is.null&longitude=not.is.null&order=observed_at.desc,id.desc&limit=65')}));
      jobs.push({kind:'events',run:()=>read('earth_events','select=id,event_type,occurred_at,latitude,longitude,magnitude,depth_km,title,description,source_id,metadata&latitude=not.is.null&longitude=not.is.null&order=occurred_at.desc,id.desc&limit=160')});
      jobs.push({kind:'telemetry',run:()=>read('seed_telemetry_samples','select=sample_id,sampled_at,latitude,longitude,altitude_km,speed_km_s,source&latitude=not.is.null&longitude=not.is.null&order=sampled_at.desc,sample_id.desc&limit=70')});
      jobs.push({kind:'products',run:()=>read('earth_observation_products','select=id,external_id,collection,acquired_at,published_at,cloud_cover,geometry,metadata,asset_links&order=acquired_at.desc,id.desc&limit=60')});
      jobs.push({kind:'volcanoes',run:()=>read('volcano_observations','select=id,volcano_id,volcano_name,observed_at,latitude,longitude,alert_level,color_code,threat_level,synopsis,notice_id,notice_url,metadata&latitude=not.is.null&longitude=not.is.null&order=observed_at.desc,id.desc&limit=70')});
      jobs.push({kind:'sources',run:()=>read('observatory_sources','select=id,name,provider,slug,sector,active&active=is.true&limit=200')});
      const results=await Promise.allSettled(jobs.map(job=>job.run()));
      const sourcesResult=results[jobs.findIndex(job=>job.kind==='sources')];
      const sources=new Map((sourcesResult.status==='fulfilled'?sourcesResult.value:[]).map(row=>[row.id,row]));
      const items=[];let failed=0;
      results.forEach((result,index)=>{
        const job=jobs[index];if(result.status!=='fulfilled'){failed++;return}
        if(job.kind==='observations') result.value.filter(validPoint).forEach(row=>{
          const source=sources.get(row.source_id);
          items.push(normalizeObservation({...row,source_name:source?.name,provider:source?.provider}));
        });
        if(job.kind==='events') result.value.filter(validPoint).forEach(row=>{
          const type=String(row.event_type||'').toLowerCase();
          const sector=type.includes('earthquake')?'earthquakes':type.includes('severe')?'severe_weather':type.includes('volcano')?'volcanoes':type.includes('fire')?'wildfires':'other_events';
          items.push({...point(row),id:'earth-event-'+row.id,record_id:row.id,sector,event_type:row.event_type,observed_at:row.occurred_at,
            metric:sector==='earthquakes'?'magnitude':row.event_type,value:row.magnitude,unit:row.magnitude==null?'':'magnitude',
            quality_status:'reported',label:row.title||row.event_type||'Earth event',description:row.description,
            source_name:sources.get(row.source_id)?.name||'Earth event database',provider:'Supabase earth_events',metadata:row.metadata});
        });
        if(job.kind==='telemetry') result.value.filter(validPoint).forEach(row=>items.push({...point(row),id:'telemetry-'+row.sample_id,record_id:row.sample_id,
          sector:'telemetry_samples',observed_at:row.sampled_at,metric:'seed telemetry sample',value:row.speed_km_s,unit:'km/s',
          quality_status:'seed/sample data',label:'Telemetry sample #'+row.sample_id,source_name:row.source||'Supabase seed telemetry',
          provider:'Supabase seed_telemetry_samples',altitude_km:row.altitude_km,speed_km_s:row.speed_km_s}));
        if(job.kind==='products') result.value.forEach(row=>{const p=center(row.geometry);if(!p)return;items.push({...p,id:'earth-product-'+row.id,record_id:row.id,
          sector:'earth_observation_products',observed_at:row.acquired_at,published_at:row.published_at,geometry:row.geometry,
          collection:row.collection,cloud_cover:row.cloud_cover,metric:'satellite image footprint',value:row.cloud_cover,
          unit:row.cloud_cover==null?'':'% cloud cover',label:row.external_id||'Earth observation product',
          quality_status:'product footprint',source_name:'Earth observation product catalog',provider:row.collection||'Supabase earth_observation_products',
          asset_links:row.asset_links,metadata:row.metadata})});
        if(job.kind==='volcanoes') result.value.filter(validPoint).forEach(row=>items.push({...point(row),id:'volcano-alert-'+row.id,record_id:row.id,
          sector:'volcano_alerts',observed_at:row.observed_at,metric:'alert level',value:row.alert_level||row.threat_level||row.color_code,
          label:row.volcano_name||row.volcano_id||'Volcano notice',description:row.synopsis,quality_status:'reported',
          source_name:'Volcano observation database',provider:row.notice_url||'Supabase volcano_observations',metadata:row.metadata}));
      });
      items.sort((a,b)=>new Date(b.observed_at||0)-new Date(a.observed_at||0));
      const layers=SECTORS.map(sector=>{const rows=items.filter(item=>item.sector===sector);return {sector,label:LABELS[sector],loaded_count:rows.length,
        count:rows.length,latest_observed_at:rows[0]?.observed_at||null,source_name:rows[0]?.source_name||'No located records in this window'}});
      if(!items.length && failed===jobs.length) throw new Error('Supabase read access failed for every observatory dataset');
      cached={ts:Date.now(),source:'Direct read-only Supabase connection',count:items.length,partial:failed>0,failed_queries:failed,
        layers,items,loaded_window_per_layer:65};
      cachedAt=Date.now();return cached;
    })();
    try{return await pending}finally{pending=null}
  }
  window.EarthData={fetchLayers,readOnly:true,provider:'Supabase',url:URL};
})();
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=require('../public/js/map-data.js');

test('map coordinate validation rejects absent, blank, non-finite, and out-of-range coordinates',()=>{
  for(const item of [
    {latitude:null,longitude:12},
    {latitude:12,longitude:null},
    {latitude:'',longitude:12},
    {latitude:12,longitude:' '},
    {latitude:Infinity,longitude:1},
    {latitude:91,longitude:1},
    {latitude:1,longitude:181}
  ]) assert.equal(data.isValidPoint(item),false,JSON.stringify(item));
  assert.equal(data.isValidPoint({latitude:'0',longitude:'0'}),true);
  assert.equal(data.isValidPoint({latitude:-90,longitude:-180}),true);
});

test('map data merge keeps server and fallback records, deduplicates IDs, and preserves richer values',()=>{
  const result=data.mergeItems(
    [{id:'earth-event-1',sector:'earthquakes',latitude:10,longitude:20,label:'Quake',source_name:'Gateway'}],
    [
      {id:'earth-event-1',sector:'earthquakes',latitude:10,longitude:20,label:'Quake',source_name:null},
      {id:'observation-2',sector:'wildfires',latitude:-4,longitude:30,label:'Fire'}
    ]
  );
  assert.equal(result.length,2);
  assert.equal(result.find(x=>x.id==='earth-event-1').source_name,'Gateway');
  assert.equal(result.find(x=>x.id==='observation-2').label,'Fire');
});

test('map layer counts come from the merged, renderable records',()=>{
  const layers=data.layersFromItems([
    {id:'1',sector:'wildfires',latitude:0,longitude:0},
    {id:'2',sector:'wildfires',latitude:1,longitude:1},
    {id:'3',sector:'earthquakes',latitude:2,longitude:2}
  ],{wildfires:{label:'Wildfires'},earthquakes:{label:'Earthquakes'},weather:{label:'Weather'}});
  assert.deepEqual(layers.map(x=>[x.sector,x.loaded_count]),[['wildfires',2],['earthquakes',1],['weather',0]]);
});

test('both map renderers merge partial API results with fallbacks',()=>{
  for(const file of ['public/js/leaflet-map.js','public/js/map.js']){
    const script=read(file);
    assert.match(script,/mergeMapItems\(serverItems,\s*fallbackItems\)/);
    assert.match(script,/layersFromItems\(items,sectors\)/);
    assert.match(script,/AbortSignal\.timeout\(15000\)/);
    assert.match(script,/function validPoint\(item\)\{return window\.EarthMapData\.isValidPoint\(item\)\}/);
    assert.match(script,/window\.__earthMapRendererReady=true/);
    assert.match(script,/Promise\.allSettled\(jobs\.map/);
  }
});

test('map loader falls back on script errors, timeouts, and failed initialization',()=>{
  const loader=read('public/js/map-loader.js');
  assert.match(loader,/Map renderer startup timed out/);
  assert.match(loader,/script\.onerror/);
  assert.match(loader,/__earthMapRendererReady/);
  assert.match(loader,/Both Leaflet CDNs failed or were blocked/);
  assert.match(loader,/__earthMapFallback=fallback/);
});

test('direct read-only browser Supabase calls are allowed by the Express CSP',()=>{
  const server=read('server.js');
  const client=read('public/js/supabase-public.js');
  assert.match(server,/https:\/\/iunxtsdczuvugttnwdky\.supabase\.co/);
  assert.match(client,/readOnly:true/);
  assert.doesNotMatch(client,/SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('Vercel serves the map as a public asset and rewrites clean map routes',()=>{
  const config=JSON.parse(read('vercel.json'));
  const html=read('map.html');
  assert.equal(html,read('public/map.html'));
  assert.ok(config.rewrites.some(x=>x.source==='/map'&&x.destination==='/map.html'));
  assert.ok(config.rewrites.some(x=>x.source==='/map/'&&x.destination==='/map.html'));
  assert.match(read('server.js'),/app\.get\(\['\/map', '\/map\/', '\/map\.html'\], \(req, res\) => res\.sendFile\(path\.join\(publicDir, 'map\.html'\)\)\)/);
  assert.match(html,/js\/map-data\.js\?v=20261012c/);
  assert.match(html,/js\/map-loader\.js\?v=20261012c/);
});

test('Vercel serves API routes through the Express app handler',()=>{
  const server=read('server.js');
  const api=read('src/routes/api.js');
  assert.match(server,/if\s*\(!process\.env\.VERCEL\)\s*\{\s*server\.listen/);
  assert.match(server,/module\.exports\s*=\s*process\.env\.VERCEL\s*\?\s*app\s*:\s*server/);
  assert.match(server,/app\.use\('\/api',\s*apiRoutes\)/);
  assert.match(api,/router\.get\('\/observatory\/layers'/);
});


test('global reference catalogue contains accurate, named features on all seven continents',()=>{
  const features=require('../public/js/map-global-features.js');
  const continents=['Africa','Asia','Europe','North America','South America','Oceania','Antarctica'];
  assert.equal(features.length,56);
  assert.deepEqual([...new Set(features.map(item=>item.continent))].sort(),continents.slice().sort());
  for(const continent of continents){
    const rows=features.filter(item=>item.continent===continent);
    assert.equal(rows.length,8,continent);
  }
  assert.equal(new Set(features.map(item=>item.id)).size,features.length);
  for(const item of features){
    assert.equal(item.sector,'global_features');
    assert.equal(typeof item.label,'string');
    assert.ok(item.label.length>2);
    assert.ok(item.feature_type);
    assert.equal(data.isValidPoint(item),true,item.label);
    assert.match(item.quality_status,/not a live event/i);
  }
});

test('synthetic seed telemetry is excluded from map rendering and real orbital positions use SGP4',()=>{
  for(const file of ['public/js/leaflet-map.js','public/js/map.js']){
    const renderer=read(file);
    assert.match(renderer,/row\.sector!=='telemetry_samples'/);
    assert.match(renderer,/global_features/);
    assert.match(renderer,/satellite_positions/);
    assert.match(renderer,/refreshLiveOverlayData/);
  }
  const live=read('public/js/map-live-data.js');
  assert.match(live,/\/api\/earthquakes/);
  assert.match(live,/twoline2satrec/);
  assert.match(live,/eciToGeodetic/);
  assert.match(live,/CelesTrak GP orbital elements/);
  assert.doesNotMatch(live,/Math\.sin|Math\.cos/);
});

test('map API excludes synthetic seed telemetry from operational layers',()=>{
  const api=read('src/routes/api.js');
  const route=api.slice(api.indexOf("router.get('/observatory/layers'"),api.indexOf('const OBSERVATORY_DATASETS'));
  assert.doesNotMatch(route,/supabaseQuery\('seed_telemetry_samples'/);
  assert.doesNotMatch(route,/telemetry_samples:\s*'Seed telemetry samples'/);
  assert.match(route,/layers:v5/);
});

test('desktop shared navigation occupies its own layout row and page content clears it',()=>{
  const css=read('public/css/mobile-nav.css');
  assert.match(css,/\.site-nav-cluster\{position:relative/);
  assert.match(css,/height:50px/);
  assert.match(css,/\.map-header\{top:62px!important\}/);
  assert.match(css,/\.map-panel,\.catalog-panel\{top:112px!important\}/);
  assert.match(css,/\.hud-header\{top:64px!important\}/);
  assert.match(css,/sat-workspace\{height:calc\(100dvh - 116px\)!important\}/);
  const nav=read('public/js/navigation.js');
  assert.match(nav,/document\.body\.prepend\(cluster\)/);
  for(const file of ['map.html','public/map.html','dashboard.html','satellites.html','index.html','about.html','data-policy.html','privacy.html','terms.html']){
    assert.match(read(file),/mobile-nav\.css\?v=20261012c/,file);
    assert.match(read(file),/navigation\.js\?v=20261012c/,file);
  }
  assert.equal(read('map.html'),read('public/map.html'));
});

test('map tiles never use CARTO raster endpoints that display API-key watermarks',()=>{
  const leaflet=read('public/js/leaflet-map.js');
  const canvas=read('public/js/map.js');
  const html=read('map.html');
  const server=read('server.js');
  for(const source of [leaflet,canvas]) assert.ok(!source.includes('basemaps.cartocdn.com'));
  assert.ok(leaflet.indexOf('https://tile.openstreetmap.org/') < leaflet.indexOf('https://server.arcgisonline.com/'));
  assert.ok(canvas.indexOf('https://tile.openstreetmap.org/') < canvas.indexOf('https://server.arcgisonline.com/'));
  assert.ok(server.includes('https://server.arcgisonline.com'));
  assert.ok(html.includes('js/map-loader.js?v=20261012c'));
  assert.ok(!html.includes('carto.com/attributions'));
});

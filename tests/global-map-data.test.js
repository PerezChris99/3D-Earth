'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('curated geography points span all continents with valid coordinates and stable identities',()=>{
 const features=require('../public/js/map-global-features.js');
 const mapData=require('../public/js/map-data.js');
 const expected=['Africa','Asia','Europe','North America','South America','Oceania','Antarctica'];
 assert.equal(features.length,56);
 assert.deepEqual([...new Set(features.map(f=>f.continent))].sort(),expected.slice().sort());
 assert.equal(new Set(features.map(f=>f.id)).size,56);
 for(const continent of expected){
  assert.equal(features.filter(f=>f.continent===continent).length,8);
 }
 for(const feature of features){
  assert.equal(feature.sector,'global_features');
  assert.equal(mapData.isValidPoint(feature),true,feature.label);
  assert.ok(feature.label&&feature.feature_type&&feature.source_name);
  assert.match(feature.quality_status,/not a live event/i);
 }
});

test('real-time map position calculations are from official feed records, not sinusoidal placeholder data',()=>{
 const live=read('public/js/map-live-data.js');
 assert.match(live,/\/api\/earthquakes/);
 assert.match(live,/\/api\/thermal/);
 assert.match(live,/\/api\/satellites\?group=/);
 assert.match(live,/twoline2satrec/);
 assert.match(live,/propagator\.propagate/);
 assert.match(live,/eciToGeodetic/);
 assert.doesNotMatch(live,/Math\.sin|Math\.cos/);
});

test('map renderers filter synthetic samples and keep reference features distinct from observations',()=>{
 for(const file of ['public/js/leaflet-map.js','public/js/map.js']){
  const source=read(file);
  assert.match(source,/row&&row\.sector!=='telemetry_samples'/);
  assert.match(source,/global_features/);
  assert.match(source,/satellite_positions/);
  assert.match(source,/refreshLiveOverlayData/);
 }
});

test('site nav is an in-flow desktop row; primary page panels sit below it',()=>{
 const css=read('public/css/mobile-nav.css');
 assert.match(css,/\.site-nav-cluster\{position:relative/);
 assert.match(css,/height:50px/);
 for(const rule of ['.landing-nav{top:50px!important}','.hud-header{top:64px!important}',
   '.layer-panel,.observatory-card{top:112px!important}','.map-header{top:62px!important}',
   '.map-panel,.catalog-panel{top:112px!important}',
   'body.satellite-workspace .sat-workspace{height:calc(100dvh - 116px)!important}']){
  assert.ok(css.includes(rule),rule);
 }
 const nav=read('public/js/navigation.js');
 assert.match(nav,/document\.body\.prepend\(cluster\)/);
});

test('all pages load matching navigation styles and the map deploys matching HTML mirrors',()=>{
 const files=['map.html','public/map.html','dashboard.html','satellites.html','index.html','about.html','data-policy.html','privacy.html','terms.html'];
 for(const file of files){
  const html=read(file);
  assert.match(html,/mobile-nav\\.css\\?v=20261012c/,file);
  assert.match(html,/navigation\\.js\\?v=20261012c/,file);
 }
 assert.equal(read('map.html'),read('public/map.html'));
});

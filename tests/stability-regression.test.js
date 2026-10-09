'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Supabase REST requests have a bounded timeout and safe diagnostic context', () => {
  const source = read('src/supabase.js');
  assert.match(source, /AbortSignal\.timeout\(12_000\)/);
  assert.match(source, /Supabase REST request timed out/);
  assert.match(source, /Supabase REST ' \+ response\.status/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEY.*console\.(log|error)/);
});

test('satellite focus offsets the camera from the satellite radial line without translating Earth', () => {
  const source = read('public/js/globe.js');
  assert.match(source, /const tangent=new THREE\.Vector3\(0,1,0\)\.cross\(radial\)/);
  assert.match(source, /multiplyScalar\(focusDistance\*\.32\)/);
  assert.match(source, /controls\.target\.set\(0,0,0\)/);
  assert.match(source, /earthGroup\.rotation\.y\+=dt\*7\.2921159e-5/);
});

test('map tile provider failures are recoverable and not cached permanently', () => {
  const source = read('public/js/map.js');
  assert.match(source, /basemaps\.cartocdn\.com\/dark_all/);
  assert.match(source, /basemaps\.cartocdn\.com\/rastertiles\/voyager/);
  assert.match(source, /tile\.openstreetmap\.org/);
  assert.match(source, /Date\.now\(\)-\(cached\.failedAt\|\|0\)<30000/);
});

test('satellite page switches to a scrollable single-column layout on mobile', () => {
  const css = read('public/css/satellites.css');
  const mobile = css.slice(css.indexOf('@media(max-width:760px)'));
  assert.match(mobile, /overflow-y:auto/);
  assert.match(mobile, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(mobile, /sat-visual\{min-height:230px/);
});

test('observatory API exposes a safe database health probe and map preserves server errors', () => {
  const api = read('src/routes/api.js');
  const map = read('public/js/map.js');
  assert.match(api, /router\.get\('\/observatory\/health'/);
  assert.match(api, /database: connected \? 'connected' : 'unavailable'/);
  assert.match(api, /database: 'not-configured'/);
  assert.match(map, /body\.error\|\|body\.message/);
  assert.match(map, /direct catalog fallback returned no located records/);
});

test('Leaflet map supports database overlays while retaining the offline canvas fallback', () => {
  const html = read('map.html');
  const loader = read('public/js/map-loader.js');
  const leaflet = read('public/js/leaflet-map.js');
  const fallback = read('public/js/map.js');
  assert.match(html, /id="leaflet-map"/);
  assert.match(loader, /loadLeaflet\(0\)/);
  assert.match(loader, /fallback\(\)/);
  assert.match(leaflet, /\/api\/observatory\/layers\?limit=160/);
  assert.match(leaflet, /\/api\/observatory\/catalog\?/);
  assert.match(fallback, /function drawBase/);
});


test('production asset policy prevents stale JS/CSS from hiding merged implementations', () => {
  const config = JSON.parse(read('vercel.json'));
  const jsCss = config.headers.find(rule => rule.source === '/(.*)\\.(js|css)');
  assert.ok(jsCss, 'JavaScript and CSS need an explicit cache policy');
  assert.equal(jsCss.headers.find(header => header.key === 'Cache-Control')?.value, 'no-cache, no-store, must-revalidate');
  assert.match(read('dashboard.html'), /\/js\/globe\.js\?v=20261009d/);
  assert.match(read('map.html'), /\/js\/map-loader\.js\?v=20261009d/);
  assert.match(read('satellites.html'), /\/js\/satellites\.js\?v=20261009d/);
});

test('Earth rotation is visibly continuous rather than imperceptible real-time sidereal rotation', () => {
  const source = read('public/js/globe.js');
  assert.match(source, /earthGroup\.rotation\.y\+=dt\*7\.2921159e-5\*100/);
  assert.match(source, /accelerated visualization/);
});

test('observatory summary tolerates a failing optional table and reports partial data', () => {
  const api = read('src/routes/api.js');
  const route = api.slice(api.indexOf("router.get('/observatory/summary'"), api.indexOf('function collectGeometryCoordinates'));
  assert.match(route, /Promise\.all\(querySpecs\.map/);
  assert.match(route, /partial: failedQueries\.length > 0/);
  assert.match(route, /failed_queries:/);
  assert.match(route, /failedQueries\.length === querySpecs\.length/);
});

test('database health diagnoses each required dataset without exposing credentials', () => {
  const api = read('src/routes/api.js');
  const route = api.slice(api.indexOf("router.get('/observatory/health'"), api.indexOf("router.get('/observatory/summary'"));
  for (const table of ['observatory_sources', 'observatory_observations', 'earth_events', 'satellites', 'satellite_observations', 'seed_telemetry_samples']) {
    assert.ok(route.includes("'" + table + "'"), table);
  }
  assert.match(route, /failed_tables/);
  assert.match(route, /schema_or_access/);
  assert.doesNotMatch(route, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test('database explorer loads only when opened, reducing initial API and database load', () => {
  assert.match(read('public/js/leaflet-map.js'), /function boot\(\)\{initMap\(\);wire\(\);loadData\(false\)\}/);
  assert.match(read('public/js/map.js'), /function boot\(\)\{wire\(\);render\(\);loadData\(false\)\}/);
  assert.match(read('public/js/leaflet-map.js'), /catalog-toggle.*loadCatalog\(true\)/);
});

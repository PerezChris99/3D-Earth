const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('all application JavaScript parses', () => {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && full.endsWith('.js') && !full.includes('node_modules')) files.push(full);
    }
  }
  walk(root);
  assert.ok(files.length > 10, 'expected application JavaScript files');
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Syntax error in ${path.relative(root, file)}: ${result.stderr}`);
  }
});

test('index exposes the core geospatial application surfaces', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const required of [
    'leaflet.js', 'public/js/geo-weather.js', 'locate-me-btn',
    'geo-consent', 'osm-map', 'weather-forecast', 'weather-local-time'
  ]) assert.ok(html.includes(required), `missing ${required}`);
});

test('geospatial module uses high-accuracy browser positioning', () => {
  const source = fs.readFileSync(path.join(root, 'public/js/geo-weather.js'), 'utf8');
  assert.match(source, /enableHighAccuracy:\s*true/);
  assert.match(source, /maximumAge:\s*0/);
  assert.match(source, /accuracy/);
});

test('OpenStreetMap attribution and official tile endpoint are configured', () => {
  const source = fs.readFileSync(path.join(root, 'public/js/geo-weather.js'), 'utf8');
  assert.match(source, /tile\.openstreetmap\.org/);
  assert.match(source, /OpenStreetMap contributors/);
});

test('weather uses automatic timezone resolution and current conditions', () => {
  const source = fs.readFileSync(path.join(root, 'public/js/geo-weather.js'), 'utf8');
  assert.match(source, /api\.open-meteo\.com/);
  assert.match(source, /timezone:\s*'auto'/);
  assert.match(source, /temperature_2m/);
  assert.match(source, /sunrise,sunset/);
});

test('server exposes the reverse geocoding route', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /require\('\.\/src\/routes\/geocode'\)/);
  assert.match(server, /app\.use\('\/api\/geocode'/);
  assert.match(server, /app\.use\('\/api\/weather'/);
});

test('dashboard control contracts match the compact UI', () => {
  const dashboard = fs.readFileSync(path.join(root, 'public/js/osint-dashboard.js'), 'utf8');
  const globe = fs.readFileSync(path.join(root, 'public/js/script.js'), 'utf8');
  assert.match(dashboard, /row\.classList\.toggle\('active'/);
  assert.match(dashboard, /document\.body\.classList\.toggle\('left-open'/);
  assert.match(dashboard, /document\.body\.classList\.toggle\('right-open'/);
  assert.match(globe, /btn-follow-iss.*resetView/);
  assert.match(globe, /globeCtrlBody\.classList\.toggle\('open'/);
});

test('privileged authentication requires a configured secret', () => {
  const api = fs.readFileSync(path.join(root, 'src/routes/api.js'), 'utf8');
  const authUi = fs.readFileSync(path.join(root, 'public/js/aoi-tool.js'), 'utf8');
  assert.match(api, /ANALYST_AUTH_SECRET/);
  assert.match(api, /timingSafeEqual/);
  assert.match(authUi, /a-secret/);
});

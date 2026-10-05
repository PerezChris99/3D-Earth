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

test('landing and dashboard expose the public application surfaces', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /dashboard\.html/);
  assert.match(html, /landing\.js/);
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  for (const required of [
    'public/js/geo-weather.js', 'locate-me-btn',
    'geo-consent', 'osm-map', 'weather-forecast', 'weather-local-time'
  ]) assert.ok(dashboard.includes(required), `missing ${required}`);
  for (const legal of ['about.html','privacy.html','terms.html','data-policy.html'])
    assert.ok(html.includes(legal), `missing legal link ${legal}`);
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

test('dashboard rendering has a first-frame fallback path', () => {
  const globe = fs.readFileSync(path.join(root, 'public/js/script.js'), 'utf8');
  assert.match(globe, /createFallbackEarth/);
  assert.match(globe, /setAnimationLoop/);
  assert.match(globe, /globeFirstFrameRendered/);
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

test('landing presentation avoids common generic AI-template markers', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/landing.css'), 'utf8');
  for (const generic of ['READY WHEN YOU ARE', 'Explore the Globe', 'Learn More', 'repeat(3,1fr)'])
    assert.doesNotMatch(html + css, new RegExp(generic.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(html, /A working view/);
  assert.match(css, /Georgia/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /border-radius:9999px/);
});

test('legal and source pages use the formal information layout', () => {
  for (const file of ['about.html','privacy.html','terms.html','data-policy.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /class="info-layout"/);
    assert.match(html, /article-meta/);
    assert.match(html, /Updated|Effective|Reviewed/);
  }
  const data = fs.readFileSync(path.join(root, 'data-policy.html'), 'utf8');
  assert.match(data, /OpenStreetMap/);
  assert.match(data, /Open-Meteo/);
  assert.match(data, /non-commercial/i);
});

test('dashboard vendors Three.js and does not block on optional runtimes', () => {
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  for (const asset of [
    '/public/vendor/three-r128.min.js',
    '/public/vendor/OrbitControls-r128.js',
    '/public/vendor/GLTFLoader-r128.js'
  ]) assert.ok(dashboard.includes(asset), `missing local globe runtime asset: ${asset}`);
  assert.doesNotMatch(dashboard, /cdnjs\\.cloudflare\\.com\\/ajax\\/libs\\/three\\.js\\/r128/);
  assert.doesNotMatch(dashboard, /cdn\\.jsdelivr\\.net\\/npm\\/three@0\\.128\\.0\\/examples/);
  assert.doesNotMatch(dashboard, /unpkg\\.com\\/satellite\\.js/);
  assert.doesNotMatch(dashboard, /unpkg\\.com\\/leaflet@1\\.9\\.4\\/dist\\/leaflet\\.js/);
  assert.doesNotMatch(dashboard, /unpkg\\.com\\/leaflet@1\\.9\\.4\\/dist\\/leaflet\\.css/);
});
test('globe startup does not depend on remote assets or synthetic satellite layers', () => {
  const globe = fs.readFileSync(path.join(root, 'public/js/script.js'), 'utf8');
  assert.match(globe, /preserveDrawingBuffer: false/);
  assert.match(globe, /safeInitStep\('starfield', createStarfield\)/);
  assert.match(globe, /safeInitStep\('earth textures', enhanceEarthAppearance\)/);
  assert.match(globe, /fetch\('\/api\/satellites'/);
  assert.doesNotMatch(globe, /Using synthetic satellite fallback/);
  assert.match(globe, /InstancedMesh/);
  assert.match(globe, /MAX_REAL_SATELLITE_VISUALS/);
});

test('satellite tracking exposes real catalog identity and live inspection', () => {
  const globe = fs.readFileSync(path.join(root, 'public/js/script.js'), 'utf8');
  const inspector = fs.readFileSync(path.join(root, 'public/js/osint-dashboard.js'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src/routes/api.js'), 'utf8');
  assert.match(globe, /getSatelliteCatalogNumber/);
  assert.match(globe, /trackSatelliteSelection/);
  assert.match(globe, /propagate/);
  assert.match(inspector, /instanceId/);
  assert.match(inspector, /Current speed/);
  assert.match(inspector, /Time in space/);
  assert.match(inspector, /Launch date/);
  assert.match(api, /\/satellites\/:norad/);
});

test('location integration keeps one WGS84 coordinate synchronized across map and globe', () => {
  const geo = fs.readFileSync(path.join(root, 'public/js/geo-weather.js'), 'utf8');
  assert.match(geo, /wgs84ToUnitVector/);
  assert.match(geo, /placeMapMarker\(lat, lon, accuracy\)/);
  assert.match(geo, /addEarthMarker\(lat, lon\)/);
  assert.match(geo, /centerGlobe\(lat, lon\)/);
  assert.match(geo, /api\.pauseRotation/);
  assert.match(geo, /destination = world\.multiplyScalar\(2\.05\)/);
});

test('mobile navigation and project attribution are present across public pages', () => {
  for (const file of ['index.html','about.html','privacy.html','terms.html','data-policy.html','dashboard.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /mobile-bottom-nav/);
    assert.match(html, /https:\/\/kweeziperez\.com/);
    assert.match(html, /target="_blank"/);
  }
});

test('navigation prefetch and static caching contracts exist', () => {
  const nav = fs.readFileSync(path.join(root, 'public/js/navigation.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(nav, /rel = 'prefetch'/);
  assert.match(server, /stale-while-revalidate/);
  assert.match(server, /Cache-Control.*no-cache/);
});


test('globe startup is independent of window load and optional runtimes', () => {
  const globe = fs.readFileSync(path.join(root, 'public/js/script.js'), 'utf8');
  const geo = fs.readFileSync(path.join(root, 'public/js/geo-weather.js'), 'utf8');
  assert.match(globe, /DOMContentLoaded/);
  assert.match(globe, /loadExternalScriptOnce/);
  assert.match(globe, /ensureSatelliteRuntime/);
  assert.match(geo, /loadLeafletRuntime/);
  assert.match(geo, /DOMContentLoaded/);
});

test('real Earth assets and visual layers are initialized reliably', () => {
    assert.ok(script.includes('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg'));
    assert.ok(script.includes('textureUrls.earthBump'));
    assert.ok(script.includes('textureUrls.earthSpecular'));
    assert.ok(script.includes('textureUrls.earthLights'));
    assert.ok(script.includes('textureUrls.moon'));
    assert.ok(script.includes("safeInitStep('sun layer', createSun)"));
    assert.ok(script.includes("safeInitStep('moon layer', createMoon)"));
    assert.ok(script.includes("safeInitStep('satellite layer', createSatellites)"));
    assert.ok(script.includes("safeInitStep('night-lights layer', createNightLights)"));
    assert.ok(script.includes('normalScale = new THREE.Vector2(0.55, 0.55)'));
    assert.ok(script.includes('earth.material.specularMap = specular'));
    assert.ok(!script.includes('const bodyGeo = new THREE.BoxGeometry(0.018, 0.007, 0.007)'));
});

test('rendering uses deterministic celestial fallbacks and valid satellite loading', () => {
    assert.match(script, /async function fetchTLES\(\)/);
    assert.doesNotMatch(script, /async async function fetchTLES/);
    assert.match(script, /new THREE\.MeshPhongMaterial\(\{ color: 0xffffff, specular: 0x111111, shininess: 4 \}\)/);
    assert.match(script, /new THREE\.PointsMaterial\(\{ size: 0\.075/);
    assert.match(script, /new THREE\.Mesh\(new THREE\.SphereGeometry\(0\.11, 24, 24\)/);
    assert.match(script, /@r128\/examples\/textures\/planets/);
});

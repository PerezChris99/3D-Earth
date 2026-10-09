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

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('world map starts at a single world view and prevents duplicate wrapped tiles',()=>{
 const source=read('public/js/map.js');
 assert.match(source,/let zoom=2,centerLon=0,centerLat=0/);
 assert.match(source,/maxTile=Math\.pow\(2,z\)-1/);
 assert.match(source,/Math\.max\(0,Math\.floor\(originX\/256\)\)/);
 assert.doesNotMatch(source,/if\(dx>size\/2\)dx-=size/);
});

test('Locate Me uses an eased bounded flight and map zoom stays within supported world bounds',()=>{
 const source=read('public/js/map.js');
 assert.match(source,/function smoothFlyTo\(/);
 assert.match(source,/smoothFlyTo\(observer\.longitude,observer\.latitude,6\)/);
 assert.match(source,/zoom=clamp\(zoom\+\(e\.deltaY<0\?1:-1\),2,7\)/);
 assert.match(read('public/css/map.css'),/overscroll-behavior:none/);
});

test('satellite preview follows its container size and selected satellite can be toggled off from the list',()=>{
 const satellite=read('public/js/satellites.js');
 const css=read('public/css/satellites.css');
 const globe=read('public/js/globe.js');
 assert.match(satellite,/previewResizeObserver=new ResizeObserver\(resize\)/);
 assert.match(css,/max-height:34vh/);
 assert.match(globe,/if\(String\(row\.dataset\.norad\)===selectedNorad\)\{deselectSatellite\(\);return\}/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('planetary renderer keeps mandatory asset boot gate without night-light overlay',()=>{
  const source=fs.readFileSync(path.join(root,'public/js/globe.js'),'utf8');
  assert.match(source,/Promise\.all/);
  for(const asset of ['earth_atmos_2048.jpg','earth_normal_2048.jpg','earth_specular_2048.jpg','earth_clouds_1024.png','moon_1024.jpg']){
    assert.match(source,new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(source,/Planetary renderer ready/);
  assert.doesNotMatch(source,/earth_lights_2048\.png/);
  assert.doesNotMatch(source,/\bnight\s*=\s*new THREE\.Mesh/);
  assert.doesNotMatch(source,/night\.material/);
});

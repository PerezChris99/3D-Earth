const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('planetary renderer keeps mandatory asset boot gate with solar/lunar-masked night lights',()=>{
  const source=fs.readFileSync(path.join(root,'public/js/globe.js'),'utf8');
  assert.match(source,/Promise\.all/);
  for(const asset of ['earth_atmos_2048.jpg','earth_normal_2048.jpg','earth_specular_2048.jpg','earth_clouds_1024.png','moon_1024.jpg','earth_lights_2048.png']){
    assert.match(source,new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(source,/Planetary renderer ready/);
  assert.match(source,/nightLights=new THREE\.Mesh/);
  assert.match(source,/moonMask=smoothstep/);
  assert.doesNotMatch(source,/night\.material/);
});

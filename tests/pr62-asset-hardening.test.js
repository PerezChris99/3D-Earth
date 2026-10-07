const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('Earth assets retain immutable Vercel caching',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  const rule=config.headers.find(r=>r.source==='/assets/earth/(.*)');
  assert.ok(rule);
  const cache=rule.headers.find(h=>h.key==='Cache-Control');
  assert.equal(cache.value,'public, max-age=31536000, immutable');
});

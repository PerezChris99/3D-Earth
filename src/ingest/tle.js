/**
 * Fetch and parse current GP/TLE orbital elements from CelesTrak.
 * Provider access is cached per catalogue group to avoid repeated upstream requests.
 */
const https=require('https');
const cache=require('../cache');
const TLE_TTL_MS=2*60*60*1000;
const GROUPS=new Set(['stations','weather','gps-ops','science','starlink','active']);
const TLE_URL='https://celestrak.org/NORAD/elements/gp.php';
function httpsGet(url){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('TLE fetch timeout')),15000);https.get(url,{headers:{'User-Agent':'3D-Earth/1.0'}},res=>{if(res.statusCode!==200){clearTimeout(timeout);res.resume();return reject(new Error('HTTP '+res.statusCode))}let raw='';res.on('data',chunk=>{raw+=chunk;if(raw.length>5000000){res.destroy();reject(new Error('Response too large'))}});res.on('end',()=>{clearTimeout(timeout);resolve(raw)});res.on('error',err=>{clearTimeout(timeout);reject(err)})}).on('error',err=>{clearTimeout(timeout);reject(err)})})}
function parseTLE(text){const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean),items=[];for(let i=0;i+2<lines.length;i+=3){const name=lines[i],tle1=lines[i+1],tle2=lines[i+2];if(!tle1.startsWith('1 ')||!tle2.startsWith('2 '))continue;const match=tle1.match(/^1\s+(\d{1,9})/);items.push({name,tle1,tle2,norad:match?Number(match[1]):null,type:'PAYLOAD'})}return items}
async function getTLEs(requestedGroup='active'){const group=GROUPS.has(String(requestedGroup).toLowerCase())?String(requestedGroup).toLowerCase():'active';const cacheKey='tle:'+group;const cached=cache.get(cacheKey);if(cached)return cached;try{const raw=await httpsGet(TLE_URL+'?GROUP='+encodeURIComponent(group.toUpperCase())+'&FORMAT=tle');const parsed=parseTLE(raw);if(parsed.length)cache.set(cacheKey,parsed,TLE_TTL_MS);return parsed}catch(error){console.error('[TLE] Fetch failed:',error.message);return[]}}
module.exports={getTLEs};
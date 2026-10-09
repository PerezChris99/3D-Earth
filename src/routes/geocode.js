'use strict';

const express = require('express');
const net = require('node:net');
const router = express.Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1100;
const cache = new Map();
const NETWORK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const networkCache = new Map();
let lastRequestAt = 0;
let queue = Promise.resolve();

function keyFor(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

async function throttledFetch(url) {
  const run = async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': '3D-Earth/1.0 (+https://github.com/PerezChris99/3D-Earth)'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    return response.json();
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

function isPrivateIp(ip) {
 if(net.isIP(ip)===4){const o=ip.split('.').map(Number);return o[0]===10||o[0]===127||o[0]===0||(o[0]===169&&o[1]===254)||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168)}
 return ip==='::1'||/^f[cd]/i.test(ip)||/^fe80:/i.test(ip);
}
router.get('/network',async(req,res)=>{
 const ip=String(req.ip||'').replace(/^::ffff:/i,'');
 if(!ip||net.isIP(ip)===0||isPrivateIp(ip))return res.json({isp:null,organization:null,city:null,region:null,country:null,approximate:true});
 const cached=networkCache.get(ip);if(cached&&cached.expiresAt>Date.now())return res.set('Cache-Control','private, max-age=300').json(cached.value);
 try{const response=await fetch('https://ipwho.is/'+encodeURIComponent(ip),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Network lookup HTTP '+response.status);const data=await response.json();if(data.success===false)throw new Error('Network lookup did not resolve');const value={isp:data.connection?.isp||null,organization:data.connection?.org||null,city:data.city||null,region:data.region||null,country:data.country||null,approximate:true,source:'IP network estimate'};networkCache.set(ip,{value,expiresAt:Date.now()+NETWORK_CACHE_TTL_MS});if(networkCache.size>2000)networkCache.delete(networkCache.keys().next().value);res.set('Cache-Control','private, max-age=300').json(value)}catch(error){res.status(502).json({error:'Network/ISP lookup unavailable.'})}
});

router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid WGS84 coordinates.' });
  }
  const key = keyFor(lat, lon);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    const data = await throttledFetch(url);
    const value = {
      display_name: data.display_name || 'Selected coordinates',
      lat: data.lat,
      lon: data.lon,
      address: data.address || {},
      osm_type: data.osm_type || null,
      osm_id: data.osm_id || null
    };
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    res.json(value);
  } catch (error) {
    res.status(502).json({ error: 'Reverse geocoding unavailable.' });
  }
});

module.exports = router;

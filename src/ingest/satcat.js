/**
 * SATCAT metadata lookup.
 * CelesTrak SATCAT is the catalog source for ownership, launch and decay metadata.
 */
const https = require('https');
const cache = require('../cache');

const TTL = 6 * 60 * 60 * 1000;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SATCAT request timeout')), 10000);
    https.get(url, { headers: { 'User-Agent': '3D-Earth/1.0' } }, res => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        raw += chunk;
        if (raw.length > 100000) res.destroy(new Error('SATCAT response too large'));
      });
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
      res.on('error', e => { clearTimeout(timer); reject(e); });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}

async function getSatelliteCatalog(catnr) {
  const id = String(catnr || '').replace(/\D/g, '');
  if (!id || id.length > 9) throw new Error('Invalid catalog number');
  const key = `satcat:${id}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const url = `https://celestrak.org/satcat/records.php?CATNR=${encodeURIComponent(id)}&FORMAT=JSON`;
  const data = await getJson(url);
  const record = Array.isArray(data) ? data[0] : data;
  if (!record || typeof record !== 'object') throw new Error('Satellite not found');
  cache.set(key, record, TTL);
  return record;
}

module.exports = { getSatelliteCatalog };

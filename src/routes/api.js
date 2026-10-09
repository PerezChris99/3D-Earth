/**
 * src/routes/api.js
 * All REST API route handlers.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../logger');
const { query: supabaseQuery, isConfigured: supabaseConfigured } = require('../supabase');

const { getTLEs } = require('../ingest/tle');
const { getSatelliteCatalog } = require('../ingest/satcat');
const { getFlights } = require('../ingest/flights');
const { getEarthquakes } = require('../ingest/earthquakes');
const { getThermalHotspots } = require('../ingest/thermal');
const { issueToken } = require('../auth');
const { sanitizeRequest } = require('../middleware/sanitize');
const cache = require('../cache');

const RESPONSE_TTL_MS = 5_000;
function cacheable(res) { res.set('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30'); }

router.use(sanitizeRequest);

router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), ts: Date.now() });
});

router.get('/status', (req, res) => {
    const mem = process.memoryUsage();
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), env: process.env.NODE_ENV || 'development', memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB', heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB', rss: Math.round(mem.rss / 1024 / 1024) + 'MB' }, ts: Date.now(), database: supabaseConfigured() ? 'configured' : 'not-configured' });
});

router.post('/auth/token', (req, res) => {
    const userId = String(req.body.userId || 'anonymous').slice(0, 64);
    const role = ['viewer', 'analyst', 'admin'].includes(req.body.role) ? req.body.role : 'viewer';
    const privilegedSecret = process.env.ANALYST_AUTH_SECRET;
    if (role !== 'viewer') {
        const supplied = Buffer.from(String(req.body.secret || ''));
        const expected = Buffer.from(String(privilegedSecret || ''));
        if (!privilegedSecret || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(403).json({ error: 'Privileged authentication required.' });
    }
    res.json({ token: issueToken(userId, role) });
});

router.get('/positions', async (req, res) => {
    try {
        const payload = await cache.getOrSet('api:positions', async () => {
            const [satellites, flights, earthquakes, thermal] = await Promise.allSettled([getTLEs('stations'), getFlights(), getEarthquakes(), getThermalHotspots()]);
            return { ts: Date.now(), satellites: satellites.status === 'fulfilled' ? satellites.value : [], flights: flights.status === 'fulfilled' ? flights.value : [], earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [], thermal: thermal.status === 'fulfilled' ? thermal.value : [] };
        }, RESPONSE_TTL_MS);
        cacheable(res); res.json(payload);
    } catch (err) {
        logger.error('API', '/positions error', { message: err.message, id: req.requestId });
        res.status(500).json({ error: 'Data gateway failure' });
    }
});

router.get('/satellites', async (req, res) => {
    try { const requestedGroup = String(req.query.group || 'stations').toLowerCase(); const allowed = new Set(['stations','weather','gps-ops','science','starlink','active']); const group = allowed.has(requestedGroup) ? requestedGroup : 'stations'; const payload = await cache.getOrSet('api:satellites:'+group, async () => ({ ts: Date.now(), source: 'CelesTrak GP', group, items: await getTLEs(group) }), 15_000); cacheable(res); res.json(payload); }
    catch (err) { logger.error('API', '/satellites error', { message: err.message }); res.status(500).json({ error: 'Satellite data unavailable' }); }
});

router.get('/satellites/:norad', async (req, res) => {
    try { const norad = String(req.params.norad || '').replace(/\\D/g, ''); if (!norad || norad.length > 9) return res.status(400).json({ error: 'Invalid satellite catalog number' }); cacheable(res); res.json(await getSatelliteCatalog(norad)); }
    catch (err) { logger.error('API', '/satellites/:norad error', { message: err.message }); res.status(404).json({ error: 'Satellite catalog record unavailable' }); }
});

router.get('/flights', async (req, res) => { try { cacheable(res); res.json(await getFlights()); } catch (err) { logger.error('API', '/flights error', { message: err.message }); res.status(500).json({ error: 'Flight data unavailable' }); } });
router.get('/earthquakes', async (req, res) => { try { cacheable(res); res.json(await getEarthquakes()); } catch (err) { logger.error('API', '/earthquakes error', { message: err.message }); res.status(500).json({ error: 'Seismic data unavailable' }); } });
router.get('/thermal', async (req, res) => { try { cacheable(res); res.json(await getThermalHotspots()); } catch (err) { logger.error('API', '/thermal error', { message: err.message }); res.status(500).json({ error: 'Thermal data unavailable' }); } });

router.get('/observatory/health', async (req, res) => {
    if (!supabaseConfigured()) {
        return res.status(503).json({ status: 'unavailable', database: 'not-configured', reason: 'Supabase server credentials are not configured' });
    }
    const startedAt = Date.now();
    try {
        await supabaseQuery('observatory_sources', 'select=id&limit=1');
        res.json({ status: 'ok', database: 'connected', latency_ms: Date.now() - startedAt, ts: Date.now() });
    } catch (err) {
        logger.error('API', '/observatory/health error', { message: err.message });
        const reason = /timed out/i.test(err.message) ? 'timeout' : /REST 4\d\d/i.test(err.message) ? 'schema_or_access' : 'upstream_unavailable';
        res.status(503).json({ status: 'unavailable', database: 'unavailable', reason, message: 'The observatory database health check failed.' });
    }
});

router.get('/observatory/summary', async (req, res) => {
    try {
        if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase server integration is not configured' });
        const [satellites, observations, samples, events, sources, sectorRows] = await Promise.all([
            supabaseQuery('satellites', 'select=id,norad_id,name,object_type,owner_country,operator&order=name.asc&limit=300'),
            supabaseQuery('satellite_observations', 'select=id,satellite_id,observed_at,latitude,longitude,altitude_km,speed_km_s&order=observed_at.desc&limit=20'),
            supabaseQuery('seed_telemetry_samples', 'select=sample_id,sampled_at,latitude,longitude,altitude_km,speed_km_s&order=sample_id.asc&limit=20'),
            supabaseQuery('earth_events', 'select=id,event_type,occurred_at,latitude,longitude,magnitude,title&order=occurred_at.desc&limit=20'),
            supabaseQuery('observatory_sources', 'select=id,slug,sector,name,provider,authority_level,expected_refresh_seconds,coverage,active&order=sector.asc'),
            supabaseQuery('observatory_sources', 'select=sector&active=is.true&order=sector.asc'),
        ]);
        const freshness = {};
        const sectors = [...new Set(sectorRows.map(row => row.sector).filter(Boolean))];
        const latestRows = (await Promise.all(sectors.map(sector =>
            supabaseQuery('observatory_observations', 'select=sector,observed_at,source_id,quality_status&id=not.is.null&sector=eq.' + encodeURIComponent(sector) + '&order=observed_at.desc,id.desc&limit=1')
        ))).flat();
        for (const row of latestRows) {
            if (!freshness[row.sector]) {
                const ageSeconds = Math.max(0, (Date.now() - new Date(row.observed_at).getTime()) / 1000);
                const source = sources.find(item => item.id === row.source_id) || null;
                freshness[row.sector] = { latest_observed_at: row.observed_at, age_seconds: Math.round(ageSeconds), status: source?.expected_refresh_seconds && ageSeconds <= source.expected_refresh_seconds ? 'LIVE' : ageSeconds < 86400 ? 'RECENT' : 'STALE', quality_status: row.quality_status };
            }
        }
        cacheable(res); res.json({ ts: Date.now(), source: 'Supabase', satellites, observations, samples, events, observatory: { sources, freshness } });
    } catch (err) {
        logger.error('API', '/observatory/summary error', { message: err.message });
        res.status(502).json({ error: 'Supabase observatory data unavailable' });
    }
});

function collectGeometryCoordinates(value, out = []) {
    if (!Array.isArray(value)) return out;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') out.push([value[0], value[1]]);
    else value.forEach(child => collectGeometryCoordinates(child, out));
    return out;
}
function geometryCenter(geometry) {
    const ringStats = ring => {
        let crossSum = 0, xSum = 0, ySum = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const x0 = Number(ring[j]?.[0]), y0 = Number(ring[j]?.[1]), x1 = Number(ring[i]?.[0]), y1 = Number(ring[i]?.[1]);
            if (![x0,y0,x1,y1].every(Number.isFinite)) continue;
            const cross = x0 * y1 - x1 * y0;
            crossSum += cross; xSum += (x0 + x1) * cross; ySum += (y0 + y1) * cross;
        }
        const signedArea = crossSum / 2;
        if (Math.abs(signedArea) < 1e-10) return null;
        return { area: Math.abs(signedArea), longitude: xSum / (6 * signedArea), latitude: ySum / (6 * signedArea) };
    };
    const polygonStats = polygon => {
        if (!Array.isArray(polygon) || !polygon.length) return null;
        const outer = ringStats(polygon[0]); if (!outer) return null;
        let area = outer.area, x = outer.longitude * outer.area, y = outer.latitude * outer.area;
        for (const hole of polygon.slice(1)) { const stat = ringStats(hole); if (!stat) continue; area -= stat.area; x -= stat.longitude * stat.area; y -= stat.latitude * stat.area; }
        return area > 1e-10 ? { area, longitude: x / area, latitude: y / area } : outer;
    };
    if (!geometry || !geometry.type || !geometry.coordinates) return null;
    let center = null;
    if (geometry.type === 'Polygon') center = polygonStats(geometry.coordinates);
    else if (geometry.type === 'MultiPolygon') {
        const parts = geometry.coordinates.map(polygonStats).filter(Boolean), area = parts.reduce((sum, part) => sum + part.area, 0);
        if (area) center = { longitude: parts.reduce((sum, part) => sum + part.longitude * part.area, 0) / area, latitude: parts.reduce((sum, part) => sum + part.latitude * part.area, 0) / area };
    }
    if (!center) {
        const points = collectGeometryCoordinates(geometry.coordinates).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90);
        if (!points.length) return null;
        center = { longitude: points.reduce((sum, p) => sum + p[0], 0) / points.length, latitude: points.reduce((sum, p) => sum + p[1], 0) / points.length };
    }
    return Number.isFinite(center.longitude) && Number.isFinite(center.latitude) && Math.abs(center.longitude) <= 180 && Math.abs(center.latitude) <= 90 ? { longitude: center.longitude, latitude: center.latitude } : null;
}

router.get('/observatory/layers', async (req, res) => {
    try {
        if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase server integration is not configured' });
        const limit = Math.min(Math.max(Number(req.query.limit) || 160, 30), 220);
        const payload = await cache.getOrSet('api:observatory:layers:v4:' + limit, async () => {
            const sectors = ['wildfires', 'volcanoes', 'oceans', 'weather'];
            const settled = await Promise.allSettled([
                supabaseQuery('observatory_sources', 'select=id,slug,sector,name,provider,expected_refresh_seconds,active&active=is.true'),
                ...sectors.map(sector => supabaseQuery('observatory_observations',
                    'select=id,sector,external_id,observed_at,published_at,latitude,longitude,metric,value,unit,quality_status,source_id&sector=eq.' +
                    encodeURIComponent(sector) + '&latitude=not.is.null&longitude=not.is.null&order=observed_at.desc,id.desc&limit=' + limit)),
                supabaseQuery('earth_events', 'select=id,event_type,occurred_at,latitude,longitude,magnitude,depth_km,title,description,source_id,metadata&latitude=not.is.null&longitude=not.is.null&order=occurred_at.desc,id.desc&limit=350'),
                supabaseQuery('seed_telemetry_samples', 'select=sample_id,sampled_at,latitude,longitude,altitude_km,speed_km_s,source&order=sampled_at.desc,sample_id.desc&limit=180'),
                supabaseQuery('earth_observation_products', 'select=id,external_id,collection,acquired_at,published_at,cloud_cover,geometry,metadata,asset_links&order=acquired_at.desc,id.desc&limit=80'),
                supabaseQuery('volcano_observations', 'select=id,volcano_id,volcano_name,observed_at,latitude,longitude,alert_level,color_code,threat_level,synopsis,notice_id,notice_url,metadata&latitude=not.is.null&longitude=not.is.null&order=observed_at.desc,id.desc&limit=120')
            ]);
            const failures = settled.filter(result => result.status === 'rejected');
            const results = settled.map(result => result.status === 'fulfilled' ? result.value : []);
            const sources = results[0], bySource = new Map(sources.map(source => [source.id, source]));
            const items = results.slice(1, 1 + sectors.length).flat().filter(row =>
                Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) &&
                Math.abs(Number(row.latitude)) <= 90 && Math.abs(Number(row.longitude)) <= 180
            ).map(row => {
                const source = bySource.get(row.source_id) || null;
                const label = row.external_id || row.metric || row.sector;
                return { id: 'observation-' + row.id, record_id: row.id, sector: row.sector, external_id: row.external_id,
                    observed_at: row.observed_at, published_at: row.published_at, latitude: Number(row.latitude), longitude: Number(row.longitude),
                    metric: row.metric, value: row.value, unit: row.unit, quality_status: row.quality_status,
                    source_id: row.source_id, label: String(label), source_name: source?.name || source?.provider || row.sector,
                    provider: source?.provider || 'Source not listed', location_kind: 'reported point' };
            });
            const eventRows = results[1 + sectors.length];
            eventRows.forEach(row => {
                const type = String(row.event_type || '').toLowerCase();
                const sector = type === 'earthquake' ? 'earthquakes' : type === 'severe-weather' ? 'severe_weather' : 'other_events';
                items.push({ id: 'earth-event-' + row.id, record_id: row.id, sector, event_type: row.event_type,
                    observed_at: row.occurred_at, latitude: Number(row.latitude), longitude: Number(row.longitude),
                    metric: type === 'earthquake' ? 'magnitude' : row.event_type, value: row.magnitude,
                    unit: row.magnitude == null ? '' : 'magnitude', depth_km: row.depth_km, quality_status: 'reported',
                    label: row.title || row.event_type || 'Earth event', description: row.description,
                    source_name: 'Earth event database', provider: 'Supabase earth_events', location_kind: 'reported event coordinates',
                    metadata: row.metadata });
            });
            results[1 + sectors.length + 1].forEach(row => {
                const lat = Number(row.latitude), lon = Number(row.longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
                items.push({ id: 'telemetry-' + row.sample_id, record_id: row.sample_id, sector: 'telemetry_samples',
                    observed_at: row.sampled_at, latitude: lat, longitude: lon, altitude_km: row.altitude_km, speed_km_s: row.speed_km_s,
                    metric: 'seed telemetry sample', value: row.speed_km_s, unit: 'km/s', quality_status: 'seed/sample data',
                    label: 'Telemetry sample #' + row.sample_id, source_name: row.source || 'Supabase seed telemetry',
                    provider: 'Supabase seed_telemetry_samples', location_kind: 'stored sample coordinates' });
            });
            results[1 + sectors.length + 2].forEach(row => {
                const center = geometryCenter(row.geometry);
                if (!center) return;
                items.push({ id: 'earth-product-' + row.id, record_id: row.id, sector: 'earth_observation_products',
                    observed_at: row.acquired_at, published_at: row.published_at, latitude: center.latitude, longitude: center.longitude,
                    geometry: row.geometry, collection: row.collection, cloud_cover: row.cloud_cover, metric: 'satellite image footprint',
                    value: row.cloud_cover, unit: row.cloud_cover == null ? '' : '% cloud cover',
                    label: row.external_id || 'Earth observation product', quality_status: 'product footprint',
                    source_name: 'Earth observation product catalog', provider: row.collection || 'Supabase earth_observation_products',
                    location_kind: 'polygon footprint; globe marker uses footprint center', asset_links: row.asset_links, metadata: row.metadata });
            });
            results[1 + sectors.length + 3].forEach(row => {
                const lat = Number(row.latitude), lon = Number(row.longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
                items.push({ id: 'volcano-alert-' + row.id, record_id: row.id, sector: 'volcano_alerts',
                    observed_at: row.observed_at, latitude: lat, longitude: lon, metric: 'alert level',
                    value: row.alert_level || row.threat_level || row.color_code, unit: '', quality_status: 'reported',
                    label: row.volcano_name || row.volcano_id || 'Volcano notice', description: row.synopsis,
                    source_name: 'Volcano observation database', provider: row.notice_url || 'Supabase volcano_observations',
                    location_kind: 'reported volcano coordinates', metadata: row.metadata });
            });
            const sectorLabels = {
                wildfires: 'Wildfires', volcanoes: 'Volcano observations', oceans: 'Ocean observations', weather: 'Surface weather',
                earthquakes: 'Earthquakes', severe_weather: 'Severe weather events', other_events: 'Other Earth events',
                telemetry_samples: 'Seed telemetry samples', earth_observation_products: 'Earth-observation footprints', volcano_alerts: 'Volcano notices'
            };
            const layers = Object.keys(sectorLabels).map(sector => {
                const layerItems = items.filter(item => item.sector === sector);
                return { sector, label: sectorLabels[sector], loaded_count: layerItems.length,
                    latest_observed_at: layerItems.reduce((latest, item) => !latest || new Date(item.observed_at || 0) > new Date(latest) ? item.observed_at : latest, null),
                    source_name: layerItems[0]?.source_name || 'No located records returned in this window',
                    note: sector === 'telemetry_samples' ? 'Seed/development samples; not verified live satellite telemetry.' :
                        sector === 'earth_observation_products' ? 'Polygon footprint is exact; globe marker is the footprint center.' : 'Only stored coordinates are plotted.' };
            });
            items.sort((a, b) => new Date(b.observed_at || 0) - new Date(a.observed_at || 0));
            return { ts: Date.now(), source: 'Supabase database records', count: items.length, loaded_window_per_layer: limit, partial: failures.length > 0, failed_queries: failures.length,
                layers, items, non_geospatial: ['world_development_observations', 'space_weather_observations', 'astronomy_snapshots', 'celestial_bodies', 'data_sources', 'data_layer_configs', 'observatory_sources', 'environment_observations', 'ingestion_runs', 'observatory_ingestion_runs'] };
        }, 30_000);
        cacheable(res); res.json(payload);
    } catch (err) {
        logger.error('API', '/observatory/layers error', { message: err.message });
        res.status(502).json({ error: 'Supabase geographic observations unavailable' });
    }
});

const OBSERVATORY_DATASETS = {
    astronomy_snapshots: { select: 'id,captured_at,sun_ra_deg,sun_dec_deg,earth_sun_distance_au,moon_phase,metadata', order: 'captured_at.desc,id.desc' },
    celestial_bodies: { select: 'id,name,body_type,parent_body_id,radius_km,mass_kg,metadata,created_at', order: 'name.asc' },
    data_layer_configs: { select: 'layer_key,sector,source_id,expected_refresh_seconds,stale_after_seconds,status,notes,updated_at', order: 'sector.asc,layer_key.asc' },
    data_sources: { select: 'id,name,provider,endpoint,description,is_authoritative,created_at', order: 'name.asc' },
    earth_events: { select: 'id,event_type,occurred_at,latitude,longitude,magnitude,depth_km,title,description,source_id,metadata', order: 'occurred_at.desc,id.desc' },
    earth_observation_products: { select: 'id,source_id,external_id,collection,acquired_at,published_at,cloud_cover,geometry,metadata,asset_links,ingested_at', order: 'acquired_at.desc,id.desc' },
    environment_observations: { select: 'id,source_id,sector,external_id,observed_at,latitude,longitude,value,unit,metrics,quality_flag,ingested_at', order: 'observed_at.desc,id.desc' },
    ingestion_runs: { select: 'id,source_id,job_name,started_at,completed_at,status,records_received,records_accepted,error_message', order: 'started_at.desc,id.desc' },
    observatory_ingestion_runs: { select: 'id,source_id,started_at,completed_at,status,records_received,records_accepted,records_rejected,duplicates,http_status,latency_ms,error', order: 'started_at.desc,id.desc' },
    observatory_observations: { select: 'id,source_id,sector,external_id,observed_at,published_at,ingested_at,latitude,longitude,metric,value,unit,quality_status,freshness_sla_seconds,payload,source_revision', order: 'observed_at.desc,id.desc' },
    observatory_sources: { select: 'id,slug,sector,name,provider,authority_level,endpoint,expected_refresh_seconds,coverage,active,metadata,created_at,updated_at', order: 'sector.asc,name.asc' },
    satellite_observations: { select: 'id,satellite_id,observed_at,latitude,longitude,altitude_km,speed_km_s,position,source_id,metadata,created_at', order: 'observed_at.desc,id.desc' },
    satellite_passes: { select: 'id,satellite_id,observer_latitude,observer_longitude,aos_at,max_elevation_deg,los_at,duration_seconds,source_id,created_at', order: 'aos_at.desc,id.desc' },
    satellites: { select: 'id,norad_id,name,object_type,owner_country,operator,launch_date,decay_date,inclination_deg,period_min,apogee_km,perigee_km,source_id,source_updated_at,metadata,created_at,updated_at', order: 'name.asc,norad_id.asc' },
    seed_telemetry_samples: { select: 'sample_id,sampled_at,latitude,longitude,altitude_km,speed_km_s,source', order: 'sampled_at.desc,sample_id.desc' },
    space_weather_observations: { select: 'id,source_id,product,observed_at,kp,kp_index,metrics,ingested_at', order: 'observed_at.desc,id.desc' },
    volcano_observations: { select: 'id,source_id,volcano_id,volcano_name,observed_at,latitude,longitude,alert_level,color_code,threat_level,synopsis,notice_id,notice_url,metadata,ingested_at', order: 'observed_at.desc,id.desc' },
    world_development_observations: { select: 'id,source_id,country_code,country_name,indicator_code,indicator_name,period,value,unit,observation_status,metadata,ingested_at', order: 'period.desc,id.asc' }
};

router.get('/observatory/catalog', async (req, res) => {
    try {
        if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase server integration is not configured' });
        const dataset = String(req.query.dataset || 'world_development_observations');
        const config = OBSERVATORY_DATASETS[dataset];
        if (!config) return res.status(400).json({ error: 'Unknown or non-public dataset' });
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
        const offset = Math.min(Math.max(Number(req.query.offset) || 0, 0), 1_000_000);
        const q = String(req.query.q || '').replace(/[^a-zA-Z0-9 ._-]/g, '').trim().slice(0, 80);
        // The world-development catalog's broad ILIKE search uses trigram indexes; use a deterministic matching sort instead of walking the entire period index while filtering.
        const order = q && dataset === 'world_development_observations' ? 'country_name.asc,indicator_code.asc,period.desc,id.asc' : config.order;
        const mapMode = req.query.map === '1';
        const mapSelect = mapMode && dataset === 'observatory_observations'
            ? 'id,source_id,sector,external_id,observed_at,published_at,latitude,longitude,metric,value,unit,quality_status'
            : mapMode && dataset === 'earth_events'
                ? 'id,event_type,occurred_at,latitude,longitude,magnitude,depth_km,title,description,source_id'
                : config.select;
        let params = 'select=' + mapSelect + (order ? '&order=' + order : '') + '&limit=' + limit + '&offset=' + offset;
        if (mapMode && ['observatory_observations', 'earth_events'].includes(dataset)) {
            params += '&latitude=not.is.null&longitude=not.is.null&latitude=gte.-90&latitude=lte.90&longitude=gte.-180&longitude=lte.180';
        }
        if (q) {
            const pattern = '*' + q + '*';
            const searchable = {
                world_development_observations: ['country_name','indicator_name','indicator_code','country_code'],
                observatory_observations: ['sector','external_id','metric','quality_status'],
                earth_events: ['title','event_type','description'], earth_observation_products: ['external_id','collection'],
                satellites: ['name','owner_country','operator'], volcano_observations: ['volcano_name','volcano_id','alert_level','threat_level'],
                environment_observations: ['sector','external_id','quality_flag'], space_weather_observations: ['product'],
                data_sources: ['name','provider','description'], observatory_sources: ['name','provider','sector','slug'],
                celestial_bodies: ['name','body_type'], seed_telemetry_samples: ['source'], ingestion_runs: ['job_name','status'],
                observatory_ingestion_runs: ['status','error'],
                data_layer_configs: ['layer_key','sector','status','notes'],
                satellite_observations: [],
                satellite_passes: [],
            }[dataset];
            if (searchable && searchable.length) params += '&or=' + encodeURIComponent('(' + searchable.map(column => column + '.ilike.' + pattern).join(',') + ')');
            // UUID-backed satellite tables support exact ID lookup without casting UUID columns to text.
            if (q && ['satellite_observations','satellite_passes'].includes(dataset) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)) {
                params += '&satellite_id=eq.' + encodeURIComponent(q);
            }
        }
        const rows = await supabaseQuery(dataset, params);
        res.set('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
        res.json({ ts: Date.now(), dataset, limit, offset, count: rows.length, next_offset: rows.length === limit ? offset + rows.length : null, has_more: rows.length === limit, items: rows });
    } catch (err) {
        logger.error('API', '/observatory/catalog error', { message: err.message });
        res.status(502).json({ error: 'Supabase dataset could not be loaded' });
    }
});

router.get('/observatory/samples', async (req, res) => {
    try {
        if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase server integration is not configured' });
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const after = Math.max(Number(req.query.after) || 0, 0);
        const filter = after > 0 ? '&sample_id=gt.' + after : '';
        const samples = await supabaseQuery('seed_telemetry_samples', 'select=sample_id,sampled_at,latitude,longitude,altitude_km,speed_km_s,source&order=sample_id.asc&limit=' + limit + filter);
        const nextCursor = samples.length === limit ? samples[samples.length - 1].sample_id : null;
        res.json({ ts: Date.now(), source: 'Supabase synthetic development dataset', count: samples.length, next_cursor: nextCursor, samples });
    } catch (err) {
        logger.error('API', '/observatory/samples error', { message: err.message });
        res.status(502).json({ error: 'Supabase sample data unavailable' });
    }
});

module.exports = router;

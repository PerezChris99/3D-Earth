/**
 * Phase 1 provider adapters.
 * Existing ingest modules remain responsible for provider-specific I/O.
 * These adapters normalize their output into the common Earth Data Engine envelope.
 */
const { DataProvider } = require('../core/provider');
const { validateEarthRecord } = require('../core/earth-schema');
const { getTLEs } = require('../ingest/tle');
const { getFlights } = require('../ingest/flights');
const { getEarthquakes } = require('../ingest/earthquakes');
const { getThermalHotspots } = require('../ingest/thermal');

function validateRecords(records) {
    return records.filter(record => validateEarthRecord(record).valid);
}

function normalizeSatellites(raw) {
    return validateRecords(raw.map((s, i) => {
        const match = String(s.tle1).match(/^1\s+(\d{1,9})/);
        return { id: match ? `norad-${match[1]}` : `tle-${i}`, type: 'object', domain: 'satellite', name: s.name, noradId: match ? Number(match[1]) : null, tle1: s.tle1, tle2: s.tle2, timestamp: null, source: 'celestrak-tle' };
    }));
}

function normalizeAircraft(raw) {
    return validateRecords(raw.map(f => ({ id: `icao24-${f.id}`, type: 'object', domain: 'aircraft', lat: Number(f.lat), lon: Number(f.lon), alt: Number(f.alt) || 0, timestamp: null, source: 'opensky', callsign: f.callsign, country: f.country, velocity: Number(f.velocity) || 0, heading: Number(f.heading) || 0, squawk: f.squawk, onGround: Boolean(f.onGround) })));
}

function normalizeEarthquakes(raw) {
    return validateRecords(raw.map(e => ({ id: e.id, type: 'event', domain: 'earthquake', lat: Number(e.lat), lon: Number(e.lon), alt: -Math.abs(Number(e.depth) || 0) * 1000, timestamp: e.time ? new Date(e.time).toISOString() : null, source: 'usgs-earthquakes', magnitude: e.mag, place: e.place, depthKm: e.depth })));
}

function normalizeThermal(raw) {
    return validateRecords(raw.map((h, i) => ({ id: `firms-${h.date || 'unknown'}-${h.time || 'unknown'}-${i}`, type: 'observation', domain: 'fire', lat: Number(h.lat), lon: Number(h.lon), timestamp: h.date && h.time ? new Date(`${h.date}T${String(h.time).padStart(4, '0').slice(0,2)}:${String(h.time).padStart(4, '0').slice(2)}:00Z`).toISOString() : null, source: 'nasa-firms', brightness: h.brightness, confidence: h.confidence })));
}

class SatelliteProvider extends DataProvider {
    constructor() {
        super({ id: 'celestrak-tle', domain: 'satellite', name: 'CelesTrak GP/TLE', license: 'CelesTrak terms', updateCadenceMs: 2 * 60 * 60 * 1000 });
    }
    async fetch() {
        const raw = await getTLEs();
        const records = normalizeSatellites(raw);
        return this.envelope(records, {
            sourceUrl: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
            processing: 'TLE normalized into Earth object records',
            limitations: ['Legacy TLE representation; migrate to GP/OMM as catalog formats evolve.'],
        });
    }
}

class AircraftProvider extends DataProvider {
    constructor() {
        super({ id: 'opensky', domain: 'aircraft', name: 'OpenSky Network', license: 'OpenSky terms', updateCadenceMs: 15000 });
    }
    async fetch() {
        const raw = await getFlights();
        const records = normalizeAircraft(raw);
        return this.envelope(records, {
            sourceUrl: 'https://opensky-network.org/api/states/all',
            processing: 'OpenSky state vectors normalized to WGS84 records',
        });
    }
}

class EarthquakeProvider extends DataProvider {
    constructor() {
        super({ id: 'usgs-earthquakes', domain: 'earthquake', name: 'USGS Earthquake Hazards Program', license: 'USGS public feed', updateCadenceMs: 60000 });
    }
    async fetch() {
        const raw = await getEarthquakes();
        const records = normalizeEarthquakes(raw);
        return this.envelope(records, {
            sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.0_hour.geojson',
            processing: 'USGS GeoJSON normalized to WGS84 event records',
        });
    }
}

class ThermalProvider extends DataProvider {
    constructor() {
        super({ id: 'nasa-firms', domain: 'fire', name: 'NASA FIRMS', license: 'NASA FIRMS terms', updateCadenceMs: 300000 });
    }
    async fetch() {
        const raw = await getThermalHotspots();
        const records = normalizeThermal(raw);
        return this.envelope(records, {
            sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
            processing: 'NASA FIRMS thermal observations normalized to WGS84',
            limitations: ['Requires FIRMS MAP_KEY configuration for live data.'],
        });
    }
}

function createDefaultProviders() {
    return [new SatelliteProvider(), new AircraftProvider(), new EarthquakeProvider(), new ThermalProvider()];
}

module.exports = { SatelliteProvider, AircraftProvider, EarthquakeProvider, ThermalProvider, createDefaultProviders, normalizeSatellites, normalizeAircraft, normalizeEarthquakes, normalizeThermal };

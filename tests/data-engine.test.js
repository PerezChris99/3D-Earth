const test = require('node:test');
const assert = require('node:assert/strict');
const { createDataEnvelope } = require('../src/core/data-envelope');
const { createDataEngine } = require('../src/core/data-engine');
const { normalizeSatellites, normalizeAircraft, normalizeEarthquakes, normalizeThermal } = require('../src/providers/earth-providers');

test('Phase 1 registers all current live data providers', () => {
    const engine = createDataEngine();
    assert.deepEqual(engine.status().map(p => p.id), ['celestrak-tle', 'opensky', 'usgs-earthquakes', 'nasa-firms']);
});

test('Phase 1 normalizers produce valid Earth records', () => {
    const sat = normalizeSatellites([{ name: 'TEST SAT', tle1: '1 25544U 98067A   26001.00000000  .00000000  00000-0  00000-0 0  9999', tle2: '2 25544  51.6400 100.0000 0005000  10.0000  20.0000 15.50000000123456' }]);
    const aircraft = normalizeAircraft([{ id: 'abc123', lat: 0.3, lon: 32.5, alt: 10000, velocity: 230, heading: 90 }]);
    const earthquakes = normalizeEarthquakes([{ id: 'usgs-1', lat: 0.3, lon: 32.5, depth: 10, mag: 4.2, place: 'Test', time: Date.now() }]);
    const thermal = normalizeThermal([{ lat: 0.3, lon: 32.5, brightness: 320, confidence: 'n', date: '2026-10-05', time: '1234' }]);

    for (const records of [sat, aircraft, earthquakes, thermal]) {
        assert.equal(records.length, 1);
        assert.ok(records[0].id);
        assert.ok(records[0].source);
        assert.ok(records[0].domain);
        assert.ok(records[0].type);
    }
    assert.equal(sat[0].noradId, 25544);
    assert.equal(aircraft[0].lat, 0.3);
});

test('Phase 1 envelopes preserve source and freshness metadata', () => {
    const envelope = createDataEnvelope({
        provider: 'test',
        domain: 'event',
        records: [{ id: 'x', type: 'event', domain: 'event' }],
        observedAt: new Date(Date.now() - 1000),
        updateCadenceMs: 60000,
        confidence: 0.8
    });
    assert.equal(envelope.provider, 'test');
    assert.equal(envelope.confidence, 0.8);
    assert.ok(envelope.freshness.ageMs >= 0);
});

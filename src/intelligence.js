/**
 * src/intelligence.js
 * Phase 5: Advanced intelligence engine.
 * 
 * Features:
 * - Threat scoring for flights (squawk, altitude anomaly, speed) and earthquakes
 * - Entity clustering: group nearby objects by grid cell
 * - Entity history: rolling 5-minute track for every unique entity
 * - Anomaly detection: sudden altitude drops, unusual velocities
 *
 * No external dependencies — pure JS.
 */
'use strict';

// Rolling entity history: entityId → [{ts, lat, lon, alt}]
const entityHistory = new Map();
const HISTORY_TTL_MS  = 5 * 60 * 1000; // 5 min
const MAX_HISTORY_PTS = 60;

/**
 * Record a position update for an entity.
 */
function recordEntityPosition(id, lat, lon, alt, ts) {
    if (!id || lat == null || lon == null) return;
    const t = ts || Date.now();
    if (!entityHistory.has(id)) entityHistory.set(id, []);
    const track = entityHistory.get(id);
    track.push({ ts: t, lat, lon, alt: alt ?? null });
    // Trim old points
    const cutoff = t - HISTORY_TTL_MS;
    while (track.length > 0 && track[0].ts < cutoff) track.shift();
    // Cap max points
    if (track.length > MAX_HISTORY_PTS) track.splice(0, track.length - MAX_HISTORY_PTS);
}

/**
 * Get the track for an entity.
 * @returns {Array<{ts,lat,lon,alt}>}
 */
function getEntityTrack(id) {
    return entityHistory.get(id) || [];
}

// ============================
// THREAT SCORING
// ============================

/**
 * Score a flight entity (0–100). Higher = more suspicious.
 * @param {object} f  flight from flights.js
 * @returns {number}
 */
function scoreFlight(f) {
    let score = 0;

    // Emergency squawk codes
    if (f.squawk === '7700') score += 60;       // general emergency
    else if (f.squawk === '7600') score += 55;  // comms failure
    else if (f.squawk === '7500') score += 70;  // hijack

    // Low altitude at high speed (potential threat aircraft)
    const alt = f.alt || 0;
    const vel = f.velocity || 0;
    if (alt < 300 && vel > 200) score += 25;

    // Heading anomaly: detect sudden reversal from history
    const track = getEntityTrack(f.id);
    if (track.length >= 3) {
        const prev = track[track.length - 2];
        const curr = track[track.length - 1];
        if (prev && curr) {
            const dLat = Math.abs(curr.lat - prev.lat);
            const dLon = Math.abs(curr.lon - prev.lon);
            if (dLat + dLon > 2) score += 15; // large jump = anomaly
        }
    }

    // Rapid altitude drop
    if (track.length >= 2) {
        const prev = track[track.length - 2];
        const curr = track[track.length - 1];
        if (prev?.alt != null && curr?.alt != null) {
            const drop = prev.alt - curr.alt;
            if (drop > 3000) score += 20; // 3000m drop in one cycle
        }
    }

    return Math.min(score, 100);
}

/**
 * Score an earthquake (0–100).
 */
function scoreEarthquake(eq) {
    const mag = eq.mag || 0;
    if (mag >= 7)   return 100;
    if (mag >= 6)   return 80;
    if (mag >= 5)   return 60;
    if (mag >= 4)   return 40;
    if (mag >= 3)   return 20;
    return 5;
}

// ============================
// CLUSTERING
// ============================

/**
 * Cluster points into grid cells (grid size in degrees).
 * @param {Array<{lat:number,lon:number,[k:string]:any}>} points
 * @param {number} gridDeg  Grid cell size in degrees (e.g. 5)
 * @returns {Array<{cell:string, lat:number, lon:number, count:number, items:any[]}>}
 */
function clusterPoints(points, gridDeg = 5) {
    const cells = new Map();
    for (const pt of points) {
        const cellLat = Math.floor(pt.lat / gridDeg) * gridDeg;
        const cellLon = Math.floor(pt.lon / gridDeg) * gridDeg;
        const key = `${cellLat}_${cellLon}`;
        if (!cells.has(key)) {
            cells.set(key, {
                cell: key,
                lat:  cellLat + gridDeg / 2,
                lon:  cellLon + gridDeg / 2,
                count: 0,
                items: []
            });
        }
        const c = cells.get(key);
        c.count++;
        if (c.items.length < 20) c.items.push(pt); // cap items per cluster
    }
    return Array.from(cells.values());
}

// ============================
// PROCESS BROADCAST DATA
// ============================

/**
 * Enrich broadcast data with threat scores and record history.
 * Returns enriched copy (does not mutate original).
 */
function processBroadcastData(data) {
    const now = Date.now();
    const flights = (data.flights || []).map(f => {
        recordEntityPosition(f.id, f.lat, f.lon, f.alt, now);
        return { ...f, threatScore: scoreFlight(f) };
    });
    const earthquakes = (data.earthquakes || []).map(eq => ({
        ...eq, threatScore: scoreEarthquake(eq)
    }));
    const thermal = data.thermal || [];

    // High-threat flights
    const highThreatFlights = flights.filter(f => f.threatScore >= 50);

    return {
        flights,
        earthquakes,
        thermal,
        intelligence: {
            highThreatFlights,
            flightClusters:    clusterPoints(flights, 10),
            earthquakeClusters: clusterPoints(earthquakes, 15),
            ts: now
        }
    };
}

module.exports = { processBroadcastData, getEntityTrack, clusterPoints, scoreFlight, scoreEarthquake };

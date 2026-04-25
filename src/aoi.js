/**
 * src/aoi.js
 * Area-of-Interest (AOI) engine — in-memory polygon store + intersection tests.
 *
 * AOI format: { id, name, createdBy, polygon: [[lon,lat], ...] }
 * Uses ray-casting for point-in-polygon (2D lng/lat plane — sufficient for small polygons).
 * No external dependencies.
 */
'use strict';

const crypto = require('crypto');

/** @type {Map<string, {id:string,name:string,createdBy:string,polygon:Array<[number,number]>}>} */
const aois = new Map();

/**
 * Create a new AOI.
 * @param {string} name       Human-readable name
 * @param {string} createdBy  User ID
 * @param {Array}  polygon    Array of [lon, lat] pairs (min 3 points, auto-closed)
 * @returns {object} saved AOI
 */
function createAOI(name, createdBy, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
        throw new Error('AOI polygon must have at least 3 coordinate pairs');
    }
    const id = crypto.randomBytes(8).toString('hex');
    const record = { id, name: String(name).slice(0, 80), createdBy: String(createdBy), polygon };
    aois.set(id, record);
    return record;
}

/** Return all stored AOIs. */
function listAOIs() {
    return Array.from(aois.values());
}

/** Delete an AOI by ID. Returns true if existed. */
function deleteAOI(id) {
    return aois.delete(id);
}

/**
 * Point-in-polygon using ray-casting.
 * @param {number} lon
 * @param {number} lat
 * @param {Array<[number,number]>} polygon  Array of [lon, lat]
 * @returns {boolean}
 */
function pointInPolygon(lon, lat, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Test a set of points against all AOIs.
 * @param {Array<{lon:number,lat:number,[key:string]:any}>} points
 * @param {string} domain  Label for the alert (e.g. 'flight', 'earthquake')
 * @returns {Array<{aoiId:string,aoiName:string,domain:string,item:object}>} triggered alerts
 */
function testPoints(points, domain) {
    const triggered = [];
    for (const aoi of aois.values()) {
        for (const item of points) {
            if (item.lon != null && item.lat != null) {
                if (pointInPolygon(item.lon, item.lat, aoi.polygon)) {
                    triggered.push({ aoiId: aoi.id, aoiName: aoi.name, domain, item });
                }
            }
        }
    }
    return triggered;
}

module.exports = { createAOI, listAOIs, deleteAOI, testPoints };

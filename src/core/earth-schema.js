/**
 * src/core/earth-schema.js
 * Canonical Earth-domain vocabulary.
 *
 * This is the first layer of the platform's common data model. It intentionally
 * stays small: providers can add domain-specific fields without changing the
 * core vocabulary.
 */

const DOMAINS = Object.freeze([
    'satellite',
    'aircraft',
    'vessel',
    'earthquake',
    'weather',
    'fire',
    'flood',
    'storm',
    'volcano',
    'infrastructure',
    'population',
    'agriculture',
    'imagery',
    'event',
]);

const OBJECT_TYPES = Object.freeze([
    'object',
    'event',
    'observation',
    'measurement',
    'area',
]);

const CORE_FIELDS = Object.freeze([
    'id',
    'type',
    'domain',
    'lat',
    'lon',
    'alt',
    'timestamp',
    'source',
]);

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function validateCoordinate(lat, lon) {
    return isFiniteNumber(lat) &&
        isFiniteNumber(lon) &&
        lat >= -90 && lat <= 90 &&
        lon >= -180 && lon <= 180;
}

function validateEarthRecord(record) {
    if (!record || typeof record !== 'object') {
        return { valid: false, errors: ['record must be an object'] };
    }

    const errors = [];
    if (!record.id) errors.push('id is required');
    if (!record.type || !OBJECT_TYPES.includes(record.type)) {
        errors.push('type must be a supported Earth object type');
    }
    if (!record.domain || !DOMAINS.includes(record.domain)) {
        errors.push('domain must be a supported Earth domain');
    }

    if (record.lat != null || record.lon != null) {
        if (!validateCoordinate(record.lat, record.lon)) {
            errors.push('lat/lon must be WGS84 decimal degrees');
        }
    }

    if (record.alt != null && !isFiniteNumber(record.alt)) {
        errors.push('alt must be a finite number in metres');
    }

    return { valid: errors.length === 0, errors };
}

module.exports = {
    DOMAINS,
    OBJECT_TYPES,
    CORE_FIELDS,
    validateCoordinate,
    validateEarthRecord,
};

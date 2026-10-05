/**
 * src/core/data-envelope.js
 * Canonical metadata wrapper for every Earth Data Engine response.
 *
 * This is deliberately provider-neutral. It gives every dataset a common
 * provenance/freshness/confidence shape before persistence is introduced.
 */

function nowIso() {
    return new Date().toISOString();
}

function normalizeTimestamp(value, fallback) {
    if (value == null) return fallback;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toISOString();
}

function normalizeConfidence(value) {
    if (value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1, n));
}

function createDataEnvelope({
    provider,
    domain,
    records = [],
    license = 'unspecified',
    retrievedAt = null,
    observedAt = null,
    confidence = null,
    processing = 'provider-normalized',
    limitations = [],
    sourceUrl = null,
    updateCadenceMs = null,
}) {
    if (!provider || !domain) throw new Error('Data envelope requires provider and domain');
    if (!Array.isArray(records)) throw new TypeError('Data envelope records must be an array');

    const retrieved = normalizeTimestamp(retrievedAt, nowIso());
    const observed = normalizeTimestamp(observedAt, retrieved);

    return {
        schemaVersion: '1.0',
        provider: String(provider),
        domain: String(domain),
        records,
        provenance: {
            sourceUrl: sourceUrl || null,
            retrievedAt: retrieved,
            observedAt: observed,
            license: String(license || 'unspecified'),
            processing: String(processing || 'provider-normalized'),
            limitations: Array.isArray(limitations) ? limitations.map(String) : [],
        },
        freshness: {
            ageMs: Math.max(0, Date.now() - new Date(observed).getTime()),
            updateCadenceMs: Number.isFinite(Number(updateCadenceMs))
                ? Number(updateCadenceMs)
                : null,
        },
        confidence: normalizeConfidence(confidence),
    };
}

function isDataEnvelope(value) {
    return Boolean(
        value &&
        value.schemaVersion === '1.0' &&
        typeof value.provider === 'string' &&
        typeof value.domain === 'string' &&
        Array.isArray(value.records) &&
        value.provenance &&
        typeof value.provenance.retrievedAt === 'string' &&
        typeof value.provenance.observedAt === 'string'
    );
}

module.exports = { createDataEnvelope, isDataEnvelope };

/**
 * src/notes.js
 * Analyst notes — in-memory store with optional geo-pin.
 * Supports create, list, get, delete. Max 500 notes.
 */
'use strict';

const crypto = require('crypto');

/** @type {Map<string, object>} */
const notes = new Map();
const MAX_NOTES = 500;

function createNote({ title, body, lat, lon, domain, userId }) {
    if (notes.size >= MAX_NOTES) {
        // Evict oldest
        const oldest = notes.keys().next().value;
        notes.delete(oldest);
    }
    const id = crypto.randomBytes(8).toString('hex');
    const record = {
        id,
        title:  String(title  || '').slice(0, 120),
        body:   String(body   || '').slice(0, 4000),
        domain: String(domain || '').slice(0, 40),
        lat:    lat  != null ? Number(lat)  : null,
        lon:    lon  != null ? Number(lon)  : null,
        userId: String(userId || 'anon'),
        ts:     Date.now()
    };
    notes.set(id, record);
    return record;
}

function listNotes(domain) {
    const all = Array.from(notes.values());
    return domain ? all.filter(n => n.domain === domain) : all;
}

function getNote(id) {
    return notes.get(id) || null;
}

function deleteNote(id) {
    return notes.delete(id);
}

module.exports = { createNote, listNotes, getNote, deleteNote };

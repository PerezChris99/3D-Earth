/**
 * src/routes/notes.js
 * REST routes for analyst note-taking (geo-pinned intel notes).
 * Requires auth; create/delete requires analyst+.
 */
'use strict';

const express = require('express');
const router  = express.Router();
const { createNote, listNotes, getNote, deleteNote } = require('../notes');
const { requireAuth, requireRole }                   = require('../auth');
const { sanitizeRequest }                            = require('../middleware/sanitize');

router.use(sanitizeRequest);

// GET /api/notes[?domain=flight]
router.get('/', requireAuth, (req, res) => {
    const domain = req.query.domain;
    res.json({ notes: listNotes(domain) });
});

// GET /api/notes/:id
router.get('/:id', requireAuth, (req, res) => {
    if (!/^[0-9a-f]{16}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const note = getNote(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ note });
});

// POST /api/notes — create
router.post('/', requireAuth, requireRole('analyst'), (req, res) => {
    const { title, body, lat, lon, domain } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    if (lat  != null && (isNaN(Number(lat))  || Number(lat)  < -90  || Number(lat)  > 90))
        return res.status(400).json({ error: 'Invalid latitude' });
    if (lon  != null && (isNaN(Number(lon))  || Number(lon)  < -180 || Number(lon)  > 180))
        return res.status(400).json({ error: 'Invalid longitude' });
    const note = createNote({ title, body, lat, lon, domain, userId: req.user.userId });
    res.status(201).json({ note });
});

// DELETE /api/notes/:id
router.delete('/:id', requireAuth, requireRole('analyst'), (req, res) => {
    if (!/^[0-9a-f]{16}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const ok = deleteNote(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Note not found' });
    res.json({ deleted: req.params.id });
});

module.exports = router;

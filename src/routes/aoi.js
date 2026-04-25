/**
 * src/routes/aoi.js
 * Protected REST routes for Area-of-Interest management.
 * Requires analyst or admin role (HMAC token via Authorization header).
 */
'use strict';

const express = require('express');
const router  = express.Router();
const { createAOI, listAOIs, deleteAOI } = require('../aoi');
const { requireAuth, requireRole }       = require('../auth');
const { sanitizeRequest }                = require('../middleware/sanitize');

router.use(sanitizeRequest);

// GET /api/aoi — list all AOIs (viewer+ allowed)
router.get('/', requireAuth, (req, res) => {
    res.json({ aois: listAOIs() });
});

// POST /api/aoi — create a new AOI (analyst+)
router.post('/', requireAuth, requireRole('analyst'), (req, res) => {
    const { name, polygon } = req.body;
    if (!name || !polygon) {
        return res.status(400).json({ error: 'name and polygon are required' });
    }
    if (!Array.isArray(polygon) || polygon.length < 3) {
        return res.status(400).json({ error: 'polygon must be an array of at least 3 [lon,lat] pairs' });
    }
    // Validate coordinate ranges
    for (const pt of polygon) {
        if (!Array.isArray(pt) || pt.length < 2 ||
            typeof pt[0] !== 'number' || typeof pt[1] !== 'number' ||
            pt[0] < -180 || pt[0] > 180 || pt[1] < -90 || pt[1] > 90) {
            return res.status(400).json({ error: 'Invalid coordinate in polygon' });
        }
    }
    try {
        const aoi = createAOI(name, req.user.sub, polygon);
        res.status(201).json({ aoi });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /api/aoi/:id — delete an AOI (analyst+)
router.delete('/:id', requireAuth, requireRole('analyst'), (req, res) => {
    const id = req.params.id;
    if (!/^[0-9a-f]{16}$/.test(id)) {
        return res.status(400).json({ error: 'Invalid AOI id' });
    }
    const ok = deleteAOI(id);
    if (!ok) return res.status(404).json({ error: 'AOI not found' });
    res.json({ deleted: id });
});

module.exports = router;

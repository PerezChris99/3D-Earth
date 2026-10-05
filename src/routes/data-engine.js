const express = require('express');
const router = express.Router();
const { createDataEngine } = require('../core/data-engine');

const engine = createDataEngine();

router.get('/providers', (req, res) => {
    res.json({ ts: Date.now(), providers: engine.status() });
});

router.get('/provider/:id', async (req, res) => {
    const id = String(req.params.id || '').slice(0, 80);
    try {
        const envelope = await engine.fetch(id);
        res.json(envelope);
    } catch (err) {
        res.status(404).json({ error: 'Provider unavailable', provider: id });
    }
});

router.get('/snapshot', async (req, res) => {
    const results = await engine.fetchAll();
    res.json({ ts: Date.now(), results });
});

module.exports = router;

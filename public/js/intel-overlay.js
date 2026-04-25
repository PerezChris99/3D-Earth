/**
 * public/js/intel-overlay.js
 * Phase 5: Advanced Intelligence Overlay.
 *
 * - Renders flight/earthquake cluster bubbles on the globe
 * - Displays threat-scored entities with color-coded markers
 * - Search/filter panel: filter any domain by keyword
 * - High-threat alerts: auto-open inspector for threat score >= 60
 * - Minimap: 2D lat/lon overview of all active entities
 */

(function () {
    'use strict';

    const EARTH_RADIUS = 1.0;

    // ============================
    // UTILS
    // ============================
    function esc(s) {
        return String(s ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
    }

    function lonLatToXYZ(lon, lat, r) {
        const phi   = (90 - lat)  * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    // ============================
    // THREAT COLOR
    // ============================
    function threatColor(score) {
        if (score >= 70) return 0xff0000;
        if (score >= 40) return 0xff9900;
        return 0x00dcff;
    }

    // ============================
    // CLUSTER SPHERES
    // ============================
    const clusterMeshes = [];

    function clearClusters() {
        if (!window.scene) return;
        clusterMeshes.forEach(m => window.scene.remove(m));
        clusterMeshes.length = 0;
    }

    function renderClusters(clusters, baseColor, r) {
        if (!window.scene || !window.THREE) return;
        clusters.forEach(cl => {
            if (cl.count < 3) return; // only show cluster if 3+ items
            const pos = lonLatToXYZ(cl.lon, cl.lat, r);
            const radius = Math.min(0.015 + cl.count * 0.001, 0.05);
            const geo = new THREE.SphereGeometry(radius, 8, 8);
            const mat = new THREE.MeshBasicMaterial({
                color: baseColor,
                transparent: true,
                opacity: 0.35,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            window.scene.add(mesh);
            clusterMeshes.push(mesh);
        });
    }

    // ============================
    // HIGH-THREAT FLIGHT MARKERS
    // ============================
    let threatPoints = null;

    function initThreatLayer() {
        if (!window.scene || !window.THREE || threatPoints) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
        const mat = new THREE.PointsMaterial({ color: 0xff0000, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false });
        threatPoints = new THREE.Points(geo, mat);
        threatPoints.frustumCulled = false;
        window.scene.add(threatPoints);
    }

    function updateThreatMarkers(flights) {
        if (!threatPoints) return;
        const high = (flights || []).filter(f => (f.threatScore || 0) >= 50);
        if (high.length === 0) return;
        const positions = new Float32Array(high.length * 3);
        high.forEach((f, i) => {
            if (f.lat == null || f.lon == null) return;
            const alt = f.alt || 0;
            const phi   = (90 - f.lat) * (Math.PI / 180);
            const theta = (f.lon + 180) * (Math.PI / 180);
            const r = EARTH_RADIUS + 0.12 + (alt / 6371000);
            positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        });
        threatPoints.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        threatPoints.geometry.attributes.position.needsUpdate = true;
    }

    // ============================
    // SEARCH PANEL
    // ============================
    let allFlights = [];
    let allEarthquakes = [];

    function initSearchPanel() {
        const input = document.getElementById('search-input');
        input?.addEventListener('input', () => runSearch(input.value.trim().toLowerCase()));
    }

    function runSearch(query) {
        const results = document.getElementById('search-results');
        if (!results) return;
        if (!query) { results.innerHTML = ''; return; }

        const matches = [];
        allFlights.forEach(f => {
            const txt = `${f.callsign} ${f.country} ${f.id}`.toLowerCase();
            if (txt.includes(query)) matches.push({ ...f, _domain: 'flight' });
        });
        allEarthquakes.forEach(eq => {
            const txt = `${eq.place} ${eq.id}`.toLowerCase();
            if (txt.includes(query)) matches.push({ ...eq, _domain: 'eq' });
        });

        if (matches.length === 0) {
            results.innerHTML = '<p class="no-results">No results</p>';
            return;
        }

        results.innerHTML = matches.slice(0, 20).map(m => {
            const label = m._domain === 'flight'
                ? `✈ ${esc(m.callsign || m.id)} — ${esc(m.country)}`
                : `⚡ M${m.mag} — ${esc(m.place || '')}`;
            return `<div class="sr-item" data-idx="${esc(String(matches.indexOf(m)))}">${label}</div>`;
        }).join('');

        results.querySelectorAll('.sr-item').forEach((el, i) => {
            el.addEventListener('click', () => {
                const item = matches[i];
                if (window.osintOpenInspector) window.osintOpenInspector({ ...item, type: item._domain });
            });
        });
    }

    // ============================
    // MINIMAP CANVAS
    // ============================
    let minimapCanvas = null;
    let minimapCtx    = null;

    function initMinimap() {
        minimapCanvas = document.getElementById('minimap-canvas');
        if (minimapCanvas) minimapCtx = minimapCanvas.getContext('2d');
    }

    function drawMinimap(flights, earthquakes) {
        if (!minimapCtx) return;
        const W = 200, H = 110;
        minimapCtx.clearRect(0, 0, W, H);
        // Background
        minimapCtx.fillStyle = 'rgba(6,12,26,0.95)';
        minimapCtx.fillRect(0, 0, W, H);
        // Grid lines
        minimapCtx.strokeStyle = 'rgba(0,220,255,0.08)';
        minimapCtx.lineWidth = 0.5;
        for (let x = 0; x < W; x += W / 6) { minimapCtx.beginPath(); minimapCtx.moveTo(x, 0); minimapCtx.lineTo(x, H); minimapCtx.stroke(); }
        for (let y = 0; y < H; y += H / 3) { minimapCtx.beginPath(); minimapCtx.moveTo(0, y); minimapCtx.lineTo(W, y); minimapCtx.stroke(); }

        // Flights
        flights.forEach(f => {
            if (f.lat == null || f.lon == null) return;
            const x = ((f.lon + 180) / 360) * W;
            const y = ((90 - f.lat) / 180) * H;
            const score = f.threatScore || 0;
            minimapCtx.fillStyle = score >= 70 ? '#ff3b3b' : score >= 40 ? '#ff9900' : 'rgba(255,107,53,0.6)';
            minimapCtx.fillRect(x - 1, y - 1, 2, 2);
        });

        // Earthquakes
        earthquakes.forEach(eq => {
            if (eq.lat == null || eq.lon == null) return;
            const x = ((eq.lon + 180) / 360) * W;
            const y = ((90 - eq.lat) / 180) * H;
            minimapCtx.fillStyle = eq.mag >= 5 ? '#ff3b3b' : 'rgba(255,204,0,0.7)';
            minimapCtx.beginPath();
            minimapCtx.arc(x, y, 2, 0, Math.PI * 2);
            minimapCtx.fill();
        });
    }

    // ============================
    // HANDLE WS INTELLIGENCE DATA
    // ============================
    function handleIntelMessage(msg) {
        if (msg.type !== 'delta_update') return;
        allFlights    = msg.flights    || [];
        allEarthquakes = msg.earthquakes || [];

        updateThreatMarkers(allFlights);

        if (msg.intelligence) {
            clearClusters();
            renderClusters(msg.intelligence.flightClusters    || [], 0xff6b35, EARTH_RADIUS + 0.12);
            renderClusters(msg.intelligence.earthquakeClusters || [], 0xffcc00, EARTH_RADIUS + 0.01);

            // Auto-alert high-threat flights
            (msg.intelligence.highThreatFlights || []).forEach(f => {
                if (window.pushAlert) window.pushAlert(`HIGH THREAT ✈ ${f.callsign || f.id} — score:${f.threatScore}`, 'danger');
            });
        }

        drawMinimap(allFlights, allEarthquakes);
    }

    // Expose for osint-dashboard.js to call
    window.intelHandleMessage = handleIntelMessage;

    // ============================
    // INIT
    // ============================
    function waitForScene(cb) {
        if (window.scene && window.THREE) { cb(); return; }
        const t = setInterval(() => { if (window.scene && window.THREE) { clearInterval(t); cb(); } }, 200);
    }

    function init() {
        initSearchPanel();
        initMinimap();
        waitForScene(() => {
            initThreatLayer();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

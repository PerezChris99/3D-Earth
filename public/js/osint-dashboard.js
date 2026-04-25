/**
 * public/js/osint-dashboard.js
 * Phase 2: OSINT Dashboard — Inspector Panel, Layer Manager,
 * Alerts, live WS data ingestion into Three.js globe scene.
 * 
 * Depends on: Three.js globals (scene, camera, renderer), globals
 * exported by script.js (tlePoints, satellitesGroup etc.)
 */

(function () {
    'use strict';

    // ==========================================
    // STATE
    // ==========================================
    const state = {
        flights: [],
        earthquakes: [],
        thermal: [],
        connected: false,
        layers: {
            satellites: true,
            flights: true,
            earthquakes: true,
            thermal: false
        }
    };

    // Three.js object pools (populated after scene is ready)
    let flightPoints = null;
    let eqPoints = null;
    let thermalPoints = null;
    let flightPositionsAttr = null;
    let eqPositionsAttr = null;
    let thermalPositionsAttr = null;

    // ==========================================
    // TOPBAR CLOCK
    // ==========================================
    function updateClock() {
        const el = document.getElementById('osint-clock');
        if (el) {
            const now = new Date();
            el.textContent = now.toUTCString().slice(5, 25) + ' UTC';
        }
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ==========================================
    // ALERTS
    // ==========================================
    function pushAlert(msg, level = 'info') {
        const list = document.getElementById('alerts-list');
        if (!list) return;
        const now = new Date().toISOString().slice(11, 19);
        const item = document.createElement('div');
        item.className = `alert-item ${level}`;
        item.innerHTML = `<span class="alert-time">${now}</span><span class="alert-msg">${escapeHtml(msg)}</span>`;
        list.prepend(item);
        // Keep max 30 alerts
        while (list.children.length > 30) list.removeChild(list.lastChild);
        // Update counter
        const cnt = document.getElementById('alert-count');
        if (cnt) cnt.textContent = list.children.length;
    }

    // ==========================================
    // INSPECTOR PANEL
    // ==========================================
    function openInspector(data) {
        const panel = document.getElementById('osint-inspector');
        const body = document.getElementById('inspector-body');
        const badge = document.getElementById('inspector-type-badge');
        const title = document.getElementById('inspector-object-title');
        if (!panel || !body) return;

        // Set badge
        const types = { sat: 'SATELLITE', flight: 'FLIGHT', eq: 'SEISMIC', thermal: 'THERMAL' };
        badge.textContent = types[data.type] || data.type.toUpperCase();
        badge.className = ``;
        badge.id = 'inspector-type-badge';
        badge.classList.add(data.type);

        if (title) title.textContent = escapeHtml(data.name || data.callsign || data.id || '—');

        body.innerHTML = buildInspectorRows(data);
        panel.classList.add('open');
    }

    function closeInspector() {
        const panel = document.getElementById('osint-inspector');
        if (panel) panel.classList.remove('open');
    }

    function buildInspectorRows(d) {
        const rows = [];
        const row = (label, value, cls = '') =>
            `<div class="insp-row"><span class="insp-label">${escapeHtml(label)}</span><span class="insp-value ${cls}">${escapeHtml(String(value ?? '—'))}</span></div>`;

        if (d.type === 'flight') {
            rows.push(row('Callsign', d.callsign));
            rows.push(row('ICAO24', d.id));
            rows.push(row('Country', d.country));
            rows.push(row('Latitude', d.lat?.toFixed(4)));
            rows.push(row('Longitude', d.lon?.toFixed(4)));
            rows.push(row('Altitude', `${Math.round(d.alt || 0)} m`, 'highlight'));
            rows.push(row('Velocity', `${Math.round(d.velocity || 0)} m/s`));
            rows.push(row('Heading', `${Math.round(d.heading || 0)}°`));
            rows.push(row('On Ground', d.onGround ? 'YES' : 'NO', d.onGround ? '' : 'ok'));
            rows.push(row('Squawk', d.squawk || '—', d.squawk === '7700' ? 'danger' : (d.squawk === '7600' ? 'warning' : '')));
        } else if (d.type === 'eq') {
            rows.push(row('Location', d.place));
            rows.push(row('Magnitude', d.mag?.toFixed(1), d.mag >= 5 ? 'danger' : d.mag >= 3 ? 'warning' : 'highlight'));
            rows.push(row('Depth', `${d.depth?.toFixed(1)} km`));
            rows.push(row('Latitude', d.lat?.toFixed(4)));
            rows.push(row('Longitude', d.lon?.toFixed(4)));
            rows.push(row('Time', new Date(d.time).toUTCString()));
        } else if (d.type === 'thermal') {
            rows.push(row('Brightness', `${Math.round(d.brightness)} K`, d.brightness > 340 ? 'danger' : 'warning'));
            rows.push(row('Confidence', d.confidence, d.confidence === 'h' ? 'danger' : 'warning'));
            rows.push(row('Latitude', d.lat?.toFixed(4)));
            rows.push(row('Longitude', d.lon?.toFixed(4)));
            rows.push(row('Date', d.date));
            rows.push(row('Time UTC', d.time));
        } else if (d.type === 'sat') {
            rows.push(row('Name', d.name));
            rows.push(row('TLE Line 1', d.tle1?.slice(0, 32) + '…'));
            rows.push(row('TLE Line 2', d.tle2?.slice(0, 32) + '…'));
        }
        return rows.join('');
    }

    // ==========================================
    // LAYER TOGGLES
    // ==========================================
    function initLayerToggles() {
        document.querySelectorAll('.layer-row[data-layer]').forEach(row => {
            const key = row.dataset.layer;
            const tog = row.querySelector('.layer-toggle');
            if (!tog) return;
            if (state.layers[key]) tog.classList.add('on');
            row.addEventListener('click', () => {
                state.layers[key] = !state.layers[key];
                tog.classList.toggle('on', state.layers[key]);
                applyLayerVisibility(key, state.layers[key]);
            });
        });
    }

    function applyLayerVisibility(key, visible) {
        if (key === 'satellites') {
            const g = window.satellitesGroup;
            if (g) g.visible = visible;
        } else if (key === 'flights' && flightPoints) {
            flightPoints.visible = visible;
        } else if (key === 'earthquakes' && eqPoints) {
            eqPoints.visible = visible;
        } else if (key === 'thermal' && thermalPoints) {
            thermalPoints.visible = visible;
        }
    }

    // ==========================================
    // THREE.JS POINT CLOUDS FOR LIVE DOMAINS
    // ==========================================
    function waitForScene(cb) {
        if (window.scene && window.THREE) { cb(); return; }
        const t = setInterval(() => {
            if (window.scene && window.THREE) { clearInterval(t); cb(); }
        }, 200);
    }

    function latLonToXYZ(lat, lon, r) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return [
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        ];
    }

    function makePointCloud(color, size, r) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(3); // placeholder
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false });
        const pts = new THREE.Points(geo, mat);
        pts.frustumCulled = false;
        window.scene.add(pts);
        return { pts, positions };
    }

    function initPointClouds() {
        // Flights: orange dots
        const f = makePointCloud(0xff6b35, 3, 1.12);
        flightPoints = f.pts;
        // Earthquakes: yellow circles
        const e = makePointCloud(0xffcc00, 5, 1.01);
        eqPoints = e.pts;
        // Thermal hotspots: red dots
        const th = makePointCloud(0xff3b3b, 3, 1.005);
        thermalPoints = th.pts;
        thermalPoints.visible = false; // off by default
        pushAlert('Point cloud layers initialized', 'info');
    }

    function updatePointCloud(pts, dataArray, r, altGetter) {
        if (!pts || !dataArray) return;
        const count = dataArray.length;
        if (count === 0) return;
        const positions = new Float32Array(count * 3);
        dataArray.forEach((d, i) => {
            const alt = altGetter ? altGetter(d) : 0;
            const [x, y, z] = latLonToXYZ(d.lat, d.lon, r + (alt / 6371000));
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        });
        pts.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pts.geometry.attributes.position.needsUpdate = true;
    }

    // ==========================================
    // RAYCASTER: CLICK GLOBE OBJECTS
    // ==========================================
    function initClickHandler() {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas) return;
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = 0.025;
        const mouse = new THREE.Vector2();

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, window.camera);

            const testObjects = [
                ...(flightPoints ? [{ obj: flightPoints, domain: 'flight', data: state.flights }] : []),
                ...(eqPoints ? [{ obj: eqPoints, domain: 'eq', data: state.earthquakes }] : []),
                ...(thermalPoints && thermalPoints.visible ? [{ obj: thermalPoints, domain: 'thermal', data: state.thermal }] : []),
            ];

            let bestDist = Infinity;
            let bestMatch = null;

            testObjects.forEach(({ obj, domain, data }) => {
                const hits = raycaster.intersectObject(obj);
                if (hits.length > 0 && hits[0].distanceToRay < bestDist) {
                    bestDist = hits[0].distanceToRay;
                    bestMatch = { idx: hits[0].index, domain, data };
                }
            });

            if (bestMatch) {
                const item = bestMatch.data[bestMatch.idx];
                if (item) openInspector({ ...item, type: bestMatch.domain });
            }
        });
    }

    // ==========================================
    // WEBSOCKET DATA STREAM
    // ==========================================
    let ws = null;
    let reconnectTimer = null;

    function connect() {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        try {
            ws = new WebSocket(`${proto}//${location.host}/ws/live`);
        } catch (e) {
            scheduleReconnect();
            return;
        }

        ws.onopen = () => {
            state.connected = true;
            updateStatus('connected');
            pushAlert('OSINT stream connected', 'info');
        };

        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg.type === 'delta_update') {
                if (Array.isArray(msg.flights) && msg.flights.length > 0) {
                    state.flights = msg.flights;
                    updatePointCloud(flightPoints, state.flights, 1.12, d => d.alt || 0);
                    updateLayerCount('flights', state.flights.length);
                }
                if (Array.isArray(msg.earthquakes) && msg.earthquakes.length > 0) {
                    state.earthquakes = msg.earthquakes;
                    updatePointCloud(eqPoints, state.earthquakes, 1.01, null);
                    updateLayerCount('earthquakes', state.earthquakes.length);
                    if (msg.earthquakes.some(e => e.mag >= 5)) {
                        pushAlert(`M${Math.max(...msg.earthquakes.filter(e=>e.mag>=5).map(e=>e.mag)).toFixed(1)} earthquake detected`, 'danger');
                    }
                }
                if (Array.isArray(msg.thermal) && msg.thermal.length > 0) {
                    state.thermal = msg.thermal;
                    updatePointCloud(thermalPoints, state.thermal, 1.005, null);
                    updateLayerCount('thermal', state.thermal.length);
                }
                updateLayerCount('satellites', window.tleData ? window.tleData.length : 0);
            }
        };

        ws.onclose = () => {
            state.connected = false;
            updateStatus('disconnected');
            scheduleReconnect();
        };
        ws.onerror = () => { ws.close(); };
    }

    function scheduleReconnect() {
        reconnectTimer = setTimeout(connect, 5000);
    }

    function updateStatus(status) {
        const dot = document.getElementById('ws-status-dot');
        const txt = document.getElementById('ws-status-text');
        if (!dot || !txt) return;
        if (status === 'connected') {
            dot.className = 'dot green'; txt.textContent = 'LIVE';
        } else {
            dot.className = 'dot red'; txt.textContent = 'RECONNECTING';
        }
    }

    function updateLayerCount(layer, count) {
        const el = document.querySelector(`[data-layer="${layer}"] .count`);
        if (el) el.textContent = count > 999 ? '999+' : count;
    }

    // ==========================================
    // SECURITY: XSS safe HTML escape
    // ==========================================
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ==========================================
    // INIT
    // ==========================================
    function init() {
        document.getElementById('inspector-close')?.addEventListener('click', closeInspector);
        initLayerToggles();
        waitForScene(() => {
            initPointClouds();
            initClickHandler();
        });
        connect();
        pushAlert('OSINT Dashboard initializing…', 'info');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

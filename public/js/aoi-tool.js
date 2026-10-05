/**
 * public/js/aoi-tool.js
 * Phase 4: Analyst AOI polygon drawing tool + Notes panel UI.
 *
 * Workflow:
 * 1. Click "Draw AOI" button in the layer panel → globe enters draw mode
 * 2. Click on globe → adds vertex (lon/lat via inverse sphere projection)
 * 3. Click "Close & Save" → sends POST /api/aoi with polygon
 * 4. AOI ring rendered on globe as a LineLoop
 * 5. Notes sidebar tab: create/list/delete geo-pinned notes
 *
 * Depends on: THREE (global), window.camera, window.scene
 */

(function () {
    'use strict';

    const EARTH_RADIUS = 1.0;

    // ============================
    // STATE
    // ============================
    const state = {
        drawMode:   false,
        vertices:   [],    // [[lon, lat], ...]
        aoiLines:   [],    // Three.js Line objects
        aoiRecords: [],    // stored AOIs from server
        authToken:  null
    };

    // ============================
    // SECURITY: HTML escape
    // ============================
    function esc(s) {
        return String(s ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
    }

    // ============================
    // AUTH TOKEN (cached from login)
    // ============================
    function setToken(t) { state.authToken = t; }
    function getToken()  { return state.authToken; }
    window.osintSetToken = setToken;

    // ============================
    // API HELPERS
    // ============================
    async function apiFetch(path, opts = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;
        const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
        return res.json();
    }

    // ============================
    // GLOBE RAYCASTING → LON/LAT
    // ============================
    function canvasToLonLat(event) {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas || !window.camera || !window.THREE) return null;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width)  * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, window.camera);
        // Intersect with unit sphere
        const sphere = new THREE.Sphere(new THREE.Vector3(0,0,0), EARTH_RADIUS);
        const hit = new THREE.Vector3();
        const ray = raycaster.ray;
        if (!ray.intersectSphere(sphere, hit)) return null;
        // Convert XYZ → lon/lat
        const lat = 90 - (Math.acos(hit.y / EARTH_RADIUS) * 180 / Math.PI);
        const lon = (Math.atan2(hit.z, hit.x) * 180 / Math.PI);
        return [parseFloat(lon.toFixed(5)), parseFloat(lat.toFixed(5))];
    }

    // ============================
    // DRAW AOI LINE ON GLOBE
    // ============================
    function lonLatToXYZ(lon, lat, r) {
        const phi   = (90 - lat)  * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    function renderAOILine(polygon, color = 0x00dcff) {
        if (!window.scene || !window.THREE) return null;
        const pts = polygon.map(([lo, la]) => lonLatToXYZ(lo, la, EARTH_RADIUS + 0.005));
        pts.push(pts[0]); // close
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
        const line = new THREE.LineLoop(geo, mat);
        window.scene.add(line);
        return line;
    }

    function clearDrawVertices() {
        state.vertices = [];
        // Remove temporary draw line if any
        if (state._tempLine) { window.scene.remove(state._tempLine); state._tempLine = null; }
    }

    // ============================
    // DRAW MODE
    // ============================
    function enterDrawMode() {
        state.drawMode = true;
        clearDrawVertices();
        document.body.style.cursor = 'crosshair';
        pushStatus('Draw mode: click globe to add vertices (min 3), then Save AOI');
        const btn = document.getElementById('aoi-draw-btn');
        if (btn) { btn.textContent = 'Cancel Draw'; btn.classList.add('active'); }
    }

    function exitDrawMode() {
        state.drawMode = false;
        clearDrawVertices();
        document.body.style.cursor = '';
        const btn = document.getElementById('aoi-draw-btn');
        if (btn) { btn.textContent = 'Draw AOI'; btn.classList.remove('active'); }
    }

    function pushStatus(msg) {
        if (window.pushAlert) window.pushAlert(msg, 'info');
    }

    // ============================
    // SAVE AOI
    // ============================
    async function saveCurrentAOI(name) {
        if (state.vertices.length < 3) {
            pushStatus('Need at least 3 vertices to create an AOI');
            return;
        }
        try {
            const data = await apiFetch('/api/aoi', {
                method: 'POST',
                body: JSON.stringify({ name: name || 'AOI ' + Date.now(), polygon: state.vertices })
            });
            if (data.aoi) {
                state.aoiRecords.push(data.aoi);
                renderAOILine(data.aoi.polygon, 0x00dcff);
                pushStatus(`AOI "${esc(data.aoi.name)}" saved (${state.vertices.length} pts)`);
                renderAOIList();
            } else {
                pushStatus('AOI save failed: ' + esc(data.error || 'unknown error'));
            }
        } catch (e) {
            pushStatus('AOI request error — are you authenticated?');
        }
        exitDrawMode();
    }

    // ============================
    // LOAD AOIs ON STARTUP
    // ============================
    async function loadAOIs() {
        if (!state.authToken) return;
        try {
            const data = await apiFetch('/api/aoi');
            if (Array.isArray(data.aois)) {
                state.aoiRecords = data.aois;
                data.aois.forEach(a => renderAOILine(a.polygon, 0x00dcff));
                renderAOIList();
            }
        } catch (_) {}
    }

    // ============================
    // AOI LIST UI
    // ============================
    function renderAOIList() {
        const list = document.getElementById('aoi-list');
        if (!list) return;
        if (state.aoiRecords.length === 0) {
            list.innerHTML = '<p class="no-items">No AOIs defined</p>'; return;
        }
        list.innerHTML = state.aoiRecords.map(a =>
            `<div class="note-item" data-id="${esc(a.id)}">
                <span>${esc(a.name)}</span>
                <span class="note-pts">${a.polygon.length} pts</span>
                <button class="del-btn" data-type="aoi" data-id="${esc(a.id)}">&times;</button>
            </div>`
        ).join('');
    }

    // ============================
    // NOTES UI
    // ============================
    async function loadNotes() {
        if (!state.authToken) return;
        try {
            const data = await apiFetch('/api/notes');
            renderNotesList(Array.isArray(data.notes) ? data.notes : []);
        } catch (_) {}
    }

    function renderNotesList(notes) {
        const list = document.getElementById('notes-list');
        if (!list) return;
        if (notes.length === 0) {
            list.innerHTML = '<p class="no-items">No analyst notes</p>'; return;
        }
        list.innerHTML = notes.map(n =>
            `<div class="note-item" data-id="${esc(n.id)}">
                <span class="note-title">${esc(n.title)}</span>
                ${n.lat != null ? `<span class="note-pts">${n.lat.toFixed(2)}, ${n.lon.toFixed(2)}</span>` : ''}
                <button class="del-btn" data-type="note" data-id="${esc(n.id)}">&times;</button>
            </div>`
        ).join('');
    }

    async function createNote(title, body, lat, lon) {
        if (!title || !body) { pushStatus('Title and body are required'); return; }
        try {
            const data = await apiFetch('/api/notes', {
                method: 'POST',
                body: JSON.stringify({ title, body, lat, lon, domain: 'analyst' })
            });
            if (data.note) {
                pushStatus(`Note "${esc(data.note.title)}" saved`);
                loadNotes();
            } else {
                pushStatus('Note save failed: ' + esc(data.error || 'error'));
            }
        } catch (_) { pushStatus('Note request error'); }
    }

    // ============================
    // AUTH PANEL: GET TOKEN
    // ============================
    async function requestToken(userId, role, secret) {
        try {
            const data = await apiFetch('/api/auth/token', {
                method: 'POST',
                body: JSON.stringify({ userId: userId || 'analyst1', role: role || 'analyst', secret: secret || '' })
            });
            if (data.token) {
                setToken(data.token);
                pushStatus(`Authenticated as ${esc(role)} — token stored`);
                loadAOIs();
                loadNotes();
                // Show analyst panels
                document.querySelectorAll('.analyst-only').forEach(el => el.classList.remove('hidden'));
            } else {
                pushStatus('Auth failed: ' + esc(data.error || 'unknown'));
            }
        } catch (e) {
            pushStatus('Auth request failed — is the server running?');
        }
    }

    // ============================
    // GLOBE SNAPSHOT (PNG export)
    // ============================
    function exportSnapshot() {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas) { pushStatus('Canvas not found'); return; }
        // Force preserveDrawingBuffer: this may require the renderer to be created with it
        // We use toBlob for async export to avoid blocking main thread
        try {
            canvas.toBlob(blob => {
                if (!blob) { pushStatus('Snapshot failed — try with preserveDrawingBuffer enabled'); return; }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `osint-snapshot-${Date.now()}.png`;
                a.click();
                URL.revokeObjectURL(a.href);
                pushStatus('Snapshot exported');
            }, 'image/png');
        } catch (e) {
            pushStatus('Snapshot error: ' + e.message);
        }
    }
    window.osintExportSnapshot = exportSnapshot;

    // ============================
    // GLOBE CLICK → DRAW / NOTE PIN
    // ============================
    function initGlobeClickExtension() {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas) return;
        canvas.addEventListener('click', (e) => {
            if (!state.drawMode) return;
            const pt = canvasToLonLat(e);
            if (!pt) return;
            state.vertices.push(pt);
            pushStatus(`Vertex added: lon=${pt[0]} lat=${pt[1]} (total: ${state.vertices.length})`);
            // Update temp line
            if (state._tempLine) window.scene.remove(state._tempLine);
            if (state.vertices.length >= 2) {
                state._tempLine = renderAOILine(state.vertices, 0xffcc00);
            }
        }, true); // capture phase so we get the event before osint-dashboard.js
    }

    function bindAnalystEvents() {
        document.getElementById('a-login-btn')?.addEventListener('click', () => {
            const userId = document.getElementById('a-userid')?.value?.trim();
            const role   = document.getElementById('a-role')?.value;
            const secret = document.getElementById('a-secret')?.value || '';
            if (userId) requestToken(userId, role, secret);
        });

        document.getElementById('aoi-draw-btn')?.addEventListener('click', () => {
            state.drawMode ? exitDrawMode() : enterDrawMode();
        });

        document.getElementById('aoi-save-btn')?.addEventListener('click', () => {
            const name = document.getElementById('aoi-name-input')?.value?.trim();
            saveCurrentAOI(name);
        });

        document.getElementById('note-save-btn')?.addEventListener('click', () => {
            const title = document.getElementById('note-title')?.value?.trim();
            const body  = document.getElementById('note-body')?.value?.trim();
            createNote(title, body, null, null);
        });

        document.getElementById('snapshot-btn')?.addEventListener('click', exportSnapshot);

        // Delegated delete
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('.del-btn[data-type]');
            if (!btn) return;
            const id   = btn.dataset.id;
            const type = btn.dataset.type;
            if (type === 'aoi') {
                await apiFetch(`/api/aoi/${encodeURIComponent(id)}`, { method: 'DELETE' });
                state.aoiRecords = state.aoiRecords.filter(a => a.id !== id);
                renderAOIList();
            } else if (type === 'note') {
                await apiFetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
                loadNotes();
            }
        });
    }

    // ============================
    // INIT
    // ============================
    function waitForScene(cb) {
        if (window.scene && window.THREE) { cb(); return; }
        const t = setInterval(() => { if (window.scene && window.THREE) { clearInterval(t); cb(); } }, 200);
    }

    function init() {
        bindAnalystEvents();
        waitForScene(() => {
            initGlobeClickExtension();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

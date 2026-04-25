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
    async function requestToken(userId, role) {
        try {
            const data = await apiFetch('/api/auth/token', {
                method: 'POST',
                body: JSON.stringify({ userId: userId || 'analyst1', role: role || 'analyst' })
            });
            if (data.token) {
                setToken(data.token);
                pushStatus(`Authenticated as ${esc(role)} — token stored`);
                loadAOIs();
                loadNotes();
                // Show analyst panels
                document.querySelectorAll('.analyst-only').forEach(el => el.style.display = 'block');
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

    // ============================
    // HTML INJECTION: Analyst panel
    // ============================
    function injectAnalystPanel() {
        if (document.getElementById('analyst-panel')) return; // idempotent
        const panel = document.createElement('div');
        panel.id = 'analyst-panel';
        panel.className = 'analyst-panel';
        panel.innerHTML = `
            <div class="panel-title">ANALYST TOOLS</div>
            <!-- Auth -->
            <div class="analyst-section">
                <div class="section-label">AUTH</div>
                <input id="a-userid" placeholder="User ID" class="a-input" value="analyst1" />
                <select id="a-role" class="a-input">
                    <option value="viewer">Viewer</option>
                    <option value="analyst" selected>Analyst</option>
                    <option value="admin">Admin</option>
                </select>
                <button id="a-login-btn" class="a-btn">Get Token</button>
            </div>
            <!-- AOI -->
            <div class="analyst-section analyst-only" style="display:none">
                <div class="section-label">AOI</div>
                <input id="aoi-name-input" placeholder="AOI name" class="a-input" />
                <div style="display:flex;gap:6px">
                    <button id="aoi-draw-btn" class="a-btn">Draw AOI</button>
                    <button id="aoi-save-btn" class="a-btn">Save AOI</button>
                </div>
                <div id="aoi-list" class="items-list"></div>
            </div>
            <!-- Notes -->
            <div class="analyst-section analyst-only" style="display:none">
                <div class="section-label">INTEL NOTES</div>
                <input id="note-title" placeholder="Title" class="a-input" />
                <textarea id="note-body" placeholder="Analysis…" class="a-textarea"></textarea>
                <button id="note-save-btn" class="a-btn">Save Note</button>
                <div id="notes-list" class="items-list"></div>
            </div>
            <!-- Export -->
            <div class="analyst-section">
                <button id="snapshot-btn" class="a-btn">Export Snapshot</button>
            </div>
        `;
        document.body.appendChild(panel);
        injectAnalystStyles();
        bindAnalystEvents();
    }

    function injectAnalystStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #analyst-panel {
                position:fixed; right:328px; top:48px; width:200px;
                background:var(--osint-bg,rgba(6,12,26,0.92));
                border:1px solid var(--osint-border,rgba(0,220,255,0.18));
                border-radius:6px; font-family:'Courier New',monospace; font-size:11px;
                color:var(--osint-text,#c8e6f4); z-index:1700;
                backdrop-filter:blur(8px); overflow:hidden;
            }
            #analyst-panel .panel-title { padding:7px 10px; color:var(--osint-accent,#00dcff); font-weight:700; letter-spacing:1px; font-size:11px; border-bottom:1px solid var(--osint-border,rgba(0,220,255,0.18)); background:rgba(0,220,255,0.05); }
            .analyst-section { padding:8px 10px; border-bottom:1px solid rgba(0,220,255,0.05); }
            .section-label { font-size:9px; color:var(--osint-subtext,#6a8fa8); letter-spacing:1px; margin-bottom:4px; }
            .a-input,.a-textarea { width:100%; background:#0a1628; border:1px solid var(--osint-border,rgba(0,220,255,0.18)); color:var(--osint-text,#c8e6f4); border-radius:3px; padding:3px 6px; font-size:11px; font-family:inherit; margin-bottom:4px; box-sizing:border-box; }
            .a-textarea { height:56px; resize:vertical; }
            .a-btn { background:rgba(0,220,255,0.1); border:1px solid var(--osint-border,rgba(0,220,255,0.18)); color:var(--osint-accent,#00dcff); border-radius:3px; padding:3px 8px; font-size:10px; cursor:pointer; font-family:inherit; letter-spacing:1px; }
            .a-btn:hover { background:rgba(0,220,255,0.2); }
            .a-btn.active { background:rgba(255,204,0,0.15); color:#ffcc00; border-color:#ffcc00; }
            .items-list { max-height:100px; overflow-y:auto; margin-top:4px; }
            .note-item { display:flex; align-items:center; gap:4px; padding:3px 0; border-bottom:1px solid rgba(0,220,255,0.04); font-size:10px; }
            .note-item .note-title { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .note-pts { color:var(--osint-subtext,#6a8fa8); font-size:9px; }
            .del-btn { background:none; border:none; color:#ff3b3b; cursor:pointer; font-size:12px; padding:0 2px; line-height:1; }
            .no-items { color:var(--osint-subtext,#6a8fa8); font-size:10px; padding:4px 0; margin:0; }
        `;
        document.head.appendChild(style);
    }

    function bindAnalystEvents() {
        document.getElementById('a-login-btn')?.addEventListener('click', () => {
            const userId = document.getElementById('a-userid')?.value?.trim();
            const role   = document.getElementById('a-role')?.value;
            if (userId) requestToken(userId, role);
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
        injectAnalystPanel();
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

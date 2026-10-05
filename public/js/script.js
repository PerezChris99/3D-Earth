// Global variables
let scene, camera, renderer, earth, clouds, atmosphere;
let controls;
// Snapshot of the initial camera state so Reset reliably restores position/target/fov
let initialCameraState = null;
let earthGroup, cloudGroup;
let isRotating = true;
let showClouds = true;
let raycaster, mouse;

// Smooth rotation resume state
let rotationTransitionActive = false;
let rotationTransitionStart = 0;
let rotationTransitionDuration = 1.2; // seconds for smooth blend when resuming
let rotationOffsetStart = 0.0; // initial offset between current rotation and GMST at transition start

// Texture URLs (using reliable sources)
const textureUrls = {
    earth: '/assets/earth/earth_atmos_2048.jpg',
    earthBump: '/assets/earth/earth_normal_2048.jpg',
    earthSpecular: '/assets/earth/earth_specular_2048.jpg',
    clouds: '/assets/earth/earth_clouds_1024.png',
    earthLights: '/assets/earth/earth_lights_2048.png',
    moon: '/assets/earth/moon_1024.jpg',
    starfield: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/cube/MilkyWay/dark_s_px.jpg'
};

// Backup texture URLs
const backupUrls = {
    earth: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
    clouds: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
};

// Data layers and groups
// ISS removed per user request
let issObject = null;
let satellitesGroup = null;
let currentsGroup = null;
let moonObject = null;
let sunObject = null;
let sunLight = null;
let ambientLight = null;
// Sun orbit for day/night
let sunAngle = 0;
// Keep the Sun at a reasonable visual distance so it's visible and detailed but still lights the globe
// (Earth radius == 1). Set closer so it is clearly visible.
let sunDistance = 6;
let sunSpeed = 0.0009; // radians per frame
// Visual moon distance (scaled). Real Moon is much farther; this keeps visibility while being distant.
let moonDistance = 2.5;
let magneticGroup = null;
let nightMaterial = null;
let nightMesh = null;
let tideMesh = null;
let tideMaterial = null;
let starUniforms = null;
// Star control parameters (driven by UI)
let starTwinkleSpeed = 0.05; // default matches UI control
let starDensityScale = 1.0; // multiplies star sizes

// Comet system globals
let cometsGroup = null;
let nextCometTime = Date.now() + (1000 * 60 * 60 * 24 * 7); // ~1 week from start
const COMET_MIN_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7; // 1 week
const COMET_MAX_INTERVAL_MS = 1000 * 60 * 60 * 24 * 90; // ~3 months

// small cloud drift offset (radians)
let cloudDrift = 0.0;

// Helper: compute GMST in radians for a given Date (reused by computeSunEcef earlier)
function getGMSTRad(date) {
    const JD = toJulianDate(date);
    const T = (JD - 2451545.0) / 36525.0;
    let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
    GMST = ((GMST % 360) + 360) % 360;
    return deg2rad(GMST);
}

// simulation time and update timers
let simTime = new Date();
let tleUpdateTimer = null;
const TLE_UPDATE_MS = 3000;

// GPU smoothing / follow settings
const USE_GPU_SMOOTH = true;
let satInterp = 1.0;
let satInterpDuration = 0.8; // seconds
let satInterpStart = 0;
let prevSatBuffer = null; // Float32Array
let nextSatBuffer = null; // Float32Array
let tleCount = 0;
let satelliteInstances = null;
let satellitePanelInstances = null;
let selectedSatellite = null;
const MAX_REAL_SATELLITE_VISUALS = 5000;
const satelliteMatrix = new THREE.Object3D();
const satelliteQuaternion = new THREE.Quaternion();
const satelliteForward = new THREE.Vector3(0, 0, 1);


// atmosphere slider pending value
// atmosphere slider pending value (raw slider value 0..1.2)
let atmoPendingValue = 0.6; // processed exposure used by shader (after gamma mapping)
let atmoPendingRaw = 0.45; // raw slider value (kept as single source of truth)
let nightPending = 0.25;
let fadePending = 4.0;

// ISS follow camera
let followISSEnabled = false;
const followLerp = 0.12;
// follow camera transition state
let followTransitionStart = 0;
let followTransitionDuration = 1.2; // seconds
let followSaved = null; // { pos: Vector3, target: Vector3, fov: number }
let followStartPos = null;
let followStartTarget = null;
let followStartFov = null;
let followTargetFov = 40; // zoomed-in fov
let followDesiredOffset = new THREE.Vector3(0.0, 0.12, 0.35);
let followOrbitSpeed = 0.6; // radians per second

// Comets removed per user request

// TLE / satellite data
let tleData = [];
let tlePoints = null;
let tlePositionsAttr = null;
let tleUpdateInterval = 5000; // ms
let lastTleUpdate = 0;
// Synthetic satellite population (visible even if TLE fetch fails)
let syntheticPoints = null;
let syntheticPositionsAttr = null;
let syntheticParams = [];
const SYNTHETIC_SAT_COUNT = 500; // adjust for performance

// Simple helper: fetch JSON
async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

// --- Astronomy & Geodesy Utilities ---
function toJulianDate(date) {
    return date.getTime() / 86400000.0 + 2440587.5;
}

function deg2rad(d) { return d * Math.PI / 180; }
function rad2deg(r) { return r * 180 / Math.PI; }

// Compute sun ECI (equatorial) vector then convert to ECEF using GMST
function computeSunEcef(date) {
    const JD = toJulianDate(date);
    const n = JD - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360; // mean longitude
    const g = (357.528 + 0.9856003 * n) % 360; // mean anomaly
    const Lrad = deg2rad(L);
    const grad = deg2rad(g);
    const lambda = deg2rad((L + 1.915 * Math.sin(grad) + 0.020 * Math.sin(2 * grad)) % 360);
    const eps = deg2rad(23.439 - 0.0000004 * n);

    const x_eq = Math.cos(lambda);
    const y_eq = Math.cos(eps) * Math.sin(lambda);
    const z_eq = Math.sin(eps) * Math.sin(lambda);
    // RA/Dec not required; vector in equatorial coordinates (ECI)
    // Now rotate by GMST to ECEF
    const T = (JD - 2451545.0) / 36525.0;
    let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
    GMST = ((GMST % 360) + 360) % 360;
    const gmstRad = deg2rad(GMST);

    const x = x_eq * Math.cos(gmstRad) + y_eq * Math.sin(gmstRad);
    const y = -x_eq * Math.sin(gmstRad) + y_eq * Math.cos(gmstRad);
    const z = z_eq;
    return new THREE.Vector3(x, y, z).normalize();
}

// Simple moon position approximation (visual only)
function computeMoonEcef(date) {
    // Low-precision lunar position based on mean elements + main periodic terms
    // Returns unit vector in ECEF (meters normalized) pointing to the Moon.
    const JD = toJulianDate(date);
    const D = JD - 2451545.0; // days since J2000
    const T = D / 36525.0;

    // Mean elements (degrees)
    const Lp = (218.3164477 + 481267.88123421 * T) % 360; // mean longitude of the Moon
    const M = (134.9633964 + 477198.8675055 * T) % 360; // Moon mean anomaly
    const Ms = (357.5291092 + 35999.0502909 * T) % 360; // Sun mean anomaly
    const Dm = (297.8501921 + 445267.1114034 * T) % 360; // mean elongation
    const F = (93.2720950 + 483202.0175233 * T) % 360; // argument of latitude

    // convert to radians
    const Lp_r = deg2rad(Lp);
    const M_r = deg2rad(M);
    const Ms_r = deg2rad(Ms);
    const Dm_r = deg2rad(Dm);
    const F_r = deg2rad(F);

    // Periodic terms (low-precision; main contributors)
    const lambda = Lp_r
        + deg2rad(6.289) * Math.sin(M_r)
        + deg2rad(1.274) * Math.sin(2 * Dm_r - M_r)
        + deg2rad(0.658) * Math.sin(2 * Dm_r)
        + deg2rad(0.214) * Math.sin(2 * M_r)
        - deg2rad(0.11) * Math.sin(Ms_r);

    const beta = deg2rad(5.128) * Math.sin(F_r)
        + deg2rad(0.280) * Math.sin(M_r + F_r)
        + deg2rad(0.277) * Math.sin(M_r - F_r)
        + deg2rad(0.173) * Math.sin(2 * Dm_r - F_r);

    // Ecliptic rectangular coordinates (unit sphere; distance ignored for direction)
    const x_ecl = Math.cos(beta) * Math.cos(lambda);
    const y_ecl = Math.cos(beta) * Math.sin(lambda);
    const z_ecl = Math.sin(beta);

    // Convert from ecliptic to equatorial coordinates by obliquity
    const eps = deg2rad(23.439291 - 0.0130042 * T);
    const x_eq = x_ecl;
    const y_eq = y_ecl * Math.cos(eps) - z_ecl * Math.sin(eps);
    const z_eq = y_ecl * Math.sin(eps) + z_ecl * Math.cos(eps);

    // Rotate from ECI (equatorial) to ECEF using GMST
    let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
    GMST = ((GMST % 360) + 360) % 360;
    const gmstRad = deg2rad(GMST);

    const x = x_eq * Math.cos(gmstRad) + y_eq * Math.sin(gmstRad);
    const y = -x_eq * Math.sin(gmstRad) + y_eq * Math.cos(gmstRad);
    const z = z_eq;
    const v = new THREE.Vector3(x, y, z);
    return v.normalize();
}

// WGS84 geodetic <-> ECEF helper removed (location features disabled)

// --- SGP4 Worker integration ---
let sgp4Worker = null;
function setupSgp4Worker() {
    if (typeof Worker === 'undefined') return null;
    try {
        sgp4Worker = new Worker('public/js/sgp4-worker.js');
        sgp4Worker.onmessage = (ev) => {
            const msg = ev.data;
            if (msg.type === 'positions' && tlePositionsAttr && msg.positions) {
                const arr = msg.positions;
                updateSatelliteModels(arr);
                // copy into attribute buffer safely
                const len = arr.length;
                // keep a separate copy for interpolation / ISS lookups
                if (!window._tleLatestBuffer || window._tleLatestBuffer.length !== len) {
                    window._tleLatestBuffer = new Float32Array(len);
                }
                window._tleLatestBuffer.set(arr);
                // update prev/next GPU buffers for interpolation
                if (prevSatBuffer && nextSatBuffer && tlePoints && tlePoints.material && tlePoints.geometry) {
                    // copy current next -> prev
                    prevSatBuffer.set(nextSatBuffer);
                    // copy incoming arr into next
                    nextSatBuffer.set(arr);
                    // flag attributes update
                    const aPrev = tlePoints.geometry.getAttribute('a_posPrev');
                    const aNext = tlePoints.geometry.getAttribute('a_posNext');
                    if (aPrev) aPrev.needsUpdate = true;
                    if (aNext) aNext.needsUpdate = true;
                    // reset interpolation timer and uniform
                    if (tlePoints.material && tlePoints.material.uniforms) {
                        tlePoints.material.uniforms.u_interp.value = 0.0;
                        satInterpStart = performance.now() / 1000.0;
                    }
                }
                lastTleUpdate = Date.now();
            } else if (msg.type === 'ready') {
                console.log('SGP4 worker ready:', msg);
                if (!msg.satlib) {
                    console.warn('Satellite.js not available inside worker; falling back to main-thread propagation.');
                    try { sgp4Worker.terminate(); } catch (e) {}
                    sgp4Worker = null;
                }
            }
        };
        return sgp4Worker;
    } catch (e) {
        console.warn('SGP4 worker setup failed', e);
        sgp4Worker = null;
    }
    return null;
}

// Wire UI checkboxes to toggle functions after DOM available
function wireUiToggles() {
    console.log('wireUiToggles: attaching UI listeners');
    const map = [
        ['chk-satellites', 'satellitesEnabled', updateSatellitesVisibility],
        ['chk-currents', 'currentsEnabled', updateCurrentsVisibility],
    ['chk-moon', 'moonEnabled', updateMoonVisibility],
    ['chk-magnetic', 'magneticEnabled', updateMagneticVisibility]
    ];

    map.forEach(([id, , fn]) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                console.log('ui-change', id, el.checked);
                fn(el.checked);
                if (window.sendControlCmd) window.sendControlCmd('set_layer', { layer: id.replace('chk-', ''), enabled: el.checked });
            });
            // defensive fallback in case addEventListener is not effective in some environments
            try { el.onchange = () => { console.log('ui-onchange-fallback', id, el.checked); fn(el.checked); }; } catch (e) {}
        } else console.warn('wireUiToggles: element not found', id);
    });

    const issChk = document.getElementById('chk-iss');
    if (issChk) {
        issChk.addEventListener('change', () => { console.log('ui-change chk-iss', issChk.checked); updateIssVisibility(issChk.checked); });
        try { issChk.onchange = () => { console.log('ui-onchange-fallback chk-iss', issChk.checked); updateIssVisibility(issChk.checked); }; } catch (e) {}
    }

    // Controls panel collapse/expand toggle — removed (old .controls element no longer exists)

    // Globe control action buttons
    document.getElementById('btn-clouds')?.addEventListener('click', () => toggleClouds());
    document.getElementById('btn-rotate')?.addEventListener('click', () => toggleRotation());
    document.getElementById('btn-reset')?.addEventListener('click', () => resetView());
    document.getElementById('btn-follow-iss')?.addEventListener('click', () => resetView());

    // Globe controls collapsible section
    const globeCtrlHdr = document.getElementById('globe-ctrl-hdr');
    const globeCtrlBody = document.getElementById('globe-ctrl-body');
    if (globeCtrlHdr && globeCtrlBody) {
        globeCtrlHdr.addEventListener('click', () => {
            const open = globeCtrlBody.classList.toggle('open');
            const caret = globeCtrlHdr.querySelector('.collapse-caret');
            if (caret) caret.textContent = open ? '▾' : '▸';
        });
    }

    // PBR toggle

    // atmosphere range
    const atRange = document.getElementById('range-atmo');
    if (atRange) {
        atRange.addEventListener('input', () => {
            const v = parseFloat(atRange.value || 1.0);
            console.log('ui-input range-atmo', v);
            atmoPendingRaw = v;
            // process immediately for snappy feedback
            const proc = Math.pow(v, 1.2);
            atmoPendingValue = proc;
            if (atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_exposure) {
                atmosphere.material.uniforms.u_exposure.value = atmoPendingValue;
            }
            if (window.sendControlCmd) window.sendControlCmd('set_setting', { key: 'atmo_exposure', value: proc });
        });

    }

    const chkAtm = document.getElementById('chk-atmosphere');
    if (chkAtm) {
    chkAtm.addEventListener('change', () => { console.log('ui-change chk-atmosphere', chkAtm.checked); if (atmosphere) atmosphere.visible = chkAtm.checked; });
    try { chkAtm.onchange = () => { console.log('ui-onchange-fallback chk-atmosphere', chkAtm.checked); if (atmosphere) atmosphere.visible = chkAtm.checked; }; } catch (e) {}
    }

    // (removed realtime, PBR toggle, and night-glow UI controls per user request)

    const fadeRange = document.getElementById('range-fade');
    if (fadeRange) {
        fadeRange.addEventListener('input', () => {
            const v = parseFloat(fadeRange.value || 4.0);
            console.log('ui-input range-fade', v);
            fadePending = v;
            if (atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_fadeHeight) {
                atmosphere.material.uniforms.u_fadeHeight.value = fadePending;
            }
            if (window.sendControlCmd) window.sendControlCmd('set_setting', { key: 'fade_height', value: v });
        });

    }

    // Sun and Moon distance sliders (live tuning)
    const sunRange = document.getElementById('range-sun-distance');
    const sunVal = document.getElementById('val-sun-distance');
    if (sunRange) {
        // set initial display
        if (sunVal) sunVal.textContent = sunRange.value;
        sunRange.addEventListener('input', () => {
            const v = parseFloat(sunRange.value || sunDistance);
            sunDistance = v;
            if (sunVal) sunVal.textContent = v.toFixed(2);
            // rescale sun sprite parts for visual consistency
            try {
                if (sunObject && sunObject.userData) {
                    const core = sunObject.userData.core;
                    const corona = sunObject.userData.corona;
                    const halo = sunObject.userData.halo;
                    if (core) core.scale.set(1.8 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.8 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.0);
                    if (corona) corona.scale.set(4.2 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 4.2 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.0);
                    if (halo) halo.scale.set(9.0 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 9.0 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.0);
                }
            } catch (e) {}
            if (window.sendControlCmd) window.sendControlCmd('set_setting', { key: 'sun_distance', value: v });
        });
        try { sunRange.oninput = () => { const v = parseFloat(sunRange.value || sunDistance); sunDistance = v; if (sunVal) sunVal.textContent = v.toFixed(2); }; } catch (e) {}
    }

    const moonRange = document.getElementById('range-moon-distance');
    const moonVal = document.getElementById('val-moon-distance');
    if (moonRange) {
        if (moonVal) moonVal.textContent = moonRange.value;
        moonRange.addEventListener('input', () => {
            const v = parseFloat(moonRange.value || moonDistance);
            moonDistance = v;
            if (moonVal) moonVal.textContent = v.toFixed(2);
            // reposition moon immediately
            try { if (moonObject) moonObject.position.setLength(moonDistance); } catch (e) {}
            if (window.sendControlCmd) window.sendControlCmd('set_setting', { key: 'moon_distance', value: v });
        });
        try { moonRange.oninput = () => { const v = parseFloat(moonRange.value || moonDistance); moonDistance = v; if (moonVal) moonVal.textContent = v.toFixed(2); }; } catch (e) {}
    }

    // Stars and comet UI removed; behavior is now automatic
}

// Swap earth material between simple Phong and MeshStandard PBR
function setEarthMaterial(usePbr) {
    if (!earth) return;
    const old = earth.material;
    try {
        // Use a matte MeshStandardMaterial regardless of the toggle.
        const mat = new THREE.MeshStandardMaterial({
            map: loadTexture(textureUrls.earth, backupUrls.earth),
            normalMap: loadTexture(textureUrls.earthBump, backupUrls.earth),
            metalness: 0.0,
            roughness: 1.0,
            envMapIntensity: 0.0
        });
        // Reduce normal map strength for subtle surface detail without glossy highlights
        try { if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.35, 0.35); } catch (e) {}
        earth.material = mat;
    } catch (e) {
        console.warn('Failed to swap earth material', e);
        earth.material = old;
    }
    try { if (old && old.dispose) old.dispose(); } catch (e) {}
}

// CPU fallback: when worker is not present, compute TLE positions on main thread and update prev/next buffers for GPU interpolation
async function updateTLEPositionsFallback() {
    if (!tleData || tleData.length === 0) return;
    const now = new Date();
    const gmst = satellite.gstime(now);
    const count = tleData.length;
    // prepare a temporary Float32Array for new positions
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        try {
            const t = tleData[i];
            if (!t.tle1 || !t.tle2) {
                // keep existing placeholder
                arr[i * 3 + 0] = nextSatBuffer ? nextSatBuffer[i * 3 + 0] : 1.1;
                arr[i * 3 + 1] = nextSatBuffer ? nextSatBuffer[i * 3 + 1] : 0.0;
                arr[i * 3 + 2] = nextSatBuffer ? nextSatBuffer[i * 3 + 2] : 0.0;
                continue;
            }
            const satrec = satellite.twoline2satrec(t.tle1, t.tle2);
            const p = satellite.propagate(satrec, now).position;
            if (!p) continue;
            const geo = satellite.eciToGeodetic(p, gmst);
            const lon = (geo.longitude * 180) / Math.PI;
            const lat = (geo.latitude * 180) / Math.PI;
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 180) * (Math.PI / 180);
            const r = 1.1;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.cos(phi);
            const z = r * Math.sin(phi) * Math.sin(theta);
            arr[i * 3 + 0] = x;
            arr[i * 3 + 1] = y;
            arr[i * 3 + 2] = z;
        } catch (e) {
            // keep previous value if error
            arr[i * 3 + 0] = nextSatBuffer ? nextSatBuffer[i * 3 + 0] : 0;
            arr[i * 3 + 1] = nextSatBuffer ? nextSatBuffer[i * 3 + 1] : 0;
            arr[i * 3 + 2] = nextSatBuffer ? nextSatBuffer[i * 3 + 2] : 0;
        }
    }
    // if buffers available, slide next -> prev, set next to arr
    if (prevSatBuffer && nextSatBuffer) {
        prevSatBuffer.set(nextSatBuffer);
        nextSatBuffer.set(arr);
        const aPrev = tlePoints.geometry.getAttribute('a_posPrev');
        const aNext = tlePoints.geometry.getAttribute('a_posNext');
        if (aPrev) aPrev.needsUpdate = true;
        if (aNext) aNext.needsUpdate = true;
        if (tlePoints.material && tlePoints.material.uniforms) {
            tlePoints.material.uniforms.u_interp.value = 0.0;
            satInterpStart = performance.now() / 1000.0;
        }
    } else if (tlePositionsAttr) {
        // fallback: update the position attribute directly
        tlePositionsAttr.array.set(arr);
        tlePositionsAttr.needsUpdate = true;
    }
    // update copy for ISS lookup
    if (!window._tleLatestBuffer || window._tleLatestBuffer.length !== arr.length) window._tleLatestBuffer = new Float32Array(arr.length);
    window._tleLatestBuffer.set(arr);
    lastTleUpdate = Date.now();
}

// helper: format Date -> datetime-local value
function toLocalDatetimeInputValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hrs = pad(d.getHours());
    const mins = pad(d.getMinutes());
    const secs = pad(d.getSeconds());
    return `${year}-${month}-${day}T${hrs}:${mins}:${secs}`;
}

// Placeholder implementations for toggles (will be filled when groups created)
// (Removed day/night, city lights, weather, earthquakes toggles)
// ISS functionality removed; placeholder no-op to avoid undefined references
function updateIssVisibility(checked) {
    if (issObject) issObject.visible = checked;
}
function updateSatellitesVisibility(checked) {
    if (satellitesGroup) satellitesGroup.visible = checked;
}
// (Removed borders toggle)
function updateCurrentsVisibility(checked) {
    if (currentsGroup) currentsGroup.visible = checked;
}
// (Removed seasonal snow toggle)
function updateMoonVisibility(checked) {
    if (moonObject) moonObject.visible = checked;
}

function updateMagneticVisibility(checked) {
    if (magneticGroup) magneticGroup.visible = checked;
}
// (Removed population heatmap toggle)
// (Removed historical events toggle)


// Track ISS using open-notify API
// ISS removed: trackISS and createISSModel intentionally omitted

// Satellites group (ISS + other simple satellites)
function createSatellites() {
    satellitesGroup = new THREE.Group();

    // Create a points buffer for many satellites using shader for GPU interpolation
    const satVertexShader = `
        attribute vec3 a_posPrev;
        attribute vec3 a_posNext;
        uniform float u_interp;
        uniform float u_pointSize;
        void main() {
            vec3 pos = mix(a_posPrev, a_posNext, u_interp);
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = u_pointSize / -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
        }
    `;
    const satFragmentShader = `
        void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float r = length(c);
            if (r > 0.5) discard;
            gl_FragColor = vec4(1.0, 0.67, 0.0, 1.0);
        }
    `;
    const satGeom = new THREE.BufferGeometry();
    tlePoints = new THREE.Points(satGeom, new THREE.ShaderMaterial({
        vertexShader: satVertexShader,
        fragmentShader: satFragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
            u_interp: { value: 0.0 },
            u_pointSize: { value: 6.0 }
        }
    }));
    // Keep the legacy interpolation buffer for propagation, but do not present satellites as dots.
    tlePoints.visible = false;
    satellitesGroup.add(tlePoints);

    // Real tracked objects are rendered as lightweight 3D spacecraft silhouettes.
    // The orbital state remains sourced from CelesTrak + SGP4; the geometry is a visual marker,
    // not a claim that every spacecraft has an identical physical design.
    const maxVisuals = MAX_REAL_SATELLITE_VISUALS;
    const bodyGeo = new THREE.BoxGeometry(0.040, 0.015, 0.015);
    const panelGeo = new THREE.BoxGeometry(0.012, 0.0022, 0.065);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xf2f5f8, emissive: 0x31465d, emissiveIntensity: 0.65, shininess: 35 });
    const panelMat = new THREE.MeshPhongMaterial({ color: 0x4779a8, emissive: 0x16304b, emissiveIntensity: 0.45, shininess: 20 });
    satelliteInstances = new THREE.InstancedMesh(bodyGeo, bodyMat, maxVisuals);
    satellitePanelInstances = new THREE.InstancedMesh(panelGeo, panelMat, maxVisuals);
    satelliteInstances.frustumCulled = false;
    satellitePanelInstances.frustumCulled = false;
    satelliteInstances.count = 0;
    satellitePanelInstances.count = 0;
    satelliteInstances.userData.domain = 'satellite';
    satellitePanelInstances.userData.domain = 'satellite-panel';
    satellitesGroup.add(satelliteInstances);
    satellitesGroup.add(satellitePanelInstances);
    window.satelliteInstances = satelliteInstances;
    window.satellitePanelInstances = satellitePanelInstances;

    // ISS removed: no per-satellite highlight mesh created

    scene.add(satellitesGroup);

    // Fetch TLEs from CelesTrak (active satellites)
    fetchTLES();


}

// Load a small ISS GLTF model (fallback to a simple box if loader unavailable)
function updateSatelliteModels(arr) {
    if (!satelliteInstances || !satellitePanelInstances || !arr) return;
    const count = Math.min(tleData.length, MAX_REAL_SATELLITE_VISUALS, Math.floor(arr.length / 3));
    for (let i = 0; i < count; i++) {
        const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
        if (![x,y,z].every(Number.isFinite) || (x === 0 && y === 0 && z === 0)) {
            satelliteMatrix.position.set(0, 0, 0);
            satelliteMatrix.scale.setScalar(0);
        } else {
            satelliteMatrix.position.set(x, y, z);
            satelliteMatrix.scale.setScalar(1);
            const prevX = i > 0 ? arr[i * 3] : x;
            // Use the orbit radial direction as a stable spacecraft attitude fallback.
            const radial = new THREE.Vector3(x, y, z).normalize();
            satelliteQuaternion.setFromUnitVectors(satelliteForward, radial);
            satelliteMatrix.quaternion.copy(satelliteQuaternion);
        }
        satelliteMatrix.updateMatrix();
        satelliteInstances.setMatrixAt(i, satelliteMatrix.matrix);
        // Panel mesh uses the same transform; its geometry is a compact cross-body silhouette.
        satellitePanelInstances.setMatrixAt(i, satelliteMatrix.matrix);
    }
    satelliteInstances.count = count;
    satellitePanelInstances.count = count;
    satelliteInstances.instanceMatrix.needsUpdate = true;
    satellitePanelInstances.instanceMatrix.needsUpdate = true;

    if (selectedSatellite?.visible && window._selectedSatelliteIndex != null) {
        const i = window._selectedSatelliteIndex;
        if (i < count) selectedSatellite.position.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
    }
}

function satelliteOwnerCountry(code) {
    const map = {
        US:'United States', CA:'Canada', UK:'United Kingdom', FR:'France', GER:'Germany',
        IT:'Italy', JPN:'Japan', IND:'India', PRC:'People\'s Republic of China',
        CIS:'Commonwealth of Independent States', SKOR:'Republic of Korea', NKOR:'North Korea',
        RUS:'Russia', AUS:'Australia', BRAZ:'Brazil', ARG:'Argentina', ISR:'Israel',
        ESA:'European Space Agency', NATO:'NATO', UEA:'United Arab Emirates', KEN:'Kenya',
        UGA:'Uganda', GHA:'Ghana', ZAF:'South Africa', NETH:'Netherlands', NOR:'Norway'
    };
    return map[String(code || '').trim().toUpperCase()] || null;
}

function formatSatelliteAge(launchDate) {
    if (!launchDate) return '—';
    const start = new Date(launchDate + 'T00:00:00Z');
    if (Number.isNaN(start.getTime())) return '—';
    const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
    const years = Math.floor(days / 365.2425);
    const months = Math.floor((days % 365.2425) / 30.44);
    return years ? `${years}y ${months}m` : `${months}m`;
}

function formatSpeed(kmps) {
    if (!Number.isFinite(kmps)) return '—';
    return `${kmps.toFixed(3)} km/s (${Math.round(kmps * 3600)} km/h)`;
}

function createSelectedSatelliteMarker() {
    if (selectedSatellite) return selectedSatellite;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.012, 0.012),
        new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x4d8fd8, emissiveIntensity: 0.9 })
    );
    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.002, 0.052),
        new THREE.MeshPhongMaterial({ color: 0x4d8fd8, emissive: 0x163d68 })
    );
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.003, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x6eb6ff, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(body, panel, ring);
    group.visible = false;
    group.userData = { ring };
    scene.add(group);
    selectedSatellite = group;
    return group;
}

async function trackSatelliteSelection(tracked) {
    if (!tracked || tracked.index == null) return;
    window._selectedSatelliteIndex = tracked.index;
    const t = tleData[tracked.index];
    if (!t) return;

    const marker = createSelectedSatelliteMarker();
    const arr = window._tleLatestBuffer;
    if (arr && arr.length >= tracked.index * 3 + 3) {
        marker.position.set(arr[tracked.index * 3], arr[tracked.index * 3 + 1], arr[tracked.index * 3 + 2]);
        marker.visible = true;
    }

    let orbital = {};
    try {
        if (window.satellite && t.tle1 && t.tle2) {
            const now = new Date();
            const satrec = satellite.twoline2satrec(t.tle1, t.tle2);
            const state = satellite.propagate(satrec, now);
            if (state?.position && state?.velocity) {
                const gmst = satellite.gstime(now);
                const geo = satellite.eciToGeodetic(state.position, gmst);
                const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
                orbital = {
                    latitude: `${(geo.latitude * 180 / Math.PI).toFixed(3)}°`,
                    longitude: `${(geo.longitude * 180 / Math.PI).toFixed(3)}°`,
                    altitude: `${geo.height.toFixed(1)} km`,
                    speed: formatSpeed(speed),
                    period: t.tle2 ? `${(1440 / Number(t.tle2.slice(52, 63))).toFixed(2)} min` : '—',
                    epoch: t.tle1.slice(18, 32).trim()
                };
            }
        }
    } catch (e) {
        console.warn('Satellite propagation failed', e);
    }

    let catalog = {};
    try {
        if (tracked.norad) {
            const res = await fetch(`/api/satellites/${encodeURIComponent(tracked.norad)}`);
            if (res.ok) catalog = await res.json();
        }
    } catch (e) {
        console.warn('Satellite catalog lookup failed', e);
    }

    const launchDate = catalog.LAUNCH_DATE || catalog.launchDate;
    const decayDate = catalog.DECAY_DATE || catalog.decayDate;
    const display = {
        type: 'sat',
        name: t.name,
        norad: tracked.norad || catalog.NORAD_CAT_ID,
        intdes: catalog.OBJECT_ID || catalog.intdes || '—',
        owner: catalog.OWNER || catalog.owner || '—',
        country: satelliteOwnerCountry(catalog.OWNER || catalog.owner) || 'Catalog owner code only',
        launchSite: catalog.LAUNCH_SITE || catalog.launchSite || '—',
        launchDate: launchDate || '—',
        timeInSpace: formatSatelliteAge(launchDate),
        deployment: launchDate ? `Launch: ${launchDate}. Separate deployment date is not present in SATCAT.` : 'Not cataloged',
        etr: decayDate ? `Decay recorded: ${decayDate}` : 'No cataloged decay date',
        callsign: 'Not assigned / not provided by SATCAT',
        period: catalog.PERIOD ? `${Number(catalog.PERIOD).toFixed(2)} min` : orbital.period,
        inclination: catalog.INCLINATION != null ? `${Number(catalog.INCLINATION).toFixed(3)}°` : '—',
        apogee: catalog.APOGEE != null ? `${Number(catalog.APOGEE).toLocaleString()} km` : '—',
        perigee: catalog.PERIGEE != null ? `${Number(catalog.PERIGEE).toLocaleString()} km` : '—',
        ...orbital,
        tle1: t.tle1,
        tle2: t.tle2
    };
    window.osintOpenInspector?.(display);
}
window.trackSatelliteSelection = trackSatelliteSelection;

function getSatelliteCatalogNumber(t) {
    const match = String(t?.tle1 || '').match(/^1\\s+(\\d{1,9})/);
    return match ? match[1] : null;
}

window.getTrackedSatellite = function(index) {
    const t = tleData[index];
    if (!t) return null;
    return { index, ...t, norad: getSatelliteCatalogNumber(t) };
};

function createISSModel() {
    issObject = new THREE.Group();
    issObject.visible = false;
    // create a simple placeholder first
    const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    placeholder.castShadow = true;
    issObject.add(placeholder);
    scene.add(issObject);

    // attempt to load GLTF if GLTFLoader available
    if (window.THREE && window.THREE.GLTFLoader) {
        try {
            const loader = new THREE.GLTFLoader();
            // small lightweight ISS model URL (public placeholder)
            const url = 'https://raw.githubusercontent.com/NASA/threejs-examples-assets/main/models/ISS/ISS.gltf';
            loader.load(url, (g) => {
                // scale and orient
                const model = g.scene || g.scenes[0];
                model.scale.set(0.02, 0.02, 0.02);
                model.rotation.x = Math.PI / 2;
                // remove placeholder and attach model
                issObject.clear();
                issObject.add(model);
            }, undefined, (err) => {
                // leave placeholder
                console.warn('ISS model load failed', err);
            });
        } catch (e) {
            // ignore
        }
    }
}

// find TLE index for ISS by name
function findIssTleIndex() {
    if (!tleData || tleData.length === 0) return -1;
    for (let i = 0; i < tleData.length; i++) {
        const n = (tleData[i].name || '').toLowerCase();
        if (n.includes('iss') || n.includes('international space station')) return i;
    }
    return -1;
}

// Fetch TLE data from CelesTrak (active satellites) and parse into tleData
async function fetchTLES() {
    try {
        // Fetch the real active catalog through our server-side CelesTrak gateway.
        // This avoids browser CORS/redirect problems and keeps the provider request cached.
        const res = await fetch('/api/satellites', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Satellite gateway HTTP ${res.status}`);
        const payload = await res.json();
        tleData = Array.isArray(payload) ? payload : [];
        if (!tleData.length) throw new Error('CelesTrak returned no active satellites');

    // allocate positions buffer
        const count = tleData.length;
    console.log('Loaded TLE count:', count);
        const positions = new Float32Array(count * 3);
        tleCount = count;
        // allocate prev/next buffers
        prevSatBuffer = new Float32Array(count * 3);
        nextSatBuffer = new Float32Array(count * 3);
        // initialize with small random positions so shader has valid data
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const r = 1.1;
            prevSatBuffer[i * 3 + 0] = r * Math.cos(a);
            prevSatBuffer[i * 3 + 1] = r * Math.sin(a) * 0.1;
            prevSatBuffer[i * 3 + 2] = r * Math.sin(a);
            nextSatBuffer[i * 3 + 0] = prevSatBuffer[i * 3 + 0];
            nextSatBuffer[i * 3 + 1] = prevSatBuffer[i * 3 + 1];
            nextSatBuffer[i * 3 + 2] = prevSatBuffer[i * 3 + 2];
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('a_posPrev', new THREE.BufferAttribute(prevSatBuffer, 3));
        geom.setAttribute('a_posNext', new THREE.BufferAttribute(nextSatBuffer, 3));
        tlePoints.geometry.dispose();
        tlePoints.geometry = geom;
        // keep a conventional positions attr for fallback uses
        tlePositionsAttr = geom.getAttribute('a_posNext');
        // schedule first update
        if (!sgp4Worker) setupSgp4Worker();
        if (sgp4Worker) {
            sgp4Worker.postMessage({ type: 'setTLE', tle: tleData });
            sgp4Worker.postMessage({ type: 'update' });
        } else updateTLEPositionsFallback();
    } catch (e) {
        console.warn('Failed to fetch real satellite catalog', e);
        // Do not fabricate satellite positions. A failed provider means no satellite layer.
        tleData = [];
        tleCount = 0;
        if (tlePoints) {
            tlePoints.geometry.dispose();
            tlePoints.geometry = new THREE.BufferGeometry();
            tlePoints.count = 0;
        }
        if (satelliteInstances) satelliteInstances.count = 0;
        if (satellitePanelInstances) satellitePanelInstances.count = 0;
        lastTleUpdate = Date.now();
    }
}

// Update positions of tlePoints using satellite.js propagation
function updateTLEPositions() {
    if (!tleData || tleData.length === 0 || !tlePositionsAttr) return;
    // use worker if available
    if (sgp4Worker) {
        sgp4Worker.postMessage({ type: 'update' });
        return;
    }
    const now = new Date();
    const gmst = satellite.gstime(now);
    for (let i = 0; i < tleData.length; i++) {
        try {
            const t = tleData[i];
            const satrec = satellite.twoline2satrec(t.tle1, t.tle2);
            const p = satellite.propagate(satrec, now).position;
            if (!p) continue;
            const geo = satellite.eciToGeodetic(p, gmst);
            const lon = (geo.longitude * 180) / Math.PI;
            const lat = (geo.latitude * 180) / Math.PI;
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 180) * (Math.PI / 180);
            const r = 1.1; // visualize at slightly above globe
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.cos(phi);
            const z = r * Math.sin(phi) * Math.sin(theta);
            tlePositionsAttr.array[i * 3 + 0] = x;
            tlePositionsAttr.array[i * 3 + 1] = y;
            tlePositionsAttr.array[i * 3 + 2] = z;
        } catch (e) {
            // skip
        }
    }
    tlePositionsAttr.needsUpdate = true;
    lastTleUpdate = Date.now();
    // debug
    // console.log('TLE positions updated at', new Date().toISOString());
}

// schedule periodic TLE updates using worker or local propagation
function loadExternalScriptOnce(src, globalName) {
    return new Promise((resolve, reject) => {
        if (globalName && window[globalName]) return resolve(window[globalName]);
        const existing = document.querySelector(`script[data-external-src="${src}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.externalSrc = src;
        script.onload = () => resolve(globalName ? window[globalName] : true);
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureSatelliteRuntime() {
    if (window.satellite) return true;
    try {
        await loadExternalScriptOnce(
            'https://unpkg.com/satellite.js@4.0.0/dist/satellite.min.js',
            'satellite'
        );
        return Boolean(window.satellite);
    } catch (error) {
        console.warn('[3D Earth] Satellite propagation runtime unavailable; live propagation will remain paused.', error);
        return false;
    }
}

async function startTleUpdateLoop() {
    if (tleUpdateTimer) clearInterval(tleUpdateTimer);
    const satelliteReady = await ensureSatelliteRuntime();
    if (!satelliteReady) return;
    tleUpdateTimer = setInterval(() => {
    if (sgp4Worker) sgp4Worker.postMessage({ type: 'update' });
    else updateTLEPositionsFallback();
    }, TLE_UPDATE_MS);
}

function stopTleUpdateLoop() {
    if (tleUpdateTimer) { clearInterval(tleUpdateTimer); tleUpdateTimer = null; }
}

// Simple Sun representation (mesh + directional light)
function createSun() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 24), new THREE.MeshBasicMaterial({ color: 0xfff4c2 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createSunTexture(256, { innerColor: '#ffffff', outerColor: '#ff9d2e', falloff: 0.78 }),
        color: 0xffd36b, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(0.7, 0.7, 1);
    group.add(core, glow);
    group.userData = { core, corona: glow, halo: glow };
    group.frustumCulled = false;
    sunObject = group;
    scene.add(group);
    sunLight = new THREE.DirectionalLight(0xfff3d9, 1.7);
    sunLight.castShadow = false;
    scene.add(sunLight);
}
// create a radial gradient texture for the sun/corona
function createSunTexture(size, opts) {
    opts = opts || {};
    const inner = opts.innerColor || '#ffffff';
    const outer = opts.outerColor || '#ffdd66';
    const falloff = (opts.falloff !== undefined) ? opts.falloff : 0.85;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;
    // central bright disk
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.0, inner);
    grad.addColorStop(falloff * 0.35, '#fff6d9');
    grad.addColorStop(falloff * 0.65, outer);
    grad.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

// Comet utilities removed


// Simple ocean currents visual (animated particles)
function createCurrents() {
    currentsGroup = new THREE.Group();
    // lightweight representation: a few rings
        for (let i = 0; i < 6; i++) {
            const radius = 1.02 + i * 0.02;
            const pts = [];
            const segments = 128;
            for (let s = 0; s <= segments; s++) {
                const a = (s / segments) * Math.PI * 2;
                pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
            }
            const geom = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({ color: 0x00bcd4, transparent: true, opacity: 0.12 });
            const ring = new THREE.Line(geom, mat);
            ring.rotation.x = Math.random() * 0.2;
            currentsGroup.add(ring);
        }
    scene.add(currentsGroup);
}

// Magnetic field visualization: a set of field lines approximated by arcs
function createMagneticField() {
    magneticGroup = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 });

    // create several dipole-like field lines at various longitudes
    const lines = 36;
    for (let i = 0; i < lines; i++) {
        const lon = (i / lines) * Math.PI * 2;
        const pts = [];
        // from southern hemisphere up over the pole to northern hemisphere
        for (let t = -1; t <= 1; t += 0.05) {
            // param t in [-1,1], map to latitude-like curve
            const lat = t * Math.PI / 2; // -pi/2..pi/2
            const r = 1.02 + 0.25 * (1 - Math.abs(t)); // extend outward near equator
            const x = r * Math.cos(lat) * Math.cos(lon);
            const y = r * Math.sin(lat);
            const z = r * Math.cos(lat) * Math.sin(lon);
            pts.push(new THREE.Vector3(x, y, z));
        }
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, lineMat);
        magneticGroup.add(line);
    }

    magneticGroup.visible = false;
    scene.add(magneticGroup);
}

// Night lights overlay (shadered) that lights only the dark side based on sun direction
function createNightLights() {
    // Start with a transparent 1x1 texture so this optional layer can never
    // interfere with the core Earth material if its asset is unavailable.
    const placeholder = document.createElement('canvas');
    placeholder.width = 1;
    placeholder.height = 1;
    const ctx = placeholder.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1, 1);
    const nightTex = new THREE.CanvasTexture(placeholder);

    nightMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uNight: { value: nightTex },
            u_sunDir: { value: new THREE.Vector3(1, 0, 0) },
            uIntensity: { value: 1.2 }
        },
        vertexShader: `
            varying vec3 vNormalWorld;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uNight;
            uniform vec3 u_sunDir;
            uniform float uIntensity;
            varying vec3 vNormalWorld;
            varying vec2 vUv;
            void main() {
                float nd = dot(normalize(vNormalWorld), normalize(u_sunDir));
                float factor = clamp(-nd, 0.0, 1.0);
                vec3 color = texture2D(uNight, vUv).rgb;
                vec3 outc = color * factor * uIntensity;
                gl_FragColor = vec4(outc, factor * uIntensity);
            }
        `,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });

    const geom = new THREE.SphereGeometry(1.0015, 64, 64);
    nightMesh = new THREE.Mesh(geom, nightMaterial);
    if (earthGroup) earthGroup.add(nightMesh);

    loadLocalTexture('earth_lights_2048.png', (texture) => {
        texture.encoding = THREE.sRGBEncoding;
        nightMaterial.uniforms.uNight.value = texture;
        nightMaterial.needsUpdate = true;
    }, (error) => console.warn('[3D Earth] Night-lights texture unavailable; layer remains inert.', error));
}

// Create a subtle tidal overlay that simulates tidal bulges driven by Moon (primary) and Sun (secondary)
function createTides() {
    tideMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_moonDir: { value: new THREE.Vector3(1,0,0) },
            u_sunDir: { value: new THREE.Vector3(1,0,0) },
            u_moonStrength: { value: 1.0 },
            u_sunStrength: { value: 0.46 },
            u_amplitude: { value: 0.012 },
            u_color: { value: new THREE.Vector3(0.05, 0.12, 0.22) }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPos;
            uniform vec3 u_moonDir;
            uniform vec3 u_sunDir;
            uniform float u_moonStrength;
            uniform float u_sunStrength;
            uniform float u_amplitude;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPos = position;
                vec3 local = normalize(position);
                float moonBulge = u_moonStrength * abs(dot(local, normalize(u_moonDir)));
                float sunBulge = u_sunStrength * abs(dot(local, normalize(u_sunDir)));
                float total = (moonBulge + sunBulge) * u_amplitude;
                vec4 displaced = vec4(position + normal * total, 1.0);
                gl_Position = projectionMatrix * modelViewMatrix * displaced;
            }
        `,
        fragmentShader: `
            uniform vec3 u_color;
            varying vec3 vNormal;
            varying vec3 vPos;
            void main() {
                float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), vec3(0.0,0.0,1.0))), 2.0);
                vec3 col = u_color * (0.9 + 0.1 * fresnel);
                gl_FragColor = vec4(col, 0.35 * (1.0 - fresnel));
            }
        `,
        transparent: true,
        depthWrite: false
    });
    const geom = new THREE.SphereGeometry(1.002, 128, 128);
    tideMesh = new THREE.Mesh(geom, tideMaterial);
    tideMesh.renderOrder = 50;
    try { tideMesh.frustumCulled = false; } catch(e) {}
    if (earthGroup) earthGroup.add(tideMesh);
}

// Seasonal snow overlay (very simple: add white texture near poles based on month)

// Moon placeholder
function createMoon() {
    const moonMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x111111, shininess: 4 });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 64, 64), moonMaterial);
    moon.castShadow = false;
    moon.receiveShadow = false;
    moon.frustumCulled = false;
    moon.userData = { material: moonMaterial };

    loadLocalTexture('moon_1024.jpg', (texture) => {
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        moonMaterial.map = texture;
        moonMaterial.needsUpdate = true;
    }, (error) => {
        console.warn('[3D Earth] Moon texture unavailable; using lit lunar fallback.', error);
        moonMaterial.color.setHex(0x9a9a9a);
    });

    moon.position.set(moonDistance, 0, 0);
    moonObject = moon;
    scene.add(moonObject);
}

// Population heatmap placeholder (a tinted sphere)

// Historical events placeholder


// Timezone visualization removed per user request

let globeFirstFrameRendered = false;
let globeRenderFailures = 0;

function createFallbackEarth() {
    console.warn('[3D Earth] Creating guaranteed fallback globe.');
    earthGroup = new THREE.Group();
    const geometry = new THREE.SphereGeometry(1, 48, 48);
    const material = new THREE.MeshPhongMaterial({
        color: 0x3f8edb,
        emissive: 0x071b31,
        shininess: 12
    });
    earth = new THREE.Mesh(geometry, material);
    earthGroup.add(earth);

    const atmosphereGeometry = new THREE.SphereGeometry(1.075, 32, 32);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x74b8f2,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
        depthWrite: false
    });
    atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    earthGroup.add(atmosphere);
    scene.add(earthGroup);
}

function showGlobeError(error) {
    console.error('[3D Earth] Globe initialization failed:', error);
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'block';
        loading.textContent = 'Globe renderer unavailable — check WebGL/GPU support and reload.';
        loading.setAttribute('role', 'alert');
    }
    const host = document.getElementById('canvas-container');
    if (host) host.classList.add('renderer-error');
}

function safeInitStep(label, fn) {
    try {
        fn();
        return true;
    } catch (error) {
        console.error('[3D Earth]', label, 'failed:', error);
        return false;
    }
}

function init() {
    try {
    // Scene setup
    scene = new THREE.Scene();

    // Camera setup
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 500);
    camera.position.set(0, 0, 3);

    // Renderer setup
    try {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false
        });
    } catch (error) {
        showGlobeError(error);
        return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = false;
    // ensure the canvas is transparent so the page background (space gradient) shows through
    try {
        renderer.setClearColor(0x000000, 0); // fully transparent
        renderer.domElement.style.background = 'transparent';
        renderer.domElement.style.display = 'block';
    } catch (e) {}
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Fallback: explicitly set a realistic outer-space gradient on the document in case CSS wasn't applied
    try {
        const spaceGradient = 'linear-gradient(135deg, #0c1445 0%, #1a1a2e 50%, #16213e 100%)';
        document.documentElement.style.background = spaceGradient;
        document.body.style.background = spaceGradient;
        document.documentElement.style.height = '100%';
        document.body.style.height = '100%';
    } catch (e) {}

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 10;
    // Save the initial camera/controls state so controls.reset() and our resetView() work reliably
    try {
        // capture a clone of the important values
        initialCameraState = {
            pos: camera.position.clone(),
            target: controls.target.clone(),
            fov: camera.fov
        };
        if (typeof controls.saveState === 'function') controls.saveState();
    } catch (e) {}

    // Raycaster for mouse interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Lighting must exist before the first render. The startup globe uses MeshPhongMaterial.
    // Without an initial light, the fallback/core Earth is black until deferred layers finish.
    safeInitStep('lighting', setupLighting);

    // Only the lighting and core Earth are startup-critical. Starfield is deferred.

    const earthCreated = safeInitStep('Earth', createEarth);
    if (!earthCreated || !earthGroup) {
        createFallbackEarth();
    } else if (!earthGroup.parent) {
        scene.add(earthGroup);
    }

    // timezone visualization removed

    // Establish the celestial/real-data scene graph before the first frame.
    // Texture/network loading is asynchronous, but Sun, Moon, stars and satellite
    // containers are present immediately and cannot disappear behind a deferred init.
    safeInitStep('starfield', createStarfield);
    safeInitStep('sun layer', createSun);
    safeInitStep('moon layer', createMoon);
    safeInitStep('satellite layer', createSatellites);
    safeInitStep('night-lights layer', createNightLights);

    // Wire UI toggles. A control failure must never prevent the core globe from rendering.
    safeInitStep('UI controls', wireUiToggles);

    // Optional layers are started after the first rendered frame.

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onMouseClick);

    publishGlobeBridge();

    // initialize simTime and UI datetime input
    simTime = new Date();
    const dtInput = document.getElementById('inp-datetime');
    const realtime = document.getElementById('chk-realtime');
    if (dtInput) dtInput.value = toLocalDatetimeInputValue(simTime);
    if (realtime) realtime.checked = true;

    // The local globe is already visible. Upgrade its textures after the first frame.
    const atRange = document.getElementById('range-atmo');
    if (atRange) {
        atmoPendingValue = parseFloat(atRange.value || atmoPendingValue);
        if (atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_exposure) {
            atmosphere.material.uniforms.u_exposure.value = atmoPendingValue;
        }
    }
    const chkAtm = document.getElementById('chk-atmosphere');
    if (chkAtm && atmosphere) atmosphere.visible = chkAtm.checked;
    const nightRange = document.getElementById('range-night');
    if (nightRange && atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_nightGlow) {
        atmosphere.material.uniforms.u_nightGlow.value = parseFloat(nightRange.value || 0.25);
    }
    const fadeRange = document.getElementById('range-fade');
    if (fadeRange && atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_fadeHeight) {
        atmosphere.material.uniforms.u_fadeHeight.value = parseFloat(fadeRange.value || 4.0);
    }

    // Start the renderer immediately. Do not wait for any external resource. The globe does not wait for remote textures or feeds.
    if (renderer.setAnimationLoop) renderer.setAnimationLoop(animate);
    else requestAnimationFrame(animate);
    updateUiDebug();

    // Everything below this point is enhancement work, not startup-critical rendering.
    setTimeout(() => {
        safeInitStep('earth textures', enhanceEarthAppearance);
        safeInitStep('ocean-current layer', createCurrents);
        safeInitStep('tide layer', createTides);
        safeInitStep('magnetic-field layer', createMagneticField);
        startTleUpdateLoop();
        ['satellites','currents','moon','magnetic'].forEach((id) => {
            const el = document.getElementById('chk-' + id);
            if (el) el.dispatchEvent(new Event('change'));
        });
    }, 0);
    } catch (error) {
        showGlobeError(error);
    }
}

// Debug helper: update the on-screen UI debug panel with current control / uniform values
function updateUiDebug() {
    // ui-debug removed per user request
}

function setupLighting() {
    // Keep non-solar fill extremely low. The computed Sun directional light is the
    // authoritative illumination source so the night hemisphere can remain dark.
    ambientLight = new THREE.AmbientLight(0x182235, 0.055);
    scene.add(ambientLight);
}

// Move the sun around the scene to create day/night on the globe
function updateSunPosition() {
    if (!sunObject || !sunLight) return;
    // compute sun direction from simTime (ECEF unit vector)
    const sunDir = computeSunEcef(simTime || new Date());
    sunObject.position.copy(sunDir.clone().multiplyScalar(sunDistance));
    sunLight.position.copy(sunObject.position);
    // adjust ambient based on sun elevation (simple proxy)
    if (ambientLight) {
        const elev = sunDir.y; // -1..1
        const brightness = 0.12 + 0.6 * Math.max(0, elev);
        ambientLight.intensity = Math.min(0.9, brightness);
    }
    // update night-light shader direction
    if (nightMaterial && nightMaterial.uniforms && nightMaterial.uniforms.u_sunDir) {
        nightMaterial.uniforms.u_sunDir.value.copy(sunDir);
    }
    // update moon position and illumination
    try {
        if (moonObject) {
            const moonDir = computeMoonEcef(simTime || new Date());
            // visual distance (scaled) so moon is visible but not too far
            moonObject.position.copy(moonDir.clone().multiplyScalar(moonDistance));

            // update shader uniform with sun direction so phases are correct
            try {
                if (moonObject.userData && moonObject.userData.material && moonObject.userData.material.uniforms && moonObject.userData.material.uniforms.u_sunDir) {
                    moonObject.userData.material.uniforms.u_sunDir.value.copy(sunDir);
                }
            } catch (e) {}

            // tidal locking: rotate the moon so the same face generally points at Earth center
            try {
                // moon should look at Earth's center (0,0,0)
                moonObject.lookAt(new THREE.Vector3(0, 0, 0));
            } catch (e) {}
        }
    } catch (e) {}

    // update tidal overlay uniforms (moon primary, sun secondary)
    try {
        if (tideMaterial && tideMaterial.uniforms) {
            const md = computeMoonEcef(simTime || new Date()).clone().normalize();
            const sd = computeSunEcef(simTime || new Date()).clone().normalize();
            tideMaterial.uniforms.u_moonDir.value.copy(md);
            tideMaterial.uniforms.u_sunDir.value.copy(sd);
            // approximate lunar tidal forcing amplitude scaled inversely with visual moonDistance
            const mStrength = THREE.MathUtils.clamp(1.0 / Math.max(0.01, moonDistance), 0.2, 3.0);
            tideMaterial.uniforms.u_moonStrength.value = mStrength;
            // amplitude increases slightly when moon is visually closer
            tideMaterial.uniforms.u_amplitude.value = 0.012 * THREE.MathUtils.clamp(1.0 + (2.5 - moonDistance) * 0.3, 0.6, 2.0);
        }
    } catch (e) {}

    // update sun sprite and directional light to match computed sunDir
    try {
        if (sunObject) {
            // sunObject may be a Group or Mesh; position it at sunDir * sunDistance
            const pos = sunDir.clone().multiplyScalar(sunDistance);
            sunObject.position.copy(pos);
        }
        if (sunLight) {
            sunLight.position.copy(sunDir.clone().multiplyScalar(sunDistance));
            // ensure the directional light points toward Earth (origin)
            if (sunLight.target) sunLight.target.position.set(0, 0, 0);
            else {
                try { sunLight.target = new THREE.Object3D(); sunLight.target.position.set(0,0,0); scene.add(sunLight.target); } catch (e) {}
            }
            // adjust intensity modestly based on sun elevation
            const elev = sunDir.y;
            sunLight.intensity = Math.max(0.6, 0.9 + elev * 0.8);
        }
    } catch (e) {}
}

function createStarfield() {
    const STAR_COUNT = 7000, radius = 60;
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
        const z = 2 * Math.random() - 1, phi = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        positions[i * 3] = r * Math.cos(phi) * radius;
        positions[i * 3 + 1] = r * Math.sin(phi) * radius;
        positions[i * 3 + 2] = z * radius;
        const brightness = 0.65 + Math.random() * 0.35, warm = Math.random();
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness * (0.88 + warm * 0.12);
        colors[i * 3 + 2] = brightness * (0.82 + warm * 0.18);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.12, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.98, depthWrite: false, depthTest: false });
    const stars = new THREE.Points(geometry, material);
    stars.frustumCulled = false;
    stars.renderOrder = -100;
    scene.add(stars);
}
// Create comet group container
function createCometGroup() {
    if (!cometsGroup) {
        cometsGroup = new THREE.Group();
        cometsGroup.frustumCulled = false;
        scene.add(cometsGroup);
    }
}

// Spawn a comet with simple straight-line trajectory for visual effect
function spawnComet(forceOptions) {
    try {
        createCometGroup();
        const nucleusGeom = new THREE.SphereGeometry(0.02, 8, 8);
        const nucleusMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
        const nucleus = new THREE.Mesh(nucleusGeom, nucleusMat);

        // tail: line geometry (will be updated each frame)
        const tailLen = 80;
        const tailPositions = new Float32Array(tailLen * 3);
        const tailGeom = new THREE.BufferGeometry();
        tailGeom.setAttribute('position', new THREE.BufferAttribute(tailPositions, 3));
        const tailMat = new THREE.LineBasicMaterial({ color: 0xffe6b3, transparent: true, opacity: 0.9 });
        const tail = new THREE.Line(tailGeom, tailMat);

        const group = new THREE.Group();
        group.add(tail);
        group.add(nucleus);

        // Random incoming vector and start far away
        const dir = new THREE.Vector3((Math.random() - 0.5) * 2.0, (Math.random() - 0.2) * 0.6, (Math.random() - 0.5) * 2.0).normalize();
        const startDist = 40 + Math.random() * 120;
        const startPos = dir.clone().multiplyScalar(startDist);
        const speed = 0.005 + Math.random() * 0.02; // units per frame
        group.position.copy(startPos);
        group.userData = { dir: dir.clone().negate(), speed: speed, tailGeom: tailGeom, tailLen: tailLen, age: 0 };
        cometsGroup.add(group);

        // schedule next comet
        nextCometTime = Date.now() + COMET_MIN_INTERVAL_MS + Math.random() * (COMET_MAX_INTERVAL_MS - COMET_MIN_INTERVAL_MS);
    } catch (e) { console.warn('spawnComet error', e); }
}

// Update comet motion and tails each frame
function updateComets(deltaSec) {
    if (!cometsGroup) return;
    const toRemove = [];
    cometsGroup.children.forEach((group) => {
        const ud = group.userData;
        const move = ud.dir.clone().multiplyScalar(ud.speed * Math.max(1.0, deltaSec * 60.0));
        group.position.add(move);
        ud.age += deltaSec;

        // update tail buffer: shift and insert current position at head
        try {
            const posAttr = ud.tailGeom.getAttribute('position');
            for (let i = ud.tailLen - 1; i > 0; i--) {
                posAttr.array[i * 3 + 0] = posAttr.array[(i - 1) * 3 + 0];
                posAttr.array[i * 3 + 1] = posAttr.array[(i - 1) * 3 + 1];
                posAttr.array[i * 3 + 2] = posAttr.array[(i - 1) * 3 + 2];
            }
            posAttr.array[0] = group.position.x;
            posAttr.array[1] = group.position.y;
            posAttr.array[2] = group.position.z;
            posAttr.needsUpdate = true;
        } catch (e) {}

        // Remove when far away or too old
        if (group.position.length() > 800 || ud.age > 900.0) toRemove.push(group);
        // If passes near earth center, let it linger a bit then remove
        if (group.position.length() < 0.6 && ud.age > 0.6) toRemove.push(group);
    });
    toRemove.forEach((g) => { try { cometsGroup.remove(g); } catch (e) {} });
}

function createEarth() {
    earthGroup = new THREE.Group();

    // Core globe: no network dependency. This is deliberately ready for the first frame.
    const earthGeometry = new THREE.SphereGeometry(1, 48, 48);
    const earthMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        specular: 0x222222,
        shininess: 12
    });
    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.castShadow = false;
    earth.receiveShadow = false;
    earthGroup.add(earth);

    const cloudGeometry = new THREE.SphereGeometry(1.012, 48, 48);
    const cloudMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
    });
    clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    clouds.visible = false;
    earthGroup.add(clouds);

    // Keep the atmosphere lightweight until the core globe is already on screen.
    const atmosphereGeometry = new THREE.SphereGeometry(1.07, 32, 32);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x74b8f2,
        transparent: true,
        opacity: 0.10,
        side: THREE.BackSide,
        depthWrite: false
    });
    atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    earthGroup.add(atmosphere);
    scene.add(earthGroup);
}

function assetMimeType(filename) {
    if (/\\.png$/i.test(filename)) return 'image/png';
    if (/\\.webp$/i.test(filename)) return 'image/webp';
    return 'image/jpeg';
}

const EARTH_ASSET_ROOTS = ['/assets/earth', '/public/assets/earth'];

async function fetchLocalTextureBlob(filename) {
    let lastError = null;
    for (const root of EARTH_ASSET_ROOTS) {
        const url = root + '/' + filename;
        try {
            const response = await fetch(url, {
                method: 'GET',
                cache: 'force-cache',
                credentials: 'same-origin'
            });
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }
            const bytes = await response.arrayBuffer();
            if (!bytes.byteLength) throw new Error('empty response');
            const declaredType = response.headers.get('content-type') || '';
            const blob = new Blob([bytes], { type: assetMimeType(filename) });
            console.info('[3D Earth] Local asset ready:', filename, {
                url,
                bytes: bytes.byteLength,
                contentType: declaredType || '(missing)'
            });
            return URL.createObjectURL(blob);
        } catch (error) {
            lastError = error;
            console.warn('[3D Earth] Local asset candidate failed:', url, error);
        }
    }
    throw lastError || new Error('No local asset candidate succeeded');
}

function loadLocalTexture(filename, onLoad, onError) {
    const loader = new THREE.TextureLoader();
    fetchLocalTextureBlob(filename)
        .then((blobUrl) => {
            loader.load(
                blobUrl,
                (texture) => {
                    try { URL.revokeObjectURL(blobUrl); } catch (e) {}
                    onLoad(texture);
                },
                undefined,
                (error) => {
                    try { URL.revokeObjectURL(blobUrl); } catch (e) {}
                    onError?.(error);
                }
            );
        })
        .catch(onError);
}

function enhanceEarthAppearance() {
    if (!earth || !clouds) return;

    const applyColorTexture = (texture) => {
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        texture.needsUpdate = true;
    };

    // The core renderer is already alive. Upgrade it from repository-local assets.
    // Fetching the bytes first makes the failure mode explicit and avoids depending
    // on a browser/server MIME mapping for image decoding.
    loadLocalTexture('earth_atmos_2048.jpg', (texture) => {
        if (!earth) return;
        applyColorTexture(texture);
        const old = earth.material;
        const material = new THREE.MeshPhongMaterial({
            map: texture,
            color: 0xffffff,
            specular: 0x333333,
            shininess: 14
        });
        earth.material = material;
        if (old && old.dispose) old.dispose();

        loadLocalTexture('earth_normal_2048.jpg', (normal) => {
            if (!earth || !earth.material) return;
            normal.encoding = THREE.LinearEncoding;
            normal.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
            earth.material.normalMap = normal;
            earth.material.normalScale = new THREE.Vector2(0.55, 0.55);
            earth.material.needsUpdate = true;
        }, (error) => console.warn('[3D Earth] Earth normal map unavailable.', error));

        loadLocalTexture('earth_specular_2048.jpg', (specular) => {
            if (!earth || !earth.material) return;
            specular.encoding = THREE.LinearEncoding;
            specular.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
            earth.material.specularMap = specular;
            earth.material.needsUpdate = true;
        }, (error) => console.warn('[3D Earth] Earth specular map unavailable.', error));
    }, (error) => {
        console.error('[3D Earth] Real Earth texture unavailable; retaining fallback globe.', error);
    });

    loadLocalTexture('earth_clouds_1024.png', (texture) => {
        if (!clouds) return;
        applyColorTexture(texture);
        clouds.material.map = texture;
        clouds.material.opacity = 0.72;
        clouds.material.needsUpdate = true;
        clouds.visible = showClouds;
    }, (error) => console.warn('[3D Earth] Cloud texture unavailable; clouds remain disabled.', error));
}

function loadTexture(url, fallback) {
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(
        url,
        function() {
            console.log('Texture loaded successfully:', url);
        },
        undefined,
        function() {
            console.warn('Failed to load texture:', url, 'Using fallback');
            // Create a simple colored texture as fallback
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 128;
            const context = canvas.getContext('2d');

            if (url.includes('clouds')) {
                // Create cloud-like pattern
                context.fillStyle = 'rgba(255, 255, 255, 0.8)';
                for (let i = 0; i < 20; i++) {
                    context.beginPath();
                    context.arc(Math.random() * 256, Math.random() * 128, Math.random() * 30 + 10, 0, Math.PI * 2);
                    context.fill();
                }
            } else {
                // Create Earth-like texture
                const gradient = context.createLinearGradient(0, 0, 256, 128);
                gradient.addColorStop(0, '#4a90e2');
                gradient.addColorStop(0.3, '#2e7d32');
                gradient.addColorStop(0.7, '#8bc34a');
                gradient.addColorStop(1, '#4a90e2');
                context.fillStyle = gradient;
                context.fillRect(0, 0, 256, 128);
            }

            texture.image = canvas;
            texture.needsUpdate = true;
        }
    );
    return texture;
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(earth);

    if (intersects.length > 0) {
        const point = intersects[0].point;
    // location extraction removed — clicking no longer reports lat/lon
    }
}

// timezone info UI removed

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    // Render the already-created Earth FIRST. Nothing in telemetry, astronomy,
    // optional layers, or live data is allowed to block the first visible frame.
    try {
        renderer.render(scene, camera);
        if (!globeFirstFrameRendered) {
            globeFirstFrameRendered = true;
            const loading = document.getElementById('loading');
            if (loading) loading.classList.add('hidden');
        }
    } catch (error) {
        globeRenderFailures++;
        console.error('[3D Earth] First-frame render failure:', error);
        return;
    }

    // compute delta time
    const nowPerf = performance.now() / 1000.0;
    if (typeof animate._lastTime === 'undefined') animate._lastTime = nowPerf;
    const deltaSec = Math.min(0.5, nowPerf - animate._lastTime);
    animate._lastTime = nowPerf;

    // Align Earth's rotation to sidereal time so the Sun rises in the east and sets in the west.
    // Use GMST computed from simTime. Also apply a slow cloud drift offset for visual motion.
    try {
        // compute current sidereal angle every frame
        const gmstNow = getGMSTRad(simTime || new Date());
        if (isRotating) {
            // increment cloud drift independently (we'll add it into cloud rotation below)
            cloudDrift += deltaSec * 0.0006;

            if (rotationTransitionActive) {
                const now = performance.now() / 1000.0;
                const tRaw = Math.min(1.0, Math.max(0.0, (now - rotationTransitionStart) / rotationTransitionDuration));
                // ease out cubic for a smooth but snappy blend
                const t = 1.0 - Math.pow(1.0 - tRaw, 3.0);
                const offset = rotationOffsetStart * (1.0 - t);
                if (earthGroup) earthGroup.rotation.y = gmstNow + offset;
                if (clouds) clouds.rotation.y = gmstNow + cloudDrift + offset;
                if (tRaw >= 1.0) rotationTransitionActive = false;
            } else {
                // normal sidereal-driven rotation
                if (earthGroup) earthGroup.rotation.y = gmstNow;
                if (clouds) clouds.rotation.y = gmstNow + cloudDrift;
            }
        } else {
            // rotation is paused: do not change earthGroup.rotation.y or clouds.rotation.y
        }
    } catch (e) {
        // fallback: if GMST fails, optionally advance by small increments when rotating
        if (isRotating) {
            if (earthGroup) earthGroup.rotation.y += 0.002;
            if (clouds) clouds.rotation.y += 0.003;
        }
    }

    // update satellites motion
    animateSatellites();
    // update TLE-derived satellite points periodically
    if (Date.now() - lastTleUpdate > tleUpdateInterval) {
        try {
            if (sgp4Worker) updateTLEPositions();
            else updateTLEPositionsFallback();
        } catch (error) {
            // Live satellite data is optional. Never let a provider/library failure
            // prevent the core Earth renderer from producing a frame.
            console.warn('[3D Earth] Satellite update skipped:', error);
            lastTleUpdate = Date.now();
        }
    }
    // animate synthetic satellites
    animateSyntheticSatellites();
    // update sun position to simulate day/night
    const realtimeEl = document.getElementById('chk-realtime');
    if (realtimeEl && realtimeEl.checked) {
        simTime = new Date();
    } else {
        // when paused, advance a bit so manual scrubbing shows motion
        simTime = new Date(simTime.getTime() + 1000 * 10); // +10s per frame
        const dtInput = document.getElementById('inp-datetime');
        if (dtInput) dtInput.value = toLocalDatetimeInputValue(simTime);
    }
    updateSunPosition();
    // push atmosphere shader uniforms (sun direction, camera pos, exposure)
    try {
        if (atmosphere && atmosphere.material && atmosphere.material.uniforms) {
            const sunEcef = computeSunEcef(simTime || new Date());
            const sunDir = new THREE.Vector3(sunEcef.x, sunEcef.y, sunEcef.z).normalize();
            if (atmosphere.material.uniforms.u_sunDir) atmosphere.material.uniforms.u_sunDir.value.copy(sunDir);
            if (atmosphere.material.uniforms.u_cameraPos) atmosphere.material.uniforms.u_cameraPos.value.copy(camera.position);
            const range = document.getElementById('range-atmo');
            const raw = range ? parseFloat(range.value) : atmoPendingValue;
            // map slider nonlinearly for finer mid-range control (gamma curve)
            const val = Math.pow(raw, 1.2);
            atmoPendingValue = val || atmoPendingValue;
            if (atmosphere.material.uniforms.u_exposure) atmosphere.material.uniforms.u_exposure.value = atmoPendingValue;
            // camera height above globe surface (approx in earth radii)
            if (atmosphere.material.uniforms.u_camHeight) {
                const camHeight = Math.max(0, camera.position.length() - 1.0);
                atmosphere.material.uniforms.u_camHeight.value = camHeight;
            }
            // sun elevation (dot with world up)
            if (atmosphere.material.uniforms.u_sunElev) {
                const sunElev = Math.max(0, sunDir.y * 0.5 + 0.5); // normalize to 0..1
                atmosphere.material.uniforms.u_sunElev.value = sunElev;
            }
            // compute sky tint based on sun elevation (day -> sunset -> night)
            if (atmosphere.material.uniforms.u_skyColor) {
                const sunElevRaw = sunDir.y; // -1..1
                let sky;
                if (sunElevRaw > 0.25) {
                    // day: soft blue
                    sky = new THREE.Color(0.53, 0.81, 0.92);
                } else if (sunElevRaw > -0.15) {
                    // sunset transition: mix blue -> orange
                    const t = (sunElevRaw + 0.15) / (0.25 + 0.15);
                    sky = new THREE.Color().lerpColors(new THREE.Color(0.98, 0.6, 0.25), new THREE.Color(0.53, 0.81, 0.92), t);
                } else {
                    // night: deep blue
                    sky = new THREE.Color(0.02, 0.05, 0.12);
                }
                atmosphere.material.uniforms.u_skyColor.value.set(sky.r, sky.g, sky.b);
            }
            // robustly apply pending control values to uniforms each frame
            try {
                if (atmosphere.material.uniforms.u_exposure) atmosphere.material.uniforms.u_exposure.value = atmoPendingValue;
                if (atmosphere.material.uniforms.u_nightGlow) atmosphere.material.uniforms.u_nightGlow.value = nightPending;
                if (atmosphere.material.uniforms.u_fadeHeight) atmosphere.material.uniforms.u_fadeHeight.value = fadePending;
            } catch (e) {}
        }
    } catch (e) {}

    // update on-screen UI debug display
    try { updateUiDebug(); } catch (e) {}
    // update ISS model position using latest worker buffer if available
    try {
        const issChk = document.getElementById('chk-iss');
        if (issObject && issChk && issChk.checked && window._tleLatestBuffer && tlePositionsAttr) {
            const idx = findIssTleIndex();
            if (idx >= 0) {
                const x = window._tleLatestBuffer[idx * 3 + 0];
                const y = window._tleLatestBuffer[idx * 3 + 1];
                const z = window._tleLatestBuffer[idx * 3 + 2];
                // if values are non-zero, update position smoothly
                if (x !== 0 || y !== 0 || z !== 0) {
                    const target = new THREE.Vector3(x, y, z);
                    // smooth: lerp from current to target
                    issObject.position.lerp(target, 0.35);
                    issObject.visible = true;
                }
            }
        }
    } catch (e) {
        // ignore errors updating ISS
    }

    controls.update();
    // advance GPU interpolation uniform toward 1 over satInterpDuration
    try {
        if (tlePoints && tlePoints.material && tlePoints.material.uniforms) {
            const now = performance.now() / 1000.0;
            if (satInterpStart > 0) {
                const t = Math.min(1.0, (now - satInterpStart) / satInterpDuration);
                tlePoints.material.uniforms.u_interp.value = t;
            }
        }
    } catch (e) {}

    // follow ISS camera
    if ((followISSEnabled || followTransitionStart > 0) && issObject && issObject.visible) {
        const now = performance.now() / 1000.0;
        const issPos = issObject.position.clone();
        // compute an orbiting offset by rotating desiredOffset around Y by orbit angle
        const orbitAngle = now * followOrbitSpeed;
        const rot = new THREE.Matrix4().makeRotationY(orbitAngle);
        const offset = followDesiredOffset.clone().applyMatrix4(rot);
        const goalCamPos = issPos.clone().add(offset);

        if (followTransitionStart > 0) {
            // transition in or out
            const tRaw = (now - followTransitionStart) / followTransitionDuration;
            const t = Math.min(1, Math.max(0, tRaw));
            if (followISSEnabled) {
                // transitioning into follow: lerp from start to goal
                camera.position.lerpVectors(followStartPos, goalCamPos, t);
                const goalTarget = issPos.clone();
                controls.target.lerpVectors(followStartTarget, goalTarget, t);
                camera.fov = followStartFov + (followTargetFov - followStartFov) * t;
                camera.updateProjectionMatrix();
                if (t >= 1.0) followTransitionStart = 0;
            } else {
                // transitioning out: lerp back to saved view
                if (followSaved) {
                    camera.position.lerpVectors(camera.position, followSaved.pos, t);
                    controls.target.lerpVectors(controls.target, followSaved.target, t);
                    camera.fov = camera.fov + (followSaved.fov - camera.fov) * t;
                    camera.updateProjectionMatrix();
                    if (t >= 1.0) {
                        followTransitionStart = 0;
                        followSaved = null;
                    }
                }
            }
            controls.update();
        } else if (followISSEnabled) {
            // actively following: smoothly orbit and look at ISS
            camera.position.lerp(goalCamPos, followLerp);
            controls.target.lerp(issPos, followLerp);
            // ease FOV towards target
            camera.fov += (followTargetFov - camera.fov) * 0.06;
            camera.updateProjectionMatrix();
            controls.update();
        }
    }
    // update procedural starfield time and pixel ratio so twinkle animates correctly
    try {
        if (starUniforms) {
            // use high-resolution time in seconds
            const tsec = (performance.now() || Date.now()) * 0.001;
            starUniforms.u_time.value = tsec;
            starUniforms.u_pixelRatio.value = window.devicePixelRatio || 1.0;
            // Procedural modulation for twinkle and density (no UI):
            // slow base oscillation plus tiny pseudo-random variation
            const baseTwinkle = 0.04 + 0.025 * Math.sin(tsec * 0.07) + 0.01 * Math.sin(tsec * 0.31);
            const noiseTw = (Math.sin(tsec * 1.17) * 0.5 + 0.5) * 0.005;
            const twinkleSpeedAuto = baseTwinkle + noiseTw;
            const baseDensity = 0.9 + 0.15 * Math.cos(tsec * 0.03) + 0.05 * Math.sin(tsec * 0.21);
            const densityNoise = 0.02 * (Math.sin(tsec * 0.9) * 0.5 + 0.5);
            const densityAuto = Math.max(0.2, baseDensity + densityNoise);
            if (starUniforms.u_twinkleSpeed) starUniforms.u_twinkleSpeed.value = twinkleSpeedAuto;
            if (starUniforms.u_densityScale) starUniforms.u_densityScale.value = densityAuto;
        }
    } catch (e) {}

    // handle rare automatic comet spawns
    try {
        if (Date.now() >= nextCometTime) {
            // spawn a comet randomly
            spawnComet();
        }
        // advance comets
        updateComets(deltaSec);
    } catch (e) {}
}

function toggleFollowISS() {
    const btn = document.getElementById('btn-follow-iss');
    // toggling ON
    if (!followISSEnabled) {
        // save current view
        followSaved = {
            pos: camera.position.clone(),
            target: controls.target.clone(),
            fov: camera.fov
        };
        followStartPos = camera.position.clone();
        followStartTarget = controls.target.clone();
        followStartFov = camera.fov;
        followISSEnabled = true;
        followTransitionStart = performance.now() / 1000.0;
        if (btn) btn.textContent = '📡 Following ISS';
    } else {
        // toggling OFF: restore
        followISSEnabled = false;
        followTransitionStart = performance.now() / 1000.0;
        if (btn) btn.textContent = '📡 Follow ISS';
    }
}

// Animate satellites: simple orbital motion for synthetic satellites
function animateSatellites() {
    if (!satellitesGroup) return;
    satellitesGroup.children.forEach((child) => {
        if (!child.userData || !child.userData.altitude) return; // skip ISS (updated elsewhere)
        const ud = child.userData;
        ud.phase += ud.speed;
        const a = ud.phase;
        const inc = ud.inclination;
        const r = ud.altitude;
        // simple inclined circular orbit
        const x = r * Math.cos(a);
        const y = r * Math.sin(a) * Math.sin(inc);
        const z = r * Math.sin(a) * Math.cos(inc);
        child.position.set(x, y, z);
    });
}

function animateSyntheticSatellites() {
    if (!syntheticPoints || !syntheticPositionsAttr) return;
    for (let i = 0; i < SYNTHETIC_SAT_COUNT; i++) {
        const p = syntheticParams[i];
        p.phase += p.speed;
        const a = p.phase;
        const inc = p.inclination;
        const r = p.altitude;
        const x = r * Math.cos(a);
        const y = r * Math.sin(a) * Math.sin(inc);
        const z = r * Math.sin(a) * Math.cos(inc);
        syntheticPositionsAttr.array[i * 3 + 0] = x;
        syntheticPositionsAttr.array[i * 3 + 1] = y;
        syntheticPositionsAttr.array[i * 3 + 2] = z;
    }
    syntheticPositionsAttr.needsUpdate = true;
}

// Control functions
function toggleClouds() {
    showClouds = !showClouds;
    if (clouds) clouds.visible = showClouds;
}

function toggleRotation() {
    // Toggle rotation flag. When enabling rotation, smoothly blend from current rotation to sidereal GMST.
    const was = isRotating;
    isRotating = !isRotating;
    if (!was && isRotating) {
        // starting rotation: compute offset between current rotation and GMST so we can blend
        try {
            const gmstNow = getGMSTRad(simTime || new Date());
            const cur = earthGroup ? earthGroup.rotation.y : 0.0;
            rotationOffsetStart = cur - gmstNow;
            rotationTransitionActive = true;
            rotationTransitionStart = performance.now() / 1000.0;
        } catch (e) {
            rotationTransitionActive = false;
        }
    } else {
        // turning rotation off: just stop updating (we keep current orientation)
        rotationTransitionActive = false;
    }
}

// toggleTimezones removed

function resetView() {
    // If we captured an initial camera state, restore it (position, target, fov).
    if (initialCameraState) {
        try {
            camera.position.copy(initialCameraState.pos);
            controls.target.copy(initialCameraState.target);
            camera.fov = initialCameraState.fov;
            camera.updateProjectionMatrix();
            controls.update();
            return;
        } catch (e) {
            // fallback to basic reset below
        }
    }
    // Fallback: set to sensible default
    camera.position.set(0, 0, 3);
    controls.reset();
}

// Toggle the controls panel collapsed/expanded and persist state
function toggleControlPanel() {
    const el = document.getElementById('controls');
    if (!el) return;
    const collapsed = el.classList.toggle('collapsed');
    try {
        localStorage.setItem('controls.collapsed', collapsed ? '1' : '0');
    } catch (e) {}
}


// Publish a stable bridge for the OSINT modules. These accessors stay live as the
// simulation replaces arrays/groups during runtime instead of copying stale values.
function publishGlobeBridge() {
    const bindings = {
        scene: () => scene,
        camera: () => camera,
        renderer: () => renderer,
        controls: () => controls,
        THREE: () => THREE,
        earth: () => earth,
        earthGroup: () => earthGroup,
        clouds: () => clouds,
        atmosphere: () => atmosphere,
        satellitesGroup: () => satellitesGroup,
        tleData: () => tleData,
        raycaster: () => raycaster,
        mouse: () => mouse
    };
    Object.entries(bindings).forEach(([key, getter]) => {
        try {
            Object.defineProperty(window, key, { configurable: true, get: getter });
        } catch (e) {
            try { window[key] = getter(); } catch (_) {}
        }
    });
    window.globeAPI = {
        getScene: () => scene,
        getCamera: () => camera,
        getRenderer: () => renderer,
        getControls: () => controls,
        getEarth: () => earth,
        getEarthGroup: () => earthGroup,
        resetView,
        toggleRotation,
        toggleClouds,
        getSimulationTime: () => new Date(simTime),
        pauseRotation: () => { isRotating = false; rotationTransitionActive = false; },
        resumeRotation: () => {
            isRotating = true;
            rotationTransitionActive = true;
            rotationTransitionStart = performance.now() / 1000;
            rotationTransitionDuration = 0.9;
        }
    };
}

// Initialize the scene
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

// small utility dot product for three.Vector3-like objects
function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
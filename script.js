// Global variables
let scene, camera, renderer, earth, clouds, atmosphere;
let controls;
// Snapshot of the initial camera state so Reset reliably restores position/target/fov
let initialCameraState = null;
let earthGroup, cloudGroup;
let isRotating = true;
let showClouds = true;
let raycaster, mouse;

// Texture URLs (using reliable sources)
const textureUrls = {
    earth: 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    earthBump: 'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
    earthSpecular: 'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
    clouds: 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
    starfield: 'https://threejs.org/examples/textures/cube/MilkyWay/dark-s_px.jpg'
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
const SYNTHETIC_SAT_COUNT = 2000; // adjust for performance

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
        sgp4Worker = new Worker('sgp4-worker.js');
        sgp4Worker.onmessage = (ev) => {
            const msg = ev.data;
            if (msg.type === 'positions' && tlePositionsAttr && msg.positions) {
                const arr = msg.positions;
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
            el.addEventListener('change', () => { console.log('ui-change', id, el.checked); fn(el.checked); });
            // defensive fallback in case addEventListener is not effective in some environments
            try { el.onchange = () => { console.log('ui-onchange-fallback', id, el.checked); fn(el.checked); }; } catch (e) {}
        } else console.warn('wireUiToggles: element not found', id);
    });

    const issChk = document.getElementById('chk-iss');
    if (issChk) {
        issChk.addEventListener('change', () => { console.log('ui-change chk-iss', issChk.checked); updateIssVisibility(issChk.checked); });
        try { issChk.onchange = () => { console.log('ui-onchange-fallback chk-iss', issChk.checked); updateIssVisibility(issChk.checked); }; } catch (e) {}
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
        });
        try { atRange.oninput = () => { const v = parseFloat(atRange.value || 1.0); console.log('ui-oninput-fallback range-atmo', v); atmoPendingRaw = v; const proc = Math.pow(v, 1.2); atmoPendingValue = proc; if (atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_exposure) atmosphere.material.uniforms.u_exposure.value = atmoPendingValue; }; } catch (e) {}
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
        });
        try { fadeRange.oninput = () => { const v = parseFloat(fadeRange.value || 4.0); console.log('ui-oninput-fallback range-fade', v); if (atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_fadeHeight) atmosphere.material.uniforms.u_fadeHeight.value = v; }; } catch (e) {}
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
        });
        try { moonRange.oninput = () => { const v = parseFloat(moonRange.value || moonDistance); moonDistance = v; if (moonVal) moonVal.textContent = v.toFixed(2); }; } catch (e) {}
    }
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
    satellitesGroup.add(tlePoints);
    tlePoints.frustumCulled = false;

    // ISS removed: no per-satellite highlight mesh created

    scene.add(satellitesGroup);

    // create ISS placeholder/model
    createISSModel();

    // Fetch TLEs from CelesTrak (active satellites)
    fetchTLES();

    // Create many synthetic satellites for visual density
    const synthGeom = new THREE.BufferGeometry();
    const synthPositions = new Float32Array(SYNTHETIC_SAT_COUNT * 3);
    synthGeom.setAttribute('position', new THREE.BufferAttribute(synthPositions, 3));
    syntheticPoints = new THREE.Points(synthGeom, new THREE.PointsMaterial({ color: 0x66ccff, size: 2, sizeAttenuation: false }));
    syntheticPoints.frustumCulled = false;
    satellitesGroup.add(syntheticPoints);
    syntheticPositionsAttr = synthGeom.getAttribute('position');

    // initialize synthetic orbital params
    syntheticParams = [];
    for (let i = 0; i < SYNTHETIC_SAT_COUNT; i++) {
        syntheticParams.push({
            altitude: 1.05 + Math.random() * 0.5,
            speed: 0.002 + Math.random() * 0.01,
            phase: Math.random() * Math.PI * 2,
            inclination: Math.random() * Math.PI
        });
    }
}

// Load a small ISS GLTF model (fallback to a simple box if loader unavailable)
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
        // CelesTrak active satellites TLE file (text)
        const url = 'https://celestrak.com/NORAD/elements/active.txt';
        const res = await fetch(url);
        const text = await res.text();
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        tleData = [];
        for (let i = 0; i < lines.length; i += 3) {
            const name = lines[i];
            const tle1 = lines[i + 1];
            const tle2 = lines[i + 2];
            if (!tle1 || !tle2) break;
            tleData.push({ name, tle1, tle2 });
        }

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
        } else updateTLEPositions();
    } catch (e) {
        console.warn('Failed to fetch TLEs', e);
        // Fallback: create a few synthetic satellites so user sees something
    console.log('Using synthetic satellite fallback');
        tleData = [];
        for (let i = 0; i < 12; i++) {
            tleData.push({ name: 'SYNTH-' + i, tle1: '', tle2: '' });
        }
        const count = tleData.length;
        const positions = new Float32Array(count * 3);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        tlePoints.geometry.dispose();
        tlePoints.geometry = geom;
        tlePositionsAttr = geom.getAttribute('position');
        // populate synthetic positions
        for (let i = 0; i < tleData.length; i++) {
            const a = (i / tleData.length) * Math.PI * 2;
            const r = 1.1;
            tlePositionsAttr.array[i * 3 + 0] = r * Math.cos(a);
            tlePositionsAttr.array[i * 3 + 1] = r * Math.sin(a) * 0.2;
            tlePositionsAttr.array[i * 3 + 2] = r * Math.sin(a);
        }
        tlePositionsAttr.needsUpdate = true;
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
function startTleUpdateLoop() {
    if (tleUpdateTimer) clearInterval(tleUpdateTimer);
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
    // Create an additive sun sprite (bright disk + soft corona layers)
    const sunGroup = new THREE.Group();

    // Primary sun sprite (sharp center)
    const sunTex = createSunTexture(1024);
    const spriteMat = new THREE.SpriteMaterial({ map: sunTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sunCore = new THREE.Sprite(spriteMat);
    // scale sprites so the Sun appears large and detailed when it's closer
    sunCore.scale.set(1.8 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.8 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.0);
    sunGroup.add(sunCore);

    // Corona layer (warmer, larger)
    const coronaTex = createSunTexture(1024, { innerColor: '#fff9e6', outerColor: '#ffbb55', falloff: 0.9 });
    const coronaMat = new THREE.SpriteMaterial({ map: coronaTex, color: 0xffeeaa, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const corona = new THREE.Sprite(coronaMat);
    corona.scale.set(4.2 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 4.2 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.0);
    sunGroup.add(corona);

    // Soft halo (very large, faint)
    const haloTex = createSunTexture(1024, { innerColor: '#ffeecc', outerColor: '#221100', falloff: 0.6 });
    const haloMat = new THREE.SpriteMaterial({ map: haloTex, color: 0xffeecc, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.5, depthWrite: false });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(9.0 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 9.0 * Math.sqrt(1.0 / Math.max(0.001, sunDistance)), 1.0);
    sunGroup.add(halo);

    sunObject = sunGroup;
    // expose sprite parts so UI sliders can rescale them at runtime
    try { sunObject.userData = { core: sunCore, corona: corona, halo: halo }; } catch (e) {}
    scene.add(sunObject);
    // keep sun sprite always rendered (avoid accidental frustum culling)
    try { sunObject.traverse((o) => { if (o && typeof o.frustumCulled !== 'undefined') o.frustumCulled = false; }); } catch (e) {}

    // Directional light representing the sun's illumination
    sunLight = new THREE.DirectionalLight(0xfff3d9, 1.25);
    sunLight.castShadow = false;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
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
    const loader = new THREE.TextureLoader();
    const nightTex = loader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png');

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
    // attach to earthGroup so it follows rotation
    if (earthGroup) earthGroup.add(nightMesh);
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
    // Moon texture (publicly available low-res for demo). Use fallback canvas if unavailable.
    const loader = new THREE.TextureLoader();
    const moonTexUrl = 'https://threejs.org/examples/textures/planets/moon_1024.jpg';
    const moonNormUrl = 'https://threejs.org/examples/textures/planets/moon_normal.jpg';
    const moonTex = loader.load(moonTexUrl, undefined, undefined, () => {
        console.warn('Moon texture failed to load, using fallback');
    });
    const moonNormal = loader.load(moonNormUrl, undefined, undefined, () => {});

    // Shader material to compute lunar phases and subtle earthshine on the night side
    const moonMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_map: { value: moonTex },
            u_normal: { value: moonNormal },
            u_sunDir: { value: new THREE.Vector3(1, 0, 0) },
            u_earthColor: { value: new THREE.Color(0x223355) },
            u_earthshineIntensity: { value: 0.06 },
            u_lightIntensity: { value: 1.0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform sampler2D u_map;
            uniform vec3 u_sunDir;
            uniform vec3 u_earthColor;
            uniform float u_earthshineIntensity;
            uniform float u_lightIntensity;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            varying vec2 vUv;

            void main() {
                vec3 n = normalize(vNormal);
                // Lambertian illumination from sun direction
                float sunDot = clamp(dot(n, normalize(u_sunDir)), -1.0, 1.0);
                // fetch albedo
                vec3 albedo = texture2D(u_map, vUv).rgb;

                // Day side lit color
                float diff = max(sunDot, 0.0);
                vec3 day = albedo * (0.12 + diff * u_lightIntensity);

                // Night side: Earthshine (soft bluish fill on the dark limb)
                float nightFac = smoothstep(-0.05, -0.5, sunDot);
                // Earthshine stronger near limb (perpendicular to sunDir)
                float limb = pow(1.0 - max(0.0, dot(n, vec3(0.0,1.0,0.0))), 1.5);
                vec3 earthshine = u_earthColor * u_earthshineIntensity * limb * nightFac;

                // subtle ambient fill for deep shadow
                vec3 ambient = albedo * 0.02;

                vec3 color = day + earthshine + ambient;
                // darken and desaturate in shadow
                if (diff <= 0.0) {
                    color *= 0.55;
                }

                // apply slight gamma
                color = pow(color, vec3(1.0/1.8));
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        side: THREE.FrontSide
    });

    const geom = new THREE.SphereGeometry(0.27, 128, 128);
    moonObject = new THREE.Mesh(geom, moonMaterial);
    moonObject.castShadow = false;
    moonObject.receiveShadow = false;
    // place the Moon at visual moonDistance scaled position
    moonObject.position.set(moonDistance, 0, 0);
    moonObject.userData = { material: moonMaterial };
    try { moonObject.frustumCulled = false; } catch (e) {}
    scene.add(moonObject);
}

// Population heatmap placeholder (a tinted sphere)

// Historical events placeholder


// Timezone visualization removed per user request

function init() {
    // Scene setup
    scene = new THREE.Scene();

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // Mobile hamburger toggle: hide full panel on small screens and show via hamburger
    try {
        const hamburger = document.getElementById('controls-hamburger');
        const controlsEl = document.getElementById('controls');
        const MOBILE_BREAK = 640;
        function updateControlsForSize() {
            if (window.innerWidth <= MOBILE_BREAK) {
                if (controlsEl) controlsEl.classList.remove('show');
                if (controlsEl) controlsEl.classList.remove('show-mobile');
                if (hamburger) hamburger.style.display = 'block';
            } else {
                if (controlsEl) controlsEl.style.display = ''; // revert to CSS block
                if (hamburger) hamburger.style.display = 'none';
                if (controlsEl) controlsEl.classList.remove('show-mobile');
            }
        }
        if (hamburger && controlsEl) {
            hamburger.addEventListener('click', () => {
                const isShown = controlsEl.classList.toggle('show-mobile');
                // scroll to top of panel when opening
                if (isShown) controlsEl.scrollTop = 0;
            });
            window.addEventListener('resize', updateControlsForSize);
            updateControlsForSize();
        }
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

    // Lighting
    setupLighting();

    // Create starfield background
    createStarfield();

    // Create Earth
    createEarth();

    // timezone visualization removed

    // Wire UI toggles
    wireUiToggles();

    // restore controls collapsed state
    const controlsEl = document.getElementById('controls');
    try {
        const collapsed = localStorage.getItem('controls.collapsed') === '1';
        if (controlsEl && collapsed) controlsEl.classList.add('collapsed');
    } catch (e) {}

    // On large screens, ensure the Bootstrap offcanvas controls are visible by default
    try {
        const LG_BREAKPOINT = 992; // Bootstrap 'lg' in px
        if (controlsEl && window.innerWidth >= LG_BREAKPOINT) {
            // Prefer using Bootstrap's Offcanvas API if available
            if (typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
                try {
                    const inst = bootstrap.Offcanvas.getOrCreateInstance(controlsEl);
                    inst.show();
                } catch (e) {
                    // fallback to adding show class
                    controlsEl.classList.add('show');
                }
            } else {
                controlsEl.classList.add('show');
            }
        }
    } catch (e) {}

    // Prepare optional feature groups
    createSatellites();
    createCurrents();
    createMoon();
    createSun();
    // create tidal overlay showing ocean bulges driven by Moon and Sun
    createTides();
    createMagneticField();
    createNightLights();
    // comets removed
    // ISS removed

    // Apply initial visibility from checkboxes
    ['satellites','currents','moon','magnetic'].forEach((id) => {
        const el = document.getElementById('chk-' + id);
        if (el) el.dispatchEvent(new Event('change'));
    });

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onMouseClick);

    // Hide loading message
    document.getElementById('loading').style.display = 'none';

    // initialize simTime and UI datetime input
    simTime = new Date();
    const dtInput = document.getElementById('inp-datetime');
    const realtime = document.getElementById('chk-realtime');
    if (dtInput) dtInput.value = toLocalDatetimeInputValue(simTime);
    if (realtime) realtime.checked = true;

    // apply initial PBR and atmosphere slider state
    const pbrChk = document.getElementById('chk-pbr');
    if (pbrChk) setEarthMaterial(pbrChk.checked);
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

    // start tle update loop
    startTleUpdateLoop();

    // Start animation
    animate();
    // initial debug update
    updateUiDebug();
}

// Debug helper: update the on-screen UI debug panel with current control / uniform values
function updateUiDebug() {
    // ui-debug removed per user request
}

function setupLighting() {
    // Ambient light (lower so night side is noticeably darker)
    ambientLight = new THREE.AmbientLight(0x404040, 0.15);
    scene.add(ambientLight);

    // Directional light (sun)
    // Note: createSun() will add a primary sun directional light (sunLight) used to illuminate the globe.
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 3, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Point light for rim lighting
    const pointLight = new THREE.PointLight(0x4fc3f7, 0.5, 100);
    pointLight.position.set(-5, 0, 5);
    scene.add(pointLight);
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
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.5
    });

    const starsVertices = [];
    for (let i = 0; i < 10000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 2000;
        starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const starfield = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starfield);
}

function createEarth() {
    earthGroup = new THREE.Group();

    // Earth geometry
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);

    // Earth material with textures - use a matte PBR-style material to reduce shininess
    const earthMaterial = new THREE.MeshStandardMaterial({
        map: loadTexture(textureUrls.earth, backupUrls.earth),
        // subtle normal map for surface detail
        normalMap: loadTexture(textureUrls.earthBump, backupUrls.earth),
        // minimize specular highlights
        metalness: 0.0,
        roughness: 1.0,
        // ensure no strong shininess from specular map
        envMapIntensity: 0.0
    });

    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.castShadow = true;
    earth.receiveShadow = true;
    earthGroup.add(earth);

    // Cloud layer
    const cloudGeometry = new THREE.SphereGeometry(1.01, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: loadTexture(textureUrls.clouds, backupUrls.clouds),
        transparent: true,
        opacity: 0.4,
        depthWrite: false
    });

    clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    earthGroup.add(clouds);

    // Atmosphere: smoother gradient blending into space for a seamless look
    const atmosphereGeometry = new THREE.SphereGeometry(1.1, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_sunDir: { value: new THREE.Vector3(0.0, 1.0, 0.0) },
            u_cameraPos: { value: new THREE.Vector3() },
            u_exposure: { value: atmoPendingValue },
            u_betaR: { value: new THREE.Vector3(3.0e-6, 7.0e-6, 18.0e-6) },
            u_betaM: { value: new THREE.Vector3(6e-6, 6e-6, 6e-6) },
            u_g: { value: 0.72 },
            u_camHeight: { value: 0.0 },
            u_fadeHeight: { value: 4.0 },
            u_skyColor: { value: new THREE.Vector3(0.53, 0.78, 0.92) },
            u_spaceColor: { value: new THREE.Vector3(0.015, 0.03, 0.08) },
            u_horizonTint: { value: new THREE.Vector3(0.98, 0.6, 0.25) },
            u_nightGlow: { value: 0.18 }
        },
        vertexShader: `
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPos = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            precision highp float;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            uniform vec3 u_sunDir;
            uniform vec3 u_cameraPos;
            uniform float u_exposure;
            uniform vec3 u_betaR;
            uniform vec3 u_betaM;
            uniform float u_g;
            uniform float u_camHeight;
            uniform float u_fadeHeight;
            uniform vec3 u_skyColor;
            uniform vec3 u_spaceColor;
            uniform vec3 u_horizonTint;
            uniform float u_nightGlow;

            const float PI = 3.141592653589793;

            float phaseHG(float cosTheta, float g) {
                float denom = 1.0 + g * g - 2.0 * g * cosTheta;
                return (1.0 - g * g) / (4.0 * PI * pow(denom, 1.5));
            }

            float phaseRayleigh(float cosTheta) {
                return (3.0 / (16.0 * PI)) * (1.0 + pow(cosTheta, 2.0));
            }

            void main() {
                vec3 viewDir = normalize(u_cameraPos - vWorldPos);
                vec3 normal = normalize(vNormal);
                float cosViewSun = dot(viewDir, normalize(u_sunDir));
                float cosSunNorm = dot(normalize(u_sunDir), normal);
                float height = length(vWorldPos) - 1.0;

                // scattering falloff with height (softened)
                float hr = 8.0;
                float hm = 1.2;
                float rayleighAmount = exp(-height / hr);
                float mieAmount = exp(-height / hm);

                float pr = phaseRayleigh(cosViewSun);
                float pm = phaseHG(cosViewSun, u_g);
                vec3 rayleigh = u_betaR * pr * rayleighAmount;
                vec3 mie = u_betaM * pm * mieAmount;

                // base scattering color (tempered intensity)
                vec3 scatter = (rayleigh + mie) * max(0.0, cosSunNorm) * u_exposure * 0.65;

                // horizon accent (warmer near sunset)
                float viewUp = clamp(dot(normal, vec3(0.0,1.0,0.0)), -1.0, 1.0);
                float horizonFactor = pow(1.0 - smoothstep(0.0, 0.9, viewUp), 1.6);
                vec3 horizon = mix(u_horizonTint, u_skyColor, 0.5);
                scatter += horizon * horizonFactor * 0.25 * u_exposure * rayleighAmount;

                // night softening
                float nightFac = smoothstep(-0.25, 0.05, -dot(normalize(u_sunDir), normal));
                vec3 night = u_spaceColor * 0.4 * nightFac * (1.0 - rayleighAmount);
                scatter = scatter + night;

                // choose final tint between skyColor and spaceColor based on camera altitude and view
                float camFade = clamp(1.0 - (u_camHeight / max(0.0001, u_fadeHeight)), 0.0, 1.0);
                float spaceMix = smoothstep(0.0, 1.0, (u_camHeight / (u_fadeHeight * 0.8)));
                vec3 baseTint = mix(u_skyColor, u_spaceColor, spaceMix);

                vec3 color = baseTint * (1.0 - exp(-scatter));
                // subtle gamma
                color = pow(color, vec3(1.0 / 2.2));

                // alpha fades with camera altitude and view (so atmosphere smoothly disappears when high)
                float alpha = clamp(camFade * (1.0 - spaceMix) + 0.02, 0.0, 0.9);
                // reduce alpha near grazing angles so limb is soft
                float limb = pow(1.0 - max(0.0, dot(viewDir, normal)), 2.0);
                alpha *= mix(0.7, 1.0, limb);

                gl_FragColor = vec4(color, alpha);
            }
        `,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    earthGroup.add(atmosphere);

    scene.add(earthGroup);
}

// createTimezoneLines removed

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
    requestAnimationFrame(animate);

    if (isRotating) {
        if (earthGroup) earthGroup.rotation.y += 0.002;
        if (clouds) clouds.rotation.y += 0.003;
    }

    // update satellites motion
    animateSatellites();
    // update TLE-derived satellite points periodically
    if (Date.now() - lastTleUpdate > tleUpdateInterval) {
        if (sgp4Worker) updateTLEPositions();
        else updateTLEPositionsFallback();
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
    renderer.render(scene, camera);
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
    isRotating = !isRotating;
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

// Initialize the scene
window.addEventListener('load', init);

// small utility dot product for three.Vector3-like objects
function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
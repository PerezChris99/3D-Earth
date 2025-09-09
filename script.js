// Global variables
let scene, camera, renderer, earth, clouds, atmosphere;
let controls;
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
let sunDistance = 5;
let sunSpeed = 0.0009; // radians per frame
let magneticGroup = null;
let nightMaterial = null;
let nightMesh = null;

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
    const JD = toJulianDate(date);
    const d = JD - 2451543.5;
    const N = deg2rad((125.1228 - 0.0529538083 * d) % 360);
    const i = deg2rad(5.1454);
    const w = deg2rad((318.0634 + 0.1643573223 * d) % 360);
    const a = 60.2666; // Earth radii (rough)
    const e = 0.054900;
    const M = deg2rad((115.3654 + 13.0649929509 * d) % 360);
    // Approximate eccentric anomaly E ~ M + e*sin(M)*(1+e*cos(M))
    const E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    const xv = a * (Math.cos(E) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const v = Math.atan2(yv, xv);
    const r = Math.sqrt(xv * xv + yv * yv);
    // position in ecliptic coordinates
    const xe = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
    const ye = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
    const ze = r * (Math.sin(v + w) * Math.sin(i));
    // convert to equatorial by obliquity
    const eps = deg2rad(23.4397);
    const xeq = xe;
    const yeq = ye * Math.cos(eps) - ze * Math.sin(eps);
    const zeq = ye * Math.sin(eps) + ze * Math.cos(eps);
    // rotate to ECEF using GMST
    const T = (JD - 2451545.0) / 36525.0;
    let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
    GMST = ((GMST % 360) + 360) % 360;
    const gmstRad = deg2rad(GMST);
    const x = xeq * Math.cos(gmstRad) + yeq * Math.sin(gmstRad);
    const y = -xeq * Math.sin(gmstRad) + yeq * Math.cos(gmstRad);
    const z = zeq;
    return new THREE.Vector3(x, y, z).normalize();
}

// WGS84 geodetic <-> ECEF
function latLonAltToEcef(latDeg, lonDeg, altM = 0) {
    const a = 6378137.0; // equatorial radius in m
    const f = 1 / 298.257223563;
    const e2 = f * (2 - f);
    const lat = deg2rad(latDeg);
    const lon = deg2rad(lonDeg);
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
    const x = (N + altM) * Math.cos(lat) * Math.cos(lon);
    const y = (N + altM) * Math.cos(lat) * Math.sin(lon);
    const z = ((1 - e2) * N + altM) * Math.sin(lat);
    return { x, y, z };
}

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

    // realtime and datetime controls
    const realtime = document.getElementById('chk-realtime');
    const dtInput = document.getElementById('inp-datetime');
    if (realtime && dtInput) {
        realtime.addEventListener('change', () => {
            console.log('ui-change chk-realtime', realtime.checked);
            if (realtime.checked) {
                simTime = new Date();
                dtInput.value = toLocalDatetimeInputValue(simTime);
            }
        });
        try { realtime.onchange = () => { console.log('ui-onchange-fallback chk-realtime', realtime.checked); if (realtime.checked) { simTime = new Date(); dtInput.value = toLocalDatetimeInputValue(simTime); } }; } catch (e) {}
        dtInput.addEventListener('change', () => {
            console.log('ui-change inp-datetime', dtInput.value);
            if (!realtime.checked) {
                const v = dtInput.value;
                if (v) simTime = new Date(v);
            }
        });
        try { dtInput.onchange = () => { console.log('ui-onchange-fallback inp-datetime', dtInput.value); if (!realtime.checked) { const v = dtInput.value; if (v) simTime = new Date(v); } }; } catch (e) {}
    }
    const issChk = document.getElementById('chk-iss');
    if (issChk) {
        issChk.addEventListener('change', () => { console.log('ui-change chk-iss', issChk.checked); updateIssVisibility(issChk.checked); });
        try { issChk.onchange = () => { console.log('ui-onchange-fallback chk-iss', issChk.checked); updateIssVisibility(issChk.checked); }; } catch (e) {}
    }

    // PBR toggle
    const pbrChk = document.getElementById('chk-pbr');
    if (pbrChk) {
    pbrChk.addEventListener('change', () => { console.log('ui-change chk-pbr', pbrChk.checked); setEarthMaterial(pbrChk.checked); });
    try { pbrChk.onchange = () => { console.log('ui-onchange-fallback chk-pbr', pbrChk.checked); setEarthMaterial(pbrChk.checked); }; } catch (e) {}
    }

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

    const nightRange = document.getElementById('range-night');
    if (nightRange) {
        nightRange.addEventListener('input', () => {
            const v = parseFloat(nightRange.value || 0.25);
            console.log('ui-input range-night', v);
            nightPending = v;
            if (atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_nightGlow) {
                atmosphere.material.uniforms.u_nightGlow.value = nightPending;
            }
        });
        try { nightRange.oninput = () => { const v = parseFloat(nightRange.value || 0.25); console.log('ui-oninput-fallback range-night', v); if (atmosphere && atmosphere.material && atmosphere.material.uniforms && atmosphere.material.uniforms.u_nightGlow) atmosphere.material.uniforms.u_nightGlow.value = v; }; } catch (e) {}
    }

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
}

// Swap earth material between simple Phong and MeshStandard PBR
function setEarthMaterial(usePbr) {
    if (!earth) return;
    const old = earth.material;
    try {
        if (usePbr) {
            const mat = new THREE.MeshStandardMaterial({
                map: loadTexture(textureUrls.earth, backupUrls.earth),
                metalness: 0.0,
                roughness: 0.9,
                normalMap: loadTexture(textureUrls.earthBump, backupUrls.earth),
                roughnessMap: loadTexture(textureUrls.earthSpecular, backupUrls.earth)
            });
            earth.material = mat;
        } else {
            const mat = new THREE.MeshPhongMaterial({
                map: loadTexture(textureUrls.earth, backupUrls.earth),
                bumpMap: loadTexture(textureUrls.earthBump, backupUrls.earth),
                bumpScale: 0.02,
                specularMap: loadTexture(textureUrls.earthSpecular, backupUrls.earth),
                specular: new THREE.Color(0x333333),
                shininess: 100
            });
            earth.material = mat;
        }
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
    const geom = new THREE.SphereGeometry(0.1, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffee88, emissive: 0xffee88 });
    sunObject = new THREE.Mesh(geom, mat);
    sunObject.position.set(5, 2, 5);
    scene.add(sunObject);

    sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.copy(sunObject.position);
    scene.add(sunLight);
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

// Seasonal snow overlay (very simple: add white texture near poles based on month)

// Moon placeholder
function createMoon() {
    const geom = new THREE.SphereGeometry(0.27, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1.0, metalness: 0.0 });
    moonObject = new THREE.Mesh(geom, mat);
    moonObject.position.set(2, 0, 0);
    moonObject.userData = { material: mat };
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
    try {
        const dbg = document.getElementById('ui-debug');
        if (!dbg) return;
        const atRange = document.getElementById('range-atmo');
        const atVal = atRange ? parseFloat(atRange.value) : null;
        const nightRange = document.getElementById('range-night');
        const nightVal = nightRange ? parseFloat(nightRange.value) : null;
        const fadeRange = document.getElementById('range-fade');
        const fadeVal = fadeRange ? parseFloat(fadeRange.value) : null;
        let uniAt = 'n/a', uniNight = 'n/a', uniFade = 'n/a';
        if (atmosphere && atmosphere.material && atmosphere.material.uniforms) {
            if (atmosphere.material.uniforms.u_exposure) uniAt = atmosphere.material.uniforms.u_exposure.value.toFixed(3);
            if (atmosphere.material.uniforms.u_nightGlow) uniNight = atmosphere.material.uniforms.u_nightGlow.value.toFixed(3);
            if (atmosphere.material.uniforms.u_fadeHeight) uniFade = atmosphere.material.uniforms.u_fadeHeight.value.toFixed(3);
        }
        dbg.innerText = `Controls -> atmo: ${atVal}  night: ${nightVal}  fade: ${fadeVal}\nUniforms -> exposure: ${uniAt}  nightGlow: ${uniNight}  fadeHeight: ${uniFade}`;
    } catch (e) {}
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
            // place moon at distance
            moonObject.position.copy(moonDir.clone().multiplyScalar(2.0));
            // approximate phase by angle between sunDir and moon direction
            const phaseCos = dot3(sunDir, moonDir);
            const illum = Math.max(0.0, phaseCos * 0.5 + 0.5);
            if (moonObject.userData && moonObject.userData.material) {
                const m = moonObject.userData.material;
                m.emissive = new THREE.Color(0x111111).multiplyScalar(illum * 0.8 + 0.1);
                m.needsUpdate = true;
            }
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

    // Earth material with textures
    const earthMaterial = new THREE.MeshPhongMaterial({
        map: loadTexture(textureUrls.earth, backupUrls.earth),
        bumpMap: loadTexture(textureUrls.earthBump, backupUrls.earth),
        bumpScale: 0.02,
        specularMap: loadTexture(textureUrls.earthSpecular, backupUrls.earth),
        specular: new THREE.Color(0x333333),
        shininess: 100
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

    // Atmosphere: Rayleigh + Mie single-scattering approximation
    const atmosphereGeometry = new THREE.SphereGeometry(1.1, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_sunDir: { value: new THREE.Vector3(0.0, 1.0, 0.0) },
            u_cameraPos: { value: new THREE.Vector3() },
            u_exposure: { value: atmoPendingValue },
            // softer scattering coefficients for a natural look
            u_betaR: { value: new THREE.Vector3(3.5e-6, 8.2e-6, 20.0e-6) },
            u_betaM: { value: new THREE.Vector3(9e-6, 9e-6, 9e-6) },
            u_g: { value: 0.75 },
            u_camHeight: { value: 0.0 },
            u_sunElev: { value: 1.0 },
            u_fadeHeight: { value: 4.0 },
            u_skyColor: { value: new THREE.Vector3(0.53, 0.81, 0.92) },
            u_nightGlow: { value: 0.25 }
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
            uniform float u_sunElev;
            uniform float u_fadeHeight;
            uniform vec3 u_skyColor;
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
                float hr = 8.0;
                float hm = 1.2;
                float rayleighAmount = exp(-height / hr);
                float mieAmount = exp(-height / hm);
                float pr = phaseRayleigh(cosViewSun);
                float pm = phaseHG(cosViewSun, u_g);
                vec3 rayleigh = u_betaR * pr * rayleighAmount;
                vec3 mie = u_betaM * pm * mieAmount;
                // sun elevation scaling (brighter near horizon)
                float sunScale = clamp(1.0 + (1.0 - clamp(u_sunElev, 0.0, 1.0)) * 0.8, 0.5, 1.8);
                // camera altitude fade (camera height measured in earth radii above 1.0)
                // use u_fadeHeight to control how quickly the atmosphere fades with altitude
                float camFade = clamp(1.0 - (u_camHeight / max(0.0001, u_fadeHeight)), 0.0, 1.0);
                vec3 color = (rayleigh + mie) * max(0.0, cosSunNorm) * u_exposure * 1.1 * sunScale * camFade;
                float limb = pow(1.0 - max(0.0, dot(viewDir, normal)), 2.0);
                // accent limb opposite sun based on azimuthal difference
                float azDiff = 1.0 - smoothstep(0.0, 1.0, abs(dot(normalize(u_sunDir), normalize(viewDir))));
                color += vec3(0.05, 0.08, 0.12) * limb * u_exposure * 0.55 * sunScale * camFade * (0.7 + 0.6 * azDiff);
                // night glow (soft) when sun is below horizon
                float nightFac = smoothstep(-0.2, 0.05, -dot(normalize(u_sunDir), normal));
                vec3 night = vec3(0.05, 0.08, 0.18) * u_nightGlow * nightFac * camFade;
                color += night;
                color = 1.0 - exp(-color);
                // tint final scattering by sky color so atmosphere matches sky appearance
                color *= u_skyColor;
                color = pow(color, vec3(1.0 / 2.2));
                // final alpha follows camera fade so atmosphere fades out completely at high altitude
                float alpha = clamp(camFade, 0.0, 1.0);
                gl_FragColor = vec4(color * camFade, alpha);
            }
        `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending
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
        const longitude = Math.atan2(point.x, point.z) * (180 / Math.PI);
        const latitude = Math.asin(point.y) * (180 / Math.PI);

    // Timezone interaction removed
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
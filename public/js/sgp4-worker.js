let satlibLoaded = false;
try {
    importScripts('https://unpkg.com/satellite.js@4.0.0/dist/satellite.min.js');
    satlibLoaded = typeof satellite !== 'undefined';
} catch (e) {
    satlibLoaded = false;
}

let tleData = [];
let running = false;

self.onmessage = function(e) {
    const msg = e.data;
    if (msg.type === 'setTLE') {
        tleData = msg.tle || [];
        // inform main thread of readiness
        self.postMessage({ type: 'ready', satlib: satlibLoaded, count: tleData.length });
    } else if (msg.type === 'update') {
        // compute positions for current time
        const now = new Date();
        if (!satlibLoaded) {
            // return zeroed positions so main thread can fallback
            const outEmpty = new Float32Array(tleData.length * 3);
            self.postMessage({ type: 'positions', positions: outEmpty }, [outEmpty.buffer]);
            return;
        }
        const gmst = satellite.gstime(now);
        const out = new Float32Array(tleData.length * 3);
        for (let i = 0; i < tleData.length; i++) {
            try {
                const t = tleData[i];
                if (!t.tle1 || !t.tle2) {
                    out[i * 3 + 0] = 0;
                    out[i * 3 + 1] = 0;
                    out[i * 3 + 2] = 0;
                    continue;
                }
                const satrec = satellite.twoline2satrec(t.tle1, t.tle2);
                const p = satellite.propagate(satrec, now).position;
                if (!p) {
                    out[i * 3 + 0] = 0;
                    out[i * 3 + 1] = 0;
                    out[i * 3 + 2] = 0;
                    continue;
                }
                const geo = satellite.eciToGeodetic(p, gmst);
                const lon = (geo.longitude * 180) / Math.PI;
                const lat = (geo.latitude * 180) / Math.PI;
                const phi = (90 - lat) * (Math.PI / 180);
                const theta = (lon + 180) * (Math.PI / 180);
                const r = 1.1;
                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.cos(phi);
                const z = r * Math.sin(phi) * Math.sin(theta);
                out[i * 3 + 0] = x;
                out[i * 3 + 1] = y;
                out[i * 3 + 2] = z;
            } catch (err) {
                out[i * 3 + 0] = 0;
                out[i * 3 + 1] = 0;
                out[i * 3 + 2] = 0;
            }
        }
        self.postMessage({ type: 'positions', positions: out }, [out.buffer]);
    }
};

# OSINT Intelligence Globe

A Palantir-style, browser-based 3D Earth intelligence platform built with Three.js, Node.js/Express, and WebSockets. Features live multi-domain data ingest, threat scoring, analyst workflows, and a dark-ops dashboard UI — all running locally with zero cloud dependencies.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux

# 3. Start the secure gateway
npm start
# or for development with auto-reload:
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (WebGL + Three.js r128)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ script.js│ │osint-dash│ │aoi-tool  │ │intel-ovrl│  │
│  │ 3D Globe │ │WS client │ │AOI/Notes │ │Clusters  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
└───────┼─────────────┼─────────────┼─────────────┼───────┘
        │  WebSocket  │  REST API   │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────┐
│  server.js (Express 5 + ws)                             │
│  Security: Helmet │ CORS │ RateLimit │ HMAC Auth        │
│                                                         │
│  REST Routes                   WebSocket /ws/live       │
│  /api/health                   → {type:'connected'}     │
│  /api/auth/token               → {type:'delta_update'}  │
│  /api/satellites               broadcast every 5s       │
│  /api/flights                                           │
│  /api/earthquakes                                       │
│  /api/thermal                                           │
│  /api/aoi      (CRUD)                                   │
│  /api/notes    (CRUD)                                   │
│                                                         │
│  Data Ingest: TLE/SGP4 │ OpenSky │ USGS │ FIRMS        │
│  Intelligence: threat scoring │ clustering │ alerting   │
└─────────────────────────────────────────────────────────┘
```

---

## File structure

```
index.html              Entry point (must stay at root for deployment)
server.js               Express 5 + WebSocket secure gateway
package.json            Dependencies: express, ws, helmet, cors, dotenv, rate-limit

public/
  css/
    style.css           Base globe + controls panel styles
    osint.css           OSINT dashboard overlay (topbar, layers, inspector,
                        alerts, analyst panel, search panel, minimap)
  js/
    script.js           Three.js globe renderer, shaders, satellite points
    osint-dashboard.js  WebSocket client, point clouds, layer toggles, inspector
    aoi-tool.js         Analyst auth, AOI polygon draw tool, geo-pinned notes
    intel-overlay.js    Threat markers, cluster bubbles, search, minimap canvas
    sgp4-worker.js      Optional Web Worker for SGP4 satellite propagation

src/
  auth.js               HMAC-SHA256 token generation and validation
  aoi.js                In-memory AOI store (id, name, polygon, timestamps)
  notes.js              In-memory analyst notes store
  alertEngine.js        Rule-based alert generation (threat score, seismic mag)
  cache.js              TTL cache for external API responses
  intelligence.js       Threat scoring, entity history, cluster detection
  routes/
    api.js              GET /api/health, /satellites, /flights, /earthquakes, /thermal
    aoi.js              GET|POST|DELETE /api/aoi and /api/aoi/:id
    notes.js            GET|POST|DELETE /api/notes and /api/notes/:id
  ingest/
    tle.js              Celestrak TLE fetch + SGP4 position propagation
    flights.js          OpenSky Network live flight positions
    earthquakes.js      USGS Earthquake Hazards real-time feed
    thermal.js          NASA FIRMS active fire/thermal hotspots
  middleware/
    sanitize.js         Request body sanitization (HTML escape, length limits)
    rateLimitWS.js      Per-IP WebSocket connection + message rate limiting
```

---

## API Endpoints

All endpoints are served at `http://localhost:3000`. Authenticated endpoints require `Authorization: Bearer <token>` header. Tokens are obtained via `POST /api/auth/token`.

| Method | Path                  | Auth     | Description                                 |
|--------|-----------------------|----------|---------------------------------------------|
| GET    | `/api/health`         | None     | Server status: `{status, uptime}`           |
| POST   | `/api/auth/token`     | None     | Issue HMAC token: `{token, role, expires}`  |
| GET    | `/api/satellites`     | None     | SGP4 propagated satellite positions         |
| GET    | `/api/flights`        | None     | Live flight positions + threat scores       |
| GET    | `/api/earthquakes`    | None     | Recent earthquakes (USGS, M1.0+)            |
| GET    | `/api/thermal`        | None     | Active thermal/fire hotspots (NASA FIRMS)   |
| GET    | `/api/positions`      | None     | Combined: satellites + flights + EQ + thermal |
| GET    | `/api/aoi`            | Viewer+  | List all AOIs                               |
| POST   | `/api/aoi`            | Analyst+ | Create AOI polygon: `{name, polygon[][]}`   |
| DELETE | `/api/aoi/:id`        | Analyst+ | Delete AOI by id                            |
| GET    | `/api/notes`          | Viewer+  | List analyst notes                          |
| POST   | `/api/notes`          | Analyst+ | Create note: `{title, body, lat?, lon?}`    |
| DELETE | `/api/notes/:id`      | Analyst+ | Delete note by id                           |

### WebSocket

Connect to `ws://localhost:3000/ws/live`. Messages:

```jsonc
// On connect
{"type": "connected", "ts": 1700000000000}

// Broadcast every 5 seconds
{
  "type": "delta_update",
  "flights": [...],
  "earthquakes": [...],
  "thermal": [...],
  "intelligence": {
    "flightClusters": [...],
    "earthquakeClusters": [...],
    "highThreatFlights": [...]
  },
  "alerts": [...]
}
```

---

## Environment variables

Copy `.env.example` to `.env` and configure:

| Variable           | Default   | Description                                      |
|--------------------|-----------|--------------------------------------------------|
| `PORT`             | `3000`    | HTTP server port                                 |
| `NODE_ENV`         | —         | Set to `production` for stricter security        |
| `JWT_SECRET`       | required  | Secret for HMAC-SHA256 token signing             |
| `ALLOWED_ORIGINS`  | `*`       | Comma-separated allowed CORS origins (prod only) |
| `TLE_URL`          | Celestrak | Override TLE data source URL                     |

---

## Security features

Nine active security layers:
1. **Helmet** — 15 HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
2. **CORS** — Origin whitelist, allowed methods (GET/POST/DELETE), Authorization header
3. **Rate limiting** — 120 req/15 min per IP on all `/api/*` routes
4. **HMAC-SHA256 auth** — Signed tokens with expiry; roles: viewer/analyst/admin
5. **Input sanitization** — HTML-escaped body fields, max field lengths enforced
6. **WebSocket guard** — Max 5 concurrent connections per IP
7. **WS message rate limit** — Max 30 messages/10s per IP; auto-disconnect violators
8. **Idle timeout** — WS connections closed after 2 minutes of inactivity
9. **Content Security Policy** — Strict allowlist for scripts, styles, images, connect

---

## Intelligence features

- **Threat scoring** — Each flight scored 0–100 based on altitude, speed, heading deviation, restricted zones
- **Entity history** — 60-second sliding window of position deltas for anomaly detection
- **Cluster detection** — DBSCAN-style geographic clustering of flights and earthquakes
- **Auto-alerts** — Alert engine fires on: high-threat flights (≥60), large earthquakes (M≥5.5), thermal surges
- **AOI polygons** — Analyst can draw polygons on the globe; stored server-side, rendered as LineLoops
- **Analyst notes** — Geo-pinned intelligence notes with title, body, and optional lat/lon
- **Search** — Real-time filter across all live flights and earthquakes by callsign/location/country
- **Minimap** — 2D lat/lon overview canvas updated every 5 seconds with all active entities

---

## UI Panels

| Panel | Position | Description |
|-------|----------|-------------|
| Topbar | Top full-width | WS status, satellite/flight/seismic counts, live clock |
| Layer panel | Left | Toggle visibility + count for each data layer |
| Inspector | Right drawer | Detailed view of any clicked globe object |
| Alerts | Bottom-left | Auto-scrolling threat/event alert feed |
| Analyst tools | Right of inspector | Auth, AOI draw, notes, snapshot export |
| Search | Bottom-left (above alerts) | Live keyword filter across all entities |
| Minimap | Bottom-right | 2D orthographic overview of all active entities |
| Controls | Top-right | Globe render settings (atmosphere, sun/moon distance, overlays) |

---

## Development status

All 5 phases complete:

| Phase | Feature | Status |
|-------|---------|--------|
| 0 | 3D globe (Three.js, atmosphere, day/night, satellites) | ✅ |
| 1 | Secure Express gateway, WebSocket live ingest | ✅ |
| 2 | OSINT dashboard overlay, layer toggles, inspector | ✅ |
| 3 | Alert engine, threat scoring, security hardening | ✅ |
| 4 | Analyst tools: auth, AOI draw, geo-notes | ✅ |
| 5 | Intelligence overlay: clusters, minimap, search | ✅ |
| — | Refactor: external CSS/JS, no inline styles, Express 5 compat | ✅ |

---

## Credits

Built by [Perez C](https://perezchris.netlify.app/) · [GitHub](https://github.com/PerezChris99/3D-Earth)

- Textures are loaded from threejs example assets or fallback generated canvases when remote textures fail.

### Satellite propagation (SGP4)
- The project tries to use a Web Worker (`sgp4-worker.js`) to offload SGP4 propagation and keep the main thread responsive.
- If a Worker cannot be created or `satellite.js` is not available inside it, the code falls back to a main-thread propagation path implemented with `satellite.js`.
- Propagation updates produce ECI/Geodetic positions which are converted to a normalized, scene-space radius (slightly above the globe) and written into Float32 buffers.
- There are two double-buffers (`prevSatBuffer` and `nextSatBuffer`) that hold consecutive position snapshots. The GPU shader interpolates between these via a uniform `u_interp` to produce smooth motion without updating individual vertices each frame.

### GPU smoothing for many satellites
- Satellites are rendered as `THREE.Points` with a custom `ShaderMaterial`.
- The vertex shader mixes `a_posPrev` and `a_posNext` by `u_interp` to compute current position. This allows the worker/main thread to update the `next` buffer periodically while the GPU renders smoothly between updates.
- For fallback cases (small synthetic sets), a standard `position` attribute is used.

### Atmosphere shader (Rayleigh + Mie approximation)
- The atmosphere is a `ShaderMaterial` on a slightly larger sphere (BackSide) with uniforms:
  - `u_sunDir` — sun direction (ECEF) used to shade the atmosphere and compute day/night transitions
  - `u_cameraPos` — used to compute view-dependent effects and camera height fading
  - `u_exposure` — controls scattering intensity (driven by the `range-atmo` control)
  - `u_betaR`, `u_betaM`, `u_g` — scattering coefficients and Henyey–Greenstein asymmetry parameter
  - `u_fadeHeight` — camera altitude fade parameter, controls how the atmosphere fades with camera distance
  - `u_skyColor`, `u_nightGlow` — tint and night glow amplitude
- The shader computes an approximate single-scattering result that blends Rayleigh and Mie contributions, adds limb accents, and applies a gamma curve to presentable color.

### Night-lights shader
- A separate sphere slightly above the globe uses a shader that samples an Earth-night texture and blends it based on the dot product between surface normal and sun direction, producing lighted city areas visible on the night side.
- This shader is additive and respects the day/night weighting calculated from the sun vector.

### Starfield, moon, and sun
- Starfield is a `Points` cloud placed far away to simulate space depth; it is static and inexpensive.
- Moon is a simple sphere with rough material and is positioned by a crude lunar approximation function for visual effect (not astrodynamically precise).
- Sun is represented by a small emissive sphere plus a `DirectionalLight` that illuminates the globe. The sun position is computed from a simple solar algorithm using Julian dates and rotated into ECEF coordinates.

### Camera, controls, and Reset logic
- `OrbitControls` provides the primary camera UX. On init we snapshot the camera position, `controls.target`, and camera FOV into `initialCameraState`. The `Reset` button restores those values precisely.
- There is also an ISS-follow mode that will save the previous camera view and smoothly transition the camera to an orbiting follow of the ISS placeholder — Reset does not automatically cancel follow unless requested.

### Resilience & fallbacks
- Textures have a fallback: if remote textures fail to load, an in-memory canvas is used as a simple substitute to keep visuals functional.
- SGP4 uses a worker when available; otherwise it uses main-thread propagation. If TLE fetch fails, a synthetic set of satellites is created so the scene isn’t empty.
- The renderer is created with `alpha: true` and `renderer.setClearColor(0x000000, 0)` so the canvas is transparent and the document body gradient shows through (provides the space background if CSS is present).

---

## Data flows & key variables

- `tleData` — parsed TLE name/two-line entries fetched from CelesTrak (or synthetic fallback)
- `sgp4Worker` — optional worker instance used to compute satellite positions off-main-thread
- `prevSatBuffer`, `nextSatBuffer` — Float32Array double-buffers for GPU interpolation
- `tlePoints` — `THREE.Points` used to render SGP4-derived satellites with `a_posPrev` / `a_posNext` attributes
- `syntheticPoints` — fallback `THREE.Points` for synthetic satellite set
- `atmosphere` — Mesh with ShaderMaterial for scattering
- `nightMesh` / `nightMaterial` — sphere + shader for night-lights

---

## UI controls and IDs (so you can script or style them)

Key UI element IDs kept stable for scripting in `script.js`:
- `controls` — outer controls panel
- `controls-hamburger` — mobile hamburger toggle
- `btn-follow-iss` — follow/stop follow ISS button
- `chk-iss` — ISS visibility toggle
- `chk-satellites` — show/hide satellites
- `chk-currents` — ocean currents toggle
- `chk-moon` — moon toggle
- `chk-magnetic` — magnetic field toggle
- `chk-pbr` — PBR Earth material toggle
- `range-atmo` — atmosphere exposure slider
- `chk-atmosphere` — atmosphere on/off
- `range-night` — night glow slider
- `range-fade` — atmosphere fade-height slider
- `chk-realtime` — real-time / manual time toggle
- `inp-datetime` — manual datetime input

There is also an on-screen `#ui-debug` area used during development to display current control values and shader uniform values.

---

## Running & developing

1. Start a local static server (see Quick start).
2. Open DevTools (F12) and watch the Console: texture, TLE, and worker messages appear there.
3. If satellite updates aren’t appearing, check network access to `https://celestrak.com/NORAD/elements/active.txt` and whether `sgp4-worker.js` successfully loaded and posted a `ready` message.
4. To debug shader values, the `#ui-debug` panel displays current slider values and the atmosphere uniforms.

### Editing code
- `script.js` is intentionally organized as a single-file demo for portability. When making edits:
  - Keep UI element IDs stable if you modify `index.html` so `script.js` can find them without changes.
  - If you adjust the atmosphere shader uniforms, ensure default values in the `createEarth()` function are consistent with the UI ranges.

### Common troubleshooting
- White page / no background: ensure `style.css` is present and loaded; the renderer is transparent so the document background provides the space gradient.
- Worker not launching: check browser security settings (Workers require file served via HTTP(s) rather than `file://`).
- TLE fetch fails: network access may be blocked; the app falls back to synthetic satellites.

---

## Extending the project (ideas & pointers)

- Replace the synthetic satellites with higher-fidelity groups or filter by NORAD categories.
- Add selectable satellite labels that render as sprites or HTML overlays.
- Improve the moon position and phase math, or add other planetary bodies.
- Move large shader code into `glsl` files and load them for clarity.
- Add unit tests around TLE parsing and fallback logic.

---

## Project structure (summary)

```
index.html       # app shell and UI
style.css        # page + control styling
script.js        # main app (rendering, UI logic, SGP4 integration)
sgp4-worker.js   # optional Web Worker for SGP4 propagation
README.md        # this file
```

---

## License & credits

- This project uses `three.js` and `satellite.js` (their licenses apply to their code).
- Textures and icons referenced are from public examples (three.js example assets) or generated at runtime as fallbacks.

If you want, I can:
- add a short `CONTRIBUTING.md` with coding conventions,
- extract shader code into dedicated files,
- or generate a `package.json` and basic dev scripts.

---

Thank you — tell me which area you want documented more deeply (e.g., the atmosphere math, SGP4 worker internals, or a developer guide for adding new UI controls) and I will expand that section.

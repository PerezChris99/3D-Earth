# ROADMAP — 3D Earth → Real-World Intelligence Platform

## Current System Analysis

### What It Is Right Now
A **pure browser-based 3D Earth visualizer** — a high-quality WebGL demo with zero backend.

| Component | Detail |
|---|---|
| **Renderer** | Three.js r128 (WebGL), GPU ShaderMaterial, OrbitControls |
| **Satellite data** | Live TLE feed from CelesTrak (`active.txt`), SGP4 propagation via `satellite.js` |
| **Worker architecture** | Web Worker offloads SGP4 so the main thread stays smooth |
| **GPU interpolation** | Double-buffered prev/next Float32Arrays; vertex shader lerps between epochs |
| **Atmosphere** | Custom Rayleigh+Mie scattering ShaderMaterial (BackSide sphere) |
| **Night lights** | Additive shader samples NASA city-lights texture, blends by sun dot-product |
| **Moon** | Low-precision lunar position (mean elements + periodic terms), earthshine shader |
| **Solar position** | Approximate Julian-date solar algorithm → correct day/night terminator |
| **Tidal overlay** | ShaderMaterial displacing vertices by moon+sun tidal force vectors |
| **Magnetic field** | 36 dipole arc lines, togglable |
| **Ocean currents** | 6 tilted rings, togglable |
| **Synthetic satellites** | 2,000 procedural orbiting points for visual density fill |
| **Stack** | Static files only — `index.html`, `style.css`, `script.js`, `sgp4-worker.js` |

### What It Does Well
- Beautiful real-time 3D rendering of the Earth with physically-motivated shaders
- Live satellite position propagation using real TLE orbital elements
- Resilient fallbacks when external resources fail
- Runs entirely client-side with no infrastructure

### What It Lacks for Real-World Use
- No server, no database, no persistence
- No multi-domain data (ships, aircraft, ground events)
- No user interaction with objects (click to inspect, annotate, alert)
- No authentication or access control
- No intelligence analysis tools (timeline, AOI, pattern-of-life)
- No collaboration layer

---

## Upgrade Paths — Palantir-Style Intelligence Platform

The suggestions below are ordered from most impactful / most achievable to most ambitious. The **recommended best way forward is highlighted at the bottom** with a phased execution plan.

---

### Tier 1 — Real-Time Multi-Domain Common Operating Picture (COP)

#### 1.1 Live Satellite Intelligence (SATINT)
Expand beyond CelesTrak `active.txt` with curated object categories and real metadata.

- **CelesTrak category feeds** — ISS, GPS, Starlink, spy sats (USA family), debris clouds, GEO belt
- **N2YO REST API** — per-satellite telemetry, visual pass prediction, above-horizon windows
- **Space-Track.org** (requires free account) — official USSPACECOM catalog, classified elements excluded but full unclassified catalog + decay predictions
- **Satellite type classification** — tag each TLE by category (comm, ISR, nav, weather, debris); colour-code on globe
- **Conjunction analysis** — compute close approaches between selected objects; display proximity arcs
- **Maneuver detection** — compare TLE epochs day-over-day; flag objects whose mean motion or eccentricity changed (indicates orbit burn → potential ISR maneuver)
- **Ground track overlay** — project next-N-orbit ground tracks as polylines on the globe

#### 1.2 Aircraft Tracking (ADSB/MLAT)
- **OpenSky Network API** (free, 400 req/day unauthenticated, 4000 authenticated) — live ADS-B position, ICAO24, callsign, altitude, velocity, vertical rate
- **ADS-B Exchange** (ADSB-fi, ADS-B One) — real-time feed, no rate-limiting, fully public
- **Military squawks** — filter Mode-S squawks 7700 (emergency), 7600 (radio failure), known mil transponder ranges
- Render aircraft as altitude-scaled points; click to open track card with callsign, type, origin/destination

#### 1.3 Maritime Tracking (AIS)
- **AISHub** — aggregated AIS data, free tier with registration; provides NMEA sentences or decoded JSON
- **MarineTraffic API** — commercial but has a free developer tier for low-volume queries
- **VesselFinder** — alternative free/commercial AIS API
- **MMSI/IMO resolution** — link MMSI to vessel registry for owner, flag, vessel type, DWT
- Render vessels as course-aligned sprites; filter by vessel type (tanker, military auxiliary, bulk carrier, submarine tender)

#### 1.4 Ground Event Feeds
- **USGS Earthquake API** — real-time seismic events worldwide; render as magnitude-scaled circles with depth colour
- **GDACS** (Global Disaster Alert and Coordination System) — tsunamis, volcanoes, cyclones, floods as geo-tagged alerts
- **ACLED** (Armed Conflict Location & Event Data) — conflict events, battles, explosions — free API with registration
- **SIGACT-style overlay** — plot arbitrary incident reports as geolocated markers with severity levels

#### 1.5 Weather Intelligence
- **OpenWeather One Call API** — cloud cover, wind field, storm systems; render as semi-transparent layers
- **NOAA GOES-East/West** — near-real-time satellite imagery tiles (served as WMTS); overlay on globe as dynamic texture
- **Windy API or Copernicus data** — wind vector fields as animated particles (similar to existing ocean currents but global and real)
- **Cyclone / hurricane tracks** — NHC advisory feeds in GeoJSON; render predicted track cones

#### 1.6 Global Visual OSINT (Live Cameras & Steams)
- **EarthCam / Insecam Integration** — pull coordinates of public unsecured IP cameras and live municipal traffic cams. Render as camera icons on the globe; click to stream video in PIP (Picture-in-Picture) panel.
- **Traffic Intelligence** — TomTom Traffic API or HERE Traffic to map live congestion routes on surface streets as color-coded glow lines over cities.
- **Night Vision / Thermal Anomaly Data** — integrate NASA FIRMS (Fire Information for Resource Management System) via MODIS/VIIRS. Shows live thermal hotspots, missile strikes, explosions, and wildfires globally.
- **CCTV HLS Video Feeds** — support streaming M3U8/HLS protocols directly within the dashboard UI (using Video.js overlay) so you never leave the map.

---

### Tier 2 — Intelligence Analysis Layer

#### 2.1 Object Inspector Panel
- Click any satellite/aircraft/vessel to open a right-side drawer with:
  - **Identity**: name, NORAD ID / ICAO24 / MMSI, type, operator, country of origin
  - **State vector**: position, velocity, altitude, heading
  - **History graph**: altitude-over-time, speed-over-time sparklines (last 24h if persisted)
  - **External links**: Space-Track, N2YO, FlightRadar24, MarineTraffic per-object pages

#### 2.2 Area of Interest (AOI) Management
- Draw polygon / circle / corridor on globe (Three.js raycasting → geodetic conversion)
- Name and save AOIs with assigned threat levels
- **Automatic alerting**: backend detects when any tracked object enters/exits an AOI; push WebSocket notification to frontend
- **Dwell time analysis**: how long has a vessel/aircraft been loitering in an AOI

#### 2.3 Timeline Replay
- Persist position snapshots to a backend database (InfluxDB / TimescaleDB — time-series optimized)
- Add a scrubber control on the globe (from `t_start` to `t_end`)
- Replay historical positions for all tracked domains simultaneously
- **Time-lapse mode**: speed up replay 10×/100×/1000× to see pattern-of-life over days/weeks

#### 2.4 Pattern-of-Life (POL) Analysis
- For a selected entity tracked over days: visualize typical route corridors, normal operating areas, port calls, anchorages
- Flag deviations from established pattern as anomalies (Z-score against historical track)
- **Ship dark period detection**: gap in AIS transmission + last known position → inferred covert transit

#### 2.5 Link Analysis / Entity Graph
- Model entities and their relationships as a graph (operator → satellite → ground station)
- Visualize as a 2D network diagram in a side panel (D3-force or Cytoscape.js)
- **Example use**: trace a VSAT terminal's parent satellite → operator company → registered country → sanctioned entity flag

#### 2.6 Anomaly Detection & Alerting
- Rule-based: altitude drop, sudden course reversal, squawk change, proximity to restricted area
- ML-based (advanced): train an isolation forest or LSTM on historical AIS/ADS-B tracks; score live tracks for anomaly probability
- Alert queue in the UI with severity levels and dismiss/escalate workflow
- **Webhook output**: POST alert JSON to Slack/Teams/SIEM on trigger

---

### Tier 3 — Backend Infrastructure

#### 3.1 Minimal Backend (Node.js / Express)
The single most unlocking change. A lightweight backend enables:
- Aggregating API keys securely (never expose in client JS)
- Caching external API responses to stay within rate limits
- WebSocket push to clients for live data
- Persistence (track history, saved AOIs, user annotations)

**Recommended stack:**
```
Node.js + Express  ←  REST/WS gateway
Redis              ←  hot cache (latest positions, ~1s TTL)
PostgreSQL         ←  persistent storage (tracks, AOIs, events)
TimescaleDB        ←  time-series extension on Postgres (position history)
```

#### 3.2 Ingest Workers
- Separate Node.js processes (or containerised microservices) per data domain:
  - `ingest-tle` — polls CelesTrak/Space-Track every 2h, stores current TLE set
  - `ingest-adsb` — polls OpenSky every 10s, writes to Redis + Postgres
  - `ingest-ais` — streams AISHub NMEA feed, decodes, writes to Redis + Postgres
  - `ingest-events` — polls USGS, GDACS, ACLED on intervals

#### 3.3 WebSocket Feed
- Frontend subscribes to `ws://server/live`
- Server pushes deltas every 5s: `{domain, id, lat, lon, alt, ...}`
- Frontend applies to scene without polling — much more efficient

#### 3.4 Auth & Access Control
- **JWT-based session auth** (no plain cookies over HTTP)
- Role model: `viewer` | `analyst` | `admin`
- Viewers see the globe read-only
- Analysts can annotate, create AOIs, run queries
- Admins configure data sources, manage users

---

### Tier 4 — Collaboration & Reporting

#### 4.1 Shared Common Operating Picture
- Multiple analysts see the same live globe via WebSocket multicast
- **Annotations sync in real-time**: one analyst draws a highlight ring on a vessel, all connected users see it
- User cursors shown on globe (like Google Docs but geospatial)

#### 4.2 Intelligence Products
- Analyst selects entities/events, adds narrative text, attaches screenshots
- System exports a structured **Intelligence Report** as PDF/HTML with embedded map snapshot, timeline, entity table
- Report versioning and commenting workflow

#### 4.3 Alerting Integration
- Outbound webhooks to Slack, Microsoft Teams, PagerDuty, generic SIEM
- Email digest of AOI activity over previous 24h
- Configurable per-AOI escalation paths

---

### Tier 5 — Advanced / Long-Term Capabilities

#### 5.1 RF / SIGINT Layer (OSINT)
- **SatNOGS network** — open-source ground station network; access decoded telemetry from amateur and educational satellites
- **Wireshark-style RF spectrum waterfall** for SDR-connected deployments
- **Signal geolocation** — if multiple SDR sensors triangulate a signal, plot estimated emitter location on globe

#### 5.2 Cyber Threat Geographic Overlay
- Shodan API — internet-exposed industrial control systems, power grid SCADA HMIs, port scans
- Plot vulnerable asset clusters by geolocation
- Overlay known threat actor infrastructure clusters

#### 5.3 ML / AI Analysis Engine
- **Trajectory prediction**: LSTM trained on AIS/TLE history to predict next 6h position
- **Object classification** from SAR/optical imagery: call external CV model (e.g., Roboflow) given lat/lon to pull and analyze satellite imagery
- **NLP OSINT fusion**: ingest news feeds, geoparse article text, plot event clusters on globe with sentiment/threat scoring

#### 5.4 Sensor Fusion Console
- Unified track table: one row per real-world entity, fused across all reporting domains (AIS + ADS-B + TLE)
- **Track association engine**: correlate a vessel's AIS track with an overhead satellite pass; flag imagery collection events

---

## > RECOMMENDED BEST WAY FORWARD

## OVERALL PROGRESS: [████████████████████████░░░░░░] 82%

### Phased Execution Plan

---

### ✅ Phase 0 — Foundation (COMPLETE)
**PROGRESS: [██████████████████████████████] 100%**
- Node.js Express gateway · Helmet · CORS · Rate-Limiting · WebSocket server
- `index.html` locked at root · `/public` directory organized · `.gitignore` added

---

### ✅ Phase 1 — Secure Data Ingest Layer (COMPLETE)
**PROGRESS: [██████████████████████████████] 100%**
- `src/ingest/tle.js` — CelesTrak TLE (2h cache, built-in https)
- `src/ingest/flights.js` — OpenSky ADS-B live aircraft (15s cache)
- `src/ingest/earthquakes.js` — USGS seismic feed (1m cache, no key)
- `src/ingest/thermal.js` — NASA FIRMS thermal hotspots (5m cache)
- `src/cache.js` — In-memory LRU/TTL cache (no Redis, zero deps)
- `src/auth.js` — HMAC-SHA256 token auth using built-in `crypto`
- `src/middleware/sanitize.js` — XSS/injection/prototype-pollution sanitizer
- `src/middleware/rateLimitWS.js` — Per-IP WS connection + message limiter + idle timeout
- `src/routes/api.js` — Unified REST API routes
- Live 5-second WebSocket broadcast loop (flights, earthquakes, thermal)

---

### ✅ Phase 2 — OSINT Dashboard UI (COMPLETE)
**PROGRESS: [██████████████████████████████] 100%**
- `public/css/osint.css` — Palantir-style dark ops dashboard CSS
- `public/js/osint-dashboard.js` — Inspector panel, layer manager, alerts, click-to-inspect
- Topbar: live UTC clock, domain object counts, WS status dot
- Left panel: layer toggles (Satellites · Flights · Seismic · Thermal) with live counts
- Right drawer: click any globe point → open object inspector with full data card
- Bottom left: real-time alert feed with severity levels
- Three.js point clouds: orange (flights), yellow (earthquakes), red (thermal hotspots)
- Raycaster click detection across all live domains
- Auto-reconnecting WebSocket client with status feedback

---

### ✅ Phase 3 — Auth, AOI Engine & Alerting (COMPLETE)
**PROGRESS: [██████████████████████████████] 100%**
- `src/aoi.js` — In-memory polygon AOI store with ray-casting point-in-polygon
- `src/alertEngine.js` — Threshold + AOI intersection checks per broadcast cycle, dedup, webhook delivery (HMAC-signed)
- `src/routes/aoi.js` — Protected REST: `GET /api/aoi`, `POST /api/aoi`, `DELETE /api/aoi/:id` (analyst+ role)
- Emergency squawk alerts: 7500 (hijack), 7600 (comms failure), 7700 (emergency) auto-triggered
- Server-pushed alerts delivered over WebSocket to all connected clients
- Client alert feed updated to display server-side trigger messages

---

### ✅ Phase 4 — Collaboration & Reporting (COMPLETE)
**PROGRESS: [██████████████████████████████] 100%**
- `src/notes.js` — In-memory geo-pinned analyst note store (max 500 notes)
- `src/routes/notes.js` — Protected REST: `GET/POST/DELETE /api/notes` (analyst+)
- `public/js/aoi-tool.js` — Globe AOI polygon drawing with click-to-place vertices
- Analyst panel: login/token, draw AOI, save notes, delete items — all client-side UI
- Globe snapshot PNG export via canvas `toBlob()`
- Analyst-only panels shown only after successful token acquisition

---

### ⏳ Phase 5 — Advanced Intelligence (NOT STARTED)
**PROGRESS: [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0%**
2. Integrate **Video.js player** within the Inspector Dashboard to stream live HLS/M3U8 feeds when a camera point is clicked.
3. Overlay **NASA FIRMS (thermal vision / hotspot data)** for near-real-time thermal anomaly awareness.
4. Render live ground traffic loops (TomTom/HERE APIs) globally.
5. Add **USGS earthquake feeds** and real-time weather layers.

**Result**: A true command-center feel. Point anywhere on Earth, see live vehicular traffic, satellite paths, flight radar, and stream live cameras.

---

### Phase 2 — Collaboration & Reporting (2–4 weeks)

1. JWT auth with viewer/analyst roles
2. WebSocket annotation sync (shared layer)
3. Export report as PDF (Puppeteer headless screenshot + text)
4. Integrate ACLED conflict events + USGS seismic feed

**Result**: Multiple users working the same picture; exportable intelligence products.

---

### Phase 3 — Advanced Intelligence (ongoing)

- ML trajectory prediction
- Pattern-of-life anomaly detection
- RF/SIGINT OSINT layer
- Cyber threat overlay

---

## Technology Stack Summary (Recommended)

| Layer | Technology | Why |
|---|---|---|
| **3D Globe** | Three.js (existing) | Already implemented and polished |
| **Backend** | Node.js + Express | Same language as frontend; fast iteration |
| **Real-time** | `ws` (WebSocket) | Lightweight; avoids Socket.io bloat |
| **Cache** | Redis | Sub-millisecond hot reads for live data |
| **Database** | PostgreSQL + TimescaleDB | Relational for AOIs/users; time-series for tracks |
| **2D Detail** | Leaflet (supplemental) | Pixel-perfect 2D overlay when zoomed to street level |
| **Auth** | JWT + bcrypt | Stateless; works across nodes |
| **Deploy** | Docker Compose + nginx | One-command deploy; easy to scale |
| **Data Sources** | CelesTrak, Space-Track, OpenSky, AISHub, USGS, ACLED | All free tier available; no licensing barriers for research |

---

## Immediate Next Steps (This Week)

1. `npm init -y` in the project root
2. Install: `express ws node-fetch dotenv ioredis`
3. Create `server.js` with Express + WebSocket skeleton
4. Obtain free API keys: OpenSky (register at opensky-network.org), AISHub (register at aishub.net)
5. Wire `script.js` to use `ws://localhost:3000/ws/live` instead of direct CelesTrak fetch
6. See ships and aircraft appear on the globe alongside satellites

That is the minimal path from a demo to a working real-world intelligence viewer.

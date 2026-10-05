# 3D Earth

**3D Earth** is a browser-based geographic visualization and situational-awareness platform built around one idea: keep the planet visible, then bring the information needed to understand a place around it.

The project started from a personal interest in **maps, tracking, and seeing the world from above**. It is deliberately more than a visual demo. The current system combines a Three.js globe, WGS84 location handling, OpenStreetMap, weather data, geospatial feeds, a Node/Express gateway, WebSocket updates, and analyst tooling.

**Built by Kweezi Perez** — https://kweeziperez.com

---

## What problem is this trying to solve?

The useful problem is not “make a 3D globe.”

The problem is **geographic context**.

A map can tell you where something is. A weather service can tell you what the atmosphere is doing. A satellite tracker can tell you where an object is. A conventional dashboard can put those things beside one another.

3D Earth is an attempt to put those pieces into a single spatial view so a person can answer:

- Where is this?
- What is around it?
- What is happening there?
- What does the weather look like?
- How does the location relate to the wider Earth?
- What external source produced the information?

For Uganda and the wider East African community, the project can support **geospatial education, mapping experiments, environmental and weather awareness, aviation/geographic context, research prototypes, and community demonstrations**. It is not intended to replace an emergency-response, aviation-navigation, meteorological, surveying, or other safety-critical system.

---

## Why it exists

This project was built because I have a genuine interest in **tracking, maps, geographic systems and the perspective of seeing the Earth from above**.

That interest became an engineering project: take the things that make maps and tracking useful, expose them through a browser, and make the geographic object itself the centre of the interface.

The intended direction is to make the platform useful for African geospatial learning and practical situational awareness while being honest about source quality, licensing, latency and uncertainty.

---

## Current capabilities

### Globe
- Three.js r128 WebGL globe
- Day/night illumination
- Atmosphere and cloud layers
- Satellite/orbital visualisation
- Moon and Sun context
- Optional ocean-current and magnetic-field layers
- WGS84 coordinate conversion
- Globe marker for the selected location
- Animated fly-to when a location is selected
- Location-aware globe centering that accounts for the globe's current rotation

### Maps and location
- OpenStreetMap via Leaflet
- WGS84 latitude/longitude selection
- Browser geolocation with explicit user permission
- Reported device accuracy
- Reverse geocoding through the application server
- Map marker and accuracy circle
- Globe ↔ map location synchronisation
- Map remains available as a full-screen conventional map mode

### Weather
- Current conditions
- Local time
- Sunrise/sunset and day/night state
- Twelve-hour forecast
- Temperature, humidity, wind and pressure
- Model-grid and elevation metadata
- Server-side cache and parameter validation

### Live geographic context
Depending on source availability:
- Satellites
- Flights
- Earthquakes
- Thermal hotspots
- Intelligence/derived layers
- Alerts and area-of-interest tools

### Analyst functions
- AOI drawing
- Geo-pinned notes
- Snapshot/export tooling
- Layer subscriptions
- Inspector panels
- WebSocket live updates
- Role-based protected analyst/admin routes

---

## Location flow

~~~mermaid
flowchart LR
    A[User presses Locate] --> B{Browser permission}
    B -->|Allowed| C[WGS84 latitude longitude accuracy]
    B -->|Denied| D[Manual coordinates]
    C --> E[Application location state]
    D --> E
    E --> F[Map marker]
    E --> G[Globe marker]
    E --> H[Globe fly-to]
    E --> I[Reverse geocoding]
    E --> J[Weather request]
    I --> K[Place name]
    J --> L[Local weather and time]
~~~

The important design decision is that **the same WGS84 coordinate is the source of truth for both the map and the globe**. The map is not a separate approximation of the globe location.

---

## Globe / map relationship

~~~mermaid
flowchart TB
    WGS84[WGS84 coordinate] --> MAP[Leaflet + OpenStreetMap]
    WGS84 --> GLOBE[Three.js Earth]
    MAP --> MARKER1[Map marker + accuracy]
    GLOBE --> MARKER2[Earth surface marker]
    WGS84 --> WEATHER[Weather API]
    WGS84 --> GEOCODE[Reverse geocoder]
    WEATHER --> CONTEXT[Local weather / time]
    GEOCODE --> CONTEXT2[Human-readable place]
~~~

Selecting a point on the map therefore updates the globe. Using device location does the same in the opposite direction.

---

## System architecture

~~~mermaid
flowchart LR
    Browser[Browser: Three.js + Leaflet + vanilla JS]
    Gateway[Node.js / Express gateway]
    WS[WebSocket /ws/live]
    Cache[In-memory TTL cache]
    Browser -->|REST| Gateway
    Browser -->|WebSocket| WS
    Gateway --> Cache
    Gateway --> GEO[Reverse geocoder]
    Gateway --> WEATHER[Weather provider]
    Gateway --> SAT[CelesTrak / satellite data]
    Gateway --> FLIGHT[OpenSky / flight data]
    Gateway --> EQ[USGS / seismic data]
    Gateway --> FIRE[Thermal hotspot feed]
    WS --> INTEL[Intelligence + alert engine]
    INTEL --> AOI[AOI checks]
    INTEL --> NOTES[Analyst notes]
~~~

---

## Startup and performance design

The globe does **not** wait for remote textures or live feeds before rendering.

~~~text
CRITICAL PATH
renderer
  ↓
camera
  ↓
lighting
  ↓
lightweight local Earth
  ↓
animation loop
  ↓
FIRST FRAME

ENHANCEMENT PATH
  ↓
Earth texture
  ↓
cloud texture
  ↓
starfield
  ↓
satellites
  ↓
Moon / Sun
  ↓
optional scientific layers
  ↓
external live data
~~~

Other startup controls include:
- capped device pixel ratio
- no unnecessary drawing-buffer preservation
- reduced initial geometry
- deferred expensive layers
- reduced synthetic satellite count
- isolated optional initialisation
- server-side caching for selected APIs

---

## Technology

| Area | Technology |
|---|---|
| Globe | Three.js r128 |
| Map | Leaflet + OpenStreetMap |
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js + Express 5 |
| Live transport | WebSocket (ws) |
| Location | Browser Geolocation + WGS84 |
| Weather | Open-Meteo gateway |
| Reverse geocoding | Server-side provider proxy |
| Satellite data | CelesTrak / satellite.js |
| Flights | OpenSky |
| Earthquakes | USGS |
| Thermal data | FIRMS feed |
| Security | Helmet, CORS, rate limiting, HMAC auth |
| Testing | Node test runner + syntax checks |

---

## Repository structure

~~~text
3D-Earth/
├── index.html
├── dashboard.html
├── about.html
├── privacy.html
├── terms.html
├── data-policy.html
├── server.js
├── package.json
├── .env.example
├── README.md
├── docs/
│   ├── ROADMAP.md
│   └── SECURITY_AUDIT.md
├── public/
│   ├── css/
│   └── js/
├── src/
│   ├── auth.js
│   ├── cache.js
│   ├── logger.js
│   ├── alertEngine.js
│   ├── intelligence.js
│   ├── aoi.js
│   ├── notes.js
│   ├── ingest/
│   ├── middleware/
│   └── routes/
└── tests/
    ├── 3d-earth.test.js
    └── syntax-check.js
~~~

---

## Routes

| Route | Purpose |
|---|---|
| / | Project landing page |
| /dashboard | Interactive globe |
| /about | Project purpose and community use |
| /privacy | Privacy policy |
| /terms | Terms of use |
| /data-policy | Data sources and provider notes |

---

## Production-readiness assessment

### Honest score: **7 / 10 for controlled production deployment**

This is **not** the same as saying the system is ready to become a public, safety-critical geographic platform at national scale.

### What is already solid
- Core globe rendering has a local first-frame fallback.
- Location handling uses WGS84.
- Browser GPS requires user permission.
- Map and globe share the same selected coordinate.
- Weather requests pass through a server gateway.
- Reverse geocoding is rate-controlled and cached.
- API input is validated.
- HTTP security headers are configured.
- API rate limiting exists.
- WebSocket authentication exists for production.
- Analyst/admin routes are protected.
- WebSocket messages are rate limited.
- Structured logging exists.
- Graceful shutdown/error guards exist.
- Automated syntax and application tests exist.
- The UI has a mobile navigation path rather than simply shrinking desktop controls.

### What prevents a 9–10/10 rating

| Area | Current reality | Needed for a higher rating |
|---|---|---|
| External data | Several public/third-party feeds | Licensed, contracted production providers |
| Map tiles | Standard OSM tile service | Dedicated tile provider or self-hosted infrastructure |
| Weather | Open-Meteo free API path | Commercial licence/provider for commercial use |
| Persistence | Important analyst state is not durable | PostgreSQL or equivalent with backups |
| Identity | Scoped HMAC access | Full identity/session management if multi-user |
| Observability | Structured logs | Metrics, tracing, alerting and dashboards |
| Scaling | Single application architecture | Horizontal scaling and shared cache/state |
| Browser QA | Automated contract tests | Real-device/browser matrix and WebGL regression tests |
| Disaster operation | Informational context | Validated operational data agreements and procedures |
| Security perimeter | Application controls | WAF, deployment-level controls and stronger secrets management |
| Data quality | Provider dependent | Provenance, freshness, confidence and validation per feed |

### The actual production problem to solve

The strongest production direction is **not another satellite dashboard**.

> Provide an accessible geographic context layer for people who need to understand what is happening in a place, without requiring specialist GIS software.

For a Ugandan/East African deployment, that can become useful in:

1. **Education** — practical geography, GIS, weather and orbital-data learning.
2. **Environmental awareness** — viewing thermal/environmental events in geographic context.
3. **Weather awareness** — putting local forecasts and conditions against an actual geographic view.
4. **Aviation and tracking education** — understanding aircraft/satellite movement without presenting the system as certified navigation.
5. **Research prototypes** — testing geospatial ideas before moving to professional GIS infrastructure.
6. **Community demonstrations** — giving non-specialists a visual way to understand location-based events.
7. **Situational context** — combining several public feeds around a place while clearly showing their limitations.

The platform becomes substantially more valuable when it develops **verified data provenance, freshness indicators, historical playback, durable storage, better African-region data coverage and professional deployment infrastructure**.

---

## External data and licensing

3D Earth is a presentation layer; it does not own most of the geographic, weather or live-feed data it displays.

Important examples:
- OpenStreetMap data requires attribution. The standard OSM tile service has its own usage policy and is not a guaranteed commercial tile backend.
- Open-Meteo's free API is intended for non-commercial use; commercial deployment requires the appropriate commercial arrangement.
- Browser geolocation is supplied by the user's device and is not guaranteed to be survey-grade.
- Public live feeds can be delayed, incomplete, rate-limited or unavailable.

See **Data & Sources** at /data-policy for the current source register.

---

## Security

The application currently includes:
- Helmet security headers
- CORS configuration
- HTTP rate limiting
- request size limits
- input sanitisation
- HMAC-based scoped access tokens
- viewer / analyst / admin roles
- WebSocket authentication
- WebSocket rate limiting
- structured server logging
- uncaught exception/rejection guards
- graceful shutdown handling

See docs/SECURITY_AUDIT.md.

---

## Development

~~~powershell
npm install

Copy-Item .env.example .env
# Configure secrets in .env

npm run dev
~~~

Validation:

~~~powershell
npm test
npm run check:syntax
~~~

Production:

~~~powershell
npm start
~~~

---

## Engineering principle

**Keep the Earth visible. Make the data explain the place.**

The project should become more useful by improving its data quality, provenance, geographic coverage and operational reliability — not by adding decorative dashboard features.

---

## Credits

Built by **Kweezi Perez** — https://kweeziperez.com

- Three.js — MIT
- Leaflet — BSD-2-Clause
- satellite.js — MIT
- ws — MIT
- OpenStreetMap contributors
- Open-Meteo
- Other external providers are identified on the Data & Sources page
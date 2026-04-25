# 3D-Earth — Palantir-Style OSINT Intelligence Globe

A production-hardened, browser-based OSINT Intelligence Platform built on Three.js r128 + Node.js/Express 5. Streams live satellite positions, flights, seismic events, and thermal hotspots to a real-time 3D globe with analyst tools, alert engine, and a secure WebSocket gateway.

---

## Development Progress

### Overall Platform

`████████████████████████` **~98% Complete — Production Ready**

### Phase Breakdown

| Phase | Feature Set | Progress |
|-------|-------------|----------|
| 0 | 3D Globe — WebGL, shaders, atmosphere, SGP4 | `████████████████████████` 100% |
| 1 | Secure Gateway — Express 5, Helmet, CORS, HMAC auth | `████████████████████████` 100% |
| 2 | OSINT Dashboard — WS stream, layer manager, inspector | `████████████████████████` 100% |
| 3 | Alert Engine — AOI intersections, threshold alerts | `████████████████████████` 100% |
| 4 | Analyst Tools — AOI draw, geo-pinned notes, snapshots | `████████████████████████` 100% |
| 5 | Intelligence Overlay — threat scoring, clustering, minimap | `████████████████████████` 100% |
| 6 | Production Hardening — structured logging, WS auth, per-client subscriptions | `████████████████████░░░░` 95% |

> Remaining 5%: JWT refresh-token rotation, geofencing / WAF rules (cloud-deploy only), persistent session storage for analyst notes.

---

## Quick Start

### Prerequisites
- Node.js v18+ (v23 recommended)
- npm

### Install & run

```powershell
# Clone or enter the project directory
cd "d:\NEW PROJECTS\earth"

# Install dependencies
npm install

# Copy environment template and configure secrets
Copy-Item .env.example .env
# Edit .env: set JWT_SECRET to a 64-char random string

# Development (hot-reload via nodemon)
npm run dev

# Production
npm start
```

Open **http://localhost:3000** in your browser.

---

## Architecture

```
Browser (Three.js + vanilla JS)
  │  HTTPS/REST ──► Express 5 API  (/api/*)
  └─ WebSocket ───► WS Gateway     (/ws/live)
                         │
              ┌──────────┴──────────┐
         Ingest layer         Alert engine
         flights / EQ /        AOI checks /
         TLE / thermal         threat scores
```

### Backend stack
| Layer | Technology |
|-------|-----------|
| HTTP server | Node.js `http` + Express 5 |
| WebSocket | `ws` library, path `/ws/live` |
| Security | Helmet, CORS, express-rate-limit |
| Auth | HMAC-SHA256 tokens (15 min TTL) — `src/auth.js` |
| Logging | Structured in-process logger — `src/logger.js` |
| Data ingest | CelesTrak TLEs, OpenSky flights, USGS earthquakes, FIRMS thermal |

### Frontend stack
| Layer | Technology |
|-------|-----------|
| 3D engine | Three.js r128, custom GLSL shaders |
| Globe controls | `public/js/script.js` |
| Live data | `public/js/osint-dashboard.js` (WebSocket client) |
| Analyst tools | `public/js/aoi-tool.js` |
| Intel overlay | `public/js/intel-overlay.js` |

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | — | Basic health check |
| GET | `/api/status` | — | Memory, uptime, environment |
| POST | `/api/auth/token` | — | Issue HMAC viewer/analyst/admin token |
| GET | `/api/satellites` | — | TLE satellite data |
| GET | `/api/flights` | — | Live flight positions |
| GET | `/api/earthquakes` | — | USGS seismic events |
| GET | `/api/thermal` | — | FIRMS thermal hotspots |
| GET | `/api/positions` | — | All domains in one call |
| GET | `/api/aoi` | Bearer | List AOI polygons |
| POST | `/api/aoi` | Bearer (analyst+) | Create AOI |
| DELETE | `/api/aoi/:id` | Bearer (analyst+) | Delete AOI |
| GET | `/api/notes` | Bearer | List intel notes |
| POST | `/api/notes` | Bearer (analyst+) | Create note |
| DELETE | `/api/notes/:id` | Bearer (analyst+) | Delete note |

### WebSocket protocol (`/ws/live`)

**Server → Client messages**

| `type` | Description |
|--------|-------------|
| `connected` | Sent on connection with initial layer state |
| `delta_update` | Live data broadcast every 5 s: `flights`, `earthquakes`, `thermal`, `intelligence`, `alerts` |
| `cmd_ack` | Acknowledgement of a client command |

**Client → Server messages**

| `type` | `action` | Fields | Description |
|--------|----------|--------|-------------|
| `cmd` | `set_layer` | `layer`, `enabled` | Toggle per-client data subscription |
| `cmd` | `set_setting` | `key`, `value` | Persist visual setting (acknowledged server-side) |

**Authentication**: Pass token as query param: `ws://host/ws/live?token=<token>`  
In production (`NODE_ENV=production`) unauthenticated connections are rejected (close code 1008).

---

## Security Overview

See [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) for the full threat model and implementation status.

| Control | Status |
|---------|--------|
| HTTP security headers (Helmet) | ✅ Implemented |
| CORS strict allowlist | ✅ Implemented |
| API rate limiting (120 req/15 min) | ✅ Implemented |
| Request body size limits (10 KB) | ✅ Implemented |
| Input sanitization (XSS, prototype pollution) | ✅ Implemented |
| HMAC-SHA256 auth tokens (15 min TTL) | ✅ Implemented |
| Role-based access (viewer / analyst / admin) | ✅ Implemented |
| WebSocket rate limiting | ✅ Implemented |
| WebSocket token authentication | ✅ Implemented |
| Structured error logging (no stack traces to client) | ✅ Implemented |
| Uncaught exception / rejection handlers | ✅ Implemented |
| Graceful shutdown | ✅ Implemented |
| JWT refresh token rotation | ⬜ Planned |
| Geofencing / WAF | ⬜ Planned (cloud deploy) |

---

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full 6-phase development roadmap.

---

## Project Structure

```
├── index.html               # App shell — must stay at root
├── server.js                # Express 5 gateway + WebSocket server
├── package.json
├── .env.example             # Environment variable template
├── docs/
│   ├── ROADMAP.md           # Phase-by-phase feature roadmap
│   └── SECURITY_AUDIT.md    # Threat model and security controls
├── public/
│   ├── css/
│   │   ├── style.css        # Globe + controls panel styles
│   │   └── osint.css        # OSINT dashboard panel styles
│   └── js/
│       ├── script.js        # Three.js globe renderer
│       ├── osint-dashboard.js  # WS client, layer manager, inspector
│       ├── aoi-tool.js      # Analyst tools: AOI, notes, export
│       ├── intel-overlay.js # Threat markers, clustering, minimap
│       └── sgp4-worker.js   # Web Worker for off-thread SGP4
└── src/
    ├── logger.js            # Structured in-process logger
    ├── auth.js              # HMAC token issue/verify, middleware
    ├── alertEngine.js       # AOI intersection + alert queue
    ├── cache.js             # In-memory TTL cache
    ├── intelligence.js      # Threat scoring, clustering, entity history
    ├── aoi.js               # In-memory AOI store
    ├── notes.js             # In-memory intel notes store
    ├── ingest/
    │   ├── tle.js           # CelesTrak TLE fetch + parse
    │   ├── flights.js       # OpenSky Network flights
    │   ├── earthquakes.js   # USGS GeoJSON earthquakes
    │   └── thermal.js       # FIRMS thermal hotspot CSV
    ├── routes/
    │   ├── api.js           # Public data + auth routes
    │   ├── aoi.js           # Protected AOI CRUD
    │   └── notes.js         # Protected notes CRUD
    └── middleware/
        ├── requestLogger.js # HTTP access logging middleware
        ├── rateLimitWS.js   # Per-IP WS rate limiter
        └── sanitize.js      # Input sanitization middleware
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=<64-char-random-string>
ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=INFO
```

---

## Logging

The backend uses a structured in-process logger (`src/logger.js`):

- **Development**: colorized, human-readable output to stdout
- **Production**: JSON lines to stdout (compatible with Datadog, CloudWatch, Loki)

Log levels: `DEBUG` → `HTTP` → `INFO` → `WARN` → `ERROR`

Set `LOG_LEVEL` in `.env` to control verbosity. Every HTTP request is logged with method, path, status, response time, IP, and a correlation ID (`req.requestId`).

---

## License & Credits

- **Three.js** (r128) — MIT
- **satellite.js** — MIT
- **ws** — MIT
- Textures: three.js example assets or generated fallback canvases
- Platform built by [Perez C](https://perezchris.netlify.app/)

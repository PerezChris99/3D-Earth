# Implementation Status

Updated: 2026-10-12

## Execution rule

**autopilot** means execute the current phase end-to-end on the working branch, validate it, open the normal pull request into main, merge it, and synchronize perez with main.

## Phase 0 — Foundation

**Status: COMPLETE**

Architecture contracts, Earth vocabulary, WGS84 validation, provider abstraction, registry, provenance/freshness/confidence envelope and regression tests are complete.

## Phase 1 — Earth Data Engine

**Status: FOUNDATION COMPLETE / PERSISTENCE READY**

Implemented:
- Provider adapters for CelesTrak, OpenSky, USGS and NASA FIRMS.
- Common normalization into Earth records.
- Source/provenance/freshness/confidence envelopes.
- Unified Data Engine registry.
- /api/data/providers
- /api/data/provider/:id
- /api/data/snapshot
- PostgreSQL/PostGIS schema and spatial indexes.
- Observation and trajectory persistence model.

Deliberately not enabled in the runtime yet: PostgreSQL driver installation, automatic migrations, background persistence workers, and Redis/shared cache. Those require deployment infrastructure and dependency-lock changes.

## Phase 2 — Earth Engine

**Status: NEXT**

- LayerManager
- ObjectManager
- universal inspector
- global object search
- spatial query foundation
- progressive loading/LOD
- consistent map/globe object selection

## Stability audit — 2026-10-09

Verified in source:
- The map uses OpenStreetMap tiles first, with Esri World Street Map as a keyless fallback. If both Leaflet CDNs fail, the self-contained canvas renderer remains available. Tile-provider failures trigger fallback after repeated tile errors.
- Supabase REST requests now have a bounded 12-second timeout and report safe table/status context to server logs. This prevents stalled upstream requests from leaving API handlers pending indefinitely.
- Satellite focus keeps the Earth target at the origin while offsetting the camera from the satellite's radial line, preventing the selected satellite from sitting directly over the Earth disk.
- Axial rotation uses Earth's sidereal angular rate rather than the previous accelerated visual rate.
- The satellite workspace uses a single-column, scrollable layout on narrow screens instead of compressing three columns into a phone viewport.

Still requires deployment/environment verification:
- Supabase-backed features cannot return database records unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or the supported service-role fallback) are configured correctly in the deployed environment and the corresponding tables/RLS policies exist.
- The `FIRMS_MAP_KEY` is required for NASA FIRMS data. Provider credentials and ingestion health must be verified in production; code changes cannot manufacture missing secrets.
- Browser checks are still required at desktop and mobile sizes for tile HTTP status, data explorer queries, WebGL/camera behavior, and live Vercel commit identity.
- Moon-facing night lights are now rendered through a dedicated shader using the existing city-lights texture, a solar-night mask, and a lunar-facing mask. The Moon's visual orbit period was corrected from an annual cycle to approximately 27.32 days. This is a low-precision visual lunar orbit, not an ephemeris-grade Moon position.

## Engineering principle

> **Keep the Earth visible. Make the data explain the place.**


## Maps page recovery — 2026-10-12

The map recovery branch includes:
- A public static copy of the map page for Vercel asset delivery, explicit /map and /map/ rewrites, and an Express route serving the same public file.
- Bounded Leaflet stylesheet and renderer startup, renderer-readiness checks, and recovery to the built-in canvas renderer when Leaflet startup fails.
- Shared, unit-tested coordinate validation that rejects null/blank values instead of accidentally plotting them at (0, 0).
- Shared stable-ID merging for server, read-only Supabase, and catalog fallback results. Partial query success no longer replaces records already returned by the gateway.
- Concurrent direct/database catalog fallback reads, counts based on records actually loaded for rendering, and a gateway timeout aligned with the backend's bounded Supabase query timeout.
- An Express CSP source entry for the project's public read-only Supabase Data API requests.

**Verification boundary:** the branch's test suite and GitHub Actions must pass. Production remains unverified until the deployed domain serves the updated map and both map API paths pass a real browser smoke test.


## API deployment retry — 2026-10-12

- The Vercel runtime now exports the Express application handler; local Node execution continues to export the HTTP server.
- Regression tests and syntax checks pass for commit `4ad2ccf0f98b816fa18d222f304ea56bba612fa6`.
- The preview deployment for that code is READY.
- The first automatic production deployment ended with Vercel `git_info_fail` before a live API smoke test could be run. This change records the deployment retry and does not mark the production API as verified.


## Basemap key-overlay fix — 2026-10-12

- Removed CARTO raster tiles from both map renderers. CARTO currently returns an “API key required” watermark on raster requests without a key, which looks like a successful tile load and therefore does not fire the tile-error fallback.
- OpenStreetMap is the primary tile source; Esri World Street Map is the fallback source. The database marker rendering path is unchanged.
- Bumped map assets to `20261012b` to bypass stale client scripts.
- OSMF tile service has best-effort availability and policy limits; use a licensed/self-hosted tile provider if traffic exceeds the public tile service's intended interactive usage.

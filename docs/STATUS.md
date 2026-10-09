# Implementation Status

Updated: 2026-10-09

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
- The map now prefers Leaflet with CARTO Dark → CARTO Voyager → OpenStreetMap tile fallback. If both Leaflet CDNs fail, the self-contained canvas renderer remains available. A 403 is treated as a tile-provider failure, not assumed to be solved by the map library alone; the Leaflet renderer switches providers after repeated tile errors.
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

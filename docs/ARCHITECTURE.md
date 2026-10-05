# 3D-Earth Architecture Contract

## Purpose

3D-Earth is being developed toward an Earth intelligence platform: a system that
puts places, real-world objects, events, measurements, movement and time into
one geographic context.

The engineering rule is:

> **Keep the Earth visible. Make the data explain the place.**

This document defines the contracts that future phases must preserve.

## 1. System layers

```
External providers
       |
       v
Provider adapters
       |
       v
Earth Data Engine
  | normalize
  | validate
  | provenance
  | freshness
  | confidence
       |
       +----> hot cache
       |
       +----> persistent spatial store
       |
       v
Earth Engine
  | LayerManager
  | ObjectManager
  | Search
  | Spatial queries
  | Universal inspector
       |
       v
3D Globe / 2D Map / Analysis UI
```

The current application already has provider-specific ingest modules and a
secure Express gateway. The core modules introduced in Phase 0 establish the
common contract without forcing a database or a new runtime dependency yet.

## 2. Common Earth data model

The platform is organized around:

- **Location** — WGS84 latitude/longitude and optional altitude.
- **Object** — a persistent or trackable thing such as a satellite, aircraft,
  vessel or infrastructure asset.
- **Event** — something that happened at a location and time.
- **Observation** — a source observation about an object or place.
- **Measurement** — a numeric observation with units and timestamp.
- **Trajectory** — a sequence of time-position states.
- **Area** — a geographic polygon, circle, corridor or administrative boundary.
- **Time** — observation time, event time, element epoch and retrieval time.
- **Source** — the provider and processing path that produced the record.
- **Relationship** — a link between entities.

## 3. Required provenance

Every dataset entering the platform should eventually expose:

| Field | Meaning |
|---|---|
| provider | Source adapter that supplied the record |
| sourceUrl | Provider endpoint or source reference where appropriate |
| retrievedAt | When 3D-Earth obtained the data |
| observedAt | When the source says the observation occurred |
| license | Terms governing use |
| processing | Normalization/derivation applied |
| limitations | Known gaps or caveats |
| freshness.ageMs | Age relative to retrieval |
| freshness.updateCadenceMs | Expected provider refresh interval |
| confidence | Optional normalized 0–1 confidence score |

No provider-specific claim should be presented as platform truth without a source.

## 4. Geographic contract

The canonical coordinate system is:

- WGS84
- latitude in decimal degrees, -90..90
- longitude in decimal degrees, -180..180
- altitude in metres unless a domain explicitly requires another orbital or
  atmospheric unit
- UTC for cross-provider timestamps

Conversion to Three.js world coordinates happens only at the rendering edge.
Providers and persistence must not store Three.js coordinates.

## 5. Provider contract

A provider adapter owns:

1. external URL/authentication
2. provider-specific parsing
3. normalization into the Earth model
4. source limitations
5. freshness expectations
6. cache policy

The rest of the application should consume normalized records/envelopes rather
than parse external payloads itself.

## 6. Domain expansion rule

New domains must follow this sequence:

1. identify the authoritative or appropriate source
2. document licensing and limitations
3. create an ingest/provider adapter
4. normalize into the common vocabulary
5. validate coordinates and timestamps
6. attach provenance
7. cache safely
8. expose through the data gateway
9. add visualization/inspection
10. add historical persistence only when the product requirement justifies it

## 7. Phase boundaries

### Phase 0 — Foundation
Architecture contracts, domain vocabulary, provider abstraction, provenance and
engineering rules.

### Phase 1 — Earth Data Engine
Provider registry, normalized ingestion, validation, persistent storage,
PostgreSQL/PostGIS, spatial indexes, historical records, freshness and
provenance queries.

### Phase 2 — Earth Engine
LayerManager, ObjectManager, universal inspector, search, spatial query
foundation and progressive loading.

### Phase 3+
Real-world domain expansion: satellites, aircraft, maritime, weather,
environment, events, infrastructure, time, analysis, education, AI and
regional/global coverage.

## 8. Non-negotiable constraints

- Do not fabricate live data.
- Do not silently turn missing fields into invented values.
- Do not mix provider-specific coordinates with WGS84 without explicit
  conversion.
- Do not let optional data failure prevent the core globe from rendering.
- Do not expose provider credentials to the browser.
- Do not make licensing assumptions.
- Preserve source and retrieval timestamps.
- Keep the globe usable when a provider is degraded.

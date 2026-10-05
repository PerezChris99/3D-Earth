# PostgreSQL/PostGIS storage foundation

Phase 1 defines the persistent spatial schema in db/migrations/001_earth_data.sql.

Requirements: PostgreSQL 14+ and PostGIS 3.x. Supply DATABASE_URL in deployment.

Tables: data_sources, earth_objects, earth_observations, earth_trajectories.

All geographic storage uses PostGIS GEOGRAPHY with SRID 4326 (WGS84). Altitude is represented separately in metres where required.

The runtime does not silently require a database yet. Persistence is intentionally enabled only after the deployment dependency and migration process are provisioned. The globe remains usable if persistence is unavailable.

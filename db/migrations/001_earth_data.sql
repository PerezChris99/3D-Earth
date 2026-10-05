-- Phase 1 spatial persistence foundation.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS data_sources (
 id TEXT PRIMARY KEY, domain TEXT NOT NULL, name TEXT NOT NULL,
 license TEXT NOT NULL DEFAULT 'unspecified', source_url TEXT,
 update_cadence_ms BIGINT, enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS earth_objects (
 id TEXT PRIMARY KEY, domain TEXT NOT NULL, object_type TEXT NOT NULL, name TEXT,
 source_id TEXT REFERENCES data_sources(id), properties JSONB NOT NULL DEFAULT '{}'::jsonb,
 location GEOGRAPHY(POINTZ,4326), observed_at TIMESTAMPTZ,
 retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 confidence DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_earth_objects_location ON earth_objects USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_earth_objects_domain ON earth_objects(domain);
CREATE INDEX IF NOT EXISTS idx_earth_objects_observed_at ON earth_objects(observed_at);
CREATE INDEX IF NOT EXISTS idx_earth_objects_source ON earth_objects(source_id);
CREATE TABLE IF NOT EXISTS earth_observations (
 id BIGSERIAL PRIMARY KEY, object_id TEXT REFERENCES earth_objects(id) ON DELETE CASCADE,
 source_id TEXT REFERENCES data_sources(id), observed_at TIMESTAMPTZ,
 retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(), location GEOGRAPHY(POINTZ,4326),
 payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 confidence DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE INDEX IF NOT EXISTS idx_earth_observations_location ON earth_observations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_earth_observations_object_time ON earth_observations(object_id, observed_at DESC);
CREATE TABLE IF NOT EXISTS earth_trajectories (
 id BIGSERIAL PRIMARY KEY, object_id TEXT NOT NULL REFERENCES earth_objects(id) ON DELETE CASCADE,
 source_id TEXT REFERENCES data_sources(id), observed_at TIMESTAMPTZ NOT NULL,
 location GEOGRAPHY(POINTZ,4326) NOT NULL, velocity_mps DOUBLE PRECISION,
 heading_deg DOUBLE PRECISION, altitude_m DOUBLE PRECISION,
 payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_earth_trajectories_object_time ON earth_trajectories(object_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_earth_trajectories_location ON earth_trajectories USING GIST(location);

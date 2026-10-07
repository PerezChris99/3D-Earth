-- Security and write-path hardening for the public Data API.
-- The browser may read explicitly public observatory data, but it must never write
-- directly to canonical observation or ingestion tables.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I', n.nspname, c.relname) AS qname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE 'ALTER TABLE ' || r.qname || ' ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE ' || r.qname || ' FROM anon, authenticated';
  END LOOP;
END $$;

GRANT SELECT ON TABLE
  public.astronomy_snapshots,
  public.celestial_bodies,
  public.data_layer_configs,
  public.data_sources,
  public.earth_events,
  public.earth_observation_products,
  public.environment_observations,
  public.observatory_observations,
  public.observatory_sources,
  public.satellite_observations,
  public.satellite_passes,
  public.satellites,
  public.seed_telemetry_samples,
  public.space_weather_observations,
  public.volcano_observations,
  public.world_development_observations
TO anon, authenticated;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'astronomy_snapshots', 'celestial_bodies', 'data_layer_configs', 'data_sources',
    'earth_events', 'earth_observation_products', 'environment_observations',
    'observatory_observations', 'observatory_sources', 'satellite_observations',
    'satellite_passes', 'satellites', 'seed_telemetry_samples',
    'space_weather_observations', 'volcano_observations', 'world_development_observations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS public_read ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      table_name
    );
  END LOOP;
END $$;

-- Ingestion functions are server-side jobs only. No Data API role may invoke them.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'ingest_%'
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || r.signature || ' FROM PUBLIC, anon, authenticated';
  END LOOP;
END $$;

-- The unique conflict index already covers this exact key. Keeping a second
-- non-unique copy only increases write cost for every observation upsert.
DROP INDEX IF EXISTS public.observatory_observations_source_external_observed_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS regression: one or more public tables have RLS disabled';
  END IF;
END $$;

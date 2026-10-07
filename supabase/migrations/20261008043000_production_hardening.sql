-- 3D Earth by Perez production hardening
ALTER TABLE public.environment_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volcano_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_weather_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earth_observation_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_layer_configs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.relname); END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['astronomy_snapshots','celestial_bodies','data_sources','data_layer_configs','earth_events','environment_observations','earth_observation_products','observatory_observations','observatory_sources','satellite_observations','satellite_passes','satellites','seed_telemetry_samples','space_weather_observations','volcano_observations','world_development_observations']
  LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)','public_read_'||t,t);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.observer_locations FROM anon,authenticated;
REVOKE ALL ON TABLE public.ingestion_runs FROM anon,authenticated;
REVOKE ALL ON TABLE public.observatory_ingestion_runs FROM anon,authenticated;

CREATE INDEX IF NOT EXISTS observatory_observations_source_external_observed_idx ON public.observatory_observations(source_id,external_id,observed_at);
CREATE INDEX IF NOT EXISTS observatory_observations_observed_idx ON public.observatory_observations(observed_at DESC);
CREATE INDEX IF NOT EXISTS environment_observations_source_observed_idx ON public.environment_observations(source_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS volcano_observations_source_observed_idx ON public.volcano_observations(source_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS space_weather_observations_source_observed_idx ON public.space_weather_observations(source_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS earth_observation_products_source_acquired_idx ON public.earth_observation_products(source_id,acquired_at DESC);
CREATE INDEX IF NOT EXISTS ingestion_runs_source_started_idx ON public.ingestion_runs(source_id,started_at DESC);
CREATE INDEX IF NOT EXISTS data_layer_configs_sector_idx ON public.data_layer_configs(sector);
CREATE INDEX IF NOT EXISTS data_layer_configs_source_idx ON public.data_layer_configs(source_id);
CREATE INDEX IF NOT EXISTS satellite_observations_source_observed_idx ON public.satellite_observations(source_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS satellite_passes_source_aos_idx ON public.satellite_passes(source_id,aos_at DESC);
CREATE INDEX IF NOT EXISTS earth_events_source_occurred_idx ON public.earth_events(source_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS world_development_source_period_idx ON public.world_development_observations(source_id,period DESC);

ALTER FUNCTION public.observatory_set_location() SET search_path=public,extensions,pg_catalog;
REVOKE EXECUTE ON FUNCTION public._source_id(text) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.ingest_noaa_space_weather() SET statement_timeout='60s';
ALTER FUNCTION public.ingest_world_bank_indicators(text[],integer,integer) SET statement_timeout='60s';
ALTER FUNCTION public.ingest_noaa_tides() SET statement_timeout='30s';
ALTER FUNCTION public.ingest_noaa_weather() SET statement_timeout='30s';
ALTER FUNCTION public.ingest_noaa_ocean() SET statement_timeout='30s';
ALTER FUNCTION public.ingest_noaa_alerts() SET statement_timeout='30s';

DO $$
DECLARE n text;
BEGIN
  FOREACH n IN ARRAY ARRAY['noaa-ocean-10min','noaa-severe-weather-5min','noaa-space-weather-minutely','noaa-weather-10min','observatory-ocean-surface','observatory-space-weather','observatory-surface-weather','observatory-tides','observatory-volcanoes','usgs-volcanoes-hourly','usgs-volcanoes-edge-hourly','copernicus-eo-hourly']
  LOOP IF EXISTS(SELECT 1 FROM cron.job WHERE jobname=n) THEN PERFORM cron.unschedule(n); END IF; END LOOP;
END $$;

SELECT cron.unschedule('observatory-live-weather-15m') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='observatory-live-weather-15m');
SELECT cron.schedule('observatory-live-weather-15m','*/15 * * * *',$job$select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='observatory_project_url')||'/functions/v1/observatory-ingest',headers:=jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='observatory_cron_anon_key'),'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='observatory_cron_anon_key')),body:='{"sources":["weather","oceans"]}'::jsonb,timeout_milliseconds:=15000);$job$);
SELECT cron.unschedule('observatory-live-spaceweather-5m') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='observatory-live-spaceweather-5m');
SELECT cron.schedule('observatory-live-spaceweather-5m','*/5 * * * *',$job$select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='observatory_project_url')||'/functions/v1/observatory-ingest',headers:=jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='observatory_cron_anon_key'),'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='observatory_cron_anon_key')),body:='{"sources":["space_weather"]}'::jsonb,timeout_milliseconds:=15000);$job$);
SELECT cron.unschedule('observatory-live-volcano-1h') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='observatory-live-volcano-1h');
SELECT cron.unschedule('world-bank-refresh-daily') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='world-bank-refresh-daily');
SELECT cron.schedule('world-bank-refresh-daily','31 2 * * *','select public.ingest_world_bank_indicators(ARRAY[''SP.POP.TOTL'',''NY.GDP.MKTP.CD'',''NY.GDP.PCAP.CD'',''SP.DYN.LE00.IN'',''SP.URB.TOTL.IN.ZS'',''IT.NET.USER.ZS'',''EG.ELC.ACCS.ZS'',''SL.UEM.TOTL.ZS'',''SH.DYN.MORT'',''SH.XPD.CHEX.GD.ZS''],2024,2024);');

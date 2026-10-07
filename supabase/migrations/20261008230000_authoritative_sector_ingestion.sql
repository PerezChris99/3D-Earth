-- Authoritative sector ingestion foundation.
-- Applied to Supabase project iunxtsdczuvugttnwdky.

create table if not exists public.environment_observations (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.data_sources(id),
  sector text not null,
  external_id text not null,
  observed_at timestamptz not null,
  latitude numeric,
  longitude numeric,
  value numeric,
  unit text,
  metrics jsonb not null default '{}'::jsonb,
  quality_flag text not null default 'observed',
  ingested_at timestamptz not null default now(),
  unique(source_id, external_id, observed_at)
);
create index if not exists environment_observations_sector_time_idx on public.environment_observations(sector, observed_at desc);
create index if not exists environment_observations_time_idx on public.environment_observations(observed_at desc);

create table if not exists public.volcano_observations (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.data_sources(id),
  volcano_id text not null,
  volcano_name text not null,
  observed_at timestamptz not null,
  latitude numeric not null check(latitude between -90 and 90),
  longitude numeric not null check(longitude between -180 and 180),
  alert_level text,
  color_code text,
  threat_level text,
  synopsis text,
  notice_id text,
  notice_url text,
  metadata jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  unique(source_id, volcano_id, observed_at)
);
create index if not exists volcano_observations_time_idx on public.volcano_observations(observed_at desc);
create index if not exists volcano_observations_geo_idx on public.volcano_observations using gist ((st_setsrid(st_makepoint(longitude::double precision, latitude::double precision),4326)::geography));

create table if not exists public.space_weather_observations (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.data_sources(id),
  product text not null,
  observed_at timestamptz not null,
  kp numeric,
  kp_index integer,
  metrics jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  unique(source_id, product, observed_at)
);
create index if not exists space_weather_time_idx on public.space_weather_observations(observed_at desc);

create table if not exists public.earth_observation_products (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.data_sources(id),
  external_id text not null,
  collection text not null,
  acquired_at timestamptz,
  published_at timestamptz,
  cloud_cover numeric,
  geometry jsonb,
  metadata jsonb not null default '{}'::jsonb,
  asset_links jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  unique(source_id, external_id)
);
create index if not exists earth_observation_products_collection_time_idx on public.earth_observation_products(collection, acquired_at desc);

create table if not exists public.ingestion_runs (
  id bigint generated always as identity primary key,
  source_id uuid references public.data_sources(id),
  job_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  records_received integer not null default 0,
  records_accepted integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ingestion_runs_job_time_idx on public.ingestion_runs(job_name, started_at desc);

create table if not exists public.data_layer_configs (
  layer_key text primary key,
  sector text not null,
  source_id uuid references public.data_sources(id),
  expected_refresh_seconds integer not null,
  stale_after_seconds integer not null,
  status text not null default 'configured',
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.data_sources(name, provider, endpoint, description, is_authoritative) values
('NOAA Space Weather','NOAA SWPC','https://services.swpc.noaa.gov/json/','Planetary K-index and operational space-weather products',true),
('USGS Volcano Hazards','USGS','https://volcanoes.usgs.gov/vsc/api/volcanoApi/geojson','US volcano status and hazard information',true),
('NOAA National Weather Service','NOAA NWS','https://api.weather.gov/','Operational weather observations and forecasts',true),
('NOAA Tides & Currents','NOAA CO-OPS','https://api.tidesandcurrents.noaa.gov/','Operational coastal water level, currents and meteorological observations',true),
('Copernicus Data Space','European Union Copernicus','https://stac.dataspace.copernicus.eu/v1/','Sentinel Earth-observation product catalogue',true),
('NASA FIRMS','NASA LANCE','https://firms.modaps.eosdis.nasa.gov/','Near-real-time active fire and thermal anomaly data',true)
on conflict(name) do update set endpoint=excluded.endpoint,description=excluded.description,is_authoritative=excluded.is_authoritative;

create or replace function public._source_id(p_name text) returns uuid
language sql stable security definer set search_path=public
as $$ select id from public.data_sources where name=p_name limit 1 $$;

create or replace function public.ingest_noaa_space_weather() returns integer
language plpgsql security definer set search_path=public,extensions as $$
declare sid uuid := public._source_id('NOAA Space Weather'); payload jsonb; rec jsonb; n integer:=0; run_id bigint;
begin
 insert into public.ingestion_runs(source_id,job_name) values(sid,'noaa-space-weather') returning id into run_id;
 payload := (extensions.http_get('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')).content::jsonb;
 for rec in select value from jsonb_array_elements(payload) order by (value->>'time_tag')::timestamptz desc limit 180 loop
  insert into public.space_weather_observations(source_id,product,observed_at,kp,kp_index,metrics)
  values(sid,'planetary_k_index_1m',(rec->>'time_tag')::timestamptz,nullif(rec->>'estimated_kp','')::numeric,nullif(rec->>'kp_index','')::integer,rec)
  on conflict(source_id,product,observed_at) do update set kp=excluded.kp,kp_index=excluded.kp_index,metrics=excluded.metrics;
  n:=n+1;
 end loop;
 update public.ingestion_runs set completed_at=now(),status='success',records_received=jsonb_array_length(payload),records_accepted=n where id=run_id;
 return n;
exception when others then
 if run_id is not null then update public.ingestion_runs set completed_at=now(),status='failed',error_message=sqlerrm where id=run_id; end if; raise;
end $$;

create or replace function public.ingest_noaa_weather() returns integer
language plpgsql security definer set search_path=public,extensions as $$
declare sid uuid:=public._source_id('NOAA National Weather Service'); station text; payload jsonb; props jsonb; n integer:=0; run_id bigint;
begin
 insert into public.ingestion_runs(source_id,job_name) values(sid,'noaa-weather') returning id into run_id;
 foreach station in array array['KSEA','KLAX','KJFK','KORD','KDEN','KATL','KDFW','KMIA','KPHX','KANC','KJNU'] loop
  begin
   payload := (extensions.http_get('https://api.weather.gov/stations/'||station||'/observations/latest')).content::jsonb; props:=payload->'properties';
   if props->>'timestamp' is not null then
    insert into public.environment_observations(source_id,sector,external_id,observed_at,latitude,longitude,value,unit,metrics)
    values(sid,'weather',coalesce(props->>'id',station),(props->>'timestamp')::timestamptz,nullif(props->>'latitude','')::numeric,nullif(props->>'longitude','')::numeric,nullif(props->'temperature'->>'value','')::numeric,'degC',
    jsonb_build_object('station',station,'wind_speed_mps',props->'windSpeed'->>'value','wind_direction_deg',props->'windDirection'->>'value','barometric_pressure_pa',props->'barometricPressure'->>'value','relative_humidity_pct',props->'relativeHumidity'->>'value','visibility_m',props->'visibility'->>'value','raw',props),'observed')
    on conflict(source_id,external_id,observed_at) do update set metrics=excluded.metrics,value=excluded.value;
    n:=n+1;
   end if;
  exception when others then null; end;
 end loop;
 update public.ingestion_runs set completed_at=now(),status='success',records_received=11,records_accepted=n where id=run_id; return n;
exception when others then if run_id is not null then update public.ingestion_runs set completed_at=now(),status='failed',error_message=sqlerrm where id=run_id; end if; raise; end $$;

create or replace function public.ingest_noaa_ocean() returns integer
language plpgsql security definer set search_path=public,extensions as $$
declare sid uuid:=public._source_id('NOAA Tides & Currents'); station text; payload jsonb; rec jsonb; n integer:=0; run_id bigint;
begin
 insert into public.ingestion_runs(source_id,job_name) values(sid,'noaa-ocean') returning id into run_id;
 foreach station in array array['9414290','8518750','8632200','8443970','8720218','9447130'] loop
  begin
   payload := (extensions.http_get('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=today&station='||station||'&product=water_level&datum=MLLW&time_zone=gmt&units=metric&application=3D-Earth&format=json')).content::jsonb;
   for rec in select value from jsonb_array_elements(coalesce(payload->'data','[]'::jsonb)) order by (value->>'t')::timestamptz desc limit 1 loop
    insert into public.environment_observations(source_id,sector,external_id,observed_at,value,unit,metrics,quality_flag)
    values(sid,'ocean-water-level',station||':'||(rec->>'t'),(rec->>'t')::timestamptz,nullif(rec->>'v','')::numeric,'m',rec,'preliminary')
    on conflict(source_id,external_id,observed_at) do update set value=excluded.value,metrics=excluded.metrics;
    n:=n+1;
   end loop;
  exception when others then null; end;
 end loop;
 update public.ingestion_runs set completed_at=now(),status='success',records_received=6,records_accepted=n where id=run_id; return n;
exception when others then if run_id is not null then update public.ingestion_runs set completed_at=now(),status='failed',error_message=sqlerrm where id=run_id; end if; raise; end $$;

create or replace function public.ingest_copernicus_eo() returns integer
language plpgsql security definer set search_path=public,extensions as $$
declare sid uuid:=public._source_id('Copernicus Data Space'); payload jsonb; f jsonb; p jsonb; n integer:=0; run_id bigint;
begin
 insert into public.ingestion_runs(source_id,job_name) values(sid,'copernicus-eo') returning id into run_id;
 payload := (extensions.http_get('https://stac.dataspace.copernicus.eu/v1/search?collections=sentinel-2-l2a&limit=25')).content::jsonb;
 for f in select value from jsonb_array_elements(coalesce(payload->'features','[]'::jsonb)) loop
  p:=f->'properties';
  insert into public.earth_observation_products(source_id,external_id,collection,acquired_at,published_at,cloud_cover,geometry,metadata,asset_links)
  values(sid,f->>'id',coalesce(f->'collection'->>0,'sentinel-2-l2a'),nullif(p->>'datetime','')::timestamptz,nullif(p->>'published','')::timestamptz,coalesce(nullif(p->>'eo:cloud_cover','')::numeric,nullif(p->>'cloudCover','')::numeric),f->'geometry',p,f->'assets')
  on conflict(source_id,external_id) do update set acquired_at=excluded.acquired_at,published_at=excluded.published_at,cloud_cover=excluded.cloud_cover,geometry=excluded.geometry,metadata=excluded.metadata,asset_links=excluded.asset_links;
  n:=n+1;
 end loop;
 update public.ingestion_runs set completed_at=now(),status='success',records_received=jsonb_array_length(coalesce(payload->'features','[]'::jsonb)),records_accepted=n where id=run_id; return n;
exception when others then if run_id is not null then update public.ingestion_runs set completed_at=now(),status='failed',error_message=sqlerrm where id=run_id; end if; raise; end $$;

create or replace function public.ingest_noaa_alerts() returns integer
language plpgsql security definer set search_path=public,extensions as $$
declare sid uuid:=public._source_id('NOAA National Weather Service'); payload jsonb; f jsonb; p jsonb; n integer:=0; run_id bigint; ts timestamptz;
begin
 insert into public.ingestion_runs(source_id,job_name) values(sid,'noaa-severe-weather') returning id into run_id;
 payload := (extensions.http_get('https://api.weather.gov/alerts/active?status=actual')).content::jsonb;
 for f in select value from jsonb_array_elements(coalesce(payload->'features','[]'::jsonb)) loop
  p:=f->'properties'; ts:=coalesce(nullif(p->>'onset','')::timestamptz,nullif(p->>'effective','')::timestamptz,now());
  insert into public.earth_events(event_type,occurred_at,latitude,longitude,title,description,source_id,metadata)
  values('severe-weather',ts,nullif(p->>'latitude','')::numeric,nullif(p->>'longitude','')::numeric,coalesce(p->>'headline',p->>'event','NOAA weather alert'),p->>'description',sid,
  jsonb_build_object('id',f->>'id','event',p->>'event','severity',p->>'severity','urgency',p->>'urgency','certainty',p->>'certainty','expires',p->>'expires','areaDesc',p->>'areaDesc','geometry',f->'geometry','raw',p))
  on conflict do nothing; n:=n+1;
 end loop;
 update public.ingestion_runs set completed_at=now(),status='success',records_received=jsonb_array_length(coalesce(payload->'features','[]'::jsonb)),records_accepted=n where id=run_id; return n;
exception when others then if run_id is not null then update public.ingestion_runs set completed_at=now(),status='failed',error_message=sqlerrm where id=run_id; end if; raise; end $$;

create unique index if not exists earth_events_external_id_uidx on public.earth_events ((metadata->>'id')) where metadata->>'id' is not null;

insert into public.data_layer_configs(layer_key,sector,source_id,expected_refresh_seconds,stale_after_seconds,notes) values
('weather','weather',public._source_id('NOAA National Weather Service'),600,1800,'Operational NWS observations; current implementation covers selected stations.'),
('ocean','ocean',public._source_id('NOAA Tides & Currents'),600,3600,'Operational NOAA coastal water-level observations; station coverage is not global.'),
('volcanoes','volcano',public._source_id('USGS Volcano Hazards'),3600,21600,'USGS volcano status feed; primarily US/Northern Mariana coverage.'),
('space-weather','space-weather',public._source_id('NOAA Space Weather'),60,300,'NOAA planetary K-index feed updates at minute cadence.'),
('earth-observation','earth-observation',public._source_id('Copernicus Data Space'),3600,21600,'Sentinel-2 product metadata from the public STAC catalogue.'),
('wildfires','wildfire',public._source_id('NASA FIRMS'),900,7200,'NASA FIRMS NRT/RT/URT; requires a free MAP_KEY for API/WFS ingestion.'),
('severe-weather','severe-weather',public._source_id('NOAA National Weather Service'),300,1800,'Active NWS alerts; current authoritative coverage is the U.S. NWS alert domain.')
on conflict(layer_key) do update set source_id=excluded.source_id,expected_refresh_seconds=excluded.expected_refresh_seconds,stale_after_seconds=excluded.stale_after_seconds,notes=excluded.notes,updated_at=now();

revoke all on function public.ingest_noaa_space_weather() from public,anon,authenticated;
revoke all on function public.ingest_noaa_weather() from public,anon,authenticated;
revoke all on function public.ingest_noaa_ocean() from public,anon,authenticated;
revoke all on function public.ingest_copernicus_eo() from public,anon,authenticated;
revoke all on function public.ingest_noaa_alerts() from public,anon,authenticated;

create extension if not exists pg_net with schema extensions;
do $$ declare r record; begin
 for r in select jobid from cron.job where jobname in ('noaa-space-weather-minutely','noaa-weather-10min','noaa-ocean-10min','copernicus-eo-hourly','noaa-severe-weather-5min') loop perform cron.unschedule(r.jobid); end loop;
end $$;
select cron.schedule('noaa-space-weather-minutely','* * * * *','select public.ingest_noaa_space_weather();');
select cron.schedule('noaa-weather-10min','*/10 * * * *','select public.ingest_noaa_weather();');
select cron.schedule('noaa-ocean-10min','*/10 * * * *','select public.ingest_noaa_ocean();');
select cron.schedule('copernicus-eo-hourly','23 * * * *','select public.ingest_copernicus_eo();');
select cron.schedule('noaa-severe-weather-5min','*/5 * * * *','select public.ingest_noaa_alerts();');

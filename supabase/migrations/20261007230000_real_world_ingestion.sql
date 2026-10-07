-- Planetary Observatory real-world ingestion foundation.
-- Sources: USGS Earthquake Catalog, World Bank WDI, CelesTrak GP/OMM.
-- Live database may already contain these objects; this migration is idempotent.

create schema if not exists extensions;
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.world_development_observations (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.data_sources(id),
  country_code text not null,
  country_name text,
  indicator_code text not null,
  indicator_name text,
  period integer not null,
  value numeric,
  unit text,
  observation_status text,
  metadata jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  unique(source_id,country_code,indicator_code,period)
);

create index if not exists world_dev_country_period_idx on public.world_development_observations(country_code,period);
create index if not exists world_dev_indicator_period_idx on public.world_development_observations(indicator_code,period);
create index if not exists world_dev_source_idx on public.world_development_observations(source_id);
alter table public.world_development_observations enable row level security;

create unique index if not exists earth_events_usgs_external_id_uq
on public.earth_events(source_id, ((metadata->>'external_id')));

-- Functions are defined in the live Supabase project as the canonical ingestion jobs.
-- Keep this migration in source control so the database is reproducible.
create or replace function public.ingest_usgs_earthquakes(lookback_days integer default 30, minimum_magnitude numeric default 2.5)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  payload jsonb; feature jsonb; props jsonb; coords jsonb; src uuid;
  inserted_count bigint := 0; start_ts text; end_ts text;
begin
  select id into src from public.data_sources where name='USGS Earthquake Catalog' limit 1;
  if src is null then
    insert into public.data_sources(name,provider,endpoint,description,is_authoritative)
    values ('USGS Earthquake Catalog','USGS','https://earthquake.usgs.gov/fdsnws/event/1/','USGS Earthquake Catalog / ComCat event data',true)
    returning id into src;
  end if;
  start_ts := to_char(now() at time zone 'UTC' - make_interval(days => greatest(1,lookback_days)),'YYYY-MM-DD"T"HH24:MI:SS');
  end_ts := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS');
  select content::jsonb into payload from extensions.http_get(
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime='||start_ts||
    '&endtime='||end_ts||'&minmagnitude='||minimum_magnitude::text||'&limit=20000&orderby=time');
  for feature in select value from jsonb_array_elements(coalesce(payload->'features','[]'::jsonb)) loop
    props := feature->'properties'; coords := feature->'geometry'->'coordinates';
    insert into public.earth_events(event_type,occurred_at,latitude,longitude,magnitude,depth_km,title,description,source_id,location,metadata)
    values (
      coalesce(props->>'type','earthquake'),to_timestamp(((props->>'time')::bigint)/1000.0),
      (coords->>1)::numeric,(coords->>0)::numeric,nullif(props->>'mag','')::numeric,(coords->>2)::numeric,
      coalesce(props->>'place','USGS earthquake'),props->>'title',src,
      st_setsrid(st_makepoint((coords->>0)::double precision,(coords->>1)::double precision),4326)::geography,
      jsonb_build_object('external_id',feature->>'id','url',props->>'url','status',props->>'status',
        'tsunami',props->>'tsunami','felt',props->>'felt','alert',props->>'alert','sig',props->>'sig',
        'mag_type',props->>'magType','net',props->>'net','code',props->>'code','updated_ms',props->>'updated',
        'ingest_method','USGS_FDSN_GEOJSON'))
    on conflict (source_id, ((metadata->>'external_id'))) do update set
      occurred_at=excluded.occurred_at,latitude=excluded.latitude,longitude=excluded.longitude,
      magnitude=excluded.magnitude,depth_km=excluded.depth_km,title=excluded.title,description=excluded.description,
      location=excluded.location,metadata=excluded.metadata;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end $$;

create or replace function public.ingest_world_bank_indicators(indicators text[],start_year integer default 2000,end_year integer default 2024)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  payload jsonb; row_data jsonb; response record; src uuid; code text; inserted_count bigint := 0; url text;
begin
  select id into src from public.data_sources where name='World Bank World Development Indicators' limit 1;
  if src is null then
    insert into public.data_sources(name,provider,endpoint,description,is_authoritative)
    values ('World Bank World Development Indicators','World Bank','https://api.worldbank.org/v2/country/all/indicator/',
      'World Development Indicators country/year indicator observations',true) returning id into src;
  end if;
  foreach code in array indicators loop
    url := 'https://api.worldbank.org/v2/country/all/indicator/'||replace(code,' ','')||
      '?format=json&date='||start_year::text||':'||end_year::text||'&per_page=10000';
    select * into response from extensions.http_get(url);
    if response.status <> 200 then continue; end if;
    payload := response.content::jsonb;
    if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) < 2 then continue; end if;
    for row_data in select value from jsonb_array_elements(payload->1) loop
      if row_data->>'value' is null then continue; end if;
      insert into public.world_development_observations(
        source_id,country_code,country_name,indicator_code,indicator_name,period,value,unit,observation_status,metadata)
      values (
        src,upper(coalesce(nullif(row_data->>'countryiso3code',''),row_data->'country'->>'id')),
        row_data->'country'->>'value',row_data->'indicator'->>'id',row_data->'indicator'->>'value',
        (row_data->>'date')::integer,(row_data->>'value')::numeric,nullif(row_data->'indicator'->>'unit',''),
        nullif(row_data->>'obs_status',''),
        jsonb_build_object('source_api','World Bank Indicators API v2','source_id',row_data->>'indicator','decimal',row_data->>'decimal'))
      on conflict (source_id,country_code,indicator_code,period) do update set
        country_name=excluded.country_name,indicator_name=excluded.indicator_name,value=excluded.value,
        unit=excluded.unit,observation_status=excluded.observation_status,metadata=excluded.metadata,ingested_at=now();
      inserted_count := inserted_count + 1;
    end loop;
  end loop;
  return inserted_count;
end $$;

create or replace function public.ingest_celestrak_group(group_name text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  payload jsonb; obj jsonb; src uuid; response record; mm numeric; ecc numeric; inc numeric;
  a_km numeric; ap_km numeric; pe_km numeric; processed bigint := 0;
begin
  select id into src from public.data_sources where name='CelesTrak General Perturbations' limit 1;
  if src is null then
    insert into public.data_sources(name,provider,endpoint,description,is_authoritative)
    values ('CelesTrak General Perturbations','CelesTrak','https://celestrak.org/NORAD/elements/gp.php',
      'Current GP/OMM orbital elements for tracked space objects',true) returning id into src;
  end if;
  select * into response from extensions.http_get(
    'https://celestrak.org/NORAD/elements/gp.php?GROUP='||
    upper(regexp_replace(group_name,'[^a-zA-Z0-9_-]','','g'))||'&FORMAT=json');
  if response.status <> 200 then raise exception 'CelesTrak request failed: status %',response.status; end if;
  payload := response.content::jsonb;
  for obj in select value from jsonb_array_elements(coalesce(payload,'[]'::jsonb)) loop
    if nullif(obj->>'NORAD_CAT_ID','') is null then continue; end if;
    mm:=nullif(obj->>'MEAN_MOTION','')::numeric; ecc:=nullif(obj->>'ECCENTRICITY','')::numeric; inc:=nullif(obj->>'INCLINATION','')::numeric;
    if mm is not null and mm>0 then
      a_km:=power(398600.4418/power((mm*2*pi())/86400.0,2),1.0/3.0);
      pe_km:=greatest(0,a_km*(1-coalesce(ecc,0))-6378.137); ap_km:=greatest(0,a_km*(1+coalesce(ecc,0))-6378.137);
    else pe_km:=null; ap_km:=null; end if;
    insert into public.satellites(norad_id,name,object_type,inclination_deg,period_min,apogee_km,perigee_km,source_id,source_updated_at,metadata,updated_at)
    values ((obj->>'NORAD_CAT_ID')::integer,coalesce(obj->>'OBJECT_NAME',concat('NORAD ',obj->>'NORAD_CAT_ID')),
      coalesce(obj->>'OBJECT_TYPE','PAYLOAD'),inc,case when mm is not null and mm>0 then 1440.0/mm else null end,
      ap_km,pe_km,src,nullif(obj->>'EPOCH','')::timestamptz,
      jsonb_build_object('raw',obj,'celestrak_group',group_name,'ingest_method','CelesTrak_GP_JSON'),now())
    on conflict(norad_id) do update set name=excluded.name,object_type=excluded.object_type,inclination_deg=excluded.inclination_deg,
      period_min=excluded.period_min,apogee_km=excluded.apogee_km,perigee_km=excluded.perigee_km,source_id=excluded.source_id,
      source_updated_at=excluded.source_updated_at,metadata=excluded.metadata,updated_at=now();
    processed:=processed+1;
  end loop;
  return processed;
end $$;

select cron.schedule('earthquake-ingestion-hourly','17 * * * *',$$select public.ingest_usgs_earthquakes(3,2.5);$$)
where not exists (select 1 from cron.job where jobname='earthquake-ingestion-hourly');

select cron.schedule('world-bank-refresh-daily','31 2 * * *',$$select public.ingest_world_bank_indicators(ARRAY['SP.POP.TOTL','NY.GDP.MKTP.CD','NY.GDP.PCAP.CD','SP.DYN.LE00.IN','SP.URB.TOTL.IN.ZS','IT.NET.USER.ZS','EG.ELC.ACCS.ZS','SL.UEM.TOTL.ZS','SH.DYN.MORT','SH.XPD.CHEX.GD.ZS'],2020,2024);$$)
where not exists (select 1 from cron.job where jobname='world-bank-refresh-daily');

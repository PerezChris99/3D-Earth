-- Production ingestion performance hardening.
-- Bulk observation upserts are exposed only to service_role and used by Edge Functions.
create or replace function public.upsert_observatory_observations(p_rows jsonb)
returns integer
language sql
security invoker
set search_path = public, extensions
as $$
  with upserted as (
    insert into public.observatory_observations (
      external_id,freshness_sla_seconds,ingested_at,latitude,longitude,metric,
      observed_at,payload,quality_status,sector,source_id,unit,value
    )
    select
      r.external_id,r.freshness_sla_seconds,
      coalesce(r.ingested_at, now()),r.latitude,r.longitude,r.metric,
      r.observed_at,r.payload,r.quality_status,r.sector,r.source_id,r.unit,r.value
    from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as r(
      external_id text,
      freshness_sla_seconds integer,
      ingested_at timestamptz,
      latitude numeric,
      longitude numeric,
      metric text,
      observed_at timestamptz,
      payload jsonb,
      quality_status text,
      sector text,
      source_id uuid,
      unit text,
      value numeric
    )
    on conflict (source_id,external_id,observed_at) do update
      set freshness_sla_seconds=excluded.freshness_sla_seconds,
          ingested_at=excluded.ingested_at,
          latitude=excluded.latitude,
          longitude=excluded.longitude,
          metric=excluded.metric,
          payload=excluded.payload,
          quality_status=excluded.quality_status,
          sector=excluded.sector,
          unit=excluded.unit,
          value=excluded.value
    returning 1
  )
  select count(*)::integer from upserted;
$$;

revoke execute on function public.upsert_observatory_observations(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_observatory_observations(jsonb) to service_role;

-- Replace row-by-row USGS upserts with one set-based statement.
create or replace function public.ingest_usgs_earthquakes(lookback_days integer default 30, minimum_magnitude numeric default 2.5)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  payload jsonb;
  src uuid;
  start_ts text;
  end_ts text;
  inserted_count bigint := 0;
begin
  select id into src from public.data_sources
  where name = 'USGS Earthquake Catalog' limit 1;

  if src is null then
    insert into public.data_sources(name,provider,endpoint,description,is_authoritative)
    values ('USGS Earthquake Catalog','USGS','https://earthquake.usgs.gov/fdsnws/event/1/',
            'USGS Earthquake Catalog / ComCat event data',true)
    returning id into src;
  end if;

  start_ts := to_char(now() at time zone 'UTC' - make_interval(days => greatest(1,lookback_days)),
                       'YYYY-MM-DD"T"HH24:MI:SS');
  end_ts := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS');

  select content::jsonb into payload
  from extensions.http_get(
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson'
    || '&starttime=' || start_ts || '&endtime=' || end_ts
    || '&minmagnitude=' || minimum_magnitude::text
    || '&limit=20000&orderby=time'
  );

  with features as (
    select value as feature
    from jsonb_array_elements(coalesce(payload->'features','[]'::jsonb))
  ),
  prepared as (
    select
      coalesce(feature->'properties'->>'type','earthquake') event_type,
      to_timestamp(((feature->'properties'->>'time')::bigint)/1000.0) occurred_at,
      (feature->'geometry'->'coordinates'->>1)::numeric latitude,
      (feature->'geometry'->'coordinates'->>0)::numeric longitude,
      nullif(feature->'properties'->>'mag','')::numeric magnitude,
      (feature->'geometry'->'coordinates'->>2)::numeric depth_km,
      coalesce(feature->'properties'->>'place','USGS earthquake') title,
      feature->'properties'->>'title' description,
      jsonb_build_object(
        'external_id',feature->>'id','url',feature->'properties'->>'url',
        'status',feature->'properties'->>'status','tsunami',feature->'properties'->>'tsunami',
        'felt',feature->'properties'->>'felt','alert',feature->'properties'->>'alert',
        'sig',feature->'properties'->>'sig','mag_type',feature->'properties'->>'magType',
        'net',feature->'properties'->>'net','code',feature->'properties'->>'code',
        'updated_ms',feature->'properties'->>'updated','ingest_method','USGS_FDSN_GEOJSON'
      ) metadata
    from features
  ),
  upserted as (
    insert into public.earth_events(
      event_type,occurred_at,latitude,longitude,magnitude,depth_km,title,description,
      source_id,location,metadata
    )
    select p.event_type,p.occurred_at,p.latitude,p.longitude,p.magnitude,p.depth_km,
      p.title,p.description,src,
      st_setsrid(st_makepoint(p.longitude::double precision,p.latitude::double precision),4326)::geography,
      p.metadata
    from prepared p
    where p.latitude between -90 and 90 and p.longitude between -180 and 180
    on conflict (source_id, ((metadata->>'external_id'))) do update
      set occurred_at=excluded.occurred_at,latitude=excluded.latitude,longitude=excluded.longitude,
          magnitude=excluded.magnitude,depth_km=excluded.depth_km,title=excluded.title,
          description=excluded.description,location=excluded.location,metadata=excluded.metadata
    returning 1
  )
  select count(*) into inserted_count from upserted;

  return inserted_count;
end
$function$;

revoke execute on function public.ingest_usgs_earthquakes(integer,numeric) from public, anon, authenticated;
grant execute on function public.ingest_usgs_earthquakes(integer,numeric) to service_role;
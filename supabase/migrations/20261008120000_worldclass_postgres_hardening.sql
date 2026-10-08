-- World-class PostgreSQL performance/security baseline for 3D Earth.
-- Applied to production first; kept here as the auditable migration artifact.

create schema if not exists private;

create table if not exists private.app_user_roles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','operator','admin'))
);
create index if not exists app_user_roles_role_idx on private.app_user_roles(role);

create or replace function private.has_role(required_role text)
returns boolean language sql stable security definer
set search_path=private,public,pg_catalog
as $$
select exists (
 select 1 from private.app_user_roles r
 where r.user_id=(select auth.uid())
 and case required_role
  when 'viewer' then r.role in ('viewer','operator','admin')
  when 'operator' then r.role in ('operator','admin')
  when 'admin' then r.role='admin'
  else false end
);
$$;
revoke all on function private.has_role(text) from public,anon,authenticated;
grant execute on function private.has_role(text) to authenticated;

-- Internal control-plane data is never public.
drop policy if exists public_read on public.ingestion_runs;
drop policy if exists public_read on public.observatory_ingestion_runs;
drop policy if exists public_read on public.observatory_ingest_credentials;
drop policy if exists operator_read on public.ingestion_runs;
drop policy if exists operator_read on public.observatory_ingestion_runs;
create policy operator_read on public.ingestion_runs for select to authenticated using ((select private.has_role('operator')));
create policy operator_read on public.observatory_ingestion_runs for select to authenticated using ((select private.has_role('operator')));

drop policy if exists observer_session_read on public.observer_locations;
drop policy if exists public_read on public.observer_locations;
create policy observer_session_read on public.observer_locations
for select to authenticated
using (
 (select private.has_role('viewer'))
 and session_id = nullif((select current_setting('request.jwt.claim.session_id',true)),'')::uuid
);

-- No anonymous/authenticated writes to authoritative datasets.
do $$
declare t text;
begin
 foreach t in array array[
 'astronomy_snapshots','celestial_bodies','data_layer_configs','data_sources','earth_events',
 'earth_observation_products','environment_observations','observatory_observations',
 'observatory_sources','satellite_observations','satellite_passes','satellites',
 'seed_telemetry_samples','space_weather_observations','volcano_observations',
 'world_development_observations'
 ] loop
  execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to anon,authenticated',t);
 end loop;
end $$;

create index if not exists earth_events_time_id_idx on public.earth_events(occurred_at desc,id desc);
create index if not exists earth_events_type_time_id_idx on public.earth_events(event_type,occurred_at desc,id desc);
create index if not exists earth_events_mag_time_idx on public.earth_events(magnitude desc nulls last,occurred_at desc,id desc);
create index if not exists earth_obs_collection_acquired_idx on public.earth_observation_products(collection,acquired_at desc nulls last,id desc);
create index if not exists earth_obs_published_idx on public.earth_observation_products(published_at desc nulls last,id desc);
create index if not exists earth_obs_source_acquired_idx on public.earth_observation_products(source_id,acquired_at desc nulls last,id desc);
create index if not exists env_sector_time_id_idx on public.environment_observations(sector,observed_at desc,id desc);
create index if not exists env_metric_time_idx on public.environment_observations((metrics->>'metric'),observed_at desc,id desc);
create index if not exists obs_sector_metric_time_id_idx on public.observatory_observations(sector,metric,observed_at desc,id desc);
create index if not exists obs_quality_time_idx on public.observatory_observations(quality_status,observed_at desc,id desc);
create index if not exists obs_source_sector_time_idx on public.observatory_observations(source_id,sector,observed_at desc,id desc);
create index if not exists sat_obs_sat_time_id_idx on public.satellite_observations(satellite_id,observed_at desc,id desc);
create index if not exists sat_obs_source_time_id_idx on public.satellite_observations(source_id,observed_at desc,id desc);
create index if not exists sat_pass_sat_aos_id_idx on public.satellite_passes(satellite_id,aos_at,id);
create index if not exists sat_pass_aos_id_idx on public.satellite_passes(aos_at,id);
create index if not exists satellites_type_name_idx on public.satellites(object_type,name,id);
create index if not exists satellites_source_updated_idx on public.satellites(source_id,source_updated_at desc,id);
create index if not exists space_weather_product_time_id_idx on public.space_weather_observations(product,observed_at desc,id);
create index if not exists volcano_time_id_idx on public.volcano_observations(observed_at desc,id);
create index if not exists volcano_source_time_id_idx on public.volcano_observations(source_id,observed_at desc,id);
create index if not exists world_dev_country_indicator_period_idx on public.world_development_observations(country_code,indicator_code,period desc,id desc);
create index if not exists world_dev_indicator_country_period_idx on public.world_development_observations(indicator_code,country_code,period desc,id desc);
create index if not exists world_dev_source_period_id_idx on public.world_development_observations(source_id,period desc,id desc);
create index if not exists observatory_runs_status_time_idx on public.observatory_ingestion_runs(status,started_at desc,id desc);
create index if not exists ingestion_runs_status_time_idx on public.ingestion_runs(status,started_at desc,id);
create index if not exists data_layer_sector_status_idx on public.data_layer_configs(sector,status,updated_at desc);
create index if not exists observatory_sources_sector_active_idx on public.observatory_sources(sector,active,updated_at desc);

alter table public.observatory_observations set (autovacuum_vacuum_scale_factor=0.02,autovacuum_analyze_scale_factor=0.01,autovacuum_vacuum_threshold=1000,autovacuum_analyze_threshold=500);
alter table public.world_development_observations set (autovacuum_vacuum_scale_factor=0.03,autovacuum_analyze_scale_factor=0.02,autovacuum_vacuum_threshold=2000,autovacuum_analyze_threshold=1000);
alter table public.satellite_observations set (autovacuum_vacuum_scale_factor=0.02,autovacuum_analyze_scale_factor=0.01,autovacuum_vacuum_threshold=500,autovacuum_analyze_threshold=250);

analyze public.observatory_observations;
analyze public.world_development_observations;
analyze public.earth_events;
analyze public.satellite_observations;
analyze public.satellites;
-- Remove redundant prefix indexes after workload analysis.
drop index if exists public.earth_events_time_idx;
drop index if exists public.earth_events_source_idx;
drop index if exists public.satellite_observations_source_idx;
drop index if exists public.sat_obs_satellite_time_idx;
drop index if exists public.satellite_passes_source_idx;
drop index if exists public.sat_pass_satellite_aos_idx;
drop index if exists public.satellites_source_idx;
drop index if exists public.world_development_source_period_idx;
drop index if exists public.volcano_observations_time_idx;
drop index if exists public.data_layer_configs_sector_idx;

-- Route USGS volcano ingestion through an Edge Function because the upstream
-- endpoint can exceed the PostgreSQL HTTP extension's short outbound timeout.

create extension if not exists pg_net with schema extensions;

do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname in ('usgs-volcanoes-hourly','usgs-volcanoes-edge-hourly') loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'usgs-volcanoes-edge-hourly',
  '13 * * * *',
  $job$
  select net.http_post(
    url := 'https://iunxtsdczuvugttnwdky.supabase.co/functions/v1/ingest-usgs-volcanoes',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_94Z9AXaZlSoSvlqbkBMN-Q_Pby5tbM3'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$
);

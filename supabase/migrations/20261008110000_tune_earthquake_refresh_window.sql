do $$
begin
  if exists(select 1 from cron.job where jobname='earthquake-ingestion-hourly') then
    perform cron.unschedule('earthquake-ingestion-hourly');
  end if;
end $$;
select cron.schedule('earthquake-ingestion-hourly','17 * * * *','select public.ingest_usgs_earthquakes(1,2.5);');
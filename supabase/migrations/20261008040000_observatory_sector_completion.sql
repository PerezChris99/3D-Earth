-- 3D Earth by Perez: climate, air quality, freshwater and wildfire sector completion
insert into public.observatory_sources(slug,sector,name,provider,authority_level,endpoint,expected_refresh_seconds,coverage,metadata)
values
('nasa-giss-climate','climate','NASA GISS GISTEMP v4','NASA GISS','authoritative','https://data.giss.nasa.gov/gistemp/',2592000,'Global','{"cadence":"monthly","anomaly_base":"1951-1980"}'),
('world-bank-ihme-air-quality','air-quality','World Bank WDI / IHME GBD 2023 PM2.5','World Bank / IHME','authoritative','https://data.worldbank.org/indicator/EN.ATM.PM25.MC.M3',31536000,'Global countries','{"period":"1990-2023","method":"population-weighted modeled PM2.5 exposure"}'),
('fao-aquastat-freshwater','freshwater','FAO AQUASTAT via World Bank WDI','FAO / World Bank','authoritative','https://data.apps.fao.org/aquastat/',31536000,'Global countries','{"delivery":"World Bank WDI","cadence":"annual/irregular"}'),
('noaa-hms-fire','wildfires','NOAA Hazard Mapping System','NOAA NESDIS','authoritative','https://www.ospo.noaa.gov/products/land/hms.html',900,'North America, Hawaii and Caribbean','{"cadence":"intraday"}')
on conflict(slug) do update set endpoint=excluded.endpoint,metadata=excluded.metadata,updated_at=now();
insert into public.data_layer_configs(layer_key,sector,expected_refresh_seconds,stale_after_seconds,status,notes)
values
('climate','climate',2592000,5184000,'configured','NASA GISS monthly climate anomaly data.'),
('air-quality','air-quality',31536000,63072000,'configured','World Bank WDI / IHME GBD 2023 PM2.5 exposure; annual/modelled, not live AQI.'),
('freshwater','freshwater',31536000,63072000,'configured','FAO AQUASTAT-derived World Bank WDI indicators; country-level historical/annual data.'),
('wildfires','wildfire',900,7200,'configured','NOAA HMS operational active-fire detections; regional coverage.')
on conflict(layer_key) do update set expected_refresh_seconds=excluded.expected_refresh_seconds,stale_after_seconds=excluded.stale_after_seconds,status=excluded.status,notes=excluded.notes,updated_at=now();
select cron.unschedule('observatory-sector-refresh-climate') where exists(select 1 from cron.job where jobname='observatory-sector-refresh-climate');
select cron.unschedule('observatory-sector-refresh-air') where exists(select 1 from cron.job where jobname='observatory-sector-refresh-air');
select cron.unschedule('observatory-sector-refresh-freshwater') where exists(select 1 from cron.job where jobname='observatory-sector-refresh-freshwater');
select cron.unschedule('observatory-wildfire-refresh') where exists(select 1 from cron.job where jobname='observatory-wildfire-refresh');

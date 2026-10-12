-- Remove only the confirmed synthetic development telemetry batch.
-- Keep the table itself for future explicitly labelled test fixtures; operational map
-- layers must never treat these generated samples as observed satellite positions.
delete from public.seed_telemetry_samples
where source = 'synthetic-development';

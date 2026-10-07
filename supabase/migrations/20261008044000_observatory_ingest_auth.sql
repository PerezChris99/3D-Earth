-- Keep the scheduler token in Vault and store only its SHA-256 digest in the database.
CREATE TABLE IF NOT EXISTS public.observatory_ingest_credentials(
  id boolean PRIMARY KEY DEFAULT true,
  token_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.observatory_ingest_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.observatory_ingest_credentials FROM anon, authenticated;
INSERT INTO public.observatory_ingest_credentials(id,token_hash)
VALUES(true,encode(digest((select decrypted_secret from vault.decrypted_secrets where name='observatory_ingest_token'),'sha256'),'hex'))
ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,active=true;
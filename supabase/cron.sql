-- Scheduled ingest: keeps the board's data fresh.
--
-- Why not Vercel Cron: the Hobby plan fires once per DAY, which would leave the board up to
-- 24h stale — useless for "is this room free tonight?". pg_cron runs in Supabase on any
-- schedule we like, and the ingest endpoint is already guarded by a shared secret.
--
-- Idempotent: safe to re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net; -- async HTTP; a blocking call would hold the cron worker

-- The secret goes in Vault rather than inline in the job body: cron.job is world-readable to
-- anyone with DB access, and the job definition would otherwise carry the plaintext header.
select vault.create_secret(
  :'ingest_secret',
  'cinecom_ingest_secret',
  'x-ingest-secret header for POST /api/ingest'
)
where not exists (select 1 from vault.decrypted_secrets where name = 'cinecom_ingest_secret');

-- Replace any previous definition so re-running doesn't stack duplicate jobs.
select cron.unschedule('cinecom-ingest') where exists (select 1 from cron.job where jobname = 'cinecom-ingest');

-- Every 10 minutes. Reservations are made hours-to-days ahead, so this is comfortably fresh;
-- the crawl is ~16 pages against an endpoint with no rate limiting.
select cron.schedule(
  'cinecom-ingest',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://cinecom.chaepark.com/api/ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cinecom_ingest_secret')
    ),
    timeout_milliseconds := 55000  -- the full crawl takes ~5-10s; leave headroom
  );
  $$
);

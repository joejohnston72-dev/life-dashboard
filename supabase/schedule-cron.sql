-- Schedule the send-reminders function to run every minute.
-- Run this in the Supabase SQL Editor AFTER deploying the edge function.
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To remove later:  select cron.unschedule('send-reminders-every-minute');

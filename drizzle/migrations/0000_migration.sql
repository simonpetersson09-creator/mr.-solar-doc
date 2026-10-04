CREATE TABLE public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  device_id text NOT NULL,
  event text NOT NULL,
  step integer,
  country text,
  platform text,
  language text
);
GRANT ALL ON public.app_events TO service_role;
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX app_events_created_at_idx ON public.app_events (created_at);
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS revisions_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_revision_at timestamp with time zone;
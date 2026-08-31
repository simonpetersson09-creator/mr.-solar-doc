CREATE TABLE public.calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  snapshot jsonb NOT NULL,
  address text,
  country_code text,
  currency text,
  installed_kwp numeric,
  annual_production_kwh numeric,
  payback_years integer,
  product_id text,
  price_amount numeric,
  price_currency text,
  apple_transaction_id text UNIQUE,
  apple_original_transaction_id text,
  apple_environment text,
  purchased_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calculations_status_check CHECK (status IN ('pending', 'paid', 'failed', 'cancelled'))
);

CREATE INDEX calculations_device_idx ON public.calculations (device_id, created_at DESC);

GRANT ALL ON public.calculations TO service_role;

ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER calculations_set_updated_at
BEFORE UPDATE ON public.calculations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
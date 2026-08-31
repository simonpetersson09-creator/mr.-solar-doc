CREATE TABLE public.premium_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  apple_original_transaction_id TEXT NOT NULL UNIQUE,
  apple_transaction_id TEXT,
  apple_environment TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  expires_at TIMESTAMP WITH TIME ZONE,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMP WITH TIME ZONE,
  last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX premium_subscriptions_device_id_idx ON public.premium_subscriptions (device_id);

GRANT ALL ON public.premium_subscriptions TO service_role;

ALTER TABLE public.premium_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_premium_subscriptions_updated_at
BEFORE UPDATE ON public.premium_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
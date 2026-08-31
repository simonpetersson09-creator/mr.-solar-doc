DELETE FROM public.calculations;

ALTER TABLE public.calculations
  DROP COLUMN IF EXISTS snapshot,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS country_code,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS installed_kwp,
  DROP COLUMN IF EXISTS annual_production_kwh,
  DROP COLUMN IF EXISTS payback_years;
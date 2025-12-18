-- Fix search_path for helper functions (security hardening)
CREATE OR REPLACE FUNCTION public.normalize_email(raw_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF raw_email IS NULL OR raw_email = '' THEN
    RETURN NULL;
  END IF;
  RETURN LOWER(TRIM(raw_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  digits_only text;
BEGIN
  IF raw_phone IS NULL OR raw_phone = '' THEN
    RETURN NULL;
  END IF;
  digits_only := regexp_replace(raw_phone, '[^0-9]', '', 'g');
  IF length(digits_only) >= 10 THEN
    RETURN RIGHT(digits_only, 10);
  END IF;
  RETURN digits_only;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_lead_fingerprint(
  p_email text,
  p_phone text,
  p_company_name text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  norm_email text;
  norm_phone text;
  norm_company text;
  fingerprint_raw text;
BEGIN
  norm_email := public.normalize_email(p_email);
  norm_phone := public.normalize_phone(p_phone);
  norm_company := LOWER(TRIM(COALESCE(p_company_name, '')));
  fingerprint_raw := COALESCE(norm_email, '') || '|' || COALESCE(norm_phone, '') || '|' || norm_company;
  RETURN LEFT(encode(sha256(fingerprint_raw::bytea), 'hex'), 32);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_lead_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;